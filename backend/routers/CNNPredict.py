import io
from pathlib import Path
from PIL import Image
from fastapi import APIRouter, File, UploadFile, HTTPException, Query
from fastapi.responses import JSONResponse, StreamingResponse
import torch
import torch.nn as nn
from torchvision import models, transforms

from .gradcam_utils import generate_gradcam, pil_to_base64


# =========================
# SETTINGS
# =========================
BASE_DIR = Path(__file__).parent.parent
MODEL_PATH = BASE_DIR / "models/best_resnet18_mammobench.pth"
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}

CLASS_NAMES = {0: "Normal", 1: "Benign", 2: "Malignant"}

# =========================
# PREPROCESSING
# Must match val_test_transform used in training exactly
# =========================
transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(
        mean=[0.485, 0.456, 0.406],
        std=[0.229, 0.224, 0.225]
    )
])

# =========================
# LOAD MODEL (once at startup)
# Rebuild same architecture used in training:
# ResNet18 with final fc layer replaced for 3 classes
# =========================
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"CNN using device: {device}")

model = models.resnet18(weights=None)
num_features = model.fc.in_features
model.fc = nn.Linear(num_features, 3)
model.load_state_dict(torch.load(MODEL_PATH, map_location=device))
model = model.to(device)
model.eval()
print("CNN model loaded successfully.")

# =========================
# PREPROCESSING FUNCTION
# =========================
def preprocess_image(image_bytes):
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    tensor = transform(img).unsqueeze(0).to(device)  # add batch dimension
    return tensor, img

# =========================
# ROUTE
# =========================
router = APIRouter(prefix="/CNNPredict", tags=["CNNPredict"])

@router.post("/")
async def predict(
    file: UploadFile = File(...),
    include_gradcam: bool = Query(False, description="If true, include base64 Grad-CAM heatmap in response")
):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=415, detail=f"Unsupported file type '{file.content_type}'.")

    contents = await file.read()

    try:
        tensor, pil_image = preprocess_image(contents)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Image processing failed: {str(e)}")

 
    try:
        with torch.no_grad():
            outputs = model(tensor)
            probabilities = torch.softmax(outputs, dim=1)
            predicted_idx = torch.argmax(probabilities, dim=1).item()
            confidence = probabilities[0][predicted_idx].item()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference failed: {str(e)}")

    response_content = {
        "prediction": predicted_idx,
        "result": CLASS_NAMES[predicted_idx],
        "score": round(confidence, 4),
        "class_probabilities": {
            CLASS_NAMES[i]: round(probabilities[0][i].item(), 4)
            for i in range(len(CLASS_NAMES))
        },
    }


    if include_gradcam:
        try:
            overlay_pil, heatmap_pil, base_pil, _ = generate_gradcam(
                model=model,
                input_tensor=tensor,
                original_pil_image=pil_image,
                target_class=predicted_idx,
            )
            response_content["gradcam"] = {
                "heatmap_base64": pil_to_base64(heatmap_pil),  
                "base_image_base64": pil_to_base64(base_pil),  
                "overlay_base64": pil_to_base64(overlay_pil),  
                "width": base_pil.width,
                "height": base_pil.height,
            }
        except Exception as e:
            response_content["gradcam_error"] = str(e)
            
    return JSONResponse(status_code=200, content=response_content) 


@router.post("/gradcam")
async def gradcam_only(
    file: UploadFile = File(...),
    target_class: int = Query(None, description="Class index to explain. If omitted, uses predicted class."),
    mode: str = Query("heatmap", description="What to return: 'heatmap', 'base', or 'overlay'"),
):
 
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=415, detail=f"Unsupported file type '{file.content_type}'.")

    contents = await file.read()

    try:
        tensor, pil_image = preprocess_image(contents)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Image processing failed: {str(e)}")

    if target_class is None:
        with torch.no_grad():
            outputs = model(tensor)
            target_class = torch.argmax(outputs, dim=1).item()

    try:
        overlay_pil, heatmap_pil, base_pil, _ = generate_gradcam(
            model=model,
            input_tensor=tensor,
            original_pil_image=pil_image,
            target_class=target_class,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Grad-CAM generation failed: {str(e)}")

    if mode == "base":
        chosen = base_pil
    elif mode == "overlay":
        chosen = overlay_pil
    else:  
        chosen = heatmap_pil

    buf = io.BytesIO()
    chosen.save(buf, format="PNG")
    buf.seek(0)
    return StreamingResponse(buf, media_type="image/png")