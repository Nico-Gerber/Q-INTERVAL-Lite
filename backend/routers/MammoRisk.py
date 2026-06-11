import torch
import torch.nn as nn
from torchvision import models, transforms
from PIL import Image
from fastapi import APIRouter, UploadFile, File, HTTPException
from typing import List
import io

router = APIRouter(prefix="/mammo-risk", tags=["MammoRisk"])

# ── Device ────────────────────────────────────────────────────────────────────
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# ── Transform ─────────────────────────────────────────────────────────────────
image_transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406],
                         std=[0.229, 0.224, 0.225]),
])

# ── Class labels ──────────────────────────────────────────────────────────────
CANCER_CLASSES  = ["Normal", "Benign", "Malignant"]
DENSITY_CLASSES = ["A", "B", "C", "D"]
BIRADS_CLASSES  = [1, 2, 3, 4, 5]

# ── Model paths ───────────────────────────────────────────────────────────────
CANCER_MODEL_PATH  = "models/best_restnet50_5_mammobench.pth"
DENSITY_MODEL_PATH = "models/best_restnet50_density_mammobench.pth"
BIRADS_MODEL_PATH  = "models/best_restnet50_birads_mammobench.pth"


def _load_model(path: str, num_classes: int) -> nn.Module:
    model = models.resnet50(weights=None)
    model.fc = nn.Linear(model.fc.in_features, num_classes)
    model.load_state_dict(torch.load(path, map_location=device))
    model.to(device)
    model.eval()
    return model


# Loaded once at import time
cancer_model  = _load_model(CANCER_MODEL_PATH,  num_classes=3)
density_model = _load_model(DENSITY_MODEL_PATH, num_classes=4)
birads_model  = _load_model(BIRADS_MODEL_PATH,  num_classes=5)


# ── Core inference ────────────────────────────────────────────────────────────

def _predict(model: nn.Module, image: Image.Image, class_names: list):
    tensor = image_transform(image).unsqueeze(0).to(device)
    with torch.no_grad():
        probs = torch.softmax(model(tensor), dim=1)[0]
    idx = torch.argmax(probs).item()
    return (
        class_names[idx],
        probs[idx].item(),
        {class_names[i]: probs[i].item() for i in range(len(class_names))},
    )


def _calculate_risk(cancer_probs: dict, density: str, birads: int) -> dict:
    cnn_risk = (cancer_probs["Malignant"] * 100) + (cancer_probs["Benign"] * 30)

    density_risk = {"A": 25, "B": 50, "C": 75, "D": 100}[density]
    birads_risk  = {1: 0, 2: 25, 3: 50, 4: 75, 5: 100}[birads]

    score = max(0, min(0.60 * cnn_risk + 0.25 * birads_risk + 0.15 * density_risk, 100))

    if score >= 67:
        level = "High Risk"
        msg   = ("The results indicate a higher level of risk. It is important to "
                 "seek medical advice promptly to ensure appropriate evaluation and care.")
    elif score >= 34:
        level = "Medium Risk"
        msg   = ("Some areas may need further review. A follow-up consultation "
                 "with a healthcare professional is recommended.")
    else:
        level = "Low Risk"
        msg   = ("No major concerns are indicated at this time. "
                 "Continue with regular check-ups and screenings.")

    return {
        "cnn_risk": cnn_risk,
        "density_risk": density_risk,
        "birads_risk": birads_risk,
        "final_risk_score": score,
        "risk_level": level,
        "msg": msg,
    }


def _predict_single(image: Image.Image) -> dict:
    cancer_pred,  _, cancer_probs  = _predict(cancer_model,  image, CANCER_CLASSES)
    density_pred, _, _             = _predict(density_model, image, DENSITY_CLASSES)
    birads_pred,  _, _             = _predict(birads_model,  image, BIRADS_CLASSES)

    if cancer_pred == "Malignant":
        return {
            "predicted_cancer_class": cancer_pred,
            "predicted_density":      density_pred,
            "predicted_birads":       birads_pred,
            "future_risk_score":      None,
            "risk_level":             "Not Applicable",
            "feedback": (
                "A malignant finding was detected. Future cancer risk estimation "
                "is not applicable because the case is already classified as "
                "cancer-suspicious. Please seek medical review."
            ),
        }

    risk = _calculate_risk(cancer_probs, density_pred, birads_pred)
    return {
        "predicted_cancer_class": cancer_pred,
        "predicted_density":      density_pred,
        "predicted_birads":       birads_pred,
        "cnn_risk_score":         round(risk["cnn_risk"], 2),
        "density_risk_score":     round(risk["density_risk"], 2),
        "birads_risk_score":      round(risk["birads_risk"], 2),
        "future_risk_score":      round(risk["final_risk_score"], 2),
        "risk_level":             risk["risk_level"],
        "feedback":               risk["msg"],
    }


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/predict/single")
async def predict_single(file: UploadFile = File(...)):
    """Run risk inference on a single mammography image."""
    try:
        image = Image.open(io.BytesIO(await file.read())).convert("RGB")
    except Exception:
        raise HTTPException(status_code=400, detail="Could not read image file.")

    return _predict_single(image)


@router.post("/predict/multi")
async def predict_multi(files: List[UploadFile] = File(...)):
    """Run risk inference across multiple mammography images for the same patient."""
    if not files:
        raise HTTPException(status_code=400, detail="No files provided.")

    image_results = []
    for f in files:
        try:
            image = Image.open(io.BytesIO(await f.read())).convert("RGB")
        except Exception:
            raise HTTPException(status_code=400, detail=f"Could not read file: {f.filename}")

        result = _predict_single(image)
        result["filename"] = f.filename
        image_results.append(result)

    # If any image is malignant, skip aggregate risk scoring
    classes = [r["predicted_cancer_class"] for r in image_results]
    if "Malignant" in classes:
        return {
            "number_of_images":  len(files),
            "image_level_results": image_results,
            "status":            "Malignant detected",
            "future_risk_score": None,
            "risk_level":        "Not Applicable",
            "feedback": (
                "A malignant finding was detected in at least one image. "
                "Future cancer risk estimation is not applicable because the case "
                "is already classified as cancer-suspicious. Please seek medical review."
            ),
        }

    highest_cnn     = max(r["cnn_risk_score"]     for r in image_results)
    highest_density = max(r["density_risk_score"] for r in image_results)
    highest_birads  = max(r["birads_risk_score"]  for r in image_results)

    final_score = max(0, min(0.60 * highest_cnn + 0.15 * highest_density + 0.25 * highest_birads, 100))

    final_class = ("Malignant" if "Malignant" in classes
                   else "Benign" if "Benign" in classes
                   else "Normal")

    if final_score >= 67:
        risk_level = "High Risk"
        feedback   = ("The results indicate a higher future cancer risk. "
                      "A medical review is strongly recommended.")
    elif final_score >= 34:
        risk_level = "Medium Risk"
        feedback   = ("The results indicate a moderate future cancer risk. "
                      "A follow-up consultation or further review is recommended.")
    else:
        risk_level = "Low Risk"
        feedback   = ("The results indicate a lower future cancer risk. "
                      "Regular screening and medical follow-up are still recommended.")

    return {
        "number_of_images":          len(files),
        "image_level_results":       image_results,
        "final_predicted_class":     final_class,
        "highest_cnn_risk_score":    round(highest_cnn, 2),
        "highest_density_risk_score": round(highest_density, 2),
        "highest_birads_risk_score": round(highest_birads, 2),
        "future_risk_score":         round(final_score, 2),
        "risk_level":                risk_level,
        "feedback":                  feedback,
    }
