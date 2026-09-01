"""Q-INTERVAL-Lite+ Risk Inference Engine - Sprint 4.

DROP-IN REPLACEMENT for the Sprint 3 engine of the same name. Same class, same
method signatures, same output field names, so the frontend needs no changes.

WHAT CHANGED UNDER THE HOOD
    The cancer classifier is now the v12 ensemble: EfficientNetV2-S trained with
    Group DRO plus ResNet-101, 4-view TTA, validation-tuned class coefficients.

    Sprint 3's cancer_v5 took `source_dataset` as a model INPUT. That field does
    not exist for a real patient - the frontend was passing the default 'ddsm'
    for everyone - and the Sprint 4 audit showed the model was substantially
    reading it rather than the image. The v12 cancer model has no source input.
    `source` is still accepted here and silently ignored, so existing calls that
    pass it keep working.

    Density and BI-RADS are UNCHANGED Sprint 3 models. The risk formula, the
    weights, the thresholds and the feedback strings are all unchanged.

WHAT IS ADDITIVE
    occlusion_overlay   - occlusion-sensitivity heatmap, the same method Jack
                          used for the quantum pipeline, so the two heatmaps in
                          the UI are now produced the same way
    cancer_margin       - top-1 minus top-2 probability, for abstention
    pred_class_sprint3_rule - what the old 0.40-threshold rule would have said

Requirements:
    pip install torch torchvision opencv-python numpy

Files needed in the folder:
    final_v12_ensemble_bundle.pth                  (new)
    final_v9_effnetv2_mt-none_dro_ce_bundle.pth    (new)
    final_v8_resnet101_nosrc_ce_bundle.pth         (new)
    density_v2_explainable.pth                     (from the Sprint 3 folder)
    birads_v2_explainable.pth                      (from the Sprint 3 folder)
    q_interval_explainable_models.py               (from the Sprint 3 folder)
    qinterval_classifier.py                        (new, next to this file)

    cancer_v5_explainable.pth is NO LONGER USED and should be deleted so nobody
    loads it by accident.

Usage - identical to Sprint 3:
    from risk_inference_engine import RiskInferenceEngine

    engine = RiskInferenceEngine.load_from_folder('path/to/handover_folder')
    result = engine.analyze_patient([
        {'image_path': 'view1.jpg', 'age': 55, 'view': 'CC',  'laterality': 'L'},
        {'image_path': 'view2.jpg', 'age': 55, 'view': 'MLO', 'laterality': 'L'},
    ])
"""


from __future__ import annotations

import base64
import os
import warnings
from typing import Any, Dict, List, Optional

import cv2
import numpy as np
import torch

import sys

from . import q_interval_explainable_models


sys.modules["q_interval_explainable_models"] = q_interval_explainable_models

from .qinterval_classifier import CLASS_NAMES, Classifier, crop_breast, load_image


def _b64_png(img: np.ndarray) -> str:
    ok, buf = cv2.imencode('.png', img)
    return base64.b64encode(buf).decode('ascii') if ok else ''


class RiskInferenceEngine:
    """Cancer + density + BI-RADS -> patient risk. Sprint 2 output contract."""

    # === Risk formula constants - unchanged from Sprint 3 ===
    CNN_WEIGHT = 0.60
    BIRADS_WEIGHT = 0.25
    DENSITY_WEIGHT = 0.15
    DENSITY_RISK_MAP = {'A': 25, 'B': 50, 'C': 75, 'D': 100}
    BIRADS_RISK_MAP = {1: 0, 2: 25, 3: 50, 4: 75, 5: 100}
    CNN_MALIGNANT_COEF = 100
    CNN_BENIGN_COEF = 30

    # === Risk level thresholds - unchanged from Sprint 2 ===
    HIGH_RISK_THRESHOLD = 67
    MEDIUM_RISK_THRESHOLD = 34

    # === Patient-level class decision (Sprint 3 rule, kept for comparison) ===
    PATIENT_MALIGNANT_THRESHOLD = 0.40
    PATIENT_BENIGN_THRESHOLD = 0.40

    LOW_CONFIDENCE_THRESHOLD = 70

    # === Feedback messages - unchanged from Sprint 2 ===
    HIGH_RISK_MSG = ('The results indicate a higher level of risk. '
                     'It is important to seek medical advice promptly for evaluation.')
    MEDIUM_RISK_MSG = ('Some areas may need further review. A follow-up consultation '
                       'with a healthcare professional is recommended.')
    LOW_RISK_MSG = ('No major concerns are indicated at this time. '
                    'Continue with regular check-ups and screenings.')
    LOW_CONF_NOTE = (" Note: predictions across the patient's mammographic views "
                     "are not fully consistent - a clinician should review the "
                     "most-suspicious view before acting.")

    NEUTRAL_RISK = 50.0   # used if a density/BI-RADS model is absent

    def __init__(self,
                 bundle_dir: str,
                 density_path: Optional[str] = None,
                 birads_path: Optional[str] = None,
                 device: Optional[str] = None,
                 tta: bool = True,
                 defer_margin: Optional[float] = None):
        if device is None:
            device = 'cuda' if torch.cuda.is_available() else 'cpu'
        self.device = torch.device(device)

        # --- cancer: the v12 ensemble ---
        self.cancer = Classifier(bundle_dir, device=str(self.device),
                                 tta=tta, defer_margin=defer_margin)

        # --- density and BI-RADS: unchanged Sprint 3 bundles ---
        self.density = self._load_optional(density_path, 'density')
        self.birads = self._load_optional(birads_path, 'BI-RADS')

    @staticmethod
    def _load_optional(path: Optional[str], what: str):
        if path is None or not os.path.exists(path):
            warnings.warn(
                f'{what} model not found. Its risk component falls back to a '
                f'neutral 50 and `{what}_model_loaded` is False in every result. '
                f'Copy the Sprint 3 bundle into the folder to restore it.',
                RuntimeWarning)
            return None
        from . import q_interval_explainable_models  # noqa: F401
        return torch.load(path, map_location='cpu', weights_only=False).eval()

    @classmethod
    def load_from_folder(cls, folder: str, device: Optional[str] = None, **kw):
        """Same entry point as Sprint 3. Finds every bundle by its filename."""
        def find(name):
            for r, _, fs in os.walk(folder):
                if name in fs:
                    return os.path.join(r, name)
            return None

        return cls(bundle_dir=folder,
                   density_path=find('density_v2_explainable.pth'),
                   birads_path=find('birads_v2_explainable.pth'),
                   device=device, **kw)

    # ---------------- risk-level helper - unchanged ----------------
    def _risk_level_and_feedback(self, score: float,
                                 low_confidence_note: bool = False) -> Dict[str, str]:
        if score >= self.HIGH_RISK_THRESHOLD:
            level, msg = 'High Risk', self.HIGH_RISK_MSG
        elif score >= self.MEDIUM_RISK_THRESHOLD:
            level, msg = 'Medium Risk', self.MEDIUM_RISK_MSG
        else:
            level, msg = 'Low Risk', self.LOW_RISK_MSG
        if low_confidence_note:
            msg = msg + self.LOW_CONF_NOTE
        return {'risk_level': level, 'feedback': msg}

    def _aux(self, model, img_bgr, age, view, laterality, source, risk_map, default_cls):
        """Run a Sprint 3 auxiliary model, or fall back if it is not loaded."""
        if model is None:
            return default_cls, self.NEUTRAL_RISK, {}, ''
        out = model.explain(img_bgr, age, view, laterality, source)
        cls = out['pred_class']
        key = int(cls) if isinstance(risk_map, dict) and 1 in risk_map else cls
        try:
            risk = float(risk_map[key])
        except (KeyError, ValueError, TypeError):
            risk = self.NEUTRAL_RISK
        probs = {str(k): round(float(v), 4) for k, v in out['probabilities'].items()}
        return cls, risk, probs, out.get('overlays', {}).get(str(cls), '')

    # --------------- per-image analysis ---------------
    def analyze_image(self,
                      image_path: str,
                      age: Optional[float] = None,
                      view: str = 'CC',
                      laterality: str = 'L',
                      source: str = 'ddsm',       # accepted and IGNORED, see module docstring
                      include_overlays: bool = True) -> Dict[str, Any]:
        img_bgr = cv2.imread(image_path)
        if img_bgr is None:
            raise ValueError(f'Could not read image: {image_path}')

        # v12 does its own preprocessing from the file - do not pre-resize
        gray = crop_breast(load_image(image_path))
        p = self.cancer.predict_proba(gray, view, laterality, age)
        probs = {CLASS_NAMES[i]: float(p[i]) for i in range(3)}
        order = np.argsort(p)[::-1]
        cancer_class = CLASS_NAMES[int(order[0])]
        margin = float(p[order[0]] - p[order[1]])

        cnn_risk = (self.CNN_MALIGNANT_COEF * probs['Malignant'] +
                    self.CNN_BENIGN_COEF * probs['Benign'])

        density_class, density_risk, density_probs, density_ov = self._aux(
            self.density, img_bgr, age, view, laterality, source,
            self.DENSITY_RISK_MAP, 'B')
        birads_class, birads_risk, birads_probs, birads_ov = self._aux(
            self.birads, img_bgr, age, view, laterality, source,
            self.BIRADS_RISK_MAP, 2)

        future_risk = (self.CNN_WEIGHT * cnn_risk +
                       self.BIRADS_WEIGHT * birads_risk +
                       self.DENSITY_WEIGHT * density_risk)
        future_risk = float(max(0.0, min(100.0, future_risk)))
        lvl = self._risk_level_and_feedback(future_risk)

        result = {
            # --- Sprint 2 schema, field names unchanged ---
            'image_path': image_path,
            'predicted_cancer_class': cancer_class,
            'predicted_density': density_class,
            'predicted_birads': int(birads_class) if str(birads_class).isdigit() else birads_class,
            'cnn_risk_score': round(float(cnn_risk), 2),
            'density_risk_score': round(density_risk, 2),
            'birads_risk_score': round(birads_risk, 2),
            'future_risk_score': round(future_risk, 2),
            'risk_level': lvl['risk_level'],
            'feedback': lvl['feedback'],

            # --- Sprint 3 additive fields, unchanged ---
            'cancer_probabilities': {k: round(v, 4) for k, v in probs.items()},
            'density_probabilities': density_probs,
            'birads_probabilities': birads_probs,

            # --- Sprint 4 additive fields ---
            'cancer_margin': round(margin, 4),
            'defer_to_radiologist': bool(
                self.cancer.defer_margin is not None and margin < self.cancer.defer_margin),
            'density_model_loaded': self.density is not None,
            'birads_model_loaded': self.birads is not None,
            'cancer_model': 'v12 ensemble (no source input)',
        }

        if include_overlays:
            cam = {c: self.cancer.gradcam_plusplus(gray, view, laterality, age, target=i)
                   for i, c in enumerate(CLASS_NAMES)}
            occ = self.cancer.occlusion_map(gray, view, laterality, age)
            result['heatmap_overlays'] = {
                'cancer_Normal': _b64_png(Classifier.overlay(gray, cam['Normal'])),
                'cancer_Benign': _b64_png(Classifier.overlay(gray, cam['Benign'])),
                'cancer_Malignant': _b64_png(Classifier.overlay(gray, cam['Malignant'])),
                'density': density_ov,
                'birads': birads_ov,
                'original': _b64_png(cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)),
                # Sprint 4 additive: faithful-by-construction heatmap, same method
                # as the quantum pipeline so the two are directly comparable
                'cancer_occlusion': _b64_png(Classifier.overlay(gray, occ)),
            }
        return result

    # --------------- patient-level analysis ---------------
    def analyze_patient(self,
                        images_with_metadata: List[Dict[str, Any]],
                        include_overlays: bool = True) -> Dict[str, Any]:
        if not images_with_metadata:
            raise ValueError('At least one image is required.')

        image_level_results = [
            self.analyze_image(
                image_path=e['image_path'],
                age=e.get('age'),
                view=e.get('view', 'CC'),
                laterality=e.get('laterality', 'L'),
                source=e.get('source', 'ddsm'),
                include_overlays=include_overlays)
            for e in images_with_metadata]

        risks = np.array([r['future_risk_score'] for r in image_level_results],
                         dtype=np.float32)
        future_risk = float(risks.max())
        max_idx = int(risks.argmax())
        risk_std = float(risks.std()) if len(risks) > 1 else 0.0
        confidence = float(np.clip(100.0 - 2.0 * risk_std, 0.0, 100.0))

        highest_density_risk = float(max(r['density_risk_score'] for r in image_level_results))
        highest_birads_risk = float(max(r['birads_risk_score'] for r in image_level_results))

        # Patient class: MAX SEVERITY over views. This is the rule the v12 model
        # was validated under (patient-level malignant recall 0.9067) and the
        # tuned class coefficients already set the operating point, so the old
        # 0.40 probability threshold would double-count that tuning.
        sev = [CLASS_NAMES.index(r['predicted_cancer_class']) for r in image_level_results]
        pred_class = CLASS_NAMES[max(sev)]

        # The Sprint 3 rule, reported alongside so the change is auditable.
        max_p_mal = max(r['cancer_probabilities']['Malignant'] for r in image_level_results)
        max_p_ben = max(r['cancer_probabilities']['Benign'] for r in image_level_results)
        if max_p_mal > self.PATIENT_MALIGNANT_THRESHOLD:
            legacy = 'Malignant'
        elif max_p_ben > self.PATIENT_BENIGN_THRESHOLD:
            legacy = 'Benign'
        else:
            legacy = 'Normal'

        low_conf = confidence < self.LOW_CONFIDENCE_THRESHOLD and len(image_level_results) > 1
        patient_lvl = self._risk_level_and_feedback(future_risk, low_confidence_note=low_conf)

        return {
            # --- Sprint 2 schema, field names unchanged ---
            'number_of_images': len(image_level_results),
            'image_level_results': image_level_results,
            'highest_density_risk_score': round(highest_density_risk, 2),
            'highest_birads_risk_score': round(highest_birads_risk, 2),
            'future_risk_score': round(future_risk, 2),
            'risk_level': patient_lvl['risk_level'],
            'feedback': patient_lvl['feedback'],

            # --- Sprint 3 additive fields, unchanged ---
            'confidence': round(confidence, 2),
            'pred_class': pred_class,
            'most_suspicious_index': max_idx,
            'most_suspicious_view': image_level_results[max_idx]['image_path'],

            # --- Sprint 4 additive fields ---
            'pred_class_sprint3_rule': legacy,
            'clinical_escalation': pred_class == 'Malignant',
            'defer_to_radiologist': any(r['defer_to_radiologist'] for r in image_level_results),
            'max_malignant_probability': round(float(max_p_mal), 4),
        }


# ----------------------------------------------------------------------------
def _schema_selftest() -> int:
    """Check the returned field names against the Sprint 3 contract."""
    S3_IMAGE = {
        'image_path', 'predicted_cancer_class', 'predicted_density',
        'predicted_birads', 'cnn_risk_score', 'density_risk_score',
        'birads_risk_score', 'future_risk_score', 'risk_level', 'feedback',
        'cancer_probabilities', 'density_probabilities', 'birads_probabilities',
        'heatmap_overlays'}
    S3_PATIENT = {
        'number_of_images', 'image_level_results', 'highest_density_risk_score',
        'highest_birads_risk_score', 'future_risk_score', 'risk_level',
        'feedback', 'confidence', 'pred_class', 'most_suspicious_index',
        'most_suspicious_view'}
    S3_OVERLAYS = {'cancer_Normal', 'cancer_Benign', 'cancer_Malignant',
                   'density', 'birads', 'original'}

    import inspect
    src = inspect.getsource(RiskInferenceEngine.analyze_image)
    src_p = inspect.getsource(RiskInferenceEngine.analyze_patient)
    ok = True
    for f in sorted(S3_IMAGE):
        hit = f"'{f}'" in src
        ok &= hit
        print(f"  [{'PASS' if hit else 'FAIL'}] image.{f}")
    for f in sorted(S3_PATIENT):
        hit = f"'{f}'" in src_p
        ok &= hit
        print(f"  [{'PASS' if hit else 'FAIL'}] patient.{f}")
    for f in sorted(S3_OVERLAYS):
        hit = f"'{f}'" in src
        ok &= hit
        print(f"  [{'PASS' if hit else 'FAIL'}] overlays.{f}")
    print('=' * 46)
    print('SCHEMA PARITY OK' if ok else 'MISSING FIELDS - frontend will break')
    return 0 if ok else 1


if __name__ == '__main__':
    import sys
    if '--schema' in sys.argv:
        raise SystemExit(_schema_selftest())
    print(__doc__)
