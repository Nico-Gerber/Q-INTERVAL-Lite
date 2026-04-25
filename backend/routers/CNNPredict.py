import io
from pathlib import Path
from PIL import Image
from fastapi import APIRouter, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse
import torch
import torch.nn as nn
from torchvision import models, transforms

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
    return tensor

# =========================
# ROUTE
# =========================
router = APIRouter(prefix="/CNNPredict", tags=["CNNPredict"])

@router.post("/")
async def predict(file: UploadFile = File(...)):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=415, detail=f"Unsupported file type '{file.content_type}'.")

    contents = await file.read()

    try:
        tensor = preprocess_image(contents)
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

    return JSONResponse(
        status_code=200,
        content={
            "prediction": predicted_idx,
            "result": CLASS_NAMES[predicted_idx],
            "score": round(confidence, 4),
               "class_probabilities": {
            CLASS_NAMES[i]: round(probabilities[0][i].item(), 4)
            for i in range(len(CLASS_NAMES))
        }
        }
    )