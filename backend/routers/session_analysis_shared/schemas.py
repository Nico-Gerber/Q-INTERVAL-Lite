from typing import Dict, Literal, Optional
from pydantic import BaseModel


ViewName = Literal[
    "L-CC",
    "L-MLO",
    "R-CC",
    "R-MLO",
]


class ClassProbabilities(BaseModel):
    Normal: float
    Benign: float
    Malignant: float


class ExplainabilityResult(BaseModel):
    base_image_base64: str
    heatmap_base64: str
    overlay_base64: Optional[str] = None


class ViewResult(BaseModel):
    result: Literal[
        "Normal",
        "Benign",
        "Malignant",
    ]

    score: float

    class_probabilities: ClassProbabilities

    explainability: ExplainabilityResult


class ClassificationSummary(BaseModel):
    overall: str
    patient_malignant_score: float
    malignant_detected: bool


class MammoRiskResult(BaseModel):
    score: Optional[float]
    level: str

    density: Optional[str] = None
    birads: Optional[int] = None


class SessionAnalysisResponse(BaseModel):
    model: str

    views: Dict[ViewName, ViewResult]

    classification: ClassificationSummary

    mammo_risk: MammoRiskResult