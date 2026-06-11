import httpx
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional

VIEW_NAMES = {
    "L-CC":  "Left Craniocaudal (L-CC)",
    "R-CC":  "Right Craniocaudal (R-CC)",
    "L-MLO": "Left Mediolateral Oblique (L-MLO)",
    "R-MLO": "Right Mediolateral Oblique (R-MLO)",
}

router = APIRouter(prefix="/explain", tags=["explain"])

MODEL_URL = "http://localhost:11434/api/generate"
MODEL = "qwen3.5:4b"

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

    # ── Per-view summary — this is now the centrepiece ──
    def view_line(view, info):
        probs = info.get("class_probabilities", {}) or {}
        breakdown = " / ".join(
            f"{cls} {round(probs.get(cls, 0) * 100, 1)}%"
            for cls in ("Malignant", "Benign", "Normal") if cls in probs
        )
        label = VIEW_NAMES.get(view, view)
        line = f"  - {label}: {info.get('result', 'N/A')} ({round(info.get('score', 0) * 100, 1)}% confidence)"       
        return line + (f"  [{breakdown}]" if breakdown else "")

    view_summary = "\n".join(view_line(v, info) for v, info in data.views.items())

    qml_view_summary = "(not provided)"
    if data.qml_views:
        qml_view_summary = "\n".join(view_line(v, info) for v, info in data.qml_views.items())

    # ── Composite risk = background context ONLY, single line, omitted when malignant ──
    composite_context = ""
    if not data.malignant_detected and data.composite_risk_score is not None:
        composite_context = (
            f"\nBackground context only (do NOT build the explanation around this): "
            f"composite future-risk score {data.composite_risk_score}/100 "
            f"({data.composite_risk_level})."
        )

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
- Centre your explanation on the INDIVIDUAL per-view classifications. Describe what the relevant views show and call out any left-vs-right (L / R) asymmetry or disagreement between views.
- Determine malignancy from the CLASSIFICATION results (the per-view results and the overall classification) — NOT from the composite risk score.
- Treat the composite future-risk score, if present, as minor background context only. Mention it in at most a brief clause, never as the main point.
- Base your primary explanation on the Classical CNN results. Reference the Quantum model only as a secondary comparison note; if they disagree, defer to the Classical result.
- End with a reminder to consult a qualified clinician.

MODEL CONTEXT:
- Classical CNN (ResNet50): Primary model, 70% test accuracy, clinically calibrated
- Quantum ML (VQC): Experimental model, ~47-51% accuracy, research prototype only

- Use the view names exactly as given. Do NOT expand, reinterpret, or invent meanings for any abbreviation or term.

- Describe what the model CLASSIFIED each view as. Do NOT assert that lesions, masses, or abnormalities are actually present — the model outputs classifications, not findings.


- Asymmetry between left and right is expected and is not a contradiction. Only flag disagreement when two views of the SAME breast diverge, or when confidence is low (e.g. a "Malignant" label below ~50%).

CLASSICAL CNN — PER-VIEW CLASSIFICATIONS (primary focus):
{view_summary}

Overall (aggregated from the per-view results above):
  Classification: {data.overall_classification}
  Patient malignant score: {round(data.patient_malignant_score * 100, 1)}%
  Malignant detected: {data.malignant_detected}
{composite_context}

QUANTUM ML — PER-VIEW (secondary reference only):
{qml_view_summary}
  Overall: {data.qml_overall_classification} ({round((data.qml_patient_malignant_score or 0) * 100, 1)}% malignant)

Models {'agree' if data.overall_classification == data.qml_overall_classification else 'disagree'} at the patient level.

Write the explanation for a {data.audience}, leading with the per-view classical findings."""

# ── Endpoint ───────────────────────────────────────────────────────────────────
@router.post("/")
async def explain(data: ExplainRequest):
    prompt = build_prompt(data)

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(MODEL_URL, json={
                "model": MODEL,
                "prompt": prompt,
                "stream": False,
                "think": False, 
            })
        result = response.json()
        explanation = result.get("response", "").strip()

    except Exception as e:
        return JSONResponse(
            status_code=503,
            content={"error": f"Model unavailable: {str(e)}", "type": type(e).__name__}
        )

    return JSONResponse(content={
        "explanation": explanation,
        "audience": data.audience,
        "disclaimer": "This explanation is AI-generated and intended solely to interpret model outputs. It must not be used as a substitute for professional clinical assessment.",
    })



# ── Future Risk Explanation ─────────────────────────────────────────────────────
future_risk_router = APIRouter(prefix="/explain-future-risk", tags=["explain"])

class FutureRiskExplainRequest(BaseModel):
    audience: str = "clinician"
    patient_age: Optional[int] = None
    num_exams: Optional[int] = None
    # Classical — primary
    cnn_yearly_risk: Optional[dict] = None
    cnn_five_year_risk: Optional[float] = None
    cnn_exam_contributions: Optional[list] = None 
    # Quantum — secondary
    qml_yearly_risk: Optional[dict] = None
    qml_five_year_risk: Optional[float] = None
    qml_exam_contributions: Optional[list] = None
   


def build_future_risk_prompt(data: FutureRiskExplainRequest) -> str:

    def yearly_lines(yearly):
        if not yearly:
            return "  (not provided)"
        return "\n".join(
            f"  - Year {k.replace('_year', '')}: {round(v, 1)}%"
            for k, v in yearly.items()
        )

    audience_instruction = (
        "You are explaining results to a General Practitioner. "
        "Use precise clinical language. Be concise and action-oriented."
        if data.audience == "clinician"
        else
        "You are explaining results to a patient in plain, reassuring language. "
        "Avoid technical jargon. Focus on what happens next."
    )

    cnn5 = data.cnn_five_year_risk
    qml5 = data.qml_five_year_risk
    agreement = "not comparable"
    if cnn5 is not None and qml5 is not None:
        diff = abs(cnn5 - qml5)
        agreement = (
            "agree closely" if diff < 2
            else "partially agree" if diff < 5
            else "disagree"
        )

    def contrib_lines(contribs):
        if not contribs:
            return "  (not provided)"
        return "\n".join(
            f"  - {c.get('label', 'exam')}: {c.get('percent', 0)}%"
            for c in contribs
        )    

    return f"""You are a clinical decision support assistant explaining an AI longitudinal breast cancer risk projection.
{audience_instruction}

STRICT RULES:
- Do NOT diagnose the patient
- Do NOT recommend specific treatments
- Do NOT estimate, recompute, or invent any numbers — use ONLY the values given below
- Keep your response to 3-4 sentences maximum
- Lead with the classical model 5-year figure and exam contributions
- Reference the Quantum model only as a secondary comparison. State whether the two models {agreement}; 
- End with a reminder to consult a qualified clinician

MODEL CONTEXT:
- Classical CNN 
- Quantum ML 

PATIENT:
  Age: {data.patient_age if data.patient_age is not None else "not provided"}
  Exams analysed: {data.num_exams if data.num_exams is not None else "not provided"}

CLASSICAL MODEL (primary):
  5-year cumulative risk: {round(cnn5, 1) if cnn5 is not None else "not provided"}%
  Year-by-year:
{yearly_lines(data.cnn_yearly_risk)}
  Exam contributions:
{contrib_lines(data.cnn_exam_contributions)}

QUANTUM MODEL (secondary reference):
  5-year cumulative risk: {round(qml5, 1) if qml5 is not None else "not provided"}%
  Year-by-year:
{yearly_lines(data.qml_yearly_risk)}
  Exam contributions :
{contrib_lines(data.qml_exam_contributions)}

The two models {agreement} at the 5-year horizon.

Write the explanation for a {data.audience}, leading with the Classical projection and noting the Quantum comparison."""

@future_risk_router.post("/")
async def explain_future_risk(data: FutureRiskExplainRequest):
    prompt = build_future_risk_prompt(data)

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(MODEL_URL, json={
                "model": MODEL,
                "prompt": prompt,
                "stream": False,
                "think": False,
            })
        result = response.json()
        explanation = result.get("response", "").strip()

    except Exception as e:
        return JSONResponse(
            status_code=503,
            content={"error": f"Model unavailable: {str(e)}", "type": type(e).__name__}
        )

    return JSONResponse(content={
        "explanation": explanation,
        "audience": data.audience,
        "disclaimer": "This explanation is AI-generated and intended solely to interpret model outputs. It must not be used as a substitute for professional clinical assessment.",
    })