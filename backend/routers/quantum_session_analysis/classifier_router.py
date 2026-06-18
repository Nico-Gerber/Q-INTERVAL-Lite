import io
import base64
import cv2
import numpy as np
import joblib
import pennylane as qml
from pennylane import numpy as pnp
from PIL import Image
from pathlib import Path
from fastapi import APIRouter, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse

# =========================
# SETTINGS
# =========================
MODELS_DIR = Path(__file__).resolve().parent / "models"
PCA_PATH = MODELS_DIR / "pcaObj.joblib"
SCALER_PATH = MODELS_DIR / "scalerObj.joblib"
MODEL_PATH = MODELS_DIR / "vqc_15000_pca8_multiclass_improved.joblib"

RESIZE_TO = (16, 16)        # model input resolution
DISPLAY_SIZE = 224          # output heatmap resolution sent to the frontend

# Occlusion defaults (on the 16x16 model input)
OCC_PATCH = 4               # size of the occluding square
OCC_STRIDE = 2              # step between positions
OCC_FILL = 0.0             # value written into the occluded patch (0.0 = black)

# =========================
# LOAD MODELS (once at startup)
# =========================
pca = joblib.load(PCA_PATH)
scaler = joblib.load(SCALER_PATH)
model_data = joblib.load(MODEL_PATH)

weights = model_data["weights"]
feature_columns = model_data["feature_columns"]
n_qubits = model_data["n_qubits"]
n_layers = model_data["n_layers"]
n_classes = model_data["n_classes"]
label_names = {int(k): v for k, v in model_data["label_names"].items()}

# Index of the malignant class (used if you'd rather attribute to malignant
# than to the predicted class — see run_inference).
MALIGNANT_IDX = next(
    (i for i, name in label_names.items() if name.lower() == "malignant"),
    None,
)

print(f"Loaded model | n_qubits: {n_qubits} | n_layers: {n_layers} | n_classes: {n_classes}")
print(f"Best epoch: {model_data['best_epoch']} | Best test acc: {model_data['best_test_acc']:.4f}")

# =========================
# QUANTUM DEVICE
# =========================
dev = qml.device("default.qubit", wires=n_qubits)

@qml.qnode(dev)
def circuit(x, w):
    for layer in range(n_layers):
        # data re-upload at every layer
        for i in range(n_qubits):
            qml.RY(x[i], wires=i)
            qml.RZ(x[i], wires=i)

        # variational layer
        qml.templates.StronglyEntanglingLayers(
            w[layer:layer + 1],
            wires=range(n_qubits)
        )
    return [qml.expval(qml.PauliZ(i)) for i in range(n_qubits)]

# =========================
# INFERENCE HELPERS
# =========================
def softmax(logits):
    logits = np.array(logits, dtype=np.float64)
    shifted = logits - np.max(logits)
    exp_vals = np.exp(shifted)
    return exp_vals / np.sum(exp_vals)

def predict_probs(feature_vector):
    raw_outputs = circuit(feature_vector, weights)[:n_classes]
    return softmax(raw_outputs)

def predict_label(probs):
    return int(np.argmax(probs))

# =========================
# IMAGE PREPROCESSING
# =========================
def image_to_arr16(pil_gray: Image.Image) -> np.ndarray:

    try:
        img = pil_gray.resize(RESIZE_TO, Image.Resampling.LANCZOS)
    except AttributeError:
        img = pil_gray.resize(RESIZE_TO)
    return np.array(img, dtype=np.float32) / 255.0   # shape (16, 16)

def arr16_to_features(arr16: np.ndarray) -> np.ndarray:
  
    flat = arr16.flatten().reshape(1, -1)
    arr_pca = pca.transform(flat)
    arr_scaled = scaler.transform(arr_pca)
    return arr_scaled[0]

def preprocess_image(image_bytes: bytes) -> np.ndarray:
   
    pil = Image.open(io.BytesIO(image_bytes)).convert("L")
    return arr16_to_features(image_to_arr16(pil))


def occlusion_map(arr16: np.ndarray, target_idx: int,
                  patch: int = OCC_PATCH, stride: int = OCC_STRIDE,
                  fill: float = OCC_FILL) -> np.ndarray:

    H, W = arr16.shape
    heat = np.zeros((H, W), dtype=np.float32)
    counts = np.zeros((H, W), dtype=np.float32)

    # baseline probability for the class we're attributing
    s0 = predict_probs(arr16_to_features(arr16))[target_idx]

    for y in range(0, H - patch + 1, stride):
        for x in range(0, W - patch + 1, stride):
            occ = arr16.copy()
            occ[y:y + patch, x:x + patch] = fill
            s = predict_probs(arr16_to_features(occ))[target_idx]
            heat[y:y + patch, x:x + patch] += (s0 - s)   # drop = importance
            counts[y:y + patch, x:x + patch] += 1.0

    # average overlapping contributions
    heat /= np.maximum(counts, 1.0)
    return heat

# =========================
# RENDERING (mirrors the CNN grad-cam output format)
# =========================
def _to_b64(arr: np.ndarray) -> str:
    buf = io.BytesIO()
    Image.fromarray(arr).save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("utf-8")

def render_occlusion(pil_gray: Image.Image, heat16: np.ndarray,
                     size: int = DISPLAY_SIZE, alpha: float = 0.5):

    # Base image at display resolution, as RGB
    base_gray = np.array(pil_gray.resize((size, size), Image.Resampling.LANCZOS))
    base_rgb = cv2.cvtColor(base_gray, cv2.COLOR_GRAY2RGB)

    # Keep only regions that supported the class, normalize to [0, 1]
    heat = np.clip(heat16, 0, None)
    if heat.max() > 0:
        heat = heat / heat.max()

    # Upsample + blur so the coarse grid takes on the smooth grad-cam look
    heat_big = cv2.resize(heat, (size, size), interpolation=cv2.INTER_CUBIC)
    heat_big = cv2.GaussianBlur(heat_big, (0, 0), sigmaX=size / 32.0)
    heat_big = np.clip(heat_big, 0, 1)

    # Colormap — same JET as the CNN path so the two views match
    heat_uint8 = np.uint8(255 * heat_big)
    heat_color = cv2.cvtColor(cv2.applyColorMap(heat_uint8, cv2.COLORMAP_JET),
                              cv2.COLOR_BGR2RGB)

    # Real blended overlay (the CNN currently ships the bare heatmap here)
    overlay = cv2.addWeighted(base_rgb, 1 - alpha, heat_color, alpha, 0)

    return base_rgb, heat_color, overlay

# =========================
# INFERENCE
# =========================
def run_inference(image_bytes: bytes, with_occlusion: bool = True,
                  attribute_to_malignant: bool = False):
    pil = Image.open(io.BytesIO(image_bytes)).convert("L")
    arr16 = image_to_arr16(pil)
    features = arr16_to_features(arr16)

    probs = predict_probs(features)
    pred_id = predict_label(probs)
    pred_name = label_names[pred_id]

    result = {
        "prediction": pred_id,
        "result": pred_name.capitalize(),
        "score": round(float(probs[pred_id]), 4),
        "class_probabilities": {
            label_names[i].capitalize(): round(float(probs[i]), 4)
            for i in range(n_classes)
        },
        "model_info": {
            "best_epoch": model_data["best_epoch"],
            "best_test_acc": round(float(model_data["best_test_acc"]), 4),
        },
    }

    if with_occlusion:
        # Mirror the CNN, which attributes to the predicted class. Flip
        # attribute_to_malignant=True to always explain the malignant score.
        target_idx = (MALIGNANT_IDX if attribute_to_malignant and MALIGNANT_IDX is not None
                      else pred_id)
        heat16 = occlusion_map(arr16, target_idx)
        base_rgb, heat_rgb, overlay_rgb = render_occlusion(pil, heat16)
        result["gradcam"] = {
            "heatmap_base64": _to_b64(heat_rgb),
            "base_image_base64": _to_b64(base_rgb),
            "overlay_base64": _to_b64(overlay_rgb),
            "width": DISPLAY_SIZE,
            "height": DISPLAY_SIZE,
            "target_class": label_names[target_idx].capitalize(),
        }

    return result

# =========================
# ROUTES
# =========================
router = APIRouter(prefix="/QMLPredictV2", tags=["predict_v2"])

@router.post("/")
async def predict(file: UploadFile = File(...), occlusion: bool = True):
    if file.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(status_code=415, detail="Unsupported file type")

    contents = await file.read()
    try:
        result = run_inference(contents, with_occlusion=occlusion)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Image processing failed: {str(e)}")

    return JSONResponse(content=result)


@router.post("/predict-four-views-QML")
async def predict_four_views(
    l_cc:  UploadFile = File(...),
    l_mlo: UploadFile = File(...),
    r_cc:  UploadFile = File(...),
    r_mlo: UploadFile = File(...),
    occlusion: bool = True,
):
    uploads = {
        "L-CC":  l_cc,
        "L-MLO": l_mlo,
        "R-CC":  r_cc,
        "R-MLO": r_mlo,
    }

    for view_name, upload in uploads.items():
        if not upload.content_type.startswith("image/"):
            raise HTTPException(
                status_code=400,
                detail=f"{view_name} must be an image file."
            )

    results = {}
    for view_name, upload in uploads.items():
        image_bytes = await upload.read()
        try:
            results[view_name] = run_inference(image_bytes, with_occlusion=occlusion)
        except ValueError as e:
            raise HTTPException(status_code=422, detail=f"{view_name}: {str(e)}")

    left_score = (
        results["L-CC"]["class_probabilities"]["Malignant"] +
        results["L-MLO"]["class_probabilities"]["Malignant"]
    ) / 2

    right_score = (
        results["R-CC"]["class_probabilities"]["Malignant"] +
        results["R-MLO"]["class_probabilities"]["Malignant"]
    ) / 2

    patient_score = max(left_score, right_score)
    malignant_detected = patient_score > 0.5

    return JSONResponse(content={
        "views": results,
        "aggregated": {
            "overall_classification": "Malignant" if malignant_detected else "Non-Malignant",
            "left_malignant_score":    round(left_score, 4),
            "right_malignant_score":   round(right_score, 4),
            "patient_malignant_score": round(patient_score, 4),
            "malignant_detected":      malignant_detected,
        }
    })