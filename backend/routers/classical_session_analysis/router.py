

import os
import io
import base64
import tempfile
from pathlib import Path
from functools import lru_cache
from typing import Optional

import cv2
import numpy as np
from PIL import Image

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse

from .risk_inference_engine import RiskInferenceEngine

router = APIRouter(prefix="/session-analysis", tags=["SessionAnalysis"])

MODELS_DIR = os.getenv("QIL_MODELS_DIR", str(Path(__file__).resolve().parent / "models"))

SLOT_META = {
    "L-CC":  ("CC",  "L"),
    "L-MLO": ("MLO", "L"),
    "R-CC":  ("CC",  "R"),
    "R-MLO": ("MLO", "R"),
}

PATIENT_MALIGNANT_THRESHOLD = 0.5  # old S2CNN patient-level gate


@lru_cache(maxsize=1)
def get_engine() -> RiskInferenceEngine:
    return RiskInferenceEngine.load_from_folder(MODELS_DIR)


def _png_b64(arr: np.ndarray) -> str:
    """Raw base64 PNG (no data: prefix) - matches the old Sprint2CNN contract."""
    buf = io.BytesIO()
    Image.fromarray(arr).save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("utf-8")


def _heatmap_and_original(engine, image_path, age, view, lat, source, pred_idx):
    from .qinterval_classifier import load_image, crop_breast
    gray = crop_breast(load_image(image_path))
    cam = engine.cancer.gradcam_plusplus(gray, view, lat, age, target=pred_idx)
    

    DISPLAY_SIZE = 512
    gray_s = cv2.resize(gray, (DISPLAY_SIZE, DISPLAY_SIZE))
    cam_s = cv2.resize(cam, (DISPLAY_SIZE, DISPLAY_SIZE))
    
    heat_bgr = cv2.applyColorMap(cam_s, cv2.COLORMAP_JET)
    heat_rgb = cv2.cvtColor(heat_bgr, cv2.COLOR_BGR2RGB)
    rgb = cv2.cvtColor(gray_s, cv2.COLOR_GRAY2RGB)
    return _png_b64(heat_rgb), _png_b64(rgb)


def _original_only(image_path, size):
    img_bgr = cv2.imread(image_path)
    if img_bgr is None:
        return ""
    rgb = cv2.cvtColor(cv2.resize(img_bgr, (size, size)), cv2.COLOR_BGR2RGB)
    return _png_b64(rgb)


def _build_classification(slot_order, image_results, cam_data, input_size):
    views = {}
    for slot, r in zip(slot_order, image_results):
        probs = r["cancer_probabilities"]
        pred = r["predicted_cancer_class"]
        heat_b64, orig_b64 = cam_data.get(slot, ("", ""))

        views[slot] = {
            "result": pred,
            "score": round(float(probs.get(pred, 0.0)), 4),
            "class_probabilities": {
                "Normal":    round(float(probs.get("Normal", 0.0)), 4),
                "Benign":    round(float(probs.get("Benign", 0.0)), 4),
                "Malignant": round(float(probs.get("Malignant", 0.0)), 4),
            },
            "gradcam": {
                "base_image_base64": orig_b64,
                "overlay_base64":    heat_b64,
                "heatmap_base64":    heat_b64,
                "width": input_size,
                "height": input_size,
            },
        }

    def mal(slot):
        return views[slot]["class_probabilities"]["Malignant"]

    left_score = (mal("L-CC") + mal("L-MLO")) / 2
    right_score = (mal("R-CC") + mal("R-MLO")) / 2
    patient_score = max(left_score, right_score)
    malignant_detected = patient_score > PATIENT_MALIGNANT_THRESHOLD

    aggregated = {
        "overall_classification": "Malignant" if malignant_detected else "Non-Malignant",
        "left_malignant_score":  round(left_score, 4),
        "right_malignant_score": round(right_score, 4),
        "patient_malignant_score": round(patient_score, 4),
        "malignant_detected": malignant_detected,
    }
    return {"views": views, "aggregated": aggregated}


def _build_composite_risk(engine_out):
    image_results = engine_out["image_level_results"]
    classes = [r["predicted_cancer_class"] for r in image_results]

    if "Malignant" in classes:  # gate (old MammoRisk behaviour)
        return {
            "number_of_images": engine_out["number_of_images"],
            "image_level_results": image_results,
            "final_predicted_class": "Malignant",
            "future_risk_score": None,
            "risk_level": "Not Applicable",
            "feedback": (
                "A malignant finding was detected in at least one image. Future "
                "cancer risk estimation is not applicable because the case is "
                "already classified as cancer-suspicious. Please seek medical review."
            ),
        }

    final_class = "Benign" if "Benign" in classes else "Normal"
    highest_cnn = max(r["cnn_risk_score"] for r in image_results)
    return {
        "number_of_images": engine_out["number_of_images"],
        "image_level_results": image_results,
        "final_predicted_class": final_class,
        "highest_cnn_risk_score": round(float(highest_cnn), 2),
        "highest_density_risk_score": engine_out["highest_density_risk_score"],
        "highest_birads_risk_score": engine_out["highest_birads_risk_score"],
        "future_risk_score": engine_out["future_risk_score"],
        "risk_level": engine_out["risk_level"],
        "feedback": engine_out["feedback"],
        "confidence": engine_out.get("confidence"),
        "most_suspicious_view": engine_out.get("most_suspicious_view"),
    }


@router.post("/predict-four-views")
async def predict_four_views(
    l_cc:  UploadFile = File(...),
    l_mlo: UploadFile = File(...),
    r_cc:  UploadFile = File(...),
    r_mlo: UploadFile = File(...),
    age: Optional[float] = Form(None),
    include_heatmaps: bool = Form(True),
):
    uploads = {"L-CC": l_cc, "L-MLO": l_mlo, "R-CC": r_cc, "R-MLO": r_mlo}
    for name, up in uploads.items():
        if not up.content_type or not up.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail=f"{name} must be an image file.")

    slot_order = list(uploads.keys())
    engine = get_engine()
    input_size = int(getattr(engine.cancer, "input_size", 512))

    tmp_paths = []
    cam_data = {}
    try:
        images_with_metadata = []
        slot_meta = {}
        for slot in slot_order:
            data = await uploads[slot].read()
            tf = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
            tf.write(data)
            tf.close()
            tmp_paths.append(tf.name)
            view, lat = SLOT_META[slot]
            meta = {"image_path": tf.name, "age": age, "view": view,
                    "laterality": lat, "source": "ddsm"}
            images_with_metadata.append(meta)
            slot_meta[slot] = meta

        engine_out = engine.analyze_patient(images_with_metadata, include_overlays=False)
        image_results = engine_out["image_level_results"]

        for slot, r in zip(slot_order, image_results):
            m = slot_meta[slot]
            if include_heatmaps:
                pred = r["predicted_cancer_class"]
                from .qinterval_classifier import CLASS_NAMES
                pred_idx = CLASS_NAMES.index(pred) if pred in CLASS_NAMES else 0
                cam_data[slot] = _heatmap_and_original(
                    engine, m["image_path"], m["age"], m["view"],
                    m["laterality"], m["source"], pred_idx,
                )
            else:
                cam_data[slot] = ("", _original_only(m["image_path"], input_size))
    finally:
        for p in tmp_paths:
            try:
                os.remove(p)
            except OSError:
                pass

    classification = _build_classification(
        slot_order, engine_out["image_level_results"], cam_data, input_size
    )
    composite_risk = _build_composite_risk(engine_out)

    return JSONResponse(content={
        "classification": classification,
        "composite_risk": composite_risk,
    })