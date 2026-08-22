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
"""

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
from . import q_interval_explainable_models as _qiem
_sys.modules.setdefault("q_interval_explainable_models", _qiem)
from .q_interval_explainable_models import QIntervalExplainable   # noqa: F401,E402


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
