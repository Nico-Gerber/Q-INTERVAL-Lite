"""Provenance for the prepared images, generated from the export config.

This is NOT the deployment preprocessing module. It records how the prepared
files were produced and provides decoding only. prepare_raw / prepare_baseline
are deliberately absent: re-cropping an already-cropped file, or asserting a
target this notebook does not own, are both wrong here.
"""

from typing import Any, Dict

import cv2
import numpy as np

CLASS_NAMES = ('Normal', 'Benign', 'Malignant')

CONTRACT: Dict[str, Any] = {
    'channels': 3,
    'clahe': False,
    'clahe_settings_if_used': {'clip': 2.0, 'grid': [8, 8]},
    'crop': {'margin_frac': 0.03, 'bg_percentile': 1.0, 'abs_margin': 0.02, 'rel_frac': 0.05, 'min_area_frac': 0.02, 'rival_ratio': 0.5, 'faint_factor': 0.5, 'faint_tol': 0.005, 'tight_frac': 0.98, 'detect_max_side': 1024, 'annot_sat': 0.98, 'annot_max_area': 0.02},
    'generated_from': "the export's own reports/config.json",
    'interpolation': 'INTER_AREA when shrinking, INTER_LINEAR when enlarging',
    'name': 'prepared-baseline',
    'native_upscale_limit': 1.0,
    'orientation': 'stored orientation retained; no flips are applied',
    'pad_value': 0,
    'prep_version': 'prep-v2',
    'seed': 42,
    'strict_native': False,
    'supported_input_formats': ['PNG', 'JPEG'],
    'target_h': 2048,
    'target_w': 1024,
    'unsupported': ['DICOM'],
    'variant': 'baseline',
}


def decode_bytes(data: bytes) -> np.ndarray:
    """PNG/JPEG bytes to one channel at the stored bit depth.

    Identical RGB channels are reduced to one; a genuinely coloured image is
    refused rather than averaged, because colour here means an overlay or the
    wrong file. DICOM is not decoded.
    """
    arr = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_UNCHANGED)
    if arr is None:
        raise ValueError("could not decode the image; PNG/JPEG only, "
                         "DICOM is not supported")
    if arr.ndim == 3:
        if arr.shape[2] == 4:
            arr = arr[:, :, :3]
        if not all(np.array_equal(arr[:, :, 0], arr[:, :, c])
                   for c in range(1, arr.shape[2])):
            raise ValueError("channels differ - a genuinely coloured image is "
                             "refused, not averaged")
        arr = arr[:, :, 0]
    return np.ascontiguousarray(arr)
