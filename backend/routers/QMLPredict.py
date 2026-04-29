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
PCA_PATH = BASE_DIR / "dataset/pcaObj.joblib"
SCALER_PATH = BASE_DIR / "dataset/scalerObj.joblib"
MODEL_PATH = BASE_DIR / "dataset/vqcModel.joblib"  

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
label_names = model_data["label_names"]
print(f"n_qubits: {n_qubits}, PCA components: {pca.n_components_}")


label_names = {int(k): v for k, v in label_names.items()}


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

    return [
        qml.expval(qml.PauliZ(0)),
        qml.expval(qml.PauliZ(1)),
        qml.expval(qml.PauliZ(2))
    ]

def softmax(logits):
    logits = np.array(logits, dtype=np.float64)
    shifted = logits - np.max(logits)
    exp_vals = np.exp(shifted)
    return exp_vals / np.sum(exp_vals)

def predict_probs(feature_vector):
    raw_outputs = circuit(feature_vector, weights)
    probs = softmax(raw_outputs)
    return np.array(probs, dtype=np.float64)

def predict_label(probs):
    return int(np.argmax(probs))

def preprocess_image(image_bytes: bytes):
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

def predict_image(image_path):
    features = preprocess_image(image_path)
    probs = predict_probs(features)
    pred_id = predict_label(probs)
    pred_name = label_names[pred_id]

    print(f"Image: {image_path}")
    print("Features:", np.round(features, 4))
    print("Class probabilities:")

    for class_id in range(n_classes):
        class_name = label_names[class_id]
        print(f"  {class_id} ({class_name}): {probs[class_id]:.4f}")

    print(f"\nPredicted class: {pred_id} ({pred_name})")
    print(f"Confidence: {probs[pred_id]:.4f}")


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


    probs = predict_probs(features)
    pred_id = predict_label(probs)
    pred_name = label_names[pred_id]



    return JSONResponse(content={
        "prediction": pred_id,
        "score": probs[pred_id],
        "result": pred_name.capitalize(),
        "class_probabilities": {
            label_names[i].capitalize(): round(float(probs[i]), 4)
            for i in range(n_classes)
        }

    })
