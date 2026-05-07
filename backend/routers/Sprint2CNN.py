import io
import cv2
import numpy as np
import torch
import torch.nn as nn
from torchvision import models
from torch.amp import autocast
import albumentations as A
from albumentations.pytorch import ToTensorV2
from pytorch_grad_cam import GradCAMPlusPlus
from pytorch_grad_cam.utils.image import show_cam_on_image
from pytorch_grad_cam.utils.model_targets import ClassifierOutputTarget
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
import base64
from PIL import Image

router = APIRouter(prefix="/S2CNNPredict", tags=["CNNPredict"])

# ── Load model bundle once at startup ─────────────────────────────────────────
BUNDLE_PATH = "models/final_model_bundle.pth"
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

bundle = torch.load(BUNDLE_PATH, map_location=device)
MEAN        = bundle["mean"]
STD         = bundle["std"]
INPUT_SIZE  = bundle["input_size"]
T_OPTIMAL   = bundle["temperature"]
CLASS_NAMES = bundle["class_names"]
REVERSE_MAP = {i: name for i, name in enumerate(CLASS_NAMES)}


def build_model():
    m = models.resnet50(weights=None)
    num_features = m.fc.in_features
    m.fc = nn.Sequential(
        nn.Dropout(p=0.3),
        nn.Linear(num_features, 256),
        nn.ReLU(inplace=True),
        nn.Dropout(p=0.3),
        nn.Linear(256, 3),
    )
    return m

model = build_model().to(device)
model.load_state_dict(bundle["model_state_dict"])
model.eval()

transform = A.Compose([
    A.Resize(INPUT_SIZE, INPUT_SIZE),
    A.Normalize(mean=MEAN, std=STD),
    ToTensorV2(),
])

cam = GradCAMPlusPlus(model=model, target_layers=[model.layer4[-1]])


# ── Helper functions ───────────────────────────────────────────────────────────
def risk_score_from_probs(probs):
    risk_pct = float(probs[2]) * 100
    if risk_pct < 30:
        return risk_pct, "Low", "Routine screening recommended."
    elif risk_pct < 60:
        return risk_pct, "Moderate", "Specialist review recommended."
    else:
        return risk_pct, "High", "Urgent specialist review required."


def run_inference(image_bytes: bytes):
    nparr = np.frombuffer(image_bytes, np.uint8)
    img_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img_bgr is None:
        raise ValueError("Could not decode image.")
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    img_resized = cv2.resize(img_rgb, (INPUT_SIZE, INPUT_SIZE))

    tensor = transform(image=img_resized)["image"].unsqueeze(0).to(device)
    with torch.no_grad():
        with autocast(device_type="cuda" if torch.cuda.is_available() else "cpu"):
            logits = model(tensor)
        probs = torch.softmax(logits.float() / T_OPTIMAL, dim=1).cpu().numpy()[0]

    pred_idx = int(np.argmax(probs))
    pred_class = REVERSE_MAP[pred_idx]
    confidence = float(probs[pred_idx])

    # Grad-CAM++ heatmap
    targets = [ClassifierOutputTarget(pred_idx)]
    grayscale_cam = cam(input_tensor=tensor, targets=targets)[0]
    heatmap_uint8 = np.uint8(255 * grayscale_cam)
    heatmap_color = cv2.applyColorMap(heatmap_uint8, cv2.COLORMAP_JET)
    heatmap_rgb = cv2.cvtColor(heatmap_color, cv2.COLOR_BGR2RGB)

    def to_b64(arr):
        buf = io.BytesIO()
        Image.fromarray(arr).save(buf, format="PNG")
        return base64.b64encode(buf.getvalue()).decode("utf-8")

    return {
        "prediction": pred_idx,
        "result": pred_class,
        "score": round(confidence, 4),
        "class_probabilities": {
            REVERSE_MAP[i]: round(float(probs[i]), 4)
            for i in range(len(REVERSE_MAP))
        },
        "gradcam": {
            "heatmap_base64": to_b64(heatmap_rgb),
            "base_image_base64": to_b64(img_resized),
            "overlay_base64": to_b64(heatmap_rgb),  
            "width": INPUT_SIZE,
            "height": INPUT_SIZE,
        }
    }

# ── Endpoint ───────────────────────────────────────────────────────────────────
@router.post("/predict")
async def predict(file: UploadFile = File(...)):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image.")
    image_bytes = await file.read()
    try:
        result = run_inference(image_bytes)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return JSONResponse(content=result)