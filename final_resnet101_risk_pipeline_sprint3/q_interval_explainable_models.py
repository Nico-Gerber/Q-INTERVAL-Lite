"""Q-INTERVAL-Lite+ explainable model class.

    import torch
    from q_interval_explainable_models import QIntervalExplainable

    model = torch.load('cancer_v5_explainable.pth', weights_only=False).eval()
    payload = model.explain(image_bgr, age=55, view='CC',
                            laterality='L', source='ddsm')
"""
import io, base64
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torchvision.models import resnet101
import cv2
from PIL import Image


class QIntervalExplainable(nn.Module):
    """Self-contained explainable model for Q-INTERVAL-Lite+ Sprint 3."""

    def __init__(self,
                 task_name='cancer',
                 class_names=('Normal', 'Benign', 'Malignant'),
                 num_classes=3,
                 n_age=8, n_view=3, n_lat=2, n_src=5,
                 emb_dim=16, dropout=0.3,
                 temperature=1.0,
                 input_size=384,
                 norm_mean=(0.485, 0.456, 0.406),
                 norm_std=(0.229, 0.224, 0.225),
                 sources=('cmmd', 'ddsm', 'dmid', 'inbreast', 'kau-bcmd')):
        super().__init__()
        self.backbone = resnet101(weights=None)
        self.backbone.fc = nn.Identity()
        self.age_emb  = nn.Embedding(n_age,  emb_dim)
        self.view_emb = nn.Embedding(n_view, emb_dim)
        self.lat_emb  = nn.Embedding(n_lat,  emb_dim)
        self.src_emb  = nn.Embedding(n_src,  emb_dim)
        self.classifier = nn.Sequential(
            nn.Dropout(dropout), nn.Linear(2048 + 4 * emb_dim, 256),
            nn.ReLU(inplace=True), nn.Dropout(dropout), nn.Linear(256, num_classes),
        )
        self.task_name   = task_name
        self.class_names = list(class_names)
        self.num_classes = num_classes
        self.temperature = float(temperature)
        self.input_size  = int(input_size)
        self.norm_mean   = tuple(norm_mean)
        self.norm_std    = tuple(norm_std)
        self.sources     = list(sources)
        self.n_age, self.n_view, self.n_lat, self.n_src = n_age, n_view, n_lat, n_src

    def forward(self, x, age_idx, view_idx, lat_idx, src_idx):
        feat = self.backbone(x)
        meta = torch.cat([self.age_emb(age_idx), self.view_emb(view_idx),
                          self.lat_emb(lat_idx), self.src_emb(src_idx)], dim=1)
        return self.classifier(torch.cat([feat, meta], dim=1))

    def _preprocess(self, image_bgr):
        img_rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
        rgb_resized = cv2.resize(img_rgb, (self.input_size, self.input_size))
        x = rgb_resized.astype(np.float32) / 255.0
        x = (x - np.array(self.norm_mean)) / np.array(self.norm_std)
        x = np.transpose(x, (2, 0, 1))[None]
        return torch.tensor(x, dtype=torch.float32), rgb_resized

    def _age_bucket(self, age):
        if age is None or (isinstance(age, float) and np.isnan(age)): return 7
        if age < 30: return 0
        if age < 40: return 1
        if age < 50: return 2
        if age < 60: return 3
        if age < 70: return 4
        if age < 80: return 5
        return 6

    def _meta_indices(self, age, view, laterality, source):
        return (
            self._age_bucket(age),
            {'CC': 0, 'MLO': 1}.get(view, 2),
            {'L': 0, 'R': 1}.get(laterality, 0),
            self.sources.index(source) if source in self.sources else 0,
        )

    @torch.no_grad()
    def predict(self, image_bgr, age, view, laterality, source):
        dev = next(self.parameters()).device
        x, _ = self._preprocess(image_bgr)
        x = x.to(dev)
        a, v, l, s = self._meta_indices(age, view, laterality, source)
        logits = self.forward(
            x,
            torch.tensor([a], device=dev),
            torch.tensor([v], device=dev),
            torch.tensor([l], device=dev),
            torch.tensor([s], device=dev),
        )
        probs = F.softmax(logits.float() / self.temperature, dim=1)[0].cpu().numpy()
        pi = int(probs.argmax())
        return {
            'pred_class'    : self.class_names[pi],
            'pred_conf'     : float(probs[pi]),
            'probabilities' : {str(self.class_names[i]): float(probs[i])
                                for i in range(self.num_classes)},
        }

    def gradcam_plus_plus(self, image_bgr, age, view, laterality, source,
                          target_class):
        dev = next(self.parameters()).device
        x, rgb_resized = self._preprocess(image_bgr)
        x = x.to(dev).requires_grad_(True)
        a, v, l, s = self._meta_indices(age, view, laterality, source)

        activations = []
        gradients   = []
        def fwd_hook(m, inp, out):
            activations.append(out)
        def bwd_hook(m, gi, go):
            gradients.append(go[0])
        target_layer = self.backbone.layer4[-1]
        h1 = target_layer.register_forward_hook(fwd_hook)
        h2 = target_layer.register_full_backward_hook(bwd_hook)

        self.zero_grad()
        logits = self.forward(
            x,
            torch.tensor([a], device=dev),
            torch.tensor([v], device=dev),
            torch.tensor([l], device=dev),
            torch.tensor([s], device=dev),
        )
        score = logits[0, int(target_class)]
        score.backward(retain_graph=False)

        A = activations[0][0]
        grads = gradients[0][0]
        h1.remove(); h2.remove()

        grads_sq = grads ** 2
        grads_cu = grads ** 3
        sum_A    = A.sum(dim=(1, 2), keepdim=True)
        alphas   = grads_sq / (2.0 * grads_sq + sum_A * grads_cu + 1e-7)
        alphas   = alphas * (grads > 0).float()
        weights  = (alphas * F.relu(grads)).sum(dim=(1, 2))
        cam      = (weights[:, None, None] * A).sum(dim=0)
        cam      = F.relu(cam)
        if cam.max() > 0:
            cam = cam / cam.max()
        cam_np = cam.detach().cpu().numpy()
        cam_resized = cv2.resize(cam_np, (self.input_size, self.input_size))
        return cam_resized, rgb_resized

    def _overlay(self, rgb_resized, cam, alpha=0.35, top_pct=10,
                 colormap=cv2.COLORMAP_MAGMA):
        thresh = np.percentile(cam, 100 - top_pct)
        masked = np.where(cam >= thresh, cam, 0.0)
        if masked.max() > 0:
            masked = masked / masked.max()
        heatmap = cv2.applyColorMap((masked * 255).astype(np.uint8), colormap)
        heatmap = cv2.cvtColor(heatmap, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        rgb     = rgb_resized.astype(np.float32) / 255.0
        overlay = (1.0 - alpha) * rgb + alpha * heatmap
        return (np.clip(overlay, 0, 1) * 255).astype(np.uint8)

    @staticmethod
    def _to_base64(arr):
        if arr.dtype != np.uint8:
            arr = (np.clip(arr, 0, 1) * 255).astype(np.uint8)
        img = Image.fromarray(arr)
        buf = io.BytesIO()
        img.save(buf, format='PNG')
        return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode('utf-8')

    def explain(self, image_bgr, age, view, laterality, source,
                multi_class=None, alpha=0.35, top_pct=10):
        if multi_class is None:
            multi_class = (self.task_name == 'cancer')

        pred = self.predict(image_bgr, age, view, laterality, source)
        rgb_for_overlay = self._preprocess(image_bgr)[1]

        overlays = {}
        if multi_class:
            for ci, cname in enumerate(self.class_names):
                cam, _ = self.gradcam_plus_plus(image_bgr, age, view,
                                                 laterality, source, target_class=ci)
                ov = self._overlay(rgb_for_overlay, cam, alpha=alpha, top_pct=top_pct)
                overlays[str(cname)] = self._to_base64(ov)
        else:
            pi = self.class_names.index(pred['pred_class']) if pred['pred_class'] in self.class_names else 0
            cam, _ = self.gradcam_plus_plus(image_bgr, age, view, laterality,
                                             source, target_class=pi)
            ov = self._overlay(rgb_for_overlay, cam, alpha=alpha, top_pct=top_pct)
            overlays[str(pred['pred_class'])] = self._to_base64(ov)

        return {
            'task'             : self.task_name,
            'pred_class'       : pred['pred_class'],
            'pred_conf'        : pred['pred_conf'],
            'probabilities'    : pred['probabilities'],
            'overlays'         : overlays,
            'original_base64'  : self._to_base64(rgb_for_overlay),
            'input_size'       : self.input_size,
        }
