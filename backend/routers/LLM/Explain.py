import httpx
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/explain", tags=["explain"])

OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL = "llama3.2"

# ── Request shape ──────────────────────────────────────────────────────────────
class ExplainRequest(BaseModel):
    audience: str = "clinician"
    # CNN — primary
    overall_classification: str
    patient_malignant_score: float
    malignant_detected: bool
    views: dict
    composite_risk_score: Optional[float] = None
    composite_risk_level: Optional[str] = None
    highest_density: Optional[float] = None
    highest_birads:  Optional[float] = None
    # QML — secondary
    qml_overall_classification: Optional[str] = None
    qml_patient_malignant_score: Optional[float] = None
    qml_views: Optional[dict] = None

# ── Prompt builder ─────────────────────────────────────────────────────────────
def build_prompt(data: ExplainRequest) -> str:
    view_summary = "\n".join([
        f"  - {view}: {info.get('result', 'N/A')} ({round(info.get('score', 0) * 100, 1)}% confidence)"
        for view, info in data.views.items()
    ])

    composite_section = ""
    if not data.malignant_detected and data.composite_risk_score is not None:
        composite_section = f"""
Composite Risk Index: {data.composite_risk_score} / 100
Risk Level: {data.composite_risk_level}
Highest Breast Density: {data.highest_density}
Highest BI-RADS Category: {data.highest_birads}
All views Data: {data.views}
"""

    audience_instruction = (
        "You are explaining results to a General Practitioner. "
        "Use precise clinical language. Be concise and action-oriented."
        if data.audience == "clinician"
        else
        "You are explaining results to a patient in plain, reassuring language. "
        "Avoid technical jargon. Focus on what happens next."
    )

    return f"""You are a clinical decision support assistant explaining AI mammogram analysis results.
{audience_instruction}

STRICT RULES:
- Do NOT diagnose the patient
- Do NOT recommend specific treatments  
- Do NOT go beyond what the results show
- Keep your response to 3-4 sentences maximum
- Base your primary explanation on the Classical CNN results
- Reference Quantum results only as a secondary comparison note
- If models disagree, note this but defer to the Classical result
- End with a reminder to consult a qualified clinician

MODEL CONTEXT:
- Classical CNN (ResNet50): Primary model, 70% test accuracy, clinically calibrated
- Quantum ML (VQC/QRF): Experimental model, ~47-51% accuracy, research prototype only

CLASSICAL CNN RESULTS (Primary):
Overall Classification: {data.overall_classification}
Patient Malignant Score: {round(data.patient_malignant_score * 100, 1)}%
Malignant Detected: {data.malignant_detected}

Per-View Classifications:
{view_summary}
{composite_section}

QUANTUM ML RESULTS (Experimental — treat as secondary reference only):
Overall Classification: {data.qml_overall_classification}
Patient Malignant Score: {round(data.qml_patient_malignant_score * 100, 1)}%

Models {'agree' if data.overall_classification == data.qml_overall_classification else 'disagree'}.

Explain these findings for a {data.audience}. Lead with classical results."""

# ── Endpoint ───────────────────────────────────────────────────────────────────
@router.post("/")
async def explain(data: ExplainRequest):
    prompt = build_prompt(data)

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(OLLAMA_URL, json={
                "model": MODEL,
                "prompt": prompt,
                "stream": False,
            })
        result = response.json()
        explanation = result.get("response", "").strip()

    except Exception as e:
        return JSONResponse(
            status_code=503,
            content={"error": f"Ollama unavailable: {str(e)}"}
        )

    return JSONResponse(content={
        "explanation": explanation,
        "audience": data.audience,
        "disclaimer": "This explanation is AI-generated and intended solely to interpret model outputs. It must not be used as a substitute for professional clinical assessment.",
    })