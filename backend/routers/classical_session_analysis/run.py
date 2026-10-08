"""Classical session analysis engine.

Four models per image, run STRICTLY ONE AT A TIME, and the four views are
processed one at a time too:

    view -> v12 ensemble      -> occlusion preview only
         -> BI-RADS model     -> BI-RADS result + risk component
         -> density model     -> density result + risk component
         -> prep-v2           -> 2048 x 1024
         -> ConvNeXt V2-Huge  -> Normal / Benign / Malignant + probabilities
         -> release, next view

Nothing runs in parallel. The previous version rendered the four heatmaps in a
ThreadPoolExecutor; that is not possible now, because four concurrent ConvNeXt
forwards at 2048x1024 would hold four copies of the activation peak. Sequential
keeps the peak at one view's worth (~1 GB) on top of ~2.6 GB of resident weights.

WHAT CHANGED, AND WHAT DID NOT
------------------------------
Changed: the cancer classification now comes from ConvNeXt V2-Huge instead of the
v12 ensemble, and it feeds the `cnn_risk` term of the risk formula.

Unchanged: the v12 ensemble is still loaded and still produces the occlusion
heatmap. BI-RADS and density run exactly as before. The risk weights
(0.60 / 0.25 / 0.15), the risk maps and the thresholds are read from
RiskInferenceEngine rather than copied, so they cannot drift.

THE HEATMAP DOES NOT EXPLAIN THE PREDICTION
-------------------------------------------
ConvNeXt classifies; the v12 ensemble draws the heatmap. They are different
models. Occlusion on ConvNeXt is not feasible here — 33 forwards per view at a
measured 66 s each is about 36 minutes for one view.

`occlusion_map` is therefore called with `target=None`, so it explains v12's OWN
argmax class. Targeting ConvNeXt's class instead would ask v12 which regions move
a probability it does not assign, and `_to_heatmap` rescales to full range
whatever the magnitude — so a map whose largest effect was 0.001 would render as
vividly as one whose largest effect was 0.6. That turns noise into a confident
picture on exactly the cases where the two models disagree.

UNVALIDATED PREPROCESSING
-------------------------
Uploads reach ConvNeXt through `prep_v2_bridge`, which reproduces prep-v2's first
pass. The published ConvNeXt metrics were measured on prepared PNGs read off disk
and do NOT describe this path. See that module's header.
"""

import base64
import gc
import io
import logging
import os
import tempfile
import time
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import cv2
import numpy as np
import torch
from PIL import Image

from . import convnext_model
from .prep_v2_bridge import PREP_CONTRACT, PrepError, prepare_upload
from .qinterval_classifier import CLASS_NAMES, crop_breast, load_image
from .risk_inference_engine import RiskInferenceEngine

logger = logging.getLogger(__name__)

MODELS_DIR = os.getenv(
    "QIL_MODELS_DIR",
    str(Path(__file__).resolve().parent / "models"),
)
CONVNEXT_BUNDLE = os.getenv("QIL_CONVNEXT_BUNDLE",
                            os.path.join(MODELS_DIR, "convnextv2h_model_bundle.pth"))
CONVNEXT_CONTRACT = os.getenv("QIL_CONVNEXT_CONTRACT",
                              os.path.join(MODELS_DIR, "model_input_v3.py"))

SLOT_META = {
    "L-CC": ("CC", "L"),
    "L-MLO": ("MLO", "L"),
    "R-CC": ("CC", "R"),
    "R-MLO": ("MLO", "R"),
}

SLOT_ORDER = ["L-CC", "L-MLO", "R-CC", "R-MLO"]
DISPLAY_SIZE = 512
HEATMAP_ALPHA = 0.45

# Occlusion grid: patch=64, stride=64 gives a 6x6 grid on the 384px input
# (36 passes per view) vs the default stride=32 which gives 11x11=121 passes.
# Non-overlapping patches are still faithful occlusion - every pixel is occluded
# exactly once - the heatmap is just coarser before the final upsample.
OCC_PATCH = 64
OCC_STRIDE = 64

# The auxiliary models take a source embedding. This is the token the engine has
# always been given here; it is kept so density and BI-RADS behave as before.
SOURCE_TOKEN = "ddsm"


@lru_cache(maxsize=1)
def _get_engine() -> RiskInferenceEngine:
    return RiskInferenceEngine.load_from_folder(MODELS_DIR)


@lru_cache(maxsize=1)
def _get_convnext() -> Tuple[Any, Any, Dict[str, Any]]:
    t0 = time.perf_counter()
    model, contract, meta = convnext_model.load_bundle(
        CONVNEXT_BUNDLE, CONVNEXT_CONTRACT, device="cpu")
    logger.info("ConvNeXt loaded in %.1fs (%s, %d params, %dx%d, T=%.4f)",
                time.perf_counter() - t0, meta["encoder"], meta["parameters"],
                meta["model_h"], meta["model_w"], meta["temperature"])
    return model, contract, meta


def _png_b64(arr: Optional[np.ndarray]) -> str:
    if arr is None:
        return ""
    if arr.dtype != np.uint8:
        arr = np.clip(arr, 0, 255).astype(np.uint8)
    buf = io.BytesIO()
    Image.fromarray(arr).save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("utf-8")


def _render_heatmap_triplet(gray: np.ndarray, occ: np.ndarray) -> Tuple[str, str, str]:
    """Base, heatmap and overlay as PNG base64, all at DISPLAY_SIZE.

    Built from the cropped upload, NOT from ConvNeXt's padded 2048x1024 input, so
    the contract's padding never reaches the screen.
    """
    base_gray = cv2.resize(gray, (DISPLAY_SIZE, DISPLAY_SIZE), interpolation=cv2.INTER_AREA)
    occ_r = cv2.resize(occ, (DISPLAY_SIZE, DISPLAY_SIZE), interpolation=cv2.INTER_CUBIC)
    base_rgb = cv2.cvtColor(base_gray, cv2.COLOR_GRAY2RGB)
    heat_rgb = cv2.cvtColor(
        cv2.applyColorMap(occ_r, cv2.COLORMAP_JET), cv2.COLOR_BGR2RGB
    )
    overlay_rgb = cv2.addWeighted(base_rgb, 1.0 - HEATMAP_ALPHA, heat_rgb, HEATMAP_ALPHA, 0)
    return _png_b64(heat_rgb), _png_b64(base_rgb), _png_b64(overlay_rgb)


def _analyse_one(slot: str, image_bytes: bytes, tmp_path: str,
                 age: Optional[float]) -> Dict[str, Any]:
    """The four models, strictly in sequence, on a single view."""
    view, laterality = SLOT_META[slot]
    engine = _get_engine()
    model, contract, meta = _get_convnext()
    timings: Dict[str, float] = {}

    # ---- 1. v12 ensemble: occlusion preview only ---------------------------
    # target=None -> v12 explains its own predicted class. See the module docstring.
    t = time.perf_counter()
    gray = crop_breast(load_image(tmp_path))
    occ = engine.cancer.occlusion_map(gray, view=view, laterality=laterality, age=age,
                                      target=None, patch=OCC_PATCH, stride=OCC_STRIDE)
    v12_probs = engine.cancer.predict_proba(gray, view, laterality, age)
    v12_class = CLASS_NAMES[int(np.argmax(v12_probs))]
    heat_b64, base_b64, overlay_b64 = _render_heatmap_triplet(gray, occ)
    timings["v12_occlusion"] = time.perf_counter() - t
    del occ
    gc.collect()

    img_bgr = cv2.imread(tmp_path)
    if img_bgr is None:
        raise ValueError(f"could not read {slot} for the auxiliary models")

    # ---- 2. BI-RADS model --------------------------------------------------
    t = time.perf_counter()
    birads_class, birads_risk, _bp, _ = engine._aux(
        engine.birads, img_bgr, age, view, laterality, SOURCE_TOKEN,
        engine.BIRADS_RISK_MAP, 2)
    timings["birads"] = time.perf_counter() - t

    # ---- 3. density model --------------------------------------------------
    t = time.perf_counter()
    density_class, density_risk, _dp, _ = engine._aux(
        engine.density, img_bgr, age, view, laterality, SOURCE_TOKEN,
        engine.DENSITY_RISK_MAP, 'B')
    timings["density"] = time.perf_counter() - t

    del img_bgr, gray
    gc.collect()

    # ---- 4. prep-v2: raw upload -> 2048 x 1024 -----------------------------
    t = time.perf_counter()
    prepared_png, geometry = prepare_upload(image_bytes)
    timings["prepare"] = time.perf_counter() - t

    # ---- 5. ConvNeXt: classification only ----------------------------------
    t = time.perf_counter()
    cnx = convnext_model.classify(model, contract, prepared_png,
                                  meta["temperature"], device="cpu")
    timings["convnext"] = time.perf_counter() - t
    del prepared_png
    gc.collect()                      # release this view's activations before the next

    probs = cnx["probabilities"]
    cancer_class = cnx["predicted_class"]

    # ---- risk formula, ConvNeXt feeding the cnn term -----------------------
    cnn_risk = (RiskInferenceEngine.CNN_MALIGNANT_COEF * probs["Malignant"] +
                RiskInferenceEngine.CNN_BENIGN_COEF * probs["Benign"])
    future_risk = (RiskInferenceEngine.CNN_WEIGHT * cnn_risk +
                   RiskInferenceEngine.BIRADS_WEIGHT * birads_risk +
                   RiskInferenceEngine.DENSITY_WEIGHT * density_risk)
    future_risk = float(max(0.0, min(100.0, future_risk)))

    logger.info("Classical %s: %s (p=%.3f) | v12 %s | occ %.1fs birads %.1fs "
                "density %.1fs prep %.1fs cnx %.1fs",
                slot, cancer_class, probs[cancer_class], v12_class,
                timings["v12_occlusion"], timings["birads"], timings["density"],
                timings["prepare"], timings["convnext"])

    return {
        "cancer_class": cancer_class,
        "cancer_probabilities": probs,
        "v12_classification": v12_class,
        "density_class": density_class,
        "birads_class": birads_class,
        "future_risk": future_risk,
        "explainability": {
            "base_image_base64": base_b64,
            "heatmap_base64": heat_b64,
            "overlay_base64": overlay_b64,
        },
        "geometry": geometry,
        "timings": timings,
    }


def run(views: dict, age: Optional[float]) -> dict:
    """Classical session analysis engine entry point.

    Args:
        views: {"L-CC": bytes, "L-MLO": bytes, "R-CC": bytes, "R-MLO": bytes}
        age:   Patient age in years, or None.

    Returns:
        Normalised model_result dict (see session_analysis/IMPLEMENTATION.md).
    """
    t0 = time.perf_counter()
    _get_convnext()
    _get_engine()
    logger.info("Classical: models ready (%.1fs)", time.perf_counter() - t0)

    tmp_paths = []
    try:
        results: Dict[str, Dict[str, Any]] = {}

        # One view at a time. No ThreadPoolExecutor: see the module docstring.
        for slot in SLOT_ORDER:
            image_bytes = views[slot]
            tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
            tmp.write(image_bytes)
            tmp.close()
            tmp_paths.append(tmp.name)
            try:
                results[slot] = _analyse_one(slot, image_bytes, tmp.name, age)
            except PrepError as exc:
                # A preprocessing refusal is the user's to fix, so it becomes a 400
                # with the reason rather than a 500.
                raise ValueError(f"{slot}: {exc}") from exc

        result_views = {}
        for slot in SLOT_ORDER:
            r = results[slot]
            probs = r["cancer_probabilities"]
            pred = r["cancer_class"]
            birads = r["birads_class"]
            if birads is not None and str(birads).isdigit():
                birads = int(birads)

            result_views[slot] = {
                "result": pred,
                "score": round(float(probs[pred]), 4),
                "class_probabilities": {
                    "Normal": round(float(probs["Normal"]), 4),
                    "Benign": round(float(probs["Benign"]), 4),
                    "Malignant": round(float(probs["Malignant"]), 4),
                },
                "explainability": r["explainability"],
                "density": r["density_class"],
                "birads": birads,
            }

        any_malignant = any(v["result"] == "Malignant" for v in result_views.values())

        if any_malignant:
            risk_score, risk_level = None, "Not Applicable"
        else:
            patient_risk = max(r["future_risk"] for r in results.values())
            risk_score = round(float(patient_risk), 2)
            risk_level = _get_engine()._risk_level_and_feedback(
                patient_risk)["risk_level"]

        logger.info("Classical: session complete in %.1fs", time.perf_counter() - t0)

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
        gc.collect()


def engine_info() -> Dict[str, Any]:
    """Provenance for logs and the report. Loads the bundle if it is not loaded yet."""
    _model, _contract, meta = _get_convnext()
    return {
        "classification_model": meta,
        "explainability_model": "v12 ensemble (occlusion sensitivity, target=own argmax)",
        "explainability_note": ("the heatmap is produced by the v12 ensemble, not by "
                                "ConvNeXt; occlusion on ConvNeXt at 2048x1024 is not "
                                "feasible on this host"),
        "auxiliary_models": ["density_v2_explainable", "birads_v2_explainable"],
        "risk_formula": {
            "cnn_weight": RiskInferenceEngine.CNN_WEIGHT,
            "birads_weight": RiskInferenceEngine.BIRADS_WEIGHT,
            "density_weight": RiskInferenceEngine.DENSITY_WEIGHT,
            "cnn_term_source": "ConvNeXt V2-Huge calibrated probabilities",
        },
        "preprocessing": PREP_CONTRACT,
        "execution": "strictly sequential: one view at a time, one model at a time",
    }
