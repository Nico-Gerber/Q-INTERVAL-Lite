"""Deployable QSVC engine: fine-tuned ResNet18 -> scaler -> PCA(12) -> quantum fidelity kernel -> SVC.

"""
import io
import base64
from pathlib import Path

import cv2
import joblib
import numpy as np
import pennylane as qml
import torch
import torch.nn as nn
from PIL import Image
from torchvision import models

ART_DIR = Path(__file__).resolve().parent / "models" / "qsvc"

IMG_SIZE = 224
DISPLAY_SIZE = 224
MEAN = torch.tensor([0.485, 0.456, 0.406]).view(1, 3, 1, 1)
STD = torch.tensor([0.229, 0.224, 0.225]).view(1, 3, 1, 1)
LABELS = ["Normal", "Benign", "Malignant"]

# Must match qsvc.py exactly (angle_entangle, full entanglement, reps=2, scale 0.03)
N_QUBITS = 12
REPS = 2
ENTANGLE_SCALE = 0.03
PAIRS = [(i, j) for i in range(N_QUBITS) for j in range(i + 1, N_QUBITS)]

_state = {}


class _Net(nn.Module):
    """Same layout as finetune_extractor.Net, so the saved state dict loads directly."""

    def __init__(self):
        super().__init__()
        base = models.resnet18(weights=None)
        self.stem = nn.Sequential(base.conv1, base.bn1, base.relu, base.maxpool, base.layer1, base.layer2)
        self.tuned = nn.Sequential(base.layer3, base.layer4)
        self.head = nn.Sequential(nn.Dropout(0.3), nn.Linear(512, 3))


def _circuit_factory():
    dev = qml.device("default.qubit", wires=N_QUBITS)

    @qml.qnode(dev)
    def circuit(x):
        for _ in range(REPS):
            for i in range(N_QUBITS):
                qml.RY(x[i], wires=i)
                qml.RZ(x[i], wires=i)
            for (i, j) in PAIRS:
                qml.CNOT(wires=[i, j])
                qml.RZ(ENTANGLE_SCALE * x[i] * x[j], wires=j)
                qml.CNOT(wires=[i, j])
        return qml.state()

    return circuit


def _load():
    if _state:
        return _state
    net = _Net()
    net.load_state_dict(torch.load(ART_DIR / "resnet18_finetuned.pth", map_location="cpu"))
    net.eval()
    pre = joblib.load(ART_DIR / "preprocessing.joblib")
    svc_bundle = joblib.load(ART_DIR / "svc.joblib")
    _state.update(
        net=net, pre=pre,
        svc=svc_bundle["svc"], support_idx=svc_bundle["support_idx"], n_train=svc_bundle["n_train"],
        sv_states=np.load(ART_DIR / "sv_states.npy"),
        circuit=_circuit_factory(),
    )
    return _state


# ---------------------------------------------------------------- quantum stage

def features_to_angles(feat512):
    p = _load()["pre"]
    x = p["scaler"].transform(feat512.reshape(1, -1))
    x = p["pca"].transform(x)
    x = p["mm1"].transform(x)
    x = p["std2"].transform(x)
    x = p["mm2"].transform(x)
    return x[0]


def probs_from_angles(angles):
    """Fidelity kernel against the stored support-vector states, then the trained SVC."""
    s = _load()
    state = np.asarray(s["circuit"](angles), dtype=np.complex64)
    k = np.abs(s["sv_states"] @ state.conj()) ** 2            # (n_sv,)
    K = np.zeros((1, s["n_train"]), dtype=np.float64)          # non-support columns have zero dual weight
    K[0, s["support_idx"]] = k
    return s["svc"].predict_proba(K)[0], int(s["svc"].predict(K)[0])


def predict_features(feat512):
    """Quantum stage only, from raw 512-d features. Used by the export check."""
    probs, svc_label = probs_from_angles(features_to_angles(feat512))
    return probs, svc_label


# ---------------------------------------------------------------- image stage

def _preprocess(pil_gray):
    img = pil_gray.resize((IMG_SIZE, IMG_SIZE), Image.BILINEAR)
    arr = np.array(img, dtype=np.uint8)
    x = torch.from_numpy(arr).float().div(255.0).unsqueeze(0).unsqueeze(0).repeat(1, 3, 1, 1)
    return (x - MEAN) / STD, arr


def _to_b64(arr):
    buf = io.BytesIO()
    Image.fromarray(arr).save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("utf-8")


def _render(gray224, cam, alpha=0.5):
    base_rgb = cv2.cvtColor(gray224, cv2.COLOR_GRAY2RGB)
    cam = cam - cam.min()
    if cam.max() > 0:
        cam = cam / cam.max()
    cam_big = cv2.resize(cam, (DISPLAY_SIZE, DISPLAY_SIZE), interpolation=cv2.INTER_CUBIC)
    cam_big = np.clip(cam_big, 0, 1)
    heat = cv2.cvtColor(cv2.applyColorMap(np.uint8(255 * cam_big), cv2.COLORMAP_JET), cv2.COLOR_BGR2RGB)
    overlay = cv2.addWeighted(base_rgb, 1 - alpha, heat, alpha, 0)
    return base_rgb, heat, overlay


def classify_view(image_bytes, with_occlusion=True):
    """with_occlusion is kept only so the signature matches run_inference. The heatmap is
    Grad-CAM on the fine-tuned ResNet18 (it explains the CNN stage, not the quantum kernel)."""
    s = _load()
    net = s["net"]
    pil = Image.open(io.BytesIO(image_bytes)).convert("L")
    x, gray224 = _preprocess(pil)

    with torch.no_grad():
        stem_out = net.stem(x)
    with torch.enable_grad():
        act = net.tuned(stem_out)                               # (1, 512, 7, 7)
        pooled = act.mean(dim=(2, 3))
        cnn_logits = net.head(pooled)

    probs, _ = probs_from_angles(features_to_angles(pooled.detach().numpy()[0].astype(np.float64)))
    pred = int(np.argmax(probs))

    result = {
        "prediction": pred,
        "result": LABELS[pred],
        "score": round(float(probs[pred]), 4),
        "class_probabilities": {LABELS[i]: round(float(probs[i]), 4) for i in range(3)},
    }

    if with_occlusion:
        # Grad-CAM: gradient of the CNN head's logit for the quantum-predicted class
        grad = torch.autograd.grad(cnn_logits[0, pred], act)[0]
        weights = grad.mean(dim=(2, 3), keepdim=True)
        cam = torch.relu((weights * act).sum(dim=1))[0].detach().numpy()
        base_rgb, heat_rgb, overlay_rgb = _render(gray224, cam)
        result["gradcam"] = {
            "heatmap_base64": _to_b64(heat_rgb),
            "base_image_base64": _to_b64(base_rgb),
            "overlay_base64": _to_b64(overlay_rgb),
            "width": DISPLAY_SIZE,
            "height": DISPLAY_SIZE,
            "target_class": LABELS[pred],
        }
    return result
