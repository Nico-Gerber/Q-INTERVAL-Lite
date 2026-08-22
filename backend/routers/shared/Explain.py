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
    qml_composite_risk_score: Optional[float] = None
    qml_composite_risk_level: Optional[str] = None
    qml_highest_density: Optional[float] = None
    qml_highest_birads:  Optional[float] = None

# ── Prompt builder ─────────────────────────────────────────────────────────────
def build_prompt(data: ExplainRequest) -> str:

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

    # ── Composite future-risk: shown AFTER the views, classical vs quantum ──
    def composite_line(label, score, level):
        if score is None:
            return f"  - {label}: NOT APPLICABLE (withheld — a malignant finding was detected)"
        return f"  - {label}: {score}/100 ({level})"

    cnn_comp = data.composite_risk_score
    qml_comp = data.qml_composite_risk_score

    composite_section = (
        "\nCOMPOSITE FUTURE-RISK SCORE (background context only — a future-risk index, "
        "NOT a malignancy result):\n"
        + composite_line("Classical", cnn_comp, data.composite_risk_level) + "\n"
        + composite_line("Quantum", qml_comp, data.qml_composite_risk_level)
    )

    if cnn_comp is not None and qml_comp is not None:
        diff = abs(cnn_comp - qml_comp)
        comp_agreement = (
            "agree closely" if diff < 10
            else "partially agree" if diff < 25
            else "disagree"
        )
        composite_section += f"\n  The two models {comp_agreement} on the composite risk score."
    elif cnn_comp is None and qml_comp is None:
        composite_section += (
            "\n  Both composite scores are withheld because a malignant finding was detected; "
            "do NOT state or compare any risk numbers."
        )

    audience_instruction = (
        "You are explaining results to a General Practitioner. "
        "Use precise clinical language. Be concise and action-oriented."
        if data.audience == "clinician"
        else
        "You are explaining results to a patient in plain, supportive language. "
        "Keep explanations simple and avoid technical jargon. Be honest and clear about "
        "any concerning findings — do not downplay results or over-reassure."
    )

    strict_audience_rule = (
        ""
        if data.audience == "clinician"
        else
        "- CRITICAL: You are speaking to a PATIENT. NEVER use view names such as "
        "'craniocaudal', 'mediolateral oblique', 'L-CC', 'R-CC', 'L-MLO', 'R-MLO', "
        "or any imaging plane terminology. You MUST refer only to 'the left breast' or "
        "'the right breast'. Violating this rule makes the response unusable."
    )

    return f"""You are a clinical decision support assistant explaining AI mammogram analysis results.
{audience_instruction}

STRICT RULES:
{strict_audience_rule}

- Do NOT diagnose the patient
- Do NOT recommend specific treatments
- Do NOT go beyond what the results show
- Keep your response to 4-5 sentences maximum
- Centre your explanation on the INDIVIDUAL per-view classifications. Describe what the relevant views show and call out any left-vs-right (L / R) asymmetry or disagreement between views.
- Determine malignancy from the per-view CLASSIFICATION results. If any single view is classified Malignant, treat the case as having a malignant finding.
- Lead with the classical per-view findings, then the quantum per-view findings, stating whether the two models agree on the CLASSIFICATION.
- AFTER the per-view findings, add one short sentence comparing the Classical and Quantum composite future-risk scores. If a score is NOT APPLICABLE, say future-risk scoring was withheld rather than giving a number. Keep this as background context — never make risk the main point.
- End with a reminder to consult a qualified clinician.




MODEL CONTEXT:
- Classical CNN (ResNet50):
- Quantum ML (VQC):

- Describe what the model CLASSIFIED each view as. Do NOT assert that lesions, masses, or abnormalities are actually present — the model outputs classifications, not findings.
- Asymmetry between left and right is expected and is not a contradiction. Only flag disagreement when two views of the SAME breast diverge, or when confidence is low (e.g. a "Malignant" label below ~50%).
- The patient malignant score and the Quantum "% malignant" are the models' CONFIDENCE in a malignant classification — they are NOT a cancer-risk percentage. Never call either a "risk" or an "overall risk", and never present them as a risk figure.
- Only the composite future-risk score represents risk. If it is not provided or marked NOT APPLICABLE, do NOT state, imply, or invent any overall risk level or percentage.
- When commenting on agreement, refer to classification and composite risk SEPARATELY — do not merge them into one "agree/disagree".
- If any view is classified Malignant, clearly state that a malignant classification was reached on that view and recommend timely clinical review. Do NOT describe it as merely "suspicious", and do NOT reassure that the overall result is fine.

CLASSICAL CNN — PER-VIEW CLASSIFICATIONS:
{view_summary}

QUANTUM ML — PER-VIEW:
{qml_view_summary}
{composite_section}

Write the explanation for a {data.audience}: lead with the per-view classical findings, then the quantum per-view findings, then briefly compare the composite future-risk scores."""

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

CLASSICAL MODEL:
  5-year cumulative risk: {round(cnn5, 1) if cnn5 is not None else "not provided"}%
  Year-by-year:
{yearly_lines(data.cnn_yearly_risk)}
  Exam contributions:
{contrib_lines(data.cnn_exam_contributions)}

QUANTUM MODEL:
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