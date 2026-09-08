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
from .qinterval_classifier import CLASS_NAMES, load_image, crop_breast


router = APIRouter(prefix="/session-analysis", tags=["SessionAnalysis"])

MODELS_DIR = os.getenv(
    "QIL_MODELS_DIR",
    str(Path(__file__).resolve().parent / "models")
)

SLOT_META = {
    "L-CC": ("CC", "L"),
    "L-MLO": ("MLO", "L"),
    "R-CC": ("CC", "R"),
    "R-MLO": ("MLO", "R"),
}

PATIENT_MALIGNANT_THRESHOLD = 0.5
DISPLAY_SIZE = 512
HEATMAP_ALPHA = 0.45


@lru_cache(maxsize=1)
def get_engine() -> RiskInferenceEngine:
    return RiskInferenceEngine.load_from_folder(MODELS_DIR)


def _png_b64(arr: np.ndarray) -> str:
    """
    Encode a uint8 RGB image as raw base64 PNG.

    No `data:image/png;base64,` prefix is added because the existing
    frontend contract expects raw base64.
    """
    if arr is None:
        return ""

    if arr.dtype != np.uint8:
        arr = np.clip(arr, 0, 255).astype(np.uint8)

    buf = io.BytesIO()
    Image.fromarray(arr).save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("utf-8")


def _render_occlusion_triplet(
    engine: RiskInferenceEngine,
    image_path: str,
    age: Optional[float],
    view: str,
    laterality: str,
    pred_idx: int,
):
    """
    Generate the three images used by the frontend/VLM:

        base_image_base64 -> mammogram only
        heatmap_base64    -> occlusion-sensitivity colour map only
        overlay_base64    -> mammogram + occlusion map

    IMPORTANT:
    This uses Classifier.occlusion_map(), NOT Grad-CAM++.

    The Quantum classifier also uses occlusion sensitivity, so this keeps the
    Classical and Quantum explainability methods conceptually aligned.
    """
    gray = crop_breast(load_image(image_path))

    # Faithful occlusion-sensitivity map for the predicted class.
    occ = engine.cancer.occlusion_map(
        gray,
        view=view,
        laterality=laterality,
        age=age,
        target=pred_idx,
    )

    base_gray = cv2.resize(
        gray,
        (DISPLAY_SIZE, DISPLAY_SIZE),
        interpolation=cv2.INTER_AREA,
    )

    occ_resized = cv2.resize(
        occ,
        (DISPLAY_SIZE, DISPLAY_SIZE),
        interpolation=cv2.INTER_CUBIC,
    )

    # Original mammogram as RGB.
    base_rgb = cv2.cvtColor(base_gray, cv2.COLOR_GRAY2RGB)

    # Colour-only heatmap as RGB.
    heat_bgr = cv2.applyColorMap(occ_resized, cv2.COLORMAP_JET)
    heat_rgb = cv2.cvtColor(heat_bgr, cv2.COLOR_BGR2RGB)

    # Real overlay matching the semantic meaning of overlay_base64.
    overlay_rgb = cv2.addWeighted(
        base_rgb,
        1.0 - HEATMAP_ALPHA,
        heat_rgb,
        HEATMAP_ALPHA,
        0,
    )

    return (
        _png_b64(heat_rgb),
        _png_b64(base_rgb),
        _png_b64(overlay_rgb),
    )


def _original_only(image_path: str) -> str:
    """
    Return the same cropped/resized mammogram used by the Classical model
    display path, without generating a heatmap.
    """
    gray = crop_breast(load_image(image_path))

    base_gray = cv2.resize(
        gray,
        (DISPLAY_SIZE, DISPLAY_SIZE),
        interpolation=cv2.INTER_AREA,
    )

    base_rgb = cv2.cvtColor(base_gray, cv2.COLOR_GRAY2RGB)
    return _png_b64(base_rgb)


def _build_classification(slot_order, image_results, cam_data):
    """
    Convert RiskInferenceEngine output to the frontend's classification shape.
    """
    views = {}

    for slot, result in zip(slot_order, image_results):
        probs = result["cancer_probabilities"]
        pred = result["predicted_cancer_class"]

        heat_b64, orig_b64, overlay_b64 = cam_data.get(
            slot,
            ("", "", ""),
        )

        views[slot] = {
            "result": pred,
            "score": round(float(probs.get(pred, 0.0)), 4),
            "class_probabilities": {
                "Normal": round(float(probs.get("Normal", 0.0)), 4),
                "Benign": round(float(probs.get("Benign", 0.0)), 4),
                "Malignant": round(float(probs.get("Malignant", 0.0)), 4),
            },
            "gradcam": {
                # Keep the existing field name for frontend compatibility.
                # These are now occlusion-sensitivity images.
                "base_image_base64": orig_b64,
                "heatmap_base64": heat_b64,
                "overlay_base64": overlay_b64,
                "width": DISPLAY_SIZE,
                "height": DISPLAY_SIZE,
                "method": "occlusion_sensitivity",
                "target_class": pred,
            },
        }

    def malignant_probability(slot: str) -> float:
        return views[slot]["class_probabilities"]["Malignant"]

    left_score = (
        malignant_probability("L-CC")
        + malignant_probability("L-MLO")
    ) / 2.0

    right_score = (
        malignant_probability("R-CC")
        + malignant_probability("R-MLO")
    ) / 2.0

    patient_score = max(left_score, right_score)
    malignant_detected = patient_score > PATIENT_MALIGNANT_THRESHOLD

    aggregated = {
        "overall_classification":
            "Malignant" if malignant_detected else "Non-Malignant",
        "left_malignant_score": round(left_score, 4),
        "right_malignant_score": round(right_score, 4),
        "patient_malignant_score": round(patient_score, 4),
        "malignant_detected": malignant_detected,
    }

    return {
        "views": views,
        "aggregated": aggregated,
    }


def _build_composite_risk(engine_out):
    """
    Preserve the existing composite-risk response contract.
    """
    image_results = engine_out["image_level_results"]
    classes = [
        result["predicted_cancer_class"]
        for result in image_results
    ]

    if "Malignant" in classes:
        return {
            "number_of_images": engine_out["number_of_images"],
            "image_level_results": image_results,
            "final_predicted_class": "Malignant",
            "future_risk_score": None,
            "risk_level": "Not Applicable",
            "feedback": (
                "A malignant finding was detected in at least one image. "
                "Future cancer risk estimation is not applicable because "
                "the case is already classified as cancer-suspicious. "
                "Please seek medical review."
            ),
        }

    final_class = "Benign" if "Benign" in classes else "Normal"
    highest_cnn = max(
        result["cnn_risk_score"]
        for result in image_results
    )

    return {
        "number_of_images": engine_out["number_of_images"],
        "image_level_results": image_results,
        "final_predicted_class": final_class,
        "highest_cnn_risk_score": round(float(highest_cnn), 2),
        "highest_density_risk_score":
            engine_out["highest_density_risk_score"],
        "highest_birads_risk_score":
            engine_out["highest_birads_risk_score"],
        "future_risk_score": engine_out["future_risk_score"],
        "risk_level": engine_out["risk_level"],
        "feedback": engine_out["feedback"],
        "confidence": engine_out.get("confidence"),
        "most_suspicious_view":
            engine_out.get("most_suspicious_view"),
    }


@router.post("/predict-four-views")
async def predict_four_views(
    l_cc: UploadFile = File(...),
    l_mlo: UploadFile = File(...),
    r_cc: UploadFile = File(...),
    r_mlo: UploadFile = File(...),
    age: Optional[float] = Form(None),
    include_heatmaps: bool = Form(True),
):
    uploads = {
        "L-CC": l_cc,
        "L-MLO": l_mlo,
        "R-CC": r_cc,
        "R-MLO": r_mlo,
    }

    for slot, upload in uploads.items():
        if (
            not upload.content_type
            or not upload.content_type.startswith("image/")
        ):
            raise HTTPException(
                status_code=400,
                detail=f"{slot} must be an image file.",
            )

    slot_order = list(uploads.keys())
    engine = get_engine()

    tmp_paths = []
    cam_data = {}

    try:
        images_with_metadata = []
        slot_meta = {}

        # Save uploads to temporary files because the Classical engine accepts
        # file paths.
        for slot in slot_order:
            upload = uploads[slot]
            data = await upload.read()

            suffix = Path(upload.filename or "").suffix or ".png"

            tmp = tempfile.NamedTemporaryFile(
                suffix=suffix,
                delete=False,
            )
            tmp.write(data)
            tmp.close()

            tmp_paths.append(tmp.name)

            view, laterality = SLOT_META[slot]

            meta = {
                "image_path": tmp.name,
                "age": age,
                "view": view,
                "laterality": laterality,

                # Still accepted by RiskInferenceEngine for compatibility,
                # but the v12 cancer classifier ignores source.
                "source": "ddsm",
            }

            images_with_metadata.append(meta)
            slot_meta[slot] = meta

        # Run classification/risk once.
        # Heatmaps are generated explicitly below so there is one clear,
        # predictable explainability path.
        engine_out = engine.analyze_patient(
            images_with_metadata,
            include_overlays=False,
        )

        image_results = engine_out["image_level_results"]

        # Build per-view occlusion visualisations.
        for slot, result in zip(slot_order, image_results):
            meta = slot_meta[slot]

            if include_heatmaps:
                pred = result["predicted_cancer_class"]

                pred_idx = (
                    CLASS_NAMES.index(pred)
                    if pred in CLASS_NAMES
                    else 0
                )

                cam_data[slot] = _render_occlusion_triplet(
                    engine=engine,
                    image_path=meta["image_path"],
                    age=meta["age"],
                    view=meta["view"],
                    laterality=meta["laterality"],
                    pred_idx=pred_idx,
                )
            else:
                cam_data[slot] = (
                    "",
                    _original_only(meta["image_path"]),
                    "",
                )

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Classical analysis failed: {str(exc)}",
        ) from exc

    finally:
        for path in tmp_paths:
            try:
                os.remove(path)
            except OSError:
                pass

    classification = _build_classification(
        slot_order,
        engine_out["image_level_results"],
        cam_data,
    )

    composite_risk = _build_composite_risk(engine_out)

    return JSONResponse(
        content={
            "classification": classification,
            "composite_risk": composite_risk,
        }
    )
