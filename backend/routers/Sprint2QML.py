import io
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
BASE_DIR = Path(__file__).parent.parent  # points to backend/
PCA_PATH = BASE_DIR / "dataset/pcaObj.joblib"
SCALER_PATH = BASE_DIR / "dataset/scalerObj.joblib"
MODEL_PATH = BASE_DIR / "dataset/vqc_900_pca4_multiclass_v5.joblib"

RESIZE_TO = (16, 16)

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

print(f"Loaded model | n_qubits: {n_qubits} | n_layers: {n_layers} | n_classes: {n_classes}")
print(f"Best epoch: {model_data['best_epoch']} | Best test acc: {model_data['best_test_acc']:.4f}")

# =========================
# QUANTUM DEVICE
# =========================
dev = qml.device("default.qubit", wires=n_qubits)

def variational_layer(layer_weights, x):
    """
    Matches the training circuit exactly:
    - Data re-uploading with per-layer learnable scale (layer_weights[:, 2])
    - Trainable RY/RZ rotations
    - Brick-layer CNOT entanglement (even pairs, then odd pairs)
    """
    # re-upload with per-layer learnable scale
    for i in range(n_qubits):
        qml.RY(layer_weights[i, 2] * x[i], wires=i)
        qml.RZ(layer_weights[i, 2] * x[(i + 1) % len(x)], wires=i)

    # trainable rotations
    for i in range(n_qubits):
        qml.RY(layer_weights[i, 0], wires=i)
        qml.RZ(layer_weights[i, 1], wires=i)

    # brick-layer entanglement
    for i in range(0, n_qubits - 1, 2):
        qml.CNOT(wires=[i, i + 1])
    for i in range(1, n_qubits - 1, 2):
        qml.CNOT(wires=[i, i + 1])

@qml.qnode(dev)
def circuit(x, w):
    for layer in range(n_layers):
        variational_layer(w[layer], x)
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
def preprocess_image(image_bytes: bytes) -> np.ndarray:
    img = Image.open(io.BytesIO(image_bytes)).convert("L")

    try:
        img = img.resize(RESIZE_TO, Image.Resampling.LANCZOS)
    except AttributeError:
        img = img.resize(RESIZE_TO)

    arr = np.array(img, dtype=np.float32) / 255.0
    arr = arr.flatten().reshape(1, -1)

    arr_pca = pca.transform(arr)
    arr_scaled = scaler.transform(arr_pca)

    return arr_scaled[0]

# =========================
# ROUTE
# =========================
router = APIRouter(prefix="/QMLPredictV2", tags=["predict_v2"])

@router.post("/")
async def predict(file: UploadFile = File(...)):
    if file.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(status_code=415, detail="Unsupported file type")

    contents = await file.read()

    try:
        features = preprocess_image(contents)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Image processing failed: {str(e)}")

    probs = predict_probs(features)
    pred_id = predict_label(probs)
    pred_name = label_names[pred_id]

    return JSONResponse(content={
        "prediction": pred_id,
        "result": pred_name.capitalize(),
        "score": round(float(probs[pred_id]), 4),
        "class_probabilities": {
            label_names[i].capitalize(): round(float(probs[i]), 4)
            for i in range(n_classes)
        },
        "model_info": {
            "best_epoch": model_data["best_epoch"],
            "best_test_acc": round(float(model_data["best_test_acc"]), 4)
        }
    })