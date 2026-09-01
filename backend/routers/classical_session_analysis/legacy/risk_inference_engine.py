"""Q-INTERVAL-Lite+ Risk Inference Engine.

Sprint 3 risk-inference pipeline as a single importable class. Output schema
matches the existing Sprint 2 frontend contract — same field names — so the
frontend is plug-and-play. Sprint 3 improvements (calibrated probabilities,
better trained models, Grad-CAM++ heatmaps, per-view confidence) are added
as ADDITIVE new fields; the frontend can adopt them when ready.

Requirements:
    pip install torch torchvision opencv-python numpy pillow

Files needed in the same folder (or pass explicit paths to __init__):
    - cancer_v5_explainable.pth
    - density_v2_explainable.pth
    - birads_v2_explainable.pth
    - q_interval_explainable_models.py   (class definition for the bundles)

Usage:
    from risk_inference_engine import RiskInferenceEngine

    engine = RiskInferenceEngine.load_from_folder('path/to/handoff_folder')

    result = engine.analyze_patient([
        {'image_path': 'view1.jpg', 'age': 55, 'view': 'CC',  'laterality': 'L', 'source': 'ddsm'},
        {'image_path': 'view2.jpg', 'age': 55, 'view': 'MLO', 'laterality': 'L', 'source': 'ddsm'},
        ...
    ])
""""""
Q-INTERVAL-Lite+ - Classical mammogram classifier
=================================================

Self-contained inference module for backend integration.
Author: Pasindu Pahasara Balasooriya Lekamlage (104348348), Sprint 4.

WHAT THIS IS
    The v12 ensemble: v11_dro (EfficientNetV2-S + CBAM, Group-DRO trained) and
    v8_resnet (ResNet-101), both without the source-dataset input, combined with
    4-view test-time augmentation and validation-tuned class coefficients.

    Returns Normal / Benign / Malignant with calibrated probabilities, plus two
    kinds of heatmap and an optional abstention flag.

QUICK START
    from qinterval_classifier import Classifier

    clf = Classifier('bundles/')                       # folder with the .pth files
    r = clf.analyze_image('img.png', view='CC', laterality='L', age=57)
    print(r['label'], r['probabilities'], r['confidence'])

    p = clf.analyze_patient([
        dict(path='lcc.png',  view='CC',  laterality='L', age=57),
        dict(path='lmlo.png', view='MLO', laterality='L', age=57),
        dict(path='rcc.png',  view='CC',  laterality='R', age=57),
        dict(path='rmlo.png', view='MLO', laterality='R', age=57)])
    print(p['patient_label'], p['most_suspicious_view'], p['defer_to_radiologist'])

SELF-TEST
    python qinterval_classifier.py --selftest
    Runs the whole pipeline on random weights and a synthetic image. Verifies
    shapes, the Grad-CAM++ hooks and the occlusion batching without needing the
    real bundles. Run this before wiring anything into the backend.

READ BEFORE DEPLOYING
    See README.md. In particular: this model has NOT been shown to work on a
    screening population. External validation on RSNA gave ROC-AUC 0.5855 against
    0.8673 internally, and that result is confounded by a preprocessing difference
    that has not yet been eliminated. Treat as decision support with a clinician in
    the loop, never as an autonomous reader.
"""

from __future__ import annotations

import json
import os
from typing import Any, Dict, List, Optional, Sequence

import cv2
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torchvision.models import efficientnet_v2_s, resnet101

__all__ = ['Classifier', 'CLASS_NAMES']

CLASS_NAMES = ['Normal', 'Benign', 'Malignant']
NORMAL, BENIGN, MALIGNANT = 0, 1, 2

# metadata cardinalities - must match training
N_AGE, N_VIEW, N_LAT, N_META, EMB = 8, 3, 2, 3, 16
NORM_MEAN = [0.485, 0.456, 0.406]
NORM_STD = [0.229, 0.224, 0.225]

# Images are downscaled to this before segmentation/cropping. The model input is
# 384-512, so working at full 10 MP resolution costs ~200 ms per image and buys
# nothing. Measured: 253 ms -> 27 ms.
PREPROC_MAX_SIDE = 1024


# ----------------------------------------------------------------------------
# model
# ----------------------------------------------------------------------------
class CBAM(nn.Module):
    """Convolutional Block Attention Module - channel then spatial attention."""

    def __init__(self, c: int, r: int = 16, k: int = 7):
        super().__init__()
        self.avg = nn.AdaptiveAvgPool2d(1)
        self.mx = nn.AdaptiveMaxPool2d(1)
        self.mlp = nn.Sequential(
            nn.Conv2d(c, c // r, 1, bias=False), nn.ReLU(inplace=True),
            nn.Conv2d(c // r, c, 1, bias=False))
        self.sp = nn.Conv2d(2, 1, k, padding=k // 2, bias=False)

    def forward(self, x):
        x = x * torch.sigmoid(self.mlp(self.avg(x)) + self.mlp(self.mx(x)))
        return x * torch.sigmoid(self.sp(torch.cat(
            [x.mean(1, keepdim=True), x.amax(1, keepdim=True)], 1)))


class MultiTaskNet(nn.Module):
    """Backbone + three metadata embeddings + classifier.

    Auxiliary heads exist only so that bundles trained with them load strictly;
    they are unused at inference.
    """

    def __init__(self, arch: str = 'effnetv2', dr: float = 0.3,
                 n_den: int = 0, n_abn: int = 0, n_bir: int = 0):
        super().__init__()
        self.arch = arch
        if arch == 'resnet101':
            self.backbone = resnet101(weights=None)
            self.backbone.fc = nn.Identity()
            feat = 2048
            self.cbam = None
        else:
            self.features = efficientnet_v2_s(weights=None).features
            self.cbam = CBAM(1280)
            self.avgpool = nn.AdaptiveAvgPool2d(1)
            feat = 1280
        self.feat_dim = feat

        self.age_emb = nn.Embedding(N_AGE, EMB)
        self.view_emb = nn.Embedding(N_VIEW, EMB)
        self.lat_emb = nn.Embedding(N_LAT, EMB)
        self.classifier = nn.Sequential(
            nn.Dropout(dr), nn.Linear(feat + N_META * EMB, 256),
            nn.ReLU(inplace=True), nn.Dropout(dr), nn.Linear(256, 3))

        self.head_den = nn.Linear(feat, n_den) if n_den else None
        self.head_abn = nn.Linear(feat, n_abn) if n_abn else None
        self.head_bir = nn.Linear(feat, n_bir) if n_bir else None

    def feature_map(self, x: torch.Tensor) -> torch.Tensor:
        """Spatial feature map, before pooling. This is what the CAMs hook."""
        if self.arch == 'resnet101':
            b = self.backbone
            x = b.maxpool(b.relu(b.bn1(b.conv1(x))))
            x = b.layer4(b.layer3(b.layer2(b.layer1(x))))
            return x
        return self.cbam(self.features(x))

    def head_from_map(self, fmap, a, v, l):
        pooled = F.adaptive_avg_pool2d(fmap, 1).flatten(1)
        meta = torch.cat([self.age_emb(a), self.view_emb(v), self.lat_emb(l)], 1)
        return self.classifier(torch.cat([pooled, meta], 1))

    def forward(self, x, a, v, l):
        return self.head_from_map(self.feature_map(x), a, v, l)


# ----------------------------------------------------------------------------
# preprocessing - must match training
# ----------------------------------------------------------------------------
def _shrink(a: np.ndarray, max_side: int = PREPROC_MAX_SIDE) -> np.ndarray:
    h, w = a.shape[:2]
    if max(h, w) <= max_side:
        return a
    s = max_side / max(h, w)
    return cv2.resize(a, (max(1, int(w * s)), max(1, int(h * s))),
                      interpolation=cv2.INTER_AREA)


def load_image(path: str) -> np.ndarray:
    """Load PNG/JPG or DICOM as uint8 greyscale, breast bright on dark."""
    if path.lower().endswith(('.dcm', '.dicom')):
        try:
            import dicomsdl
            d = dicomsdl.open(path)
            arr = d.pixelData()
            invert = d.getPixelDataInfo().get(
                'PhotometricInterpretation', '') == 'MONOCHROME1'
        except Exception:
            import pydicom
            d = pydicom.dcmread(path)
            arr = d.pixel_array
            invert = getattr(d, 'PhotometricInterpretation', '') == 'MONOCHROME1'
        arr = _shrink(arr).astype(np.float32)
        lo, hi = np.percentile(arr, [1, 99])
        arr = np.clip((arr - lo) / max(hi - lo, 1e-6), 0, 1)
        if invert:
            arr = 1.0 - arr
        return (arr * 255).astype(np.uint8)

    img = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
    if img is None:
        raise FileNotFoundError(path)
    img = _shrink(img)
    if img[:8, :8].mean() > 127:       # bright corner => not yet inverted
        img = 255 - img
    return img


def crop_breast(img: np.ndarray, pad: int = 8) -> np.ndarray:
    """Otsu threshold, keep the largest connected component, crop to it."""
    blur = cv2.GaussianBlur(img, (5, 5), 0)
    _, m = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    n, _, stats, _ = cv2.connectedComponentsWithStats(m, 8)
    if n <= 1:
        return img
    k = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    x, y = stats[k, cv2.CC_STAT_LEFT], stats[k, cv2.CC_STAT_TOP]
    w, h = stats[k, cv2.CC_STAT_WIDTH], stats[k, cv2.CC_STAT_HEIGHT]
    if w < img.shape[1] * 0.10 or h < img.shape[0] * 0.10:
        return img
    y0, y1 = max(0, y - pad), min(img.shape[0], y + h + pad)
    x0, x1 = max(0, x - pad), min(img.shape[1], x + w + pad)
    out = img[y0:y1, x0:x1]
    return out if out.size else img


def age_bucket(age) -> int:
    if age is None or (isinstance(age, float) and np.isnan(age)):
        return 7
    for i, hi in enumerate([30, 40, 50, 60, 70, 80]):
        if age < hi:
            return i
    return 6


VIEW_IDX = {'CC': 0, 'MLO': 1}
LAT_IDX = {'L': 0, 'R': 1}


def _to_tensor(gray: np.ndarray, size: int) -> torch.Tensor:
    rgb = cv2.cvtColor(cv2.resize(gray, (size, size)), cv2.COLOR_GRAY2RGB)
    t = torch.from_numpy(rgb).float().permute(2, 0, 1) / 255.0
    mean = torch.tensor(NORM_MEAN).view(3, 1, 1)
    std = torch.tensor(NORM_STD).view(3, 1, 1)
    return (t - mean) / std


# ----------------------------------------------------------------------------
# the classifier
# ----------------------------------------------------------------------------
class Classifier:
    """The v12 ensemble, ready for inference.

    Parameters
    ----------
    bundle_dir : folder containing final_v12_ensemble_bundle.pth and the member
                 bundles it names. Files are located by name, so folder layout
                 does not matter.
    device     : 'cuda', 'cpu', or None to pick automatically.
    tta        : average over 4 flips. Matches how the model was evaluated.
                 Turn off for ~4x faster inference at a small accuracy cost.
    defer_margin : if set, results where the top two probabilities are closer
                 than this are flagged defer_to_radiologist=True. Calibrate it
                 with calibrate_defer_margin(); do not guess.
    """

    def __init__(self, bundle_dir: str, device: Optional[str] = None,
                 tta: bool = True, defer_margin: Optional[float] = None):
        self.device = torch.device(
            device or ('cuda' if torch.cuda.is_available() else 'cpu'))
        self.tta = tta
        self.defer_margin = defer_margin

        ens_path = self._find(bundle_dir, 'final_v12_ensemble_bundle.pth')
        if ens_path is None:
            raise FileNotFoundError(
                f'final_v12_ensemble_bundle.pth not found under {bundle_dir}')
        self.cfg = torch.load(ens_path, map_location='cpu', weights_only=False)

        self.members: List[str] = list(self.cfg['members'])
        w = np.array([self.cfg['weights'][m] for m in self.members], dtype=np.float32)
        self.weights = w / w.sum()
        self.coef = np.asarray(self.cfg['class_coefficients'], dtype=np.float32)

        self.models: Dict[str, MultiTaskNet] = {}
        self.temps: Dict[str, float] = {}
        self.sizes: Dict[str, int] = {}
        for name in self.members:
            src = self.cfg['member_bundles'][name]
            path = src if os.path.exists(src) else self._find(
                bundle_dir, os.path.basename(src))
            if path is None:
                raise FileNotFoundError(
                    f'member bundle {os.path.basename(src)} not found under {bundle_dir}')
            model, meta = self._load_member(path)
            self.models[name] = model.to(self.device).eval()
            self.temps[name] = float(meta['temperature'])
            self.sizes[name] = int(meta.get(
                'input_size', 512 if model.arch == 'resnet101' else 384))

    # -- loading ------------------------------------------------------------
    @staticmethod
    def _find(root: str, name: str) -> Optional[str]:
        if os.path.isfile(root) and os.path.basename(root) == name:
            return root
        for r, _, fs in os.walk(root):
            if name in fs:
                return os.path.join(r, name)
        return None

    @staticmethod
    def _load_member(path: str):
        b = torch.load(path, map_location='cpu', weights_only=False)
        sd = b['model_state_dict']
        if b.get('uses_source_embedding', False):
            raise ValueError(
                f'{path} expects a source_dataset input, which does not exist for a '
                f'real patient. Only no-source bundles are supported.')
        arch = 'resnet101' if any(k.startswith('backbone.') for k in sd) else 'effnetv2'
        g = lambda k: sd[k].shape[0] if k in sd else 0
        m = MultiTaskNet(arch, n_den=g('head_den.weight'),
                         n_abn=g('head_abn.weight'), n_bir=g('head_bir.weight'))
        m.load_state_dict(sd, strict=True)   # strict: a silent partial load once
        m.eval()                             # made a random model report 0.5718
        return m, b

    # -- core inference ------------------------------------------------------
    def _meta_tensors(self, view, laterality, age, n=1):
        a = torch.full((n,), age_bucket(age), dtype=torch.long, device=self.device)
        v = torch.full((n,), VIEW_IDX.get(str(view).upper(), 2),
                       dtype=torch.long, device=self.device)
        l = torch.full((n,), LAT_IDX.get(str(laterality).upper(), 0),
                       dtype=torch.long, device=self.device)
        return a, v, l

    @torch.no_grad()
    def _member_probs(self, name: str, gray: np.ndarray,
                      view, laterality, age) -> np.ndarray:
        model, size, T = self.models[name], self.sizes[name], self.temps[name]
        variants = [gray]
        if self.tta:
            variants = [gray, gray[:, ::-1], gray[::-1, :], gray[::-1, ::-1]]
        x = torch.stack([_to_tensor(np.ascontiguousarray(v), size)
                         for v in variants]).to(self.device)
        a, v_, l = self._meta_tensors(view, laterality, age, len(variants))
        logits = model(x, a, v_, l).float()
        return F.softmax(logits / T, 1).mean(0).cpu().numpy()

    def predict_proba(self, gray: np.ndarray, view='CC', laterality='L',
                      age=None) -> np.ndarray:
        """Calibrated, coefficient-adjusted 3-class probabilities."""
        per = np.stack([self._member_probs(n, gray, view, laterality, age)
                        for n in self.members])
        p = (per * self.weights[:, None]).sum(0) * self.coef
        return p / p.sum()

    # -- public API ----------------------------------------------------------
    def analyze_image(self, path: str, view: str = 'CC', laterality: str = 'L',
                      age: Optional[float] = None,
                      explain: Optional[str] = None) -> Dict[str, Any]:
        """Classify one mammographic view.

        explain : None, 'gradcam++', 'occlusion', or 'both'.
        Returns a dict with label, probabilities, confidence, margin,
        defer_to_radiologist, and any requested heatmaps as uint8 arrays.
        """
        gray = crop_breast(load_image(path))
        p = self.predict_proba(gray, view, laterality, age)
        order = np.argsort(p)[::-1]
        margin = float(p[order[0]] - p[order[1]])

        out: Dict[str, Any] = {
            'path': path,
            'view': view,
            'laterality': laterality,
            'label': CLASS_NAMES[int(order[0])],
            'label_index': int(order[0]),
            'probabilities': {CLASS_NAMES[i]: float(p[i]) for i in range(3)},
            'confidence': float(p[order[0]]),
            'margin': margin,
            'defer_to_radiologist': bool(
                self.defer_margin is not None and margin < self.defer_margin),
        }
        if explain in ('gradcam++', 'both'):
            out['gradcam'] = self.gradcam_plusplus(gray, view, laterality, age)
        if explain in ('occlusion', 'both'):
            out['occlusion'] = self.occlusion_map(gray, view, laterality, age)
        return out

    def analyze_patient(self, images: Sequence[Dict[str, Any]],
                        explain: Optional[str] = None) -> Dict[str, Any]:
        """Classify a patient from up to four views.

        Patient label is the MAXIMUM severity across views, matching how the
        model was evaluated (Normal < Benign < Malignant). A cancer in one view
        is a cancer.
        """
        views = [self.analyze_image(explain=explain, **{
            k: im[k] for k in ('path', 'view', 'laterality', 'age') if k in im})
            for im in images]
        idx = int(np.argmax([v['label_index'] for v in views]))
        worst = views[idx]
        mal = [v['probabilities']['Malignant'] for v in views]
        return {
            'views': views,
            'patient_label': worst['label'],
            'patient_label_index': worst['label_index'],
            'most_suspicious_view': idx,
            'most_suspicious_view_name': f"{worst['laterality']}-{worst['view']}",
            'max_malignant_probability': float(max(mal)),
            'mean_malignant_probability': float(np.mean(mal)),
            'confidence': float(worst['confidence']),
            'defer_to_radiologist': any(v['defer_to_radiologist'] for v in views),
            'clinical_escalation': worst['label'] == 'Malignant',
        }

    # -- explainability ------------------------------------------------------
    def gradcam_plusplus(self, gray: np.ndarray, view='CC', laterality='L',
                         age=None, target: Optional[int] = None,
                         member: Optional[str] = None) -> np.ndarray:
        """Grad-CAM++ heatmap, uint8 in [0,255] at the input resolution.

        Gradient-based: fast, but it infers importance rather than measuring it.
        Use occlusion_map when you need to know what actually changes the output.
        """
        name = member or self.members[0]
        model, size = self.models[name], self.sizes[name]
        x = _to_tensor(gray, size).unsqueeze(0).to(self.device).requires_grad_(True)
        a, v, l = self._meta_tensors(view, laterality, age, 1)

        fmap = model.feature_map(x)
        fmap.retain_grad()
        logits = model.head_from_map(fmap, a, v, l)
        cls = int(logits.argmax(1).item()) if target is None else int(target)
        model.zero_grad(set_to_none=True)
        logits[0, cls].backward()

        A = fmap.detach()[0]                       # (C,H,W)
        g = fmap.grad.detach()[0]
        g2, g3 = g ** 2, g ** 3
        denom = 2 * g2 + (A * g3).sum(dim=(1, 2), keepdim=True)
        alpha = g2 / torch.where(denom != 0, denom, torch.ones_like(denom))
        w = (alpha * F.relu(g)).sum(dim=(1, 2))    # (C,)
        cam = F.relu((w[:, None, None] * A).sum(0))
        return self._to_heatmap(cam.cpu().numpy(), gray.shape)

    @torch.no_grad()
    def occlusion_map(self, gray: np.ndarray, view='CC', laterality='L', age=None,
                      target: Optional[int] = None, patch: int = 64,
                      stride: int = 32, member: Optional[str] = None) -> np.ndarray:
        """Occlusion sensitivity - hide a patch, measure the drop in probability.

        Slower than Grad-CAM++ but faithful by construction: it measures the
        causal effect of each region rather than inferring it from gradients.
        Useful for checking whether the model is reading the lesion or the
        background, which the Sprint 4 audit showed is a real risk.

        Matches the method Jack used for the quantum pipeline, so the classical
        and quantum heatmaps become directly comparable. Resolution here is far
        finer: the QML version occludes a 16x16 image, this one the full input.
        """
        name = member or self.members[0]
        model, size, T = self.models[name], self.sizes[name], self.temps[name]
        base = _to_tensor(gray, size).to(self.device)
        a1, v1, l1 = self._meta_tensors(view, laterality, age, 1)

        p0 = F.softmax(model(base.unsqueeze(0), a1, v1, l1).float() / T, 1)[0]
        cls = int(p0.argmax().item()) if target is None else int(target)
        ref = float(p0[cls])

        ys = list(range(0, max(1, size - patch + 1), stride))
        xs = list(range(0, max(1, size - patch + 1), stride))
        batch = base.unsqueeze(0).repeat(len(ys) * len(xs), 1, 1, 1)
        for i, y in enumerate(ys):
            for j, x in enumerate(xs):
                batch[i * len(xs) + j, :, y:y + patch, x:x + patch] = 0.0

        a, v, l = self._meta_tensors(view, laterality, age, batch.shape[0])
        drops = []
        for s in range(0, batch.shape[0], 64):      # cap peak memory
            chunk = batch[s:s + 64]
            pr = F.softmax(model(chunk, a[:len(chunk)], v[:len(chunk)],
                                 l[:len(chunk)]).float() / T, 1)[:, cls]
            drops.append((ref - pr).cpu().numpy())
        grid = np.concatenate(drops).reshape(len(ys), len(xs))
        grid = cv2.GaussianBlur(grid.astype(np.float32), (3, 3), 0)
        return self._to_heatmap(grid, gray.shape)

    @staticmethod
    def _to_heatmap(arr: np.ndarray, shape) -> np.ndarray:
        arr = arr - arr.min()
        m = arr.max()
        arr = arr / m if m > 0 else np.zeros_like(arr)
        return (cv2.resize(arr, (shape[1], shape[0])) * 255).astype(np.uint8)

    @staticmethod
    def overlay(gray: np.ndarray, heat: np.ndarray, alpha: float = 0.4) -> np.ndarray:
        """Blend a heatmap over the image. Returns BGR uint8, ready for cv2.imwrite."""
        base = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
        colour = cv2.applyColorMap(heat, cv2.COLORMAP_JET)
        return cv2.addWeighted(base, 1 - alpha, colour, alpha, 0)

    # -- calibration helper --------------------------------------------------
    @staticmethod
    def calibrate_defer_margin(probs: np.ndarray, coverage: float = 0.80) -> float:
        """Margin threshold that auto-classifies `coverage` of a reference set.

        Run on held-out probabilities, NOT on the images you are about to score.
        probs: (N,3) array from predict_proba.
        """
        p = np.sort(probs, axis=1)
        margins = p[:, -1] - p[:, -2]
        return float(np.quantile(margins, 1.0 - coverage))


# ----------------------------------------------------------------------------
# self-test
# ----------------------------------------------------------------------------
def _selftest() -> int:
    """Exercise the pipeline on random weights. No bundles needed."""
    print('Q-INTERVAL classifier self-test\n' + '=' * 46)
    ok = True

    def check(name, cond, detail=''):
        nonlocal ok
        ok &= bool(cond)
        print(f'  [{"PASS" if cond else "FAIL"}] {name}' + (f'  {detail}' if detail else ''))

    gray = (np.random.default_rng(0).random((900, 700)) * 255).astype(np.uint8)
    gray[200:700, 150:550] = 200                      # a bright "breast"
    check('crop_breast keeps a plausible region',
          crop_breast(gray).size > 0.2 * gray.size, f'{crop_breast(gray).shape}')

    for arch, size in [('effnetv2', 384), ('resnet101', 512)]:
        m = MultiTaskNet(arch).eval()
        x = _to_tensor(gray, size).unsqueeze(0)
        a = torch.zeros(1, dtype=torch.long)
        fmap = m.feature_map(x)
        check(f'{arch} feature map', fmap.dim() == 4 and fmap.shape[0] == 1,
              tuple(fmap.shape))
        out = m(x, a, a, a)
        check(f'{arch} forward -> (1,3)', tuple(out.shape) == (1, 3), tuple(out.shape))
        check(f'{arch} pooled dim matches classifier',
              fmap.shape[1] == m.feat_dim, f'{fmap.shape[1]} vs {m.feat_dim}')

    clf = Classifier.__new__(Classifier)              # bypass bundle loading
    clf.device = torch.device('cpu')
    clf.tta = True
    clf.defer_margin = 0.15
    clf.members = ['m']
    clf.weights = np.array([1.0], dtype=np.float32)
    clf.coef = np.array([1.0, 1.6, 2.0], dtype=np.float32)
    clf.models = {'m': MultiTaskNet('effnetv2').eval()}
    clf.temps = {'m': 1.66}
    clf.sizes = {'m': 384}

    p = clf.predict_proba(gray, 'MLO', 'L', 57)
    check('predict_proba sums to 1', abs(p.sum() - 1) < 1e-5, f'{p.round(4)}')
    check('predict_proba is 3-class', p.shape == (3,))

    cam = clf.gradcam_plusplus(gray, 'MLO', 'L', 57)
    check('Grad-CAM++ shape matches image', cam.shape == gray.shape, cam.shape)
    check('Grad-CAM++ is uint8 0-255',
          cam.dtype == np.uint8 and cam.max() <= 255)

    occ = clf.occlusion_map(gray, 'MLO', 'L', 57, patch=96, stride=64)
    check('occlusion shape matches image', occ.shape == gray.shape, occ.shape)
    check('occlusion is uint8', occ.dtype == np.uint8)

    ov = Classifier.overlay(gray, cam)
    check('overlay is BGR', ov.shape == (*gray.shape, 3))

    ref = np.random.default_rng(1).dirichlet([2, 2, 2], size=500)
    thr = Classifier.calibrate_defer_margin(ref, 0.80)
    cov = (np.sort(ref, 1)[:, -1] - np.sort(ref, 1)[:, -2] >= thr).mean()
    check('defer margin gives ~80% coverage', abs(cov - 0.80) < 0.03, f'{cov:.3f}')

    print('=' * 46)
    print('ALL PASSED - safe to wire in' if ok else 'FAILURES ABOVE - do not integrate')
    return 0 if ok else 1


if __name__ == '__main__':
    import sys
    if '--selftest' in sys.argv:
        raise SystemExit(_selftest())
    print(__doc__)


import os
from typing import List, Dict, Any, Optional
import numpy as np
import torch
import cv2

# Required so torch.load can unpickle the bundle classes. The bundles were
# pickled when this lived as a top-level module, so the saved class reference is
# "q_interval_explainable_models.QIntervalExplainable". Register that name in
# sys.modules so unpickling still resolves it now that it's a package submodule.
import sys as _sys
from .. import q_interval_explainable_models as _qiem
_sys.modules.setdefault("q_interval_explainable_models", _qiem)
from ..q_interval_explainable_models import QIntervalExplainable   # noqa: F401,E402


class RiskInferenceEngine:
    """Loads the three explainable models and computes patient-level risk."""

    # === Risk formula constants ===
    CNN_WEIGHT       = 0.60
    BIRADS_WEIGHT    = 0.25
    DENSITY_WEIGHT   = 0.15
    DENSITY_RISK_MAP = {'A': 25, 'B': 50, 'C': 75, 'D': 100}
    BIRADS_RISK_MAP  = {1: 0,    2: 25,  3: 50,  4: 75,  5: 100}
    CNN_MALIGNANT_COEF = 100
    CNN_BENIGN_COEF    = 30

    # === Risk level thresholds (same as Sprint 2) ===
    HIGH_RISK_THRESHOLD   = 67
    MEDIUM_RISK_THRESHOLD = 34

    # === Patient-level class decision thresholds ===
    PATIENT_MALIGNANT_THRESHOLD = 0.40
    PATIENT_BENIGN_THRESHOLD    = 0.40

    # === Confidence threshold for the multi-view inconsistency flag ===
    LOW_CONFIDENCE_THRESHOLD = 70

    # === Feedback messages (same as Sprint 2) ===
    HIGH_RISK_MSG   = ('The results indicate a higher level of risk. '
                       'It is important to seek medical advice promptly for evaluation.')
    MEDIUM_RISK_MSG = ('Some areas may need further review. A follow-up consultation '
                       'with a healthcare professional is recommended.')
    LOW_RISK_MSG    = ('No major concerns are indicated at this time. '
                       'Continue with regular check-ups and screenings.')
    LOW_CONF_NOTE   = (" Note: predictions across the patient's mammographic views "
                       "are not fully consistent - a clinician should review the "
                       "most-suspicious view before acting.")

    def __init__(self,
                 cancer_path: str,
                 density_path: str,
                 birads_path: str,
                 device: Optional[str] = None):
        """Load the three explainable bundles into a single engine."""
        if device is None:
            device = 'cuda' if torch.cuda.is_available() else 'cpu'
        self.device = torch.device(device)
        self.cancer  = torch.load(cancer_path,  map_location=self.device, weights_only=False).eval().to(self.device)
        self.density = torch.load(density_path, map_location=self.device, weights_only=False).eval().to(self.device)
        self.birads  = torch.load(birads_path,  map_location=self.device, weights_only=False).eval().to(self.device)

    @classmethod
    def load_from_folder(cls, folder: str, device: Optional[str] = None):
        """Convenience loader assuming standard bundle filenames in the folder."""
        return cls(
            cancer_path  = os.path.join(folder, 'cancer_v5_explainable.pth'),
            density_path = os.path.join(folder, 'density_v2_explainable.pth'),
            birads_path  = os.path.join(folder, 'birads_v2_explainable.pth'),
            device       = device,
        )

    # ---------------- risk-level helper ----------------
    def _risk_level_and_feedback(self, score: float, low_confidence_note: bool = False) -> Dict[str, str]:
        if score >= self.HIGH_RISK_THRESHOLD:
            level, msg = 'High Risk', self.HIGH_RISK_MSG
        elif score >= self.MEDIUM_RISK_THRESHOLD:
            level, msg = 'Medium Risk', self.MEDIUM_RISK_MSG
        else:
            level, msg = 'Low Risk', self.LOW_RISK_MSG
        if low_confidence_note:
            msg = msg + self.LOW_CONF_NOTE
        return {'risk_level': level, 'feedback': msg}

    # --------------- per-image analysis ---------------
    def analyze_image(self,
                      image_path: str,
                      age: Optional[float] = None,
                      view: str = 'CC',
                      laterality: str = 'L',
                      source: str = 'ddsm',
                      include_overlays: bool = True) -> Dict[str, Any]:
        """Run all three models on one image and compute the image-level risk.

        Returns a dict in the existing Sprint 2 schema, with Sprint 3 additive
        fields (cancer/density/birads_probabilities, heatmap_overlays).
        """
        img_bgr = cv2.imread(image_path)
        if img_bgr is None:
            raise ValueError(f'Could not read image: {image_path}')

        cancer_out  = self.cancer .explain(img_bgr, age, view, laterality, source)
        density_out = self.density.explain(img_bgr, age, view, laterality, source)
        birads_out  = self.birads .explain(img_bgr, age, view, laterality, source)

        # CNN risk: P(Mal)*100 + P(Ben)*30
        p_benign    = cancer_out['probabilities'].get('Benign',    0.0)
        p_malignant = cancer_out['probabilities'].get('Malignant', 0.0)
        cnn_risk    = self.CNN_MALIGNANT_COEF * p_malignant + self.CNN_BENIGN_COEF * p_benign

        # Density and BIRADS: hard-argmax mapping
        density_class = density_out['pred_class']
        birads_class  = birads_out['pred_class']
        density_risk  = float(self.DENSITY_RISK_MAP.get(density_class, 50))
        birads_risk   = float(self.BIRADS_RISK_MAP.get(int(birads_class), 50))

        future_risk = (
            self.CNN_WEIGHT      * cnn_risk +
            self.BIRADS_WEIGHT   * birads_risk +
            self.DENSITY_WEIGHT  * density_risk
        )
        future_risk = float(max(0.0, min(100.0, future_risk)))

        # Per-image risk level + feedback (same thresholds)
        lvl = self._risk_level_and_feedback(future_risk, low_confidence_note=False)

        # Build the response using the Sprint 2 schema field names
        result = {
            'image_path'            : image_path,
            'predicted_cancer_class': cancer_out['pred_class'],
            'predicted_density'     : density_out['pred_class'],
            'predicted_birads'      : int(birads_out['pred_class']),
            'cnn_risk_score'        : round(float(cnn_risk),    2),
            'density_risk_score'    : round(density_risk,        2),
            'birads_risk_score'     : round(birads_risk,         2),
            'future_risk_score'     : round(future_risk,         2),
            'risk_level'            : lvl['risk_level'],
            'feedback'              : lvl['feedback'],

            # Sprint 3 additive fields (calibrated probabilities)
            'cancer_probabilities'  : {k: round(v, 4) for k, v in cancer_out ['probabilities'].items()},
            'density_probabilities' : {k: round(v, 4) for k, v in density_out['probabilities'].items()},
            'birads_probabilities'  : {k: round(v, 4) for k, v in birads_out ['probabilities'].items()},
        }

        if include_overlays:
            # Sprint 3 additive field: Grad-CAM++ heatmap overlays as base64 PNGs
            overlays = {
                # Three cancer overlays (one per class) - clinician can compare evidence
                'cancer_Normal'   : cancer_out ['overlays'].get('Normal',    ''),
                'cancer_Benign'   : cancer_out ['overlays'].get('Benign',    ''),
                'cancer_Malignant': cancer_out ['overlays'].get('Malignant', ''),
                # Single density / BIRADS overlay - on predicted class
                'density'         : density_out['overlays'].get(str(density_class), ''),
                'birads'          : birads_out ['overlays'].get(str(birads_class),  ''),
                # Resized original for side-by-side display
                'original'        : cancer_out ['original_base64'],
            }
            result['heatmap_overlays'] = overlays

        return result

    # --------------- patient-level analysis ---------------
    def analyze_patient(self,
                        images_with_metadata: List[Dict[str, Any]],
                        include_overlays: bool = True) -> Dict[str, Any]:
        """Process one or more views of a single patient and aggregate.

        Returns a dict in the existing Sprint 2 schema:
            - number_of_images
            - image_level_results : list of per-image dicts
            - highest_density_risk_score
            - highest_birads_risk_score
            - future_risk_score (patient-level)
            - risk_level
            - feedback
        Plus Sprint 3 additive fields:
            - confidence, pred_class, most_suspicious_index, most_suspicious_view
        """
        if not images_with_metadata:
            raise ValueError('At least one image is required.')

        image_level_results = [
            self.analyze_image(
                image_path = entry['image_path'],
                age        = entry.get('age'),
                view       = entry.get('view', 'CC'),
                laterality = entry.get('laterality', 'L'),
                source     = entry.get('source', 'ddsm'),
                include_overlays = include_overlays,
            )
            for entry in images_with_metadata
        ]

        # Per-image future_risk_scores for patient-level aggregation
        risks      = np.array([r['future_risk_score'] for r in image_level_results], dtype=np.float32)
        future_risk = float(risks.max())                           # max-severity (Sprint 2 rule)
        max_idx    = int(risks.argmax())
        risk_std   = float(risks.std()) if len(risks) > 1 else 0.0
        confidence = float(np.clip(100.0 - 2.0 * risk_std, 0.0, 100.0))

        # Highest density / birads risk across views (Sprint 2 field names)
        highest_density_risk = float(max(r['density_risk_score'] for r in image_level_results))
        highest_birads_risk  = float(max(r['birads_risk_score']  for r in image_level_results))

        # Patient-level class (max-severity over views, using calibrated probabilities)
        max_p_mal = max(r['cancer_probabilities'].get('Malignant', 0.0) for r in image_level_results)
        max_p_ben = max(r['cancer_probabilities'].get('Benign',    0.0) for r in image_level_results)
        if max_p_mal > self.PATIENT_MALIGNANT_THRESHOLD:
            pred_class = 'Malignant'
        elif max_p_ben > self.PATIENT_BENIGN_THRESHOLD:
            pred_class = 'Benign'
        else:
            pred_class = 'Normal'

        low_conf = (confidence < self.LOW_CONFIDENCE_THRESHOLD and len(image_level_results) > 1)
        patient_lvl = self._risk_level_and_feedback(future_risk, low_confidence_note=low_conf)

        return {
            # Sprint 2 schema fields (unchanged names)
            'number_of_images'          : len(image_level_results),
            'image_level_results'       : image_level_results,
            'highest_density_risk_score': round(highest_density_risk, 2),
            'highest_birads_risk_score' : round(highest_birads_risk,  2),
            'future_risk_score'         : round(future_risk,           2),
            'risk_level'                : patient_lvl['risk_level'],
            'feedback'                  : patient_lvl['feedback'],

            # Sprint 3 additive fields (frontend can adopt when ready)
            'confidence'                : round(confidence, 2),
            'pred_class'                : pred_class,
            'most_suspicious_index'     : max_idx,
            'most_suspicious_view'      : image_level_results[max_idx]['image_path'],
        }
