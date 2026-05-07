import torch
import torch.nn as nn
from torchvision import models, transforms
from PIL import Image
from fastapi import APIRouter, UploadFile, File, HTTPException
from typing import List
import io
import numpy as np


router = APIRouter(prefix="/mammo-risk", tags=["MammoRisk"])


# ── Device ────────────────────────────────────────────────────────────────────
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")


# ── Transform ─────────────────────────────────────────────────────────────────
image_transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(
        mean=[0.485, 0.456, 0.406],
        std=[0.229, 0.224, 0.225],
    ),
])


# ── Class labels ──────────────────────────────────────────────────────────────
CANCER_CLASSES = ["Normal", "Benign", "Malignant"]
DENSITY_CLASSES = ["A", "B", "C", "D"]
BIRADS_CLASSES = [1, 2, 3, 4, 5]


# ── Risk maps ─────────────────────────────────────────────────────────────────
CANCER_RISK_MAP = {
    "Normal": 0,
    "Benign": 30,
    "Malignant": 100,
}

DENSITY_RISK_MAP = {
    "A": 25,
    "B": 50,
    "C": 75,
    "D": 100,
}

BIRADS_RISK_MAP = {
    1: 0,
    2: 25,
    3: 50,
    4: 75,
    5: 100,
}


# ── Model paths ───────────────────────────────────────────────────────────────
CANCER_MODEL_PATH = "models/best_restnet50_5_mammobench.pth"
DENSITY_MODEL_PATH = "models/best_restnet50_density_mammobench.pth"
BIRADS_MODEL_PATH = "models/best_restnet50_birads_mammobench.pth"


# ── Load models ───────────────────────────────────────────────────────────────
def _load_model(path: str, num_classes: int) -> nn.Module:
    model = models.resnet50(weights=None)
    model.fc = nn.Linear(model.fc.in_features, num_classes)
    model.load_state_dict(torch.load(path, map_location=device))
    model.to(device)
    model.eval()
    return model


cancer_model = _load_model(CANCER_MODEL_PATH, num_classes=3)
density_model = _load_model(DENSITY_MODEL_PATH, num_classes=4)
birads_model = _load_model(BIRADS_MODEL_PATH, num_classes=5)


# ── Helpers ───────────────────────────────────────────────────────────────────
def _risk_level(score: float) -> str:
    if score < 34:
        return "Low Risk"
    elif score < 67:
        return "Medium Risk"
    return "High Risk"


def _feedback(score: float) -> str:
    if score >= 67:
        return (
            "The results indicate a higher level of risk. It is important to "
            "seek medical advice promptly to ensure appropriate evaluation and care."
        )
    elif score >= 34:
        return (
            "Some areas may need further review. A follow-up consultation "
            "with a healthcare professional is recommended."
        )
    return (
        "No major concerns are indicated at this time. Continue with regular "
        "check-ups and screenings."
    )


def _probs_to_percent_dict(class_names: list, probs_tensor: torch.Tensor) -> dict:
    return {
        str(class_names[i]): round(float(probs_tensor[i].item() * 100.0), 2)
        for i in range(len(class_names))
    }


def _expected_risk_from_percent_probs(probabilities: dict, risk_map: dict) -> float:
    total = 0.0

    for cls, prob_percent in probabilities.items():
        key = int(cls) if isinstance(next(iter(risk_map.keys())), int) else cls
        total += (float(prob_percent) / 100.0) * float(risk_map[key])

    return total


def _calculate_formula_risk(
    cancer_risk_score: float,
    density_risk_score: float,
    birads_risk_score: float,
) -> float:
    score = (
        0.60 * cancer_risk_score
        + 0.15 * density_risk_score
        + 0.25 * birads_risk_score
    )

    return max(0.0, min(score, 100.0))


def _predict(model: nn.Module, image: Image.Image, class_names: list):
    tensor = image_transform(image).unsqueeze(0).to(device)

    with torch.no_grad():
        probs = torch.softmax(model(tensor), dim=1)[0]

    idx = torch.argmax(probs).item()
    predicted_class = class_names[idx]
    confidence = float(probs[idx].item() * 100.0)
    probabilities = _probs_to_percent_dict(class_names, probs)

    return predicted_class, confidence, probabilities


# ── Core inference ────────────────────────────────────────────────────────────
def _predict_single(image: Image.Image, filename: str | None = None) -> dict:
    cancer_pred, cancer_confidence, cancer_probabilities = _predict(
        cancer_model,
        image,
        CANCER_CLASSES,
    )

    density_pred, density_confidence, density_probabilities = _predict(
        density_model,
        image,
        DENSITY_CLASSES,
    )

    birads_pred, birads_confidence, birads_probabilities = _predict(
        birads_model,
        image,
        BIRADS_CLASSES,
    )

    cancer_risk_score = _expected_risk_from_percent_probs(
        cancer_probabilities,
        CANCER_RISK_MAP,
    )

    density_risk_score = _expected_risk_from_percent_probs(
        density_probabilities,
        DENSITY_RISK_MAP,
    )

    birads_risk_score = _expected_risk_from_percent_probs(
        birads_probabilities,
        BIRADS_RISK_MAP,
    )

    formula_final_risk_score = _calculate_formula_risk(
        cancer_risk_score=cancer_risk_score,
        density_risk_score=density_risk_score,
        birads_risk_score=birads_risk_score,
    )

    formula_risk_level = _risk_level(formula_final_risk_score)

    result = {
        "image_name": filename,

        "predicted_cancer_class": cancer_pred,
        "cancer_confidence": round(cancer_confidence, 2),
        "cancer_probabilities": cancer_probabilities,
        "cancer_risk_score": round(cancer_risk_score, 2),

        "predicted_density": density_pred,
        "density_confidence": round(density_confidence, 2),
        "density_probabilities": density_probabilities,
        "density_risk_score": round(density_risk_score, 2),

        "predicted_birads": int(birads_pred),
        "birads_confidence": round(birads_confidence, 2),
        "birads_probabilities": birads_probabilities,
        "birads_risk_score": round(birads_risk_score, 2),

        # QML-style naming
        "formula_final_risk_score": round(formula_final_risk_score, 2),
        "formula_risk_level": formula_risk_level,

        # MammoRisk/backwards-compatible aliases
        "cnn_risk_score": round(cancer_risk_score, 2),
        "final_risk_score": round(formula_final_risk_score, 2),
        "future_risk_score": round(formula_final_risk_score, 2),
        "risk_level": formula_risk_level,
        "feedback": _feedback(formula_final_risk_score),
    }

    return result


def _make_patient_summary(image_results: list[dict]) -> dict:
    formula_scores = [
        float(item["formula_final_risk_score"])
        for item in image_results
    ]

    cancer_scores = [
        float(item["cancer_risk_score"])
        for item in image_results
    ]

    density_scores = [
        float(item["density_risk_score"])
        for item in image_results
    ]

    birads_scores = [
        float(item["birads_risk_score"])
        for item in image_results
    ]

    highest_formula = max(formula_scores)
    average_formula = float(np.mean(formula_scores))

    highest_cancer = max(cancer_scores)
    highest_density = max(density_scores)
    highest_birads = max(birads_scores)

    final_class = (
        "Malignant" if any(r["predicted_cancer_class"] == "Malignant" for r in image_results)
        else "Benign" if any(r["predicted_cancer_class"] == "Benign" for r in image_results)
        else "Normal"
    )

    return {
        "number_of_images": len(image_results),

        "average_formula_risk_score": round(average_formula, 2),
        "highest_formula_risk_score": round(highest_formula, 2),
        "final_patient_formula_risk_score": round(highest_formula, 2),
        "final_patient_formula_risk_level": _risk_level(highest_formula),

        # MammoRisk/backwards-compatible aggregate fields
        "final_predicted_class": final_class,
        "highest_cnn_risk_score": round(highest_cancer, 2),
        "highest_density_risk_score": round(highest_density, 2),
        "highest_birads_risk_score": round(highest_birads, 2),
        "future_risk_score": round(highest_formula, 2),
        "risk_level": _risk_level(highest_formula),
        "feedback": _feedback(highest_formula),

        "aggregation_method": "highest image risk",
    }


# ── Routes ────────────────────────────────────────────────────────────────────
@router.post("/predict/single")
async def predict_single(file: UploadFile = File(...)):
    """Run risk inference on a single mammography image."""
    try:
        image = Image.open(io.BytesIO(await file.read())).convert("RGB")
    except Exception:
        raise HTTPException(status_code=400, detail="Could not read image file.")

    image_result = _predict_single(image, filename=file.filename)

    # Same general style as predict_qml_images.py:
    return {
        "image_results": [image_result],
        "patient_summary": _make_patient_summary([image_result]),
        "important_limitation": (
            "This is a MammoRisk image-based risk prototype. It is not a "
            "clinically validated future cancer probability model."
        ),
    }


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
            raise HTTPException(
                status_code=400,
                detail=f"Could not read file: {f.filename}",
            )

        image_results.append(_predict_single(image, filename=f.filename))

    return {
        "image_results": image_results,
        "patient_summary": _make_patient_summary(image_results),
        "important_limitation": (
            "This is a MammoRisk image-based risk prototype. It is not a "
            "clinically validated future cancer probability model."
        ),
    }
