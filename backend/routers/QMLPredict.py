import os
import io
import numpy as np
import joblib
import pennylane as qml
from PIL import Image
from pathlib import Path
from fastapi import APIRouter, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse

# =========================
# SETTINGS
# =========================
BASE_DIR = Path(__file__).parent.parent  # points to backend/
PCA_PATH = BASE_DIR / "dataset/pca_model.joblib"
SCALER_PATH = BASE_DIR / "dataset/qml_scaler.joblib"
MODEL_PATH = BASE_DIR / "dataset/vqc_500_pca4_best.joblib"  

RESIZE_TO = (16, 16)

# =========================
# LOAD MODELS (once at startup)
# =========================
pca = joblib.load(PCA_PATH)
scaler = joblib.load(SCALER_PATH)
model_data = joblib.load(MODEL_PATH)

weights = model_data["weights"]
n_qubits = model_data["n_qubits"]
n_layers = model_data["n_layers"]
threshold = model_data.get("threshold", 0.5)

print(f"n_qubits: {n_qubits}, PCA components: {pca.n_components_}")


# =========================
# QUANTUM DEVICE
# =========================
dev = qml.device("default.qubit", wires=n_qubits)

def variational_layer(layer_weights):
    for i in range(n_qubits):
        qml.RY(layer_weights[i, 0], wires=i)
        qml.RZ(layer_weights[i, 1], wires=i)
    for i in range(n_qubits):
        qml.CNOT(wires=[i, (i + 1) % n_qubits])

@qml.qnode(dev)
def circuit(x, weights):
    for i in range(n_qubits):
        qml.RY(x[i], wires=i)
        qml.RZ(x[i], wires=i)
    for layer in range(n_layers):
        variational_layer(weights[layer])
    return qml.expval(qml.PauliZ(0))

def predict_score(feature_vector):
    raw = circuit(feature_vector, weights)
    prob = (raw + 1.0) / 2.0
    return float(np.clip(prob, 1e-7, 1 - 1e-7))

def preprocess_image(image_bytes):
    img = Image.open(io.BytesIO(image_bytes)).convert("L")
    img = img.resize(RESIZE_TO, Image.Resampling.LANCZOS)
    arr = np.array(img, dtype=np.float32) / 255.0
    arr = arr.flatten().reshape(1, -1)
    arr_pca = pca.transform(arr)
    arr_scaled = scaler.transform(arr_pca)
    return arr_scaled[0]

# =========================
# ROUTE
# =========================
router = APIRouter(prefix="/QMLPredict", tags=["predict"])

@router.post("/")
async def predict(file: UploadFile = File(...)):
    if file.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(status_code=415, detail="Unsupported file type")

    contents = await file.read()

    try:
        features = preprocess_image(contents)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Image processing failed: {str(e)}")

    score = predict_score(features)
    label = 1 if score >= threshold else 0

    return JSONResponse(content={
        "score": round(score, 4),
        "prediction": label,
        "result": "Cancer" if label == 1 else "No Cancer"
    })
