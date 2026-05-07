import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))

import io
import pickle
from pathlib import Path
from typing import List

import numpy as np
from PIL import Image
from fastapi import APIRouter, File, HTTPException, UploadFile

try:
    import joblib
except ImportError:
    joblib = None

from qml_common import (
    BIRADS_CLASSES,
    BIRADS_RISK_MAP,
    CANCER_CLASSES,
    DENSITY_CLASSES,
    DENSITY_RISK_MAP,
    CANCER_RISK_MAP,
    make_birads_classifier_circuit,
    make_classifier_circuit,
    make_risk_circuit,
    risk_level,
    softmax_np,
)

router = APIRouter(prefix="/qml-mammo-risk", tags=["QMLMammoRisk"])

# =========================
# PATHS
# =========================
SCRIPT_DIR = Path(__file__).resolve().parent

DEP_DIR    = SCRIPT_DIR / "dep"

MODEL_DIR   = SCRIPT_DIR / "mammo-bench models"
OBJECTS_DIR = MODEL_DIR  / "objects"

PCA_PATH             = DEP_DIR / "qml_image_risk_pca.pkl"
SCALER_PATH          = DEP_DIR / "qml_image_risk_scaler.pkl"
CANCER_WEIGHTS_PATH  = DEP_DIR / "qml_cancer_classifier_weights.npz"
DENSITY_WEIGHTS_PATH = DEP_DIR / "qml_density_classifier_weights.npz"
BIRADS_WEIGHTS_PATH  = DEP_DIR / "qml_birads_classifier_weights.npz"
RISK_WEIGHTS_PATH    = DEP_DIR / "qml_risk_regressor_weights.npz"

IMAGE_SIZE = 32

# =========================
# LOAD AT STARTUP
# =========================
def _load_pickle(path: Path):
    if not path.exists():
        raise FileNotFoundError(f"Missing file: {path}")
    if joblib is not None:
        try:
            return joblib.load(path)
        except Exception:
            pass
    with open(path, "rb") as f:
        return pickle.load(f)


def _load_weights(path: Path):
    if not path.exists():
        raise FileNotFoundError(f"Missing weights: {path}")
    return np.load(path, allow_pickle=True)["weights"]


pca             = _load_pickle(PCA_PATH)
scaler          = _load_pickle(SCALER_PATH)
cancer_weights  = _load_weights(CANCER_WEIGHTS_PATH)
density_weights = _load_weights(DENSITY_WEIGHTS_PATH)
birads_weights  = _load_weights(BIRADS_WEIGHTS_PATH)
risk_weights    = _load_weights(RISK_WEIGHTS_PATH)

cancer_circuit  = make_classifier_circuit(n_outputs=3)
density_circuit = make_classifier_circuit(n_outputs=4)
birads_circuit  = make_birads_classifier_circuit()
risk_circuit    = make_risk_circuit()

# =========================
# PREPROCESSING
# =========================
def _preprocess(image_bytes: bytes) -> np.ndarray:
    img = Image.open(io.BytesIO(image_bytes)).convert("L")
    img = img.resize((IMAGE_SIZE, IMAGE_SIZE))
    arr = np.asarray(img, dtype=np.float32) / 255.0
    flat = arr.flatten().reshape(1, -1)
    return scaler.transform(pca.transform(flat))[0].astype(float)


# =========================
# INFERENCE HELPERS
# =========================
def _run_classifier(circuit, weights, classes, risk_map):
    """Returns (predicted_class, confidence %, probs_dict, risk_score)."""
    logits = circuit(None, weights)          # x injected below — see _predict_single
    raise RuntimeError("Call _run_classifier_on(x, ...) instead.")


def _run_classifier_on(x, circuit, weights, classes, risk_map):
    logits      = circuit(x, weights)
    probs       = softmax_np(logits) * 100.0
    idx         = int(np.argmax(probs))
    pred        = classes[idx]
    confidence  = round(float(np.max(probs)), 2)
    probs_dict  = {str(c): round(float(p), 2) for c, p in zip(classes, probs)}
    risk_score  = sum(
        (float(p) / 100.0) * float(risk_map[c])
        for c, p in zip(classes, probs)
    )
    return pred, confidence, probs_dict, round(risk_score, 2)


def _calculate_risk(cancer_risk: float, density_risk: float, birads_risk: float) -> float:
    score = 0.60 * cancer_risk + 0.15 * density_risk + 0.25 * birads_risk
    return round(max(0.0, min(score, 100.0)), 2)


def _feedback(score: float) -> tuple[str, str]:
    """Returns (risk_level, feedback_message) matching MammoRisk exactly."""
    if score >= 67:
        return (
            "High Risk",
            "The results indicate a higher level of risk. It is important to "
            "seek medical advice promptly to ensure appropriate evaluation and care.",
        )
    elif score >= 34:
        return (
            "Medium Risk",
            "Some areas may need further review. A follow-up consultation "
            "with a healthcare professional is recommended.",
        )
    else:
        return (
            "Low Risk",
            "No major concerns are indicated at this time. "
            "Continue with regular check-ups and screenings.",
        )


# =========================
# CORE PREDICTION
# =========================
def _predict_single(image_bytes: bytes, filename: str = None) -> dict:
    x = _preprocess(image_bytes)

    cancer_pred, cancer_conf, cancer_probs, cancer_risk = _run_classifier_on(
        x, cancer_circuit, cancer_weights, CANCER_CLASSES, CANCER_RISK_MAP
    )
    density_pred, density_conf, density_probs, density_risk = _run_classifier_on(
        x, density_circuit, density_weights, DENSITY_CLASSES, DENSITY_RISK_MAP
    )
    birads_pred, birads_conf, birads_probs, birads_risk = _run_classifier_on(
        x, birads_circuit, birads_weights, BIRADS_CLASSES, BIRADS_RISK_MAP
    )

    # Direct QML risk regressor
    raw_risk          = risk_circuit(x, risk_weights)
    qml_direct_score  = round(max(0.0, min(float((raw_risk + 1.0) / 2.0) * 100.0, 100.0)), 2)
    qml_risk_lvl, _   = _feedback(qml_direct_score)

    # Malignant early exit — matches MammoRisk behaviour
    if cancer_pred == "Malignant":
        result = {
            "predicted_cancer_class":  cancer_pred,
            "predicted_density":       density_pred,
            "predicted_birads":        birads_pred,
            "future_risk_score":       None,
            "risk_level":              "Not Applicable",
            "feedback": (
                "A malignant finding was detected. Future cancer risk estimation "
                "is not applicable because the case is already classified as "
                "cancer-suspicious. Please seek medical review."
            ),
        }
        if filename:
            result["filename"] = filename
        return result

    formula_score         = _calculate_risk(cancer_risk, density_risk, birads_risk)
    formula_level, msg    = _feedback(formula_score)

    result = {
        # Cancer
        "predicted_cancer_class":  cancer_pred,
        "cancer_confidence":       cancer_conf,
        "cancer_probabilities":    cancer_probs,
        "cancer_risk_score":       cancer_risk,

        # Density
        "predicted_density":       density_pred,
        "density_confidence":      density_conf,
        "density_probabilities":   density_probs,
        "density_risk_score":      density_risk,

        # BI-RADS
        "predicted_birads":        birads_pred,
        "birads_confidence":       birads_conf,
        "birads_probabilities":    birads_probs,
        "birads_risk_score":       birads_risk,

        # Formula risk  (matches MammoRisk field names)
        "cnn_risk_score":          cancer_risk,
        "future_risk_score":       formula_score,
        "risk_level":              formula_level,
        "feedback":                msg,

        # QML direct regressor (extra — QML pipeline only)
        "qml_direct_risk_score":   qml_direct_score,
        "qml_direct_risk_level":   qml_risk_lvl,
    }

    if filename:
        result["filename"] = filename

    return result


# =========================
# ROUTES
# =========================
@router.post("/predict/single")
async def predict_single(file: UploadFile = File(...)):
    """Run QML risk inference on a single mammography image."""
    try:
        contents = await file.read()
        return _predict_single(contents)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Prediction failed: {str(e)}")


@router.post("/predict/multi")
async def predict_multi(files: List[UploadFile] = File(...)):
    """Run QML risk inference across multiple mammography images for the same patient."""
    if not files:
        raise HTTPException(status_code=400, detail="No files provided.")

    image_results = []
    for f in files:
        try:
            contents = await f.read()
            result   = _predict_single(contents, filename=f.filename)
            image_results.append(result)
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"Failed on {f.filename}: {str(e)}")

    classes = [r["predicted_cancer_class"] for r in image_results]

    # Malignant in any image — matches MammoRisk multi behaviour
    if "Malignant" in classes:
        return {
            "number_of_images":    len(files),
            "image_level_results": image_results,
            "status":              "Malignant detected",
            "future_risk_score":   None,
            "risk_level":          "Not Applicable",
            "feedback": (
                "A malignant finding was detected in at least one image. "
                "Future cancer risk estimation is not applicable because the case "
                "is already classified as cancer-suspicious. Please seek medical review."
            ),
        }

    # Aggregate using highest risk per component (matches MammoRisk)
    non_malignant = [r for r in image_results if r.get("future_risk_score") is not None]

    highest_cancer  = max(r["cancer_risk_score"]  for r in non_malignant)
    highest_density = max(r["density_risk_score"] for r in non_malignant)
    highest_birads  = max(r["birads_risk_score"]  for r in non_malignant)
    highest_qml     = max(r["qml_direct_risk_score"] for r in non_malignant)

    final_score           = _calculate_risk(highest_cancer, highest_density, highest_birads)
    final_level, feedback = _feedback(final_score)

    final_class = (
        "Malignant" if "Malignant" in classes
        else "Benign" if "Benign" in classes
        else "Normal"
    )

    return {
        "number_of_images":              len(files),
        "image_level_results":           image_results,
        "final_predicted_class":         final_class,

        # Formula aggregate (matches MammoRisk field names)
        "highest_cnn_risk_score":        round(highest_cancer, 2),
        "highest_density_risk_score":    round(highest_density, 2),
        "highest_birads_risk_score":     round(highest_birads, 2),
        "future_risk_score":             final_score,
        "risk_level":                    final_level,
        "feedback":                      feedback,

        # QML direct aggregate (extra — QML pipeline only)
        "highest_qml_direct_risk_score": round(highest_qml, 2),
        "qml_direct_risk_level":         risk_level(highest_qml),
    }