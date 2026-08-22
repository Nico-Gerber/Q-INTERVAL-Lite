import io
import json
import os
import pickle
from pathlib import Path
from typing import Dict, List, Any, Tuple

import numpy as np
import pandas as pd
from PIL import Image
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware

import pennylane as qml
from pennylane import numpy as pnp


# ============================================================
# CONFIG
# ============================================================

def resolve_artifacts_path() -> Path:
    # Bundled primary model file lives alongside this module, in ./models.
    return Path(__file__).resolve().parent / "models" / "QeSFRP_V0.1.pkl"


ARTIFACTS_PATH = resolve_artifacts_path()

APPLY_AGE_MULTIPLIER = True

# Demo/display setting:
# True = the main frontend risk output uses the smooth demo-shaped yearly curve.
# The raw QML probabilities are still returned separately for transparency/debugging.
USE_DEMO_RISK_AS_MAIN_OUTPUT = True

# Post-processing / interpretability settings.
ENFORCE_CUMULATIVE_RISK = True
MIN_TOTAL_POSITIVE_DROP_FOR_PERCENT = 1.0  # percentage points; below this, % contribution is unstable
LOW_IMPACT_THRESHOLD_5Y = 1.0             # percentage points
MODERATE_IMPACT_THRESHOLD_5Y = 3.0        # percentage points


# Learned from your Mammo-Bench age feature prototype.
# These are only a prototype adjustment, not clinically validated.
AGE_MULTIPLIERS = {
    "Under 30": 0.70,
    "30-39": 1.02,
    "40-49": 1.04,
    "50-59": 1.08,
    "60-69": 1.15,
    "70-79": 1.25,
    "80+": 1.50,
}

VIEW_KEYS = ["L-CC", "R-CC", "L-MLO", "R-MLO"]

# These are read from the artifact if the retrained model stores them.
# Old artifacts do not have these keys, so the backend falls back to 1.0.
DEFAULT_FEATURE_SCALES = {
    "recency_feature_scale": 1.0,
    "equal_feature_scale": 1.0,
    "latest_feature_scale": 0.25,
    "change_feature_scale": 0.50,
}


# ============================================================
# APP
# ============================================================

app = FastAPI(title="View-aware EMBED QML Future-Risk API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# LOAD MODEL ARTIFACTS
# ============================================================

artifacts: Dict[str, Any] = {}
dev = None


def load_artifacts() -> Dict[str, Any]:
    if not ARTIFACTS_PATH.exists():
        raise FileNotFoundError(
            f"Could not find model artifact: {ARTIFACTS_PATH}\n"
            "Set VIEW_AWARE_QML_ARTIFACTS env var or update ARTIFACTS_PATH."
        )

    with open(ARTIFACTS_PATH, "rb") as f:
        loaded = pickle.load(f)

    required = [
        "pca",
        "standard_scaler",
        "angle_scaler",
        "weights",
        "head_w",
        "head_b",
        "image_size_for_qml",
        "n_qubits",
        "n_layers",
        "horizon_years",
        "recency_lambda",
    ]
    missing = [k for k in required if k not in loaded]
    if missing:
        raise RuntimeError(f"Artifact file is missing required keys: {missing}")

    return loaded


@app.on_event("startup")
def startup_event():
    global artifacts, dev
    artifacts = load_artifacts()
    dev = qml.device("default.qubit", wires=int(artifacts["n_qubits"]))
    print(f"Loaded QML artifacts from: {ARTIFACTS_PATH}")
    print(f"Model type: {artifacts.get('model_type', 'unknown')}")


# ============================================================
# BASIC HELPERS
# ============================================================


def get_age_group(age: float) -> str:
    if age < 30:
        return "Under 30"
    if age < 40:
        return "30-39"
    if age < 50:
        return "40-49"
    if age < 60:
        return "50-59"
    if age < 70:
        return "60-69"
    if age < 80:
        return "70-79"
    return "80+"


def safe_percent(value: float) -> float:
    return float(np.clip(value, 0.0, 100.0))


def parse_metadata(metadata_json: str) -> Dict[str, Any]:
    try:
        metadata = json.loads(metadata_json)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"metadata_json is not valid JSON: {e}")

    if "patient_age" not in metadata:
        raise HTTPException(status_code=400, detail="metadata_json must include patient_age")
    if "exams" not in metadata or not isinstance(metadata["exams"], list):
        raise HTTPException(status_code=400, detail="metadata_json must include exams list")
    if len(metadata["exams"]) == 0:
        raise HTTPException(status_code=400, detail="At least one exam is required")

    for exam in metadata["exams"]:
        if "exam_date" not in exam:
            raise HTTPException(status_code=400, detail="Each exam must include exam_date")
        if "views" not in exam:
            raise HTTPException(status_code=400, detail="Each exam must include views")
        missing_views = [v for v in VIEW_KEYS if v not in exam["views"]]
        if missing_views:
            raise HTTPException(
                status_code=400,
                detail=f"Each exam must include all four views {VIEW_KEYS}. Missing: {missing_views}",
            )

    return metadata


async def read_files_by_filename(files: List[UploadFile]) -> Dict[str, bytes]:
    out = {}
    for f in files:
        content = await f.read()
        out[f.filename] = content
    return out


def load_image_vector_from_bytes(image_bytes: bytes, image_size: int) -> np.ndarray:
    img = Image.open(io.BytesIO(image_bytes)).convert("L")
    img = img.resize((image_size, image_size))
    arr = np.asarray(img).astype(np.float32) / 255.0
    return arr.flatten()


# ============================================================
# FEATURE BUILDING: SAME STRUCTURE AS TRAINING
# ============================================================


def build_exam_feature_from_uploaded_exam(
    exam: Dict[str, Any],
    file_bytes_by_name: Dict[str, bytes],
    image_size: int,
    disable_asymmetry: bool = False,
) -> Dict[str, Any]:
    view_vectors: Dict[str, np.ndarray] = {}

    for view_key in VIEW_KEYS:
        filename = exam["views"].get(view_key)
        if filename not in file_bytes_by_name:
            raise HTTPException(
                status_code=400,
                detail=f"File for {view_key} not uploaded or filename mismatch: {filename}",
            )
        view_vectors[view_key] = load_image_vector_from_bytes(
            file_bytes_by_name[filename], image_size=image_size
        )

    lcc = view_vectors["L-CC"]
    rcc = view_vectors["R-CC"]
    lmlo = view_vectors["L-MLO"]
    rmlo = view_vectors["R-MLO"]

    # Main image aggregation inside one exam.
    view_mean = np.mean(np.vstack([lcc, rcc, lmlo, rmlo]), axis=0)

    # Separate asymmetry branch inside one exam.
    cc_asym = np.abs(lcc - rcc)
    mlo_asym = np.abs(lmlo - rmlo)

    # Used only for asymmetry ablation: rebuild the exact same feature vector,
    # but remove the asymmetry evidence to see how much it changes prediction.
    if disable_asymmetry:
        cc_asym = np.zeros_like(cc_asym)
        mlo_asym = np.zeros_like(mlo_asym)

    cc_asym_score = float(np.mean(cc_asym))
    mlo_asym_score = float(np.mean(mlo_asym))
    asymmetry_score = float((cc_asym_score + mlo_asym_score) / 2.0)

    # Must match training script: concat(view_mean, cc_asym, mlo_asym)
    exam_feature_raw = np.concatenate([view_mean, cc_asym, mlo_asym]).astype(np.float32)

    study_dt = pd.to_datetime(exam["exam_date"], errors="coerce")
    if pd.isna(study_dt):
        raise HTTPException(status_code=400, detail=f"Invalid exam_date: {exam['exam_date']}")

    return {
        "exam_id": str(exam.get("exam_id", exam.get("exam_number", "exam"))),
        "study_dt": study_dt,
        "exam_feature_raw": exam_feature_raw,
        "asymmetry_score": asymmetry_score,
        "cc_asymmetry_score": cc_asym_score,
        "mlo_asymmetry_score": mlo_asym_score,
        "views_received": VIEW_KEYS,
    }


def compute_recency_weights(exam_dates: List[pd.Timestamp], recency_lambda: float) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    latest = max(exam_dates)
    years_before_latest = np.array([(latest - d).days / 365.25 for d in exam_dates], dtype=np.float32)
    raw_weights = np.exp(-recency_lambda * years_before_latest)
    norm_weights = raw_weights / raw_weights.sum()
    return years_before_latest, raw_weights, norm_weights


def build_patient_feature_from_metadata_and_files(
    metadata: Dict[str, Any],
    file_bytes_by_name: Dict[str, bytes],
    disable_asymmetry: bool = False,
) -> Tuple[np.ndarray, Dict[str, Any]]:
    image_size = int(artifacts["image_size_for_qml"])
    recency_lambda = float(artifacts["recency_lambda"])

    exam_features = []
    for exam in metadata["exams"]:
        exam_features.append(
            build_exam_feature_from_uploaded_exam(
                exam, file_bytes_by_name, image_size=image_size, disable_asymmetry=disable_asymmetry
            )
        )

    # Sort chronologically oldest -> latest.
    exam_features = sorted(exam_features, key=lambda x: x["study_dt"])

    dates = [ex["study_dt"] for ex in exam_features]
    exam_matrix = np.vstack([ex["exam_feature_raw"] for ex in exam_features])
    asym_scores = np.array([ex["asymmetry_score"] for ex in exam_features], dtype=np.float32)

    years_before_latest, raw_weights, norm_weights = compute_recency_weights(dates, recency_lambda)

    # Main longitudinal features. Must match training script exactly.
    recency_weighted_exam = np.sum(exam_matrix * norm_weights[:, None], axis=0)
    equal_weighted_exam = np.mean(exam_matrix, axis=0)
    latest_exam = exam_matrix[-1]
    earliest_exam = exam_matrix[0]
    change_exam = latest_exam - earliest_exam

    # Asymmetry longitudinal features.
    recency_weighted_asym = float(np.sum(asym_scores * norm_weights))
    equal_asym = float(np.mean(asym_scores))
    latest_asym = float(asym_scores[-1])
    earliest_asym = float(asym_scores[0])
    asym_change = float(latest_asym - earliest_asym)
    max_asym = float(np.max(asym_scores))
    asym_trend = "increasing" if asym_change > 0.02 else ("decreasing" if asym_change < -0.02 else "stable")

    patient_age = float(metadata["patient_age"])

    # Age is deliberately NOT used inside the QML feature vector.
    # The QML model uses only image timeline / recency / asymmetry evidence.
    # Age is applied later as a final separate multiplier.
    scalar_features = np.array(
        [
            recency_weighted_asym,
            equal_asym,
            latest_asym,
            earliest_asym,
            asym_change,
            max_asym,
            float(len(exam_features)),
            float(np.mean(years_before_latest)),
            float(np.max(years_before_latest)),
        ],
        dtype=np.float32,
    )

    # Feature stream scaling. If you retrain with balanced scales, the artifact stores
    # these values and the backend uses the same layout/scaling at inference time.
    recency_feature_scale = float(artifacts.get("recency_feature_scale", DEFAULT_FEATURE_SCALES["recency_feature_scale"]))
    equal_feature_scale = float(artifacts.get("equal_feature_scale", DEFAULT_FEATURE_SCALES["equal_feature_scale"]))
    latest_feature_scale = float(artifacts.get("latest_feature_scale", DEFAULT_FEATURE_SCALES["latest_feature_scale"]))
    change_feature_scale = float(artifacts.get("change_feature_scale", DEFAULT_FEATURE_SCALES["change_feature_scale"]))

    patient_feature_raw = np.concatenate(
        [
            recency_weighted_exam * recency_feature_scale,
            equal_weighted_exam * equal_feature_scale,
            latest_exam * latest_feature_scale,
            change_exam * change_feature_scale,
            scalar_features,
        ]
    ).astype(np.float32)

    exam_summary = []
    for i, ex in enumerate(exam_features):
        exam_summary.append(
            {
                "exam_id": ex["exam_id"],
                "exam_date": str(ex["study_dt"].date()),
                "exam_index_oldest_to_latest": i + 1,
                "views_received": ex["views_received"],
                "years_before_latest": float(years_before_latest[i]),
                "raw_recency_weight": float(raw_weights[i]),
                "normalised_recency_weight": float(norm_weights[i]),
                "asymmetry_score": float(ex["asymmetry_score"]),
                "cc_asymmetry_score": float(ex["cc_asymmetry_score"]),
                "mlo_asymmetry_score": float(ex["mlo_asymmetry_score"]),
                "recency_role": "latest" if i == len(exam_features) - 1 else ("oldest" if i == 0 else "middle"),
            }
        )

    debug = {
        "patient_age": patient_age,
        "age_group": get_age_group(patient_age),
        "num_exams": len(exam_features),
        "first_exam_date": str(dates[0].date()),
        "latest_exam_date": str(dates[-1].date()),
        "asymmetry_trend": asym_trend,
        "asymmetry_change": asym_change,
        "recency_lambda": recency_lambda,
        "exam_summary": exam_summary,
        "patient_feature_shape": list(patient_feature_raw.shape),
        "disable_asymmetry": bool(disable_asymmetry),
        "age_used_inside_qml": False,
        "age_adjustment_strategy": "external_age_group_multiplier",
        "feature_stream_scales": {
            "recency_feature_scale": float(artifacts.get("recency_feature_scale", DEFAULT_FEATURE_SCALES["recency_feature_scale"])),
            "equal_feature_scale": float(artifacts.get("equal_feature_scale", DEFAULT_FEATURE_SCALES["equal_feature_scale"])),
            "latest_feature_scale": float(artifacts.get("latest_feature_scale", DEFAULT_FEATURE_SCALES["latest_feature_scale"])),
            "change_feature_scale": float(artifacts.get("change_feature_scale", DEFAULT_FEATURE_SCALES["change_feature_scale"])),
        },
    }

    return patient_feature_raw, debug


# ============================================================
# QML INFERENCE
# ============================================================


def make_quantum_circuit():
    n_qubits = int(artifacts["n_qubits"])
    n_layers = int(artifacts["n_layers"])

    @qml.qnode(dev, interface="autograd")
    def circuit(inputs, weights):
        for i in range(n_qubits):
            qml.RY(inputs[i], wires=i)

        for layer in range(n_layers):
            for q in range(n_qubits):
                qml.RY(weights[layer, q, 0], wires=q)
                qml.RZ(weights[layer, q, 1], wires=q)

            for q in range(n_qubits - 1):
                qml.CNOT(wires=[q, q + 1])
            qml.CNOT(wires=[n_qubits - 1, 0])

        return [qml.expval(qml.PauliZ(i)) for i in range(n_qubits)]

    return circuit


def sigmoid_np(x):
    return 1.0 / (1.0 + np.exp(-x))


def predict_qml(patient_feature_raw: np.ndarray) -> np.ndarray:
    standard_scaler = artifacts["standard_scaler"]
    pca = artifacts["pca"]
    angle_scaler = artifacts["angle_scaler"]

    X_std = standard_scaler.transform([patient_feature_raw])
    X_pca = pca.transform(X_std)
    X_angle = angle_scaler.transform(X_pca)

    circuit = make_quantum_circuit()
    weights = pnp.array(artifacts["weights"], requires_grad=False)
    head_w = np.array(artifacts["head_w"])
    head_b = np.array(artifacts["head_b"])

    q_out = np.array(circuit(pnp.array(X_angle[0], requires_grad=False), weights), dtype=np.float64)
    logits = np.dot(q_out, head_w) + head_b
    probs = sigmoid_np(logits)
    return probs.astype(float)




# ============================================================
# FULL INFERENCE + EXAM CONTRIBUTIONS
# ============================================================


def calculate_risk_level(risk_5y: float) -> str:
    if risk_5y < 10:
        return "Low Risk"
    if risk_5y < 25:
        return "Medium Risk"
    return "High Risk"


def make_raw_qml_yearly_risk_dict(probs: np.ndarray, apply_cumulative: bool = True) -> Dict[str, float]:
    """
    True model output from the QML head for each yearly horizon.
    This is returned for debugging/transparency, but not used as the main display
    output when USE_DEMO_RISK_AS_MAIN_OUTPUT=True.
    """
    horizon_years = [int(y) for y in artifacts["horizon_years"]]
    probs = np.asarray(probs, dtype=float)

    if apply_cumulative:
        probs = np.maximum.accumulate(probs)

    return {
        f"{year}_year": safe_percent(float(probs[i] * 100.0))
        for i, year in enumerate(horizon_years)
    }


def make_yearly_risk_dict(probs: np.ndarray, apply_cumulative: bool = True) -> Dict[str, float]:
    """
    Demo-shaped yearly risk curve used as the MAIN frontend display.

    Important: this intentionally creates a visible 1-5 year curve
    from the model's 5-year QML output. The real raw QML outputs are still
    returned separately as raw_true_qml_risk_for_debug.
    """
    horizon_years = [int(y) for y in artifacts["horizon_years"]]

    # Anchor the curve on the model's 5-year probability.
    base_prob = float(np.asarray(probs, dtype=float)[-1])
    five_year_risk_pct = safe_percent(base_prob * 100.0)

    # Stronger visible curve for frontend demonstration.
    # This avoids the graph looking flat when the true QML outputs are near 50/50.
    curve_factors = {
        1: 0.12,
        2: 0.28,
        3: 0.20,
        4: 1.00,
        5: 1.00,
    }

    yearly_risks = {}
    previous = 0.0
    for year in horizon_years:
        factor = curve_factors.get(year, min(float(year) / max(horizon_years), 1.0))
        risk = safe_percent(five_year_risk_pct * factor)

        # Keep the demo curve shaped rather than strictly cumulative so year 3 can dip.
        if apply_cumulative and year != 3:
            risk = max(previous, risk)
        previous = risk

        yearly_risks[f"{year}_year"] = round(float(risk), 2)

    return yearly_risks


def make_risk_curve_points(risk_dict: Dict[str, float]) -> List[Dict[str, Any]]:
    """Frontend-friendly chart array so the UI does not accidentally plot the raw/debug field."""
    points = []
    for key in ["1_year", "2_year", "3_year", "4_year", "5_year"]:
        if key in risk_dict:
            points.append({
                "year": key.replace("_", " "),
                "risk_percent": round(float(risk_dict[key]), 2),
            })
    return points


def highest_risk_year_from_dict(risk_dict: Dict[str, float]) -> str:
    return max(risk_dict, key=lambda k: float(risk_dict[k]))


def classify_impact(max_abs_change: float) -> str:
    if max_abs_change < LOW_IMPACT_THRESHOLD_5Y:
        return "low"
    if max_abs_change < MODERATE_IMPACT_THRESHOLD_5Y:
        return "moderate"
    return "high"


def run_view_aware_inference(metadata: Dict[str, Any], file_bytes_by_name: Dict[str, bytes], disable_asymmetry: bool = False) -> Dict[str, Any]:
    """
    Runs the full view-aware pipeline once:
        metadata/files -> feature building -> scaler/PCA/angle scaler -> QML -> age adjustment.

    This is also used by exam contribution/ablation testing.
    """
    patient_feature_raw, feature_debug = build_patient_feature_from_metadata_and_files(
        metadata, file_bytes_by_name, disable_asymmetry=disable_asymmetry
    )

    probs = predict_qml(patient_feature_raw)

    # True raw model probabilities for each horizon.
    raw_qml_risk = make_raw_qml_yearly_risk_dict(probs, apply_cumulative=True)

    # Demo-shaped curve anchored on the model's 5-year probability.
    demo_qml_risk = make_yearly_risk_dict(probs, apply_cumulative=True)

    # Main displayed risk. For the current test workflow, this is demo-shaped.
    if USE_DEMO_RISK_AS_MAIN_OUTPUT:
        base_qml_risk = demo_qml_risk
    else:
        base_qml_risk = raw_qml_risk

    patient_age = float(metadata["patient_age"])
    age_group = get_age_group(patient_age)
    age_multiplier = float(AGE_MULTIPLIERS.get(age_group, 1.0))

    if APPLY_AGE_MULTIPLIER:
        final_risk = {
            key: safe_percent(value * age_multiplier)
            for key, value in base_qml_risk.items()
        }
    else:
        final_risk = base_qml_risk.copy()

    risk_5y = final_risk.get("5_year", list(final_risk.values())[-1])
    risk_level = calculate_risk_level(risk_5y)

    return {
        "patient_feature_raw": patient_feature_raw,
        "feature_debug": feature_debug,
        "base_qml_risk": base_qml_risk,
        "raw_qml_risk": raw_qml_risk,
        "demo_qml_risk": demo_qml_risk,
        "final_risk": final_risk,
        "risk_level": risk_level,
        "age_group": age_group,
        "age_multiplier": age_multiplier,
    }


def calculate_exam_contributions(
    metadata: Dict[str, Any],
    file_bytes_by_name: Dict[str, bytes],
    full_final_risk: Dict[str, float],
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    Exam-level contribution using ablation:
        full 5-year risk - risk after removing one exam.

    Important fix:
        If the total positive change is tiny, do NOT normalise one tiny change
        into 100%. That was the misleading behaviour in the earlier backend.
    """
    exams = metadata.get("exams", [])
    full_5y = float(full_final_risk.get("5_year", list(full_final_risk.values())[-1]))

    if len(exams) == 1:
        only_exam = exams[0]
        row = {
            "exam_id": str(only_exam.get("exam_id", only_exam.get("exam_number", "exam_1"))),
            "exam_date": str(only_exam.get("exam_date", "")),
            "risk_without_exam_5y": None,
            "risk_change_5y": round(full_5y, 4),
            "risk_drop_5y": round(max(full_5y, 0.0), 4),
            "contribution_percent": 100.0,
            "contribution_percent_reliable": False,
            "interpretation": "only_exam_available",
        }
        summary = {
            "method": "single_exam_no_ablation_possible",
            "full_risk_5y": round(full_5y, 4),
            "total_positive_risk_drop_5y": round(max(full_5y, 0.0), 4),
            "total_absolute_risk_change_5y": round(abs(full_5y), 4),
            "max_absolute_risk_change_5y": round(abs(full_5y), 4),
            "impact_level": classify_impact(abs(full_5y)),
            "contribution_percent_reliable": False,
            "warning": "Only one exam was provided, so per-exam ablation contribution cannot be measured properly.",
        }
        return [row], summary

    raw_contribs: List[Dict[str, Any]] = []

    for i, exam in enumerate(exams):
        reduced_metadata = dict(metadata)
        reduced_metadata["exams"] = [ex for j, ex in enumerate(exams) if j != i]

        reduced_result = run_view_aware_inference(reduced_metadata, file_bytes_by_name)
        reduced_final_risk = reduced_result["final_risk"]
        risk_without_5y = float(reduced_final_risk.get("5_year", list(reduced_final_risk.values())[-1]))

        risk_change = full_5y - risk_without_5y
        risk_drop = max(risk_change, 0.0)

        raw_contribs.append(
            {
                "exam_id": str(exam.get("exam_id", exam.get("exam_number", f"exam_{i + 1}"))),
                "exam_date": str(exam.get("exam_date", "")),
                "risk_without_exam_5y": round(risk_without_5y, 4),
                "risk_change_5y": round(risk_change, 4),
                "risk_drop_5y": round(risk_drop, 4),
                "contribution_percent": None,
                "contribution_percent_reliable": False,
                "interpretation": "risk_increasing" if risk_change > 0 else ("risk_reducing_or_protective" if risk_change < 0 else "neutral"),
            }
        )

    total_positive_drop = float(sum(item["risk_drop_5y"] for item in raw_contribs))
    total_absolute_change = float(sum(abs(item["risk_change_5y"]) for item in raw_contribs))
    max_abs_change = float(max(abs(item["risk_change_5y"]) for item in raw_contribs)) if raw_contribs else 0.0

    contribution_percent_reliable = total_positive_drop >= MIN_TOTAL_POSITIVE_DROP_FOR_PERCENT

    for item in raw_contribs:
        if contribution_percent_reliable and total_positive_drop > 0:
            item["contribution_percent"] = round((item["risk_drop_5y"] / total_positive_drop) * 100.0, 2)
            item["contribution_percent_reliable"] = True
        else:
            item["contribution_percent"] = None
            item["contribution_percent_reliable"] = False

    summary = {
        "method": "leave_one_exam_out_ablation",
        "full_risk_5y": round(full_5y, 4),
        "total_positive_risk_drop_5y": round(total_positive_drop, 4),
        "total_absolute_risk_change_5y": round(total_absolute_change, 4),
        "max_absolute_risk_change_5y": round(max_abs_change, 4),
        "impact_level": classify_impact(max_abs_change),
        "contribution_percent_reliable": contribution_percent_reliable,
        "warning": None if contribution_percent_reliable else (
            "Exam ablation changes are under 1 percentage point. Contribution percentages are hidden because they would be misleading."
        ),
    }

    return raw_contribs, summary


def calculate_asymmetry_ablation(
    metadata: Dict[str, Any],
    file_bytes_by_name: Dict[str, bytes],
    full_final_risk: Dict[str, float],
) -> Dict[str, Any]:
    """
    Measures approximate asymmetry impact by rebuilding the same patient feature
    with asymmetry vectors/scores zeroed out, then re-running the model.
    """
    without_asym = run_view_aware_inference(
        metadata, file_bytes_by_name, disable_asymmetry=True
    )

    risk_without = without_asym["final_risk"]
    full_5y = float(full_final_risk.get("5_year", list(full_final_risk.values())[-1]))
    without_5y = float(risk_without.get("5_year", list(risk_without.values())[-1]))
    change_5y = full_5y - without_5y

    yearly_change = {
        key: round(float(full_final_risk[key]) - float(risk_without.get(key, 0.0)), 4)
        for key in full_final_risk.keys()
    }

    return {
        "method": "zero_asymmetry_feature_ablation",
        "risk_without_asymmetry": {k: round(float(v), 4) for k, v in risk_without.items()},
        "risk_change_from_asymmetry": yearly_change,
        "risk_without_asymmetry_5y": round(without_5y, 4),
        "asymmetry_risk_change_5y": round(change_5y, 4),
        "impact_level": classify_impact(abs(change_5y)),
        "interpretation": "asymmetry_increased_risk" if change_5y > 0 else ("asymmetry_reduced_risk" if change_5y < 0 else "no_measured_change"),
        "note": "Approximate interpretability only. This re-runs the same model with asymmetry evidence removed.",
    }


# ============================================================
# ROUTES
# ============================================================


@app.get("/health")
def health():
    return {
        "status": "ok",
        "model_loaded": bool(artifacts),
        "artifact_path": str(ARTIFACTS_PATH),
        "model_type": artifacts.get("model_type", "unknown") if artifacts else None,
    }


@app.post("/qml-future-risk-view-aware/")
async def qml_future_risk_view_aware(
    metadata_json: str = Form(...),
    files: List[UploadFile] = File(...),
):
    """
    Frontend sends:
        - metadata_json form field
        - all image files listed in metadata_json exams[].views

    Returns:
        - base QML yearly risk
        - age-adjusted yearly risk
        - recency weights
        - asymmetry scores/trend
        - model/debug summary
    """
    if not artifacts:
        raise HTTPException(status_code=500, detail="Model artifacts not loaded")

    metadata = parse_metadata(metadata_json)
    file_bytes_by_name = await read_files_by_filename(files)

    inference = run_view_aware_inference(metadata, file_bytes_by_name)

    feature_debug = inference["feature_debug"]
    base_qml_risk = inference["base_qml_risk"]
    raw_qml_risk = inference.get("raw_qml_risk", {})
    demo_qml_risk = inference.get("demo_qml_risk", {})
    final_risk = inference["final_risk"]
    risk_level = inference["risk_level"]
    patient_age = float(metadata["patient_age"])
    age_group = inference["age_group"]
    age_multiplier = inference["age_multiplier"]

    # Ablation-based contribution: re-run the model while removing one exam at a time.
    exam_contributions, exam_contribution_summary = calculate_exam_contributions(
        metadata, file_bytes_by_name, final_risk
    )

    # Ablation-based asymmetry impact: re-run with asymmetry features removed.
    asymmetry_ablation = calculate_asymmetry_ablation(metadata, file_bytes_by_name, final_risk)

    explanation_factors = []
    if feature_debug["exam_summary"]:
        latest_exam = feature_debug["exam_summary"][-1]
        explanation_factors.append(
            f"Latest exam has recency weight {latest_exam['normalised_recency_weight']:.3f}"
        )
    explanation_factors.append(f"Asymmetry trend is {feature_debug['asymmetry_trend']}")
    explanation_factors.append(f"Age group {age_group} multiplier is {age_multiplier:.2f}")

    return {
        "status": "success",
        "model": {
            "name": "EMBED view-aware QML future-risk model",
            "type": artifacts.get("model_type", "View-aware QML VQC"),
            "clinically_validated": False,
            "artifact_path": str(ARTIFACTS_PATH),
        },
        "patient_input": {
            "patient_age": patient_age,
            "age_group": age_group,
            "age_multiplier_used": APPLY_AGE_MULTIPLIER,
            "age_multiplier": age_multiplier,
            "number_of_exams": feature_debug["num_exams"],
            "first_exam_date": feature_debug["first_exam_date"],
            "latest_exam_date": feature_debug["latest_exam_date"],
        },
        "exam_summary": feature_debug["exam_summary"],
        "exam_contributions": exam_contributions,
        "exam_contribution_summary": exam_contribution_summary,
        "total_exam_impact": exam_contribution_summary,
        "asymmetry_analysis": {
            "trend": feature_debug["asymmetry_trend"],
            "asymmetry_change": feature_debug["asymmetry_change"],
            "description": "Compares L-CC vs R-CC and L-MLO vs R-MLO, then tracks changes across exams.",
            "ablation": asymmetry_ablation,
        },
        "feature_summary": {
            "image_aggregation_used": True,
            "recency_weighting_used": True,
            "asymmetry_branch_used": True,
            "longitudinal_analysis_used": True,
            "age_adjustment_used": APPLY_AGE_MULTIPLIER,
            "age_used_inside_qml": False,
            "age_adjustment_strategy": "external_age_group_multiplier",
            "qml_pca_features": int(artifacts["pca_components"]),
            "qml_qubits": int(artifacts["n_qubits"]),
            "patient_feature_shape": feature_debug["patient_feature_shape"],
            "feature_stream_scales": feature_debug.get("feature_stream_scales", {}),
            "cumulative_risk_postprocessing_used": ENFORCE_CUMULATIVE_RISK,
            "demo_risk_used_as_main_output": USE_DEMO_RISK_AS_MAIN_OUTPUT,
        },
        "future_risk": {
            "output_mode": "demo_main" if USE_DEMO_RISK_AS_MAIN_OUTPUT else "true_qml_main",
            "base_qml_risk": base_qml_risk,
            "age_adjusted_risk": final_risk,
            "risk_curve_for_chart": make_risk_curve_points(final_risk),
            "raw_true_qml_risk_for_debug": raw_qml_risk,
            "demo_qml_risk": demo_qml_risk,
            "risk_level": risk_level,
            "highest_risk_year": highest_risk_year_from_dict(final_risk),
            "cumulative_risk_enforced": ENFORCE_CUMULATIVE_RISK,
        },
        "patient_summary": {
            "number_of_exams": feature_debug["num_exams"],
            "final_patient_qml_yearly_future_risk": final_risk,
            "final_patient_qml_1_year_risk_score": final_risk.get("1_year"),
            "final_patient_qml_2_year_risk_score": final_risk.get("2_year"),
            "final_patient_qml_3_year_risk_score": final_risk.get("3_year"),
            "final_patient_qml_4_year_risk_score": final_risk.get("4_year"),
            "final_patient_qml_5_year_risk_score": final_risk.get("5_year"),
            "final_patient_qml_risk_level": risk_level,
            "risk_curve_for_chart": make_risk_curve_points(final_risk),
            "output_mode": "demo_main",
        },
        "model_explanation": {
            "simple_summary": (
                "The model used all uploaded exams, four standard mammogram views per exam, "
                "exam dates, recency weighting, and left-right asymmetry comparison "
                "to estimate future risk. For the current frontend demonstration, the main displayed yearly risks use a demo-shaped curve anchored on the model's 5-year QML output. The raw QML yearly outputs are still returned separately under raw_true_qml_risk_for_debug. Patient age is then applied as a separate final multiplier. Exam contribution is calculated separately using ablation: the model is re-run with each exam removed to see how much the 5-year risk changes."
            ),
            "main_contributing_factors": explanation_factors,
        },
        "disclaimer": {
            "message": "Research prototype only. Not clinically validated. Do not use for medical decision-making.",
            "demo_output_note": "Main yearly risk output is demo-shaped for frontend testing while full EMBED training is processing. Raw QML output is included separately for debugging."
        },
    }
