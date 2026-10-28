from .schemas import (
    ClassificationSummary,
    ClassProbabilities,
    ExplainabilityResult,
    MammoRiskResult,
    SessionAnalysisResponse,
    ViewResult,
)

PATIENT_MALIGNANT_THRESHOLD = 0.5


def build_session_response(model_result: dict, model_name: str) -> SessionAnalysisResponse:
    """Assemble the shared SessionAnalysisResponse from a normalised internal dict.

    Expected shape of model_result:
        {
            "views": {
                "L-CC" | "L-MLO" | "R-CC" | "R-MLO": {
                    "result": "Normal" | "Benign" | "Malignant",
                    "score": float,
                    "class_probabilities": {"Normal": float, "Benign": float, "Malignant": float},
                    "explainability": {"base_image_base64": str, "heatmap_base64": str, "overlay_base64": str | None},
                    "density": str | None,
                    "birads": int | None,
                }
            },
            "mammo_risk": {"score": float | None, "level": str},
        }
    """

    views = model_result["views"]

    left_score = (
        views["L-CC"]["class_probabilities"]["Malignant"]
        + views["L-MLO"]["class_probabilities"]["Malignant"]
    ) / 2.0

    right_score = (
        views["R-CC"]["class_probabilities"]["Malignant"]
        + views["R-MLO"]["class_probabilities"]["Malignant"]
    ) / 2.0

    patient_score = max(left_score, right_score)
    malignant_detected = patient_score > PATIENT_MALIGNANT_THRESHOLD

    densities = [v["density"] for v in views.values() if v["density"] is not None]
    birads_values = [v["birads"] for v in views.values() if v["birads"] is not None]

    public_views = {
        slot: ViewResult(
            result=view["result"],
            score=view["score"],
            class_probabilities=ClassProbabilities(**view["class_probabilities"]),
            explainability=ExplainabilityResult(**view["explainability"]),
        )
        for slot, view in views.items()
    }

    return SessionAnalysisResponse(
        model=model_name,
        views=public_views,
        classification=ClassificationSummary(
            overall="Malignant" if malignant_detected else "Non-Malignant",
            patient_malignant_score=round(patient_score, 4),
            malignant_detected=malignant_detected,
        ),
        mammo_risk=MammoRiskResult(
            score=model_result["mammo_risk"]["score"],
            level=model_result["mammo_risk"]["level"],
            density=max(densities) if densities else None,
            birads=max(birads_values) if birads_values else None,
        ),
    )
