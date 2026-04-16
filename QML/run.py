import argparse
import os
import numpy as np
import joblib
import pennylane as qml
from PIL import Image

# python run.py --image dataset/images/preprocessed/train/train_10.png


PCA_PATH = "models and obj/pcaObj.joblib"
SCALER_PATH = "models and obj/scalerObj.joblib"
MODEL_PATH = "models and obj/vqcModel.joblib"

RESIZE_TO = (16, 16)


pca = joblib.load(PCA_PATH)
scaler = joblib.load(SCALER_PATH)
model_data = joblib.load(MODEL_PATH)

weights = model_data["weights"]
feature_columns = model_data["feature_columns"]
n_qubits = model_data["n_qubits"]
n_layers = model_data["n_layers"]
n_classes = model_data["n_classes"]
label_names = model_data["label_names"]

# Make sure label keys are ints
label_names = {int(k): v for k, v in label_names.items()}


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

def preprocess_image(image_path):
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"Image not found: {image_path}")

    img = Image.open(image_path).convert("L")

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

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Predict one mammogram image with trained 3-class VQC")
    parser.add_argument("--image", required=True, help="Path to input image")
    args = parser.parse_args()

    predict_image(args.image)