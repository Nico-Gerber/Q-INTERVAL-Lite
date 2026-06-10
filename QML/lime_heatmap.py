import os
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"

import numpy as np
import matplotlib.pyplot as plt
import joblib
import pennylane as qml
from PIL import Image
from skimage.segmentation import slic
from skimage.transform import resize as sk_resize
from lime import lime_image

# ============================================================
# CONFIG
# ============================================================

QRF_MODEL_PATH   = "QML/quantum_random_forest_v2.joblib"
PCA_MODEL_PATH   = "QML/8pca/pcaObj.joblib"
SCALER_PATH      = "QML/8pca/scalerObj.joblib"

RESIZE_TO        = (16, 16)
N_QUBITS         = 8
N_LAYERS         = 4
LABEL_NAMES      = {0: "normal", 1: "benign", 2: "malignant"}
LIME_NUM_SAMPLES = 300

# ============================================================
# LOAD
# ============================================================

def load_artifacts():
    bundle          = joblib.load(QRF_MODEL_PATH)
    clf             = bundle["classifier"]
    quantum_weights = bundle["quantum_weights"]
    pca             = joblib.load(PCA_MODEL_PATH)
    scaler          = joblib.load(SCALER_PATH)
    return clf, quantum_weights, pca, scaler

# ============================================================
# IMAGE → SCALED PCA
# ============================================================

def load_mammogram(image_path):
    img = Image.open(image_path).convert("L")
    img = img.resize((RESIZE_TO[1], RESIZE_TO[0]))
    return np.array(img, dtype=np.float64) / 255.0

def image_to_pca(image, pca, scaler):
    flat = image.flatten().reshape(1, -1).astype(np.float32)
    return scaler.transform(pca.transform(flat)).astype(np.float64)

# ============================================================
# QUANTUM CIRCUIT
# ============================================================

def make_quantum_circuit(quantum_weights):
    dev = qml.device("default.qubit", wires=N_QUBITS)

    @qml.qnode(dev)
    def quantum_feature_map(x):
        for layer in range(N_LAYERS):
            qml.templates.AngleEmbedding(x, wires=range(N_QUBITS), rotation="Y")
            qml.templates.StronglyEntanglingLayers(
                quantum_weights[layer:layer + 1], wires=range(N_QUBITS)
            )
        measurements = []
        for i in range(N_QUBITS):
            measurements.append(qml.expval(qml.PauliX(i)))
            measurements.append(qml.expval(qml.PauliY(i)))
            measurements.append(qml.expval(qml.PauliZ(i)))
        for i in range(N_QUBITS):
            for j in range(i + 1, N_QUBITS):
                measurements.append(qml.expval(qml.PauliX(i) @ qml.PauliX(j)))
                measurements.append(qml.expval(qml.PauliY(i) @ qml.PauliY(j)))
                measurements.append(qml.expval(qml.PauliZ(i) @ qml.PauliZ(j)))
        return measurements

    return quantum_feature_map

def extract_quantum_features(X, qfm):
    return np.array([qfm(x) for x in X], dtype=np.float64)

# ============================================================
# LIME PREDICT FUNCTION
# ============================================================

def make_predict_fn(clf, pca, scaler, qfm):
    def predict_fn(images):
        flat     = images[..., 0].reshape(len(images), -1).astype(np.float32)
        scaled   = scaler.transform(pca.transform(flat)).astype(np.float64)
        return clf.predict_proba(extract_quantum_features(scaled, qfm))
    return predict_fn

# ============================================================
# MAIN
# ============================================================

def run_explanation(image_path, y_true, clf, pca, scaler, quantum_weights,
                    target_label=None, save_path="heatmap.png"):

    image    = load_mammogram(image_path)
    X_scaled = image_to_pca(image, pca, scaler)
    qfm      = make_quantum_circuit(quantum_weights)

    pred_probs = clf.predict_proba(extract_quantum_features(X_scaled, qfm))[0]
    pred_label = int(np.argmax(pred_probs))
    if target_label is None:
        target_label = pred_label

    print(f"True: {LABEL_NAMES[y_true]} | Predicted: {LABEL_NAMES[pred_label]} | Probs: {np.round(pred_probs, 3)}")
    print(f"Running LIME ({LIME_NUM_SAMPLES} perturbations)...")

    image_rgb   = np.stack([image] * 3, axis=-1)
    explainer   = lime_image.LimeImageExplainer(random_state=42)
    explanation = explainer.explain_instance(
        image_rgb,
        make_predict_fn(clf, pca, scaler, qfm),
        top_labels=3,
        num_samples=LIME_NUM_SAMPLES,
        segmentation_fn=lambda img: slic(img, n_segments=20, compactness=5, sigma=0.5),
    )

    segments   = explanation.segments
    weight_map = dict(explanation.local_exp[target_label])
    heatmap    = np.zeros(segments.shape, dtype=np.float64)
    for seg_id, weight in weight_map.items():
        heatmap[segments == seg_id] = weight
    heatmap /= np.abs(heatmap).max() + 1e-8

    D  = (256, 256)
    up = lambda a: sk_resize(a, D, order=0, anti_aliasing=False)

    fig, axes = plt.subplots(1, 2, figsize=(9, 5))
    fig.suptitle(
        f"True: {LABEL_NAMES[y_true]}  |  Predicted: {LABEL_NAMES[pred_label]}  |  Probs: {np.round(pred_probs, 3)}",
        fontsize=12, fontweight="bold"
    )
    axes[0].imshow(up(image), cmap="gray")
    axes[0].set_title("Mammogram (16×16)")
    axes[0].axis("off")

    im = axes[1].imshow(up(heatmap), cmap="RdBu_r", vmin=-1, vmax=1)
    axes[1].imshow(up(image), cmap="gray", alpha=0.3)
    axes[1].set_title(f"LIME heatmap  (red → {LABEL_NAMES[pred_label]})")
    axes[1].axis("off")
    plt.colorbar(im, ax=axes[1], fraction=0.046, pad=0.04)

    plt.tight_layout()
    plt.savefig(save_path, dpi=150, bbox_inches="tight")
    plt.show()
    print(f"Saved → {save_path}")