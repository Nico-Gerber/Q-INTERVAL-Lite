from typing import Optional

from .classifier_router import run_inference
from .composite_risk_router import _calculate_risk, _predict_single as predict_risk


SLOT_ORDER = ["L-CC", "L-MLO", "R-CC", "R-MLO"]


def run(views: dict, age: Optional[float]) -> dict:
    """Quantum session analysis engine entry point.

    Args:
        views: {"L-CC": bytes, "L-MLO": bytes, "R-CC": bytes, "R-MLO": bytes}
        age:   Patient age in years, or None (unused by this engine).

    Returns:
        Normalised model_result dict (see session_analysis/IMPLEMENTATION.md).
    """
    result_views = {}
    risk_results = {}

    for slot in SLOT_ORDER:
        image_bytes = views[slot]
        classification = run_inference(image_bytes, with_occlusion=True)
        risk = predict_risk(image_bytes, filename=slot)

        explanation = classification.get("gradcam", {})
        birads = risk.get("predicted_birads")
        if birads is not None:
            birads = int(birads)

        result_views[slot] = {
            "result": classification["result"],
            "score": round(float(classification["score"]), 4),
            "class_probabilities": {
                "Normal": round(float(classification["class_probabilities"]["Normal"]), 4),
                "Benign": round(float(classification["class_probabilities"]["Benign"]), 4),
                "Malignant": round(float(classification["class_probabilities"]["Malignant"]), 4),
            },
            "explainability": {
                "base_image_base64": explanation.get("base_image_base64", ""),
                "heatmap_base64": explanation.get("heatmap_base64", ""),
                "overlay_base64": explanation.get("overlay_base64"),
            },
            "density": risk.get("predicted_density"),
            "birads": birads,
        }
        risk_results[slot] = risk

    any_malignant = any(v["result"] == "Malignant" for v in result_views.values())

    if any_malignant:
        risk_score, risk_level = None, "Not Applicable"
    else:
        valid_risks = [
            r for r in risk_results.values()
            if r.get("future_risk_score") is not None
        ]

        if not valid_risks:
            risk_score, risk_level = None, "Not Applicable"
        else:
            risk_score = _calculate_risk(
                max(r["cancer_risk_score"] for r in valid_risks),
                max(r["density_risk_score"] for r in valid_risks),
                max(r["birads_risk_score"] for r in valid_risks),
            )
            risk_level = max(valid_risks, key=lambda r: r["future_risk_score"])["risk_level"]

    return {
        "views": result_views,
        "mammo_risk": {"score": risk_score, "level": risk_level},
    }
