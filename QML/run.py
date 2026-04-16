import argparse
import os
import numpy as np
import joblib
import pandas as pd
import pennylane as qml
from PIL import Image

#python run.py --image dataset/images/preprocessed/train/train_10.png

# =========================
# SETTINGS
# =========================
PCA_PATH = "dataset/pca_model.joblib"
SCALER_PATH = "dataset/qml_scaler.joblib"
MODEL_PATH = "vqc_500_pca4_best.joblib"

# Must match training preprocessing
RESIZE_TO = (16, 16)  # change to (32, 32) if that is what you trained with

# =========================
# LOAD SAVED OBJECTS
# =========================
pca = joblib.load(PCA_PATH)
scaler = joblib.load(SCALER_PATH)
model_data = joblib.load(MODEL_PATH)

weights = model_data["weights"]
feature_columns = model_data["feature_columns"]
n_qubits = model_data["n_qubits"]
n_layers = model_data["n_layers"]
threshold = model_data.get("threshold", 0.5)

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

def predict_label(score):
    return 1 if score >= threshold else 0

def preprocess_image(image_path):
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"Image not found: {image_path}")

    img = Image.open(image_path).convert("L")
    img = img.resize(RESIZE_TO, Image.Resampling.LANCZOS)
    arr = np.array(img, dtype=np.float32) / 255.0
    arr = arr.flatten().reshape(1, -1)

    arr_pca = pca.transform(arr)
    arr_scaled = scaler.transform(arr_pca)

    return arr_scaled[0]

def predict_image(image_path):
    features = preprocess_image(image_path)
    score = predict_score(features)
    label = predict_label(score)

    print(f"Image: {image_path}")
    print("Features:", np.round(features, 4))
    print(f"Score: {score:.4f}")
    print(f"Prediction: {label} ({'Cancer' if label == 1 else 'No Cancer'})")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Predict one mammogram image with trained VQC")
    parser.add_argument("--image", required=True, help="Path to input image")
    args = parser.parse_args()

    predict_image(args.image)