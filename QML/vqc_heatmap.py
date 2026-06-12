import os
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"

import numpy as np
import matplotlib.pyplot as plt
import joblib
import pennylane as qml
from pennylane import numpy as pnp
from PIL import Image
from skimage.segmentation import slic
from skimage.filters import threshold_otsu
from skimage.transform import resize as sk_resize
from lime import lime_image

# Config
VQC_MODEL_PATH   = "backend/dataset/vqc_15000_pca8_multiclass_improved.joblib"
PCA_MODEL_PATH   = "QML/8pca/pcaObj.joblib"
SCALER_PATH      = "QML/8pca/scalerObj.joblib"

RESIZE_TO        = (16, 16)
LABEL_NAMES      = {0: "normal", 1: "benign", 2: "malignant"}
LIME_NUM_SAMPLES = 300

# Load Artifects
def load_artifacts():
    bundle   = joblib.load(VQC_MODEL_PATH)
    weights  = bundle["weights"]
    n_qubits = bundle["n_qubits"]
    n_layers = bundle["n_layers"]
    n_classes = bundle["n_classes"]

    pca    = joblib.load(PCA_MODEL_PATH)
    scaler = joblib.load(SCALER_PATH)

    print("Loaded VQC artifacts.")
    print(f"  n_qubits : {n_qubits}")
    print(f"  n_layers : {n_layers}")
    print(f"  n_classes: {n_classes}")
    print(f"  PCA shape: {pca.components_.shape}")
    return weights, n_qubits, n_layers, n_classes, pca, scaler

# IMAGE LOADING
def load_mammogram(image_path):
    """Grayscale → resize → Otsu mask → normalise [0,1]."""
    img = Image.open(image_path).convert("L")
    img = img.resize((RESIZE_TO[1], RESIZE_TO[0]))
    arr = np.array(img, dtype=np.float64) / 255.0
    thresh = threshold_otsu(arr)
    arr[arr < thresh] = 0.0
    return arr

def image_to_pca(image, pca, scaler):
    """(16,16) → flatten → PCA → scaler. Returns (1, 8) float64."""
    flat = image.flatten().reshape(1, -1).astype(np.float32)
    return scaler.transform(pca.transform(flat)).astype(np.float64)

# VQC CIRCUIT
def make_vqc(weights, n_qubits, n_layers, n_classes):
    dev = qml.device("default.qubit", wires=n_qubits)

    @qml.qnode(dev)
    def circuit(x):
        for layer in range(n_layers):
            # encoding
            for i in range(n_qubits):
                qml.RY(x[i], wires=i)
                qml.RZ(x[i], wires=i)
            # variational layer — matches v2 training
            qml.templates.StronglyEntanglingLayers(
                weights[layer:layer + 1],
                wires=range(n_qubits)
            )
        return qml.probs(wires=[0, 1])

    def predict_probs(x):
        probs = np.array(circuit(x), dtype=np.float64)
        probs = probs[:n_classes]
        probs = probs / np.sum(probs)
        return probs

    return predict_probs

# Lime prediction function
def make_predict_fn(predict_probs_fn, pca, scaler):
    def predict_fn(images):
        gray     = images[..., 0]
        flat     = gray.reshape(len(images), -1).astype(np.float32)

        masked = []
        for row in flat:
            arr = row.reshape(RESIZE_TO)
            thresh = threshold_otsu(arr) if arr.max() > arr.min() else 0.0
            arr[arr < thresh] = 0.0
            masked.append(arr.flatten())
        masked = np.array(masked, dtype=np.float32)

        pca_feat = pca.transform(masked)
        scaled   = scaler.transform(pca_feat).astype(np.float64)
        probs    = np.array([predict_probs_fn(x) for x in scaled], dtype=np.float64)
        return probs

    return predict_fn

# Main
def run_explanation(
    image_path,
    y_true,
    weights,
    n_qubits,
    n_layers,
    n_classes,
    pca,
    scaler,
    target_label=None,
    save_path="vqc_heatmap.png",
):
    image    = load_mammogram(image_path)
    X_scaled = image_to_pca(image, pca, scaler)
    predict_probs_fn = make_vqc(weights, n_qubits, n_layers, n_classes)

    pred_probs = predict_probs_fn(X_scaled[0])
    pred_label = int(np.argmax(pred_probs))
    if target_label is None:
        target_label = pred_label

    print(f"True:      {LABEL_NAMES[y_true]}")
    print(f"Predicted: {LABEL_NAMES[pred_label]}")
    print(f"Probs:     {np.round(pred_probs, 4)}")

    print(f"\nRunning LIME ({LIME_NUM_SAMPLES} perturbations)...")
    image_rgb   = np.stack([image] * 3, axis=-1)
    predict_fn  = make_predict_fn(predict_probs_fn, pca, scaler)
    explainer   = lime_image.LimeImageExplainer(random_state=42)
    explanation = explainer.explain_instance(
        image_rgb,
        predict_fn,
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
        f"True: {LABEL_NAMES[y_true]}  |  "
        f"Predicted: {LABEL_NAMES[pred_label]}  |  "
        f"Probs: {np.round(pred_probs, 3)}",
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

    return {
        "pred_label":   pred_label,
        "pred_probs":   pred_probs,
        "lime_heatmap": heatmap,
    }