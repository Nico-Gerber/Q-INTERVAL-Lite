import httpx
import os
import base64

from pathlib import Path
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional


OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

VLM = "dots-studio/dots-3-note-preview:free"


DEBUG_VLM_DIR = Path("debug_vlm")
DEBUG_VLM_DIR.mkdir(exist_ok=True)


def save_debug_b64_image(b64_string: str, filename: str):
    if not b64_string:
        print(f"DEBUG: no image data for {filename}")
        return

    if "," in b64_string:
        b64_string = b64_string.split(",", 1)[1]

    path = DEBUG_VLM_DIR / filename

    with open(path, "wb") as f:
        f.write(base64.b64decode(b64_string))

    print("DEBUG saved:", path.resolve())


def as_data_uri(image_b64: str) -> str:
    if image_b64.startswith("data:image"):
        return image_b64

    return f"data:image/png;base64,{image_b64}"


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


QUANTUM MODEL:
  5-year cumulative risk: {round(qml5, 1) if qml5 is not None else "not provided"}%
  Year-by-year:
{yearly_lines(data.qml_yearly_risk)}


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



class VLMCompareRequest(BaseModel):
    base_image: str         
    classical_heatmap: str   
    classical_verdict: str
    quantum_heatmap: str   
    quantum_verdict: str  
    view: str            
    audience: str            



def build_view_prompt(data: VLMCompareRequest) -> str:
    audience_instruction = (
        "Write for a general practitioner using concise, precise clinical language. "
        "Avoid explaining basic medical concepts unless needed for clarity."
        if data.audience == "clinician"
        else
        "Write for a patient using clear, neutral, non-alarming language. "
        "Avoid unnecessary technical terminology and do not imply that an AI prediction is a diagnosis."
    )

    return f"""
You are a medical imaging model-interpretability assistant.

You are analysing ONE mammographic view only.

You will receive exactly three images in this exact order:

IMAGE 1 = the original mammogram for view {data.view}.
IMAGE 2 = the Classical model occlusion-sensitivity heatmap for the SAME view.
IMAGE 3 = the Quantum model occlusion-sensitivity heatmap for the SAME view.

All three images refer to the same mammographic view and the same breast.

Classical model prediction: {data.classical_verdict}
Quantum model prediction: {data.quantum_verdict}

The heatmaps are occlusion-sensitivity maps. A highlighted area indicates that
occluding information in that image region affected the corresponding model's
output.

A highlighted region represents model sensitivity or influence only.
It does NOT prove that the highlighted region contains cancer, benign disease,
normal tissue, or any other pathology.

IMPORTANT IMAGE-IDENTITY RULES:

IMAGE 2 is ALWAYS the Classical model heatmap.
IMAGE 3 is ALWAYS the Quantum model heatmap.

Never swap IMAGE 2 and IMAGE 3.

Never assign the Quantum model prediction to the Classical heatmap.
Never assign the Classical model prediction to the Quantum heatmap.

The Classical prediction is exactly:
{data.classical_verdict}

The Quantum prediction is exactly:
{data.quantum_verdict}

Do not infer either prediction from the appearance of a heatmap.
Use the supplied prediction labels exactly as given.

Before writing the final explanation, internally compare IMAGE 2 and IMAGE 3
directly and determine:

- where the strongest Classical heatmap regions are located,
- where the strongest Quantum heatmap regions are located,
- whether the strongest regions overlap,
- whether they are only partially overlapping,
- or whether they are clearly different.

Do not state that the two models focus on the same region unless their strongest
highlighted regions visibly overlap.

If their strongest highlighted regions are spatially different, explicitly say
that the models focus on different regions.

LATERALITY AND IMAGE-ORIENTATION RULES:

The supplied view label determines which breast is shown.

L-CC and L-MLO ALWAYS represent the LEFT breast.
R-CC and R-MLO ALWAYS represent the RIGHT breast.

For this request, the supplied view is {data.view}.

Never infer breast laterality from where the breast appears within the image.
Never change the laterality specified by the view label.

The words "left" and "right" can refer to two different things:
1. anatomical breast laterality, determined ONLY by the view label;
2. left/right position within the displayed image.

When describing a heatmap location, explicitly say:
"left side of the displayed image"
or
"right side of the displayed image".

Do NOT say "left breast" or "right breast" when describing heatmap position.

For example:
"The strongest sensitivity is in the upper-left portion of the displayed image."

Do NOT convert this into:
"The strongest sensitivity is in the left breast."

SPATIAL DESCRIPTION RULES:

Prefer conservative image-relative descriptions such as:

- left side of the displayed image
- right side of the displayed image
- central region
- upper portion of the displayed image
- lower portion of the displayed image
- near the edge of the displayed image
- near the chest-wall side
- near the anterior portion of the breast

Do not invent anatomical localisation.

For CC views, do not assign a highlighted region to an upper or lower breast
quadrant unless that anatomical location can be established confidently from
the supplied image.

Do not use terms such as:
"upper outer quadrant",
"upper inner quadrant",
"lower outer quadrant",
or "lower inner quadrant"
unless the anatomical orientation is genuinely unambiguous.

If anatomical orientation is uncertain, use image-relative descriptions instead.

VISIBLE-MAMMOGRAM RULES:

Describe only features that are reasonably visible in IMAGE 1.

Do not independently diagnose the patient.

Do not call an area:
"suspicious",
"malignant",
"benign",
"cancerous",
"concerning",
or "abnormal"
unless that description was explicitly supplied as ground truth.

Do not claim that a visible area corresponds to disease solely because a heatmap
highlights it.

If no specific visible abnormal feature can be confidently described, say so
briefly and neutrally.

HEATMAP INTERPRETATION RULES:

Describe the heatmaps as indicators of model sensitivity.

Do not say:
"this area caused the malignant prediction",
"this region supports the benign classification",
"this area is malignant",
or similar wording that makes the heatmap sound diagnostic.

Instead use wording such as:

"The Classical model shows strongest sensitivity in..."
"The Quantum model shows strongest sensitivity in..."
"This region influenced the Classical model's output..."
"The Classical model predicted Malignant, while the Quantum model predicted Benign."

Keep the heatmap location and the model prediction as separate concepts.

COMPARISON RULES:

Explicitly compare the two heatmaps.

Use one of these types of conclusions when appropriate:

- the highlighted regions substantially overlap
- the highlighted regions partially overlap
- the strongest highlighted regions are different

Do not force agreement between the models.

Do not assume that similar predictions mean similar heatmaps.

Do not assume that different predictions mean different heatmaps.

Base the heatmap comparison only on what is visible in IMAGE 2 and IMAGE 3.

Do not speculate that differences are caused by model architecture, training data,
feature extraction, or quantum/classical methodology unless that information is
explicitly provided.

OUTPUT FORMAT:

Return one coherent paragraph only.

Do not use headings.
Do not use bullet points.
Do not use numbered lists.
Do not use Markdown.
Do not use asterisks.
Do not use tables.
Do not use code formatting.

Write naturally and avoid repetitive phrasing.

Keep the explanation between 90 and 130 words, excluding the final disclaimer.

The paragraph should naturally include:
- a brief description of what can be visibly observed in the original mammogram,
- the main Classical heatmap location,
- the main Quantum heatmap location,
- whether the two heatmaps overlap or differ,
- and the supplied model predictions.

{audience_instruction}

End with exactly this sentence:

This explanation is generated for research and decision-support purposes and should not replace assessment by a qualified healthcare professional.
"""



        
    


@router.post("/explain_view")
async def explainview(data: VLMCompareRequest):

    prompt = build_view_prompt(data)

    if not OPENROUTER_API_KEY:
        return JSONResponse(
            status_code=500,
            content={
                "error": "OPENROUTER_API_KEY is not configured"
            }
        )

    print("\n===== OPENROUTER VLM DEBUG =====")
    print("View:", data.view)
    print("Classical:", data.classical_verdict)
    print("Quantum:", data.quantum_verdict)

    # Keep your debug image saving for now
    save_debug_b64_image(
        data.base_image,
        f"{data.view}_01_original.png"
    )

    save_debug_b64_image(
        data.classical_heatmap,
        f"{data.view}_02_classical.png"
    )

    save_debug_b64_image(
        data.quantum_heatmap,
        f"{data.view}_03_quantum.png"
    )

    payload = {
        "model": VLM,

        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": prompt
                    },

                    {
                        "type": "image_url",
                        "image_url": {
                            "url": as_data_uri(
                                data.base_image
                            )
                        }
                    },

                    {
                        "type": "image_url",
                        "image_url": {
                            "url": as_data_uri(
                                data.classical_heatmap
                            )
                        }
                    },

                    {
                        "type": "image_url",
                        "image_url": {
                            "url": as_data_uri(
                                data.quantum_heatmap
                            )
                        }
                    }
                ]
            }
        ],

        "temperature": 0.2,
        "max_tokens": 10000
    }

    try:
        async with httpx.AsyncClient(
            timeout=320.0
        ) as client:

            response = await client.post(
                OPENROUTER_URL,

                headers={
                    "Authorization":
                        f"Bearer {OPENROUTER_API_KEY}",

                    "Content-Type":
                        "application/json",

                    # Optional
                    "X-OpenRouter-Title":
                        "Q-Interval-Lite"
                },

                json=payload
            )

        # Very useful while testing
        if not response.is_success:
            print(
                "OpenRouter error:",
                response.status_code,
                response.text
            )

            return JSONResponse(
                status_code=response.status_code,
                content={
                    "error":
                        f"OpenRouter request failed: "
                        f"{response.text}"
                }
            )

        result = response.json()

        print("FULL OPENROUTER RESPONSE:")
        print(result)

        content = (
            result
            .get("choices", [{}])[0]
            .get("message", {})
            .get("content")
        )

        explanation = content.strip() if isinstance(content, str) else ""

        print(
            "OpenRouter model used:",
            result.get("model")
        )

        print(
            "VLM explanation:",
            explanation
        )

    except Exception as e:
        return JSONResponse(
            status_code=503,
            content={
                "error":
                    f"OpenRouter unavailable: {str(e)}",

                "type":
                    type(e).__name__
            }
        )

    return JSONResponse(
        content={
            "explanation": explanation,
            "audience": data.audience,

            # Helpful during testing.
            "model": result.get("model")
        }
    )
    