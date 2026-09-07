"""Shared Future Risk API response contract.

Both Classical and Quantum engines are model-specific internally, but their
FastAPI routers MUST return the same small response object to the frontend.
"""

from typing import Any, Dict, Iterable, List, Optional


def _normalise_risk_level(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None

    text = str(value).strip()
    low = text.lower()

    if "low" in low:
        return "Low"
    if "moderate" in low or "medium" in low:
        return "Moderate"
    if "high" in low:
        return "High"

    return text


def build_future_risk_response(
    *,
    yearly_risk: Dict[str, float],
    risk_level: Optional[str],
    exams: Iterable[Dict[str, Any]],
) -> Dict[str, Any]:
    """Build the only Future Risk response shape exposed to React.

    Units:
      - yearly risk values: percentage points (e.g. 6.25 means 6.25%)
      - image_contribution_percent: percentage points (0..100)
    """

    ordered_yearly = {
        f"{year}_year": round(float(yearly_risk.get(f"{year}_year", 0.0)), 2)
        for year in range(1, 6)
    }

    image_level_results: List[Dict[str, Any]] = []
    for index, exam in enumerate(exams, start=1):
        contribution = exam.get("contribution_percent")
        image_level_results.append(
            {
                "filename": str(exam.get("exam_id") or f"exam_{index}"),
                "exam_date": str(exam["exam_date"]),
                "image_contribution_percent": (
                    None if contribution is None else round(float(contribution), 2)
                ),
            }
        )

    return {
        "patient_summary": {
            "final_patient_yearly_future_risk": ordered_yearly,
            "final_patient_5_year_risk_score": ordered_yearly["5_year"],
            "risk_level": _normalise_risk_level(risk_level),
        },
        "image_level_results": image_level_results,
    }
