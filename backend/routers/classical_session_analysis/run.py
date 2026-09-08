import base64
import io
import os
import tempfile
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
from PIL import Image

from .qinterval_classifier import CLASS_NAMES, crop_breast, load_image
from .risk_inference_engine import RiskInferenceEngine


MODELS_DIR = os.getenv(
    "QIL_MODELS_DIR",
    str(Path(__file__).resolve().parent / "models"),
)

SLOT_META = {
    "L-CC": ("CC", "L"),
    "L-MLO": ("MLO", "L"),
    "R-CC": ("CC", "R"),
    "R-MLO": ("MLO", "R"),
}

SLOT_ORDER = ["L-CC", "L-MLO", "R-CC", "R-MLO"]
DISPLAY_SIZE = 512
HEATMAP_ALPHA = 0.45

# Occlusion grid: patch=64, stride=64 gives a 6×6 grid on the 384px input
# (36 passes per view) vs the default stride=32 which gives 11×11=121 passes.
# Non-overlapping patches are still faithful occlusion — every pixel is occluded
# exactly once — the heatmap is just coarser before the final upsample.
OCC_PATCH = 64
OCC_STRIDE = 64


@lru_cache(maxsize=1)
def _get_engine() -> RiskInferenceEngine:
    return RiskInferenceEngine.load_from_folder(MODELS_DIR)


def _png_b64(arr: np.ndarray) -> str:
    if arr is None:
        return ""
    if arr.dtype != np.uint8:
        arr = np.clip(arr, 0, 255).astype(np.uint8)
    buf = io.BytesIO()
    Image.fromarray(arr).save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("utf-8")


def _render_heatmap_triplet(engine, image_path, age, view, laterality, pred_idx):
    gray = crop_breast(load_image(image_path))
    occ = engine.cancer.occlusion_map(
        gray, view=view, laterality=laterality, age=age, target=pred_idx,
        patch=OCC_PATCH, stride=OCC_STRIDE,
    )
    base_gray = cv2.resize(gray, (DISPLAY_SIZE, DISPLAY_SIZE), interpolation=cv2.INTER_AREA)
    occ_r = cv2.resize(occ, (DISPLAY_SIZE, DISPLAY_SIZE), interpolation=cv2.INTER_CUBIC)
    base_rgb = cv2.cvtColor(base_gray, cv2.COLOR_GRAY2RGB)
    heat_rgb = cv2.cvtColor(
        cv2.applyColorMap(occ_r, cv2.COLORMAP_JET), cv2.COLOR_BGR2RGB
    )
    overlay_rgb = cv2.addWeighted(base_rgb, 1.0 - HEATMAP_ALPHA, heat_rgb, HEATMAP_ALPHA, 0)
    return _png_b64(heat_rgb), _png_b64(base_rgb), _png_b64(overlay_rgb)


def run(views: dict, age: Optional[float]) -> dict:
    """Classical session analysis engine entry point.

    Args:
        views: {"L-CC": bytes, "L-MLO": bytes, "R-CC": bytes, "R-MLO": bytes}
        age:   Patient age in years, or None.

    Returns:
        Normalised model_result dict (see session_analysis/IMPLEMENTATION.md).
    """
    engine = _get_engine()
    tmp_paths = []

    try:
        images_with_metadata = []
        slot_meta = {}

        for slot in SLOT_ORDER:
            tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
            tmp.write(views[slot])
            tmp.close()
            tmp_paths.append(tmp.name)

            view_name, laterality = SLOT_META[slot]
            meta = {
                "image_path": tmp.name,
                "age": age,
                "view": view_name,
                "laterality": laterality,
                "source": "ddsm",
            }
            images_with_metadata.append(meta)
            slot_meta[slot] = meta

        engine_out = engine.analyze_patient(images_with_metadata, include_overlays=False)
        image_results = engine_out["image_level_results"]

        def _heatmap_job(args):
            slot, result = args
            meta = slot_meta[slot]
            pred = result["predicted_cancer_class"]
            pred_idx = CLASS_NAMES.index(pred) if pred in CLASS_NAMES else 0
            return slot, _render_heatmap_triplet(
                engine, meta["image_path"], meta["age"],
                meta["view"], meta["laterality"], pred_idx,
            )

        with ThreadPoolExecutor(max_workers=4) as pool:
            cam_data = dict(pool.map(_heatmap_job, zip(SLOT_ORDER, image_results)))

        result_views = {}
        for slot, result in zip(SLOT_ORDER, image_results):
            probs = result["cancer_probabilities"]
            pred = result["predicted_cancer_class"]
            heat_b64, orig_b64, overlay_b64 = cam_data.get(slot, ("", "", ""))
            birads = result.get("predicted_birads")
            if birads is not None:
                birads = int(birads)

            result_views[slot] = {
                "result": pred,
                "score": round(float(probs.get(pred, 0.0)), 4),
                "class_probabilities": {
                    "Normal": round(float(probs.get("Normal", 0.0)), 4),
                    "Benign": round(float(probs.get("Benign", 0.0)), 4),
                    "Malignant": round(float(probs.get("Malignant", 0.0)), 4),
                },
                "explainability": {
                    "base_image_base64": orig_b64,
                    "heatmap_base64": heat_b64,
                    "overlay_base64": overlay_b64,
                },
                "density": result.get("predicted_density"),
                "birads": birads,
            }

        any_malignant = any(v["result"] == "Malignant" for v in result_views.values())

        if any_malignant:
            risk_score, risk_level = None, "Not Applicable"
        else:
            future_risk = engine_out.get("future_risk_score")
            if future_risk is None:
                risk_score, risk_level = None, "Not Applicable"
            else:
                risk_score = round(float(future_risk), 2)
                risk_level = engine_out["risk_level"]

        return {
            "views": result_views,
            "mammo_risk": {"score": risk_score, "level": risk_level},
        }

    finally:
        for path in tmp_paths:
            try:
                os.remove(path)
            except OSError:
                pass
