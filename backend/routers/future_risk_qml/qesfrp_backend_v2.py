"""
qesfrp_backend_v2.py -- QeSFRP inference API for the retrained model.

Same endpoint, same request format, same response shape as the previous
backend, so the frontend does not need to change. What is different inside:

  * loads artifacts.pkl from 03_train_quantum.py (hazard head, not 5 sigmoids)
  * features come from the radiomic descriptor pipeline, not raw-pixel PCA
  * cumulative risk is monotone by construction, so no post-hoc enforcement
  * the demo-shaped curve is gone (see DEMO CURVE below)

Age multipliers follow the architecture document: each yearly risk is
multiplied by the patient's age-group weight to give the final yearly risk.

    Final N year risk = N year risk * age_group weight

DEMO CURVE
----------
The old backend had USE_DEMO_RISK_AS_MAIN_OUTPUT = True, which returned a
hand-shaped curve anchored on the model's 5-year output as the main displayed
risk. That existed because the model was not trained yet. It is now, so this
version returns real model output only. Shipping a fabricated curve through a
field called `qml_yearly_future_risk` on a breast-cancer risk tool is not
something to leave switched on by accident.

RUNNING
-------
    pip install fastapi uvicorn pennylane torch scikit-learn scikit-image \
                scipy pillow pandas numpy
    uvicorn qesfrp_backend_v2:app --host 0.0.0.0 --port 8000

Single file. The only thing beside it is the weights:

    qesfrp_backend_v2.py
    models/QeSFRP_V0.2.pkl     (artifacts.pkl from training, renamed)
"""

import io
import json
import os
import pickle
import warnings
from pathlib import Path
from typing import Any, Dict, List, Tuple

import numpy as np
import pandas as pd
from PIL import Image
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

import torch

warnings.filterwarnings("ignore")


# ============================================================
# CONFIG
# ============================================================

HERE = Path(__file__).resolve().parent

ARTIFACTS_PATH = Path(os.environ.get(
    "QESFRP_ARTIFACTS", HERE / "models" / "QeSFRP_V0.2.pkl"))

APPLY_AGE_MULTIPLIER = True

# Interpretability thresholds (percentage points on the 5-year risk).
MIN_TOTAL_POSITIVE_DROP_FOR_PERCENT = 1.0
LOW_IMPACT_THRESHOLD_5Y = 1.0
MODERATE_IMPACT_THRESHOLD_5Y = 3.0

# From the architecture document. Prototype adjustment, not clinically
# validated, and applied AFTER the model rather than learned by it.
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

# Risk bands on the final 5-year figure.
RISK_BANDS = [(3.0, "Low Risk"), (8.0, "Medium Risk"), (float("inf"), "High Risk")]



# ============================================================
# IMAGE DESCRIPTORS  (inlined from 02_extract_features.py)
# ------------------------------------------------------------
# Identical to the training-time extractor. If you ever change one, change
# both: a mismatch here does not raise, it just feeds the model wrong numbers
# and returns a confident answer.
# ============================================================

try:
    from skimage.feature import graycomatrix, graycoprops, local_binary_pattern
    HAVE_SKIMAGE = True
except ImportError:
    HAVE_SKIMAGE = False

try:
    from scipy.ndimage import gaussian_filter, sobel
    HAVE_SCIPY = True
except ImportError:
    HAVE_SCIPY = False


WORK_SIZE = 224          # matches the pipeline's native 224x224 output
LBP_POINTS = 8
LBP_RADIUS = 1
DENSITY_PERCENTILES = [60, 70, 80, 90]


def build_feature_names():
    names = []
    names += ["breast_area_frac", "breast_mean", "breast_std", "breast_skew",
              "breast_kurt", "breast_p10", "breast_p25", "breast_p50",
              "breast_p75", "breast_p90", "breast_iqr", "breast_entropy"]
    for p in DENSITY_PERCENTILES:
        names += ["dense_frac_p%d" % p, "dense_mean_p%d" % p]
    names += ["dense_compactness", "dense_contrast"]
    for d in (1, 4):
        names += ["glcm_contrast_d%d" % d, "glcm_homogeneity_d%d" % d,
                  "glcm_energy_d%d" % d, "glcm_correlation_d%d" % d,
                  "glcm_dissimilarity_d%d" % d, "glcm_asm_d%d" % d]
    names += ["lbp_h%d" % i for i in range(LBP_POINTS + 2)]
    names += ["lbp_entropy", "lbp_uniformity"]
    for s in (1, 3):
        names += ["grad_mean_s%d" % s, "grad_std_s%d" % s,
                  "grad_p90_s%d" % s, "grad_energy_s%d" % s]
    names += ["band_e0", "band_e1", "band_e2", "band_e3",
              "band_ratio_01", "band_ratio_12", "band_ratio_23"]
    return names


FEATURE_NAMES = build_feature_names()
N_FEATURES = len(FEATURE_NAMES)


def breast_mask(arr):
    """Otsu-ish split of tissue from background. Mammogram backgrounds are
    near-black and occupy a large, roughly unimodal low-intensity peak."""
    thr = max(0.05, float(np.percentile(arr, 20)))
    m = arr > thr
    if m.sum() < 0.05 * m.size:          # threshold collapsed, fall back
        m = arr > arr.mean() * 0.25
    if m.sum() < 0.01 * m.size:
        m = np.ones_like(arr, dtype=bool)
    return m


def safe_stats(v):
    if v.size == 0:
        return dict(mean=0.0, std=0.0, skew=0.0, kurt=0.0)
    mu = float(v.mean())
    sd = float(v.std())
    if sd < 1e-8:
        return dict(mean=mu, std=0.0, skew=0.0, kurt=0.0)
    z = (v - mu) / sd
    return dict(mean=mu, std=sd, skew=float((z ** 3).mean()),
                kurt=float((z ** 4).mean() - 3.0))


def shannon_entropy(v, bins=32, rng=(0.0, 1.0)):
    if v.size == 0:
        return 0.0
    h, _ = np.histogram(v, bins=bins, range=rng, density=False)
    p = h.astype(np.float64)
    s = p.sum()
    if s <= 0:
        return 0.0
    p /= s
    p = p[p > 0]
    return float(-(p * np.log2(p)).sum())


def extract_image_features(path, laterality):
    """Image path -> 1-D float vector of length N_FEATURES.

    This is the function to replace when moving to a CNN embedding.
    """
    img = Image.open(path).convert("L")
    img = img.resize((WORK_SIZE, WORK_SIZE), Image.BILINEAR)
    arr = np.asarray(img).astype(np.float32) / 255.0

    # Orient every breast the same way so L/R comparisons mean something.
    if str(laterality).upper().startswith("L"):
        arr = np.fliplr(arr)

    mask = breast_mask(arr)
    tissue = arr[mask]

    feats = []

    # --- intensity inside the breast ------------------------------------
    st = safe_stats(tissue)
    pct = np.percentile(tissue, [10, 25, 50, 75, 90]) if tissue.size else np.zeros(5)
    feats += [float(mask.mean()), st["mean"], st["std"], st["skew"], st["kurt"]]
    feats += [float(x) for x in pct]
    feats += [float(pct[3] - pct[1]), shannon_entropy(tissue)]

    # --- density proxies -------------------------------------------------
    dense_mask_ref = None
    for p in DENSITY_PERCENTILES:
        if tissue.size:
            thr = float(np.percentile(tissue, p))
            dm = mask & (arr > thr)
            frac = float(dm.sum()) / max(float(mask.sum()), 1.0)
            dmean = float(arr[dm].mean()) if dm.any() else 0.0
        else:
            dm, frac, dmean = np.zeros_like(mask), 0.0, 0.0
        if p == 80:
            dense_mask_ref = dm
        feats += [frac, dmean]

    # shape of the dense region and its contrast against the rest
    if dense_mask_ref is not None and dense_mask_ref.any() and HAVE_SCIPY:
        edge = np.abs(sobel(dense_mask_ref.astype(np.float32)))
        compact = float(edge.sum()) / max(float(dense_mask_ref.sum()), 1.0)
        rest = mask & ~dense_mask_ref
        contrast = (float(arr[dense_mask_ref].mean()) -
                    (float(arr[rest].mean()) if rest.any() else 0.0))
    else:
        compact, contrast = 0.0, 0.0
    feats += [compact, contrast]

    # --- GLCM texture ----------------------------------------------------
    if HAVE_SKIMAGE:
        q = (arr * 31).astype(np.uint8)
        q[~mask] = 0
        for d in (1, 4):
            try:
                g = graycomatrix(q, distances=[d],
                                 angles=[0, np.pi / 4, np.pi / 2, 3 * np.pi / 4],
                                 levels=32, symmetric=True, normed=True)
                for prop in ("contrast", "homogeneity", "energy",
                             "correlation", "dissimilarity", "ASM"):
                    feats.append(float(np.nanmean(graycoprops(g, prop))))
            except Exception:
                feats += [0.0] * 6
    else:
        feats += [0.0] * 12

    # --- LBP -------------------------------------------------------------
    if HAVE_SKIMAGE:
        try:
            lbp = local_binary_pattern(arr, LBP_POINTS, LBP_RADIUS, method="uniform")
            vals = lbp[mask]
            h, _ = np.histogram(vals, bins=LBP_POINTS + 2,
                                range=(0, LBP_POINTS + 2), density=True)
            feats += [float(x) for x in h]
            hp = h[h > 0]
            feats += [float(-(hp * np.log2(hp)).sum()) if hp.size else 0.0,
                      float((h ** 2).sum())]
        except Exception:
            feats += [0.0] * (LBP_POINTS + 4)
    else:
        feats += [0.0] * (LBP_POINTS + 4)

    # --- gradients --------------------------------------------------------
    if HAVE_SCIPY:
        for s in (1, 3):
            sm = gaussian_filter(arr, sigma=s)
            gx, gy = sobel(sm, axis=0), sobel(sm, axis=1)
            mag = np.sqrt(gx ** 2 + gy ** 2)
            mv = mag[mask]
            if mv.size:
                feats += [float(mv.mean()), float(mv.std()),
                          float(np.percentile(mv, 90)), float((mv ** 2).mean())]
            else:
                feats += [0.0] * 4
    else:
        feats += [0.0] * 8

    # --- multiscale band energies ----------------------------------------
    if HAVE_SCIPY:
        blurs = [arr] + [gaussian_filter(arr, sigma=s) for s in (2, 4, 8)]
        bands = [blurs[i] - blurs[i + 1] for i in range(3)] + [blurs[-1]]
        energies = []
        for b in bands:
            bv = b[mask]
            energies.append(float((bv ** 2).mean()) if bv.size else 0.0)
        feats += energies
        eps = 1e-8
        feats += [energies[0] / (energies[1] + eps),
                  energies[1] / (energies[2] + eps),
                  energies[2] / (energies[3] + eps)]
    else:
        feats += [0.0] * 7

    out = np.asarray(feats, dtype=np.float32)
    if out.shape[0] != N_FEATURES:
        raise RuntimeError("feature length %d != expected %d"
                           % (out.shape[0], N_FEATURES))
    return np.nan_to_num(out, nan=0.0, posinf=0.0, neginf=0.0)


# ============================================================
# QUANTUM CIRCUIT  (inlined from 03_train_quantum.py)
# ------------------------------------------------------------
# The pickle stores a state_dict, not the class, so the architecture has to be
# defined here for the weights to load into. n_qubits and n_blocks come from
# the artifact, so this rebuilds whatever was trained.
# ============================================================

import torch.nn as nn
import pennylane as qml


class QuantumRiskModel(nn.Module):
    """Data re-uploading VQC with a discrete-time hazard head.

    Readout uses single-qubit <Z> and neighbouring <ZZ> correlators. The old
    circuit measured only single-qubit Z after one encoding pass, which keeps
    the model close to linear in the encoded angles; correlators expose the
    entanglement the circuit actually builds.
    """

    def __init__(self, n_qubits=8, n_blocks=4, n_horizons=5, seed=42,
                 device="default.qubit", diff_method="backprop"):
        super().__init__()
        self.n_qubits = n_qubits
        self.n_blocks = n_blocks
        self.diff_method = diff_method

        g = torch.Generator().manual_seed(seed)
        self.enc_scale = nn.Parameter(torch.ones(n_blocks, n_qubits))
        self.enc_shift = nn.Parameter(torch.zeros(n_blocks, n_qubits))
        self.theta = nn.Parameter(
            0.1 * torch.randn(n_blocks, n_qubits, 3, generator=g))

        # backprop through default.qubit stores every intermediate statevector,
        # so memory and time blow up past ~12 qubits. lightning.qubit with
        # adjoint differentiation is O(1) in circuit depth and far faster at
        # high qubit counts, but it evaluates one sample at a time.
        self.batched = (diff_method == "backprop")
        dev = qml.device(device, wires=n_qubits)

        @qml.qnode(dev, interface="torch", diff_method=diff_method)
        def circuit(x, theta, enc_scale, enc_shift):
            for b in range(n_blocks):
                # re-upload the data every block
                for q in range(n_qubits):
                    qml.RY(enc_scale[b, q] * x[..., q] + enc_shift[b, q], wires=q)  # noqa
                for q in range(n_qubits):
                    qml.RY(theta[b, q, 0], wires=q)
                    qml.RZ(theta[b, q, 1], wires=q)
                    qml.RY(theta[b, q, 2], wires=q)
                for q in range(n_qubits):
                    qml.CNOT(wires=[q, (q + 1) % n_qubits])
                if b % 2 == 1:                     # longer-range coupling
                    for q in range(0, n_qubits - 2, 2):
                        qml.CZ(wires=[q, q + 2])
            obs = [qml.expval(qml.PauliZ(q)) for q in range(n_qubits)]
            obs += [qml.expval(qml.PauliZ(q) @ qml.PauliZ((q + 1) % n_qubits))
                    for q in range(n_qubits)]
            return obs

        self.circuit = circuit
        self.head = nn.Linear(2 * n_qubits, n_horizons)
        nn.init.zeros_(self.head.bias)
        nn.init.normal_(self.head.weight, std=0.1)

    def forward(self, x):
        if self.batched:
            out = self.circuit(x, self.theta, self.enc_scale, self.enc_shift)
            q = torch.stack(out, dim=-1).float()
        else:
            rows = []
            for i in range(x.shape[0]):
                o = self.circuit(x[i], self.theta, self.enc_scale, self.enc_shift)
                rows.append(torch.stack(o, dim=-1).float())
            q = torch.stack(rows, dim=0)
        return self.head(q)                        # hazard logits [B, 5]


def cumulative_risk(hazard_logits):
    """h_t -> F_t = 1 - prod_{j<=t}(1 - h_j). Monotone non-decreasing."""
    h = torch.sigmoid(hazard_logits)
    surv = torch.cumprod(1.0 - h + 1e-8, dim=1)
    return 1.0 - surv


def cumulative_risk(hazard_logits):
    """h_t -> F_t = 1 - prod_{j<=t}(1 - h_j). Monotone non-decreasing."""
    h = torch.sigmoid(hazard_logits)
    surv = torch.cumprod(1.0 - h + 1e-8, dim=1)
    return 1.0 - surv


# ============================================================
# APP
# ============================================================

app = FastAPI(title="QeSFRP -- EMBED Quantum Sequential Future-Risk API",
              version="0.2")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

artifacts: Dict[str, Any] = {}
_model = None


@app.on_event("startup")
def startup_event():
    """Load the artifact and rebuild the circuit it describes."""
    global artifacts, _model

    if not ARTIFACTS_PATH.exists():
        raise FileNotFoundError(
            "Could not find model artifact: %s\n"
            "Copy qml_out/artifacts.pkl there, or set QESFRP_ARTIFACTS."
            % ARTIFACTS_PATH)

    with open(ARTIFACTS_PATH, "rb") as f:
        artifacts = pickle.load(f)

    required = ["model_state", "quantile_transformer", "selected_feature_idx",
                "angle_scaler", "n_qubits", "n_blocks", "horizons",
                "recency_lambda"]
    missing = [k for k in required if k not in artifacts]
    if missing:
        raise RuntimeError("Artifact is missing required keys: %s" % missing)

    _model = QuantumRiskModel(
        n_qubits=int(artifacts["n_qubits"]),
        n_blocks=int(artifacts["n_blocks"]),
        n_horizons=len(artifacts["horizons"]),
    )
    _model.load_state_dict(artifacts["model_state"])
    _model.eval()

    print("QeSFRP v0.2 ready: %d qubits, %d blocks, horizons %s"
          % (artifacts["n_qubits"], artifacts["n_blocks"], artifacts["horizons"]))


# ============================================================
# HELPERS
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


def calculate_risk_level(risk_5y: float) -> str:
    for threshold, label in RISK_BANDS:
        if risk_5y < threshold:
            return label
    return "High Risk"


def classify_impact(max_abs_change: float) -> str:
    if max_abs_change < LOW_IMPACT_THRESHOLD_5Y:
        return "low"
    if max_abs_change < MODERATE_IMPACT_THRESHOLD_5Y:
        return "moderate"
    return "high"


def parse_metadata(metadata_json: str) -> Dict[str, Any]:
    try:
        metadata = json.loads(metadata_json)
    except Exception as e:
        raise HTTPException(status_code=400,
                            detail="metadata_json is not valid JSON: %s" % e)

    if "patient_age" not in metadata:
        raise HTTPException(status_code=400,
                            detail="metadata_json must include patient_age")
    if "exams" not in metadata or not isinstance(metadata["exams"], list):
        raise HTTPException(status_code=400,
                            detail="metadata_json must include an exams list")
    if not metadata["exams"]:
        raise HTTPException(status_code=400, detail="At least one exam is required")

    for exam in metadata["exams"]:
        if "exam_date" not in exam:
            raise HTTPException(status_code=400,
                                detail="Each exam must include exam_date")
        if "views" not in exam:
            raise HTTPException(status_code=400,
                                detail="Each exam must include views")
        missing = [v for v in VIEW_KEYS if v not in exam["views"]]
        if missing:
            raise HTTPException(
                status_code=400,
                detail="Each exam must include all four views %s. Missing: %s"
                       % (VIEW_KEYS, missing))
    return metadata


async def read_files_by_filename(files: List[UploadFile]) -> Dict[str, bytes]:
    out = {}
    for f in files:
        out[f.filename] = await f.read()
    return out


# ============================================================
# FEATURE BUILDING -- must mirror training exactly
# ============================================================

def image_descriptor_from_bytes(image_bytes: bytes, laterality: str) -> np.ndarray:
    """61 radiomic descriptors, via the training-time extractor."""
    img = Image.open(io.BytesIO(image_bytes)).convert("L")
    tmp = io.BytesIO()
    img.save(tmp, format="PNG")
    tmp.seek(0)
    return extract_image_features(tmp, laterality)


def build_exam_vector(exam: Dict[str, Any],
                      file_bytes_by_name: Dict[str, bytes],
                      disable_asymmetry: bool = False
                      ) -> Tuple[np.ndarray, Dict[str, Any]]:
    """One exam -> 305-d vector: view means, then CC and MLO asymmetry.

    Layout matches build_exam_vectors() in training:
        [mean_all | cc_mean | mlo_mean | cc_asym | mlo_asym]
    """
    views = {}
    for vk in VIEW_KEYS:
        fname = exam["views"][vk]
        if fname not in file_bytes_by_name:
            raise HTTPException(status_code=400,
                                detail="Uploaded files do not include '%s' for view %s"
                                       % (fname, vk))
        lat = "L" if vk.startswith("L") else "R"
        views[vk] = image_descriptor_from_bytes(file_bytes_by_name[fname], lat)

    mean_all = np.mean(np.vstack([views[v] for v in VIEW_KEYS]), axis=0)
    cc_mean = 0.5 * (views["L-CC"] + views["R-CC"])
    mlo_mean = 0.5 * (views["L-MLO"] + views["R-MLO"])
    cc_asym = np.abs(views["L-CC"] - views["R-CC"])
    mlo_asym = np.abs(views["L-MLO"] - views["R-MLO"])

    asym_score = float(np.mean(cc_asym) + np.mean(mlo_asym))

    if disable_asymmetry:
        cc_asym = np.zeros_like(cc_asym)
        mlo_asym = np.zeros_like(mlo_asym)

    vec = np.concatenate([mean_all, cc_mean, mlo_mean,
                          cc_asym, mlo_asym]).astype(np.float32)

    return vec, {
        "exam_date": exam["exam_date"],
        "study_dt": pd.to_datetime(exam["exam_date"]),
        "asymmetry_score": asym_score,
        "cc_asymmetry": float(np.mean(cc_asym)),
        "mlo_asymmetry": float(np.mean(mlo_asym)),
    }


def compute_recency_weights(dates: List[pd.Timestamp], recency_lambda: float):
    """Architecture document formula.

        years_before_latest = latest_exam_date - current_exam_date
        raw_weight          = exp(-0.5 * years_before_latest)
        normalized          = raw / sum(raw)
    """
    latest = max(dates)
    years_back = np.array([(latest - d).days / 365.25 for d in dates],
                          dtype=np.float32)
    raw = np.exp(-recency_lambda * years_back)
    return years_back, raw, raw / raw.sum()


def build_patient_feature(metadata: Dict[str, Any],
                          file_bytes_by_name: Dict[str, bytes],
                          disable_asymmetry: bool = False,
                          exclude_exam_index: int = None
                          ) -> Tuple[np.ndarray, Dict[str, Any]]:
    """Assemble the 1528-d sequence vector for one patient.

    Mirrors build_sequence_features() at training time:
        [current | recency_weighted | delta | slope | prev_delta | scalars]
    """
    recency_lambda = float(artifacts["recency_lambda"])
    max_history = 5

    exams = list(metadata["exams"])
    if exclude_exam_index is not None:
        exams = [e for i, e in enumerate(exams) if i != exclude_exam_index]
    if not exams:
        raise HTTPException(status_code=400, detail="No exams left to score")

    built = [build_exam_vector(e, file_bytes_by_name, disable_asymmetry)
             for e in exams]
    built.sort(key=lambda t: t[1]["study_dt"])
    built = built[-max_history:]

    mats = np.vstack([b[0] for b in built])
    dates = [b[1]["study_dt"] for b in built]
    D = mats.shape[1]

    years_back, raw_w, norm_w = compute_recency_weights(dates, recency_lambda)

    current = mats[-1]
    recency = np.sum(mats * norm_w[:, None], axis=0)

    if len(built) > 1:
        delta = current - mats[0]
        gap = float(years_back[0])
        slope = delta / max(gap, 0.5)
        prev = current - mats[-2]
    else:
        delta = np.zeros(D, np.float32)
        slope = np.zeros(D, np.float32)
        prev = np.zeros(D, np.float32)
        gap = 0.0

    scalars = np.array([len(built), gap, float(years_back.mean())],
                       dtype=np.float32)

    vec = np.concatenate([current, recency, delta, slope, prev,
                          scalars]).astype(np.float32)

    debug = {
        "n_exams_used": len(built),
        "exam_dates": [d.strftime("%Y-%m-%d") for d in dates],
        "years_before_latest": [round(float(v), 3) for v in years_back],
        "raw_recency_weights": [round(float(v), 4) for v in raw_w],
        "normalized_recency_weights": [round(float(v), 4) for v in norm_w],
        "asymmetry_per_exam": [b[1]["asymmetry_score"] for b in built],
        "history_span_years": round(gap, 3),
        "feature_dim": int(vec.shape[0]),
    }
    return vec, debug


# ============================================================
# MODEL
# ============================================================

def predict_cumulative_risk(patient_feature_raw: np.ndarray) -> np.ndarray:
    """Raw sequence vector -> cumulative risk per horizon, as percentages.

    Same transform chain as training: quantile transform, select the qubit
    features, standardise, clip, scale into the angle range.
    """
    qt = artifacts["quantile_transformer"]
    chosen = artifacts["selected_feature_idx"]
    ang = artifacts["angle_scaler"]

    x = qt.transform(patient_feature_raw.reshape(1, -1))
    x = np.nan_to_num(x, nan=0.0, posinf=0.0, neginf=0.0)
    x = x[:, chosen]
    x = np.clip(ang.transform(x), -3, 3) * (np.pi / 3)

    with torch.no_grad():
        logits = _model(torch.tensor(x, dtype=torch.float32))
        risk = cumulative_risk(logits).numpy()[0]

    return risk * 100.0


def yearly_risk_dict(risk_pct: np.ndarray) -> Dict[str, float]:
    return {"%d_year" % h: round(float(r), 2)
            for h, r in zip(artifacts["horizons"], risk_pct)}


def apply_calibration(risk_dict: Dict[str, float]) -> Dict[str, float]:
    """Map raw model output onto observed event rates, if calibrators exist.

    Training uses pos_weight ~8 so the model attends to a 0.85% event rate.
    That helps ranking and inflates every probability by roughly that factor,
    so raw output reads like "38% one-year risk" for someone near 1%. Isotonic
    regression is monotone, so this rescales without changing AUC.

    Run 05_calibrate.py to add these. Without them the API still works, and
    `calibrated` in the response tells the frontend which it is looking at.
    """
    cal = artifacts.get("calibrators")
    if not cal:
        return dict(risk_dict)

    out, prev = {}, 0.0
    for k in risk_dict:
        v = float(risk_dict[k])
        if k in cal:
            v = float(cal[k].predict([v / 100.0])[0]) * 100.0
        # isotonic is fitted per horizon, so enforce monotonicity across them
        v = max(v, prev)
        prev = v
        out[k] = round(v, 3)
    return out


def make_risk_curve_points(risk_dict: Dict[str, float]) -> List[Dict[str, Any]]:
    pts = []
    for k, v in risk_dict.items():
        pts.append({"year": int(k.split("_")[0]), "label": k.replace("_", " "),
                    "risk_percent": round(float(v), 2)})
    return sorted(pts, key=lambda p: p["year"])


def highest_risk_year_from_dict(risk_dict: Dict[str, float]) -> str:
    return max(risk_dict.items(), key=lambda kv: kv[1])[0]


# ============================================================
# INFERENCE
# ============================================================

def run_inference(metadata: Dict[str, Any],
                  file_bytes_by_name: Dict[str, bytes],
                  disable_asymmetry: bool = False,
                  exclude_exam_index: int = None) -> Dict[str, Any]:
    """Full pipeline once. Also used for the ablation passes."""
    feat, debug = build_patient_feature(
        metadata, file_bytes_by_name,
        disable_asymmetry=disable_asymmetry,
        exclude_exam_index=exclude_exam_index)

    risk_pct = predict_cumulative_risk(feat)
    uncalibrated = yearly_risk_dict(risk_pct)
    model_risk = apply_calibration(uncalibrated)

    patient_age = float(metadata["patient_age"])
    age_group = get_age_group(patient_age)
    age_multiplier = float(AGE_MULTIPLIERS.get(age_group, 1.0))

    # Architecture document: Final N year risk = N year risk * age_group weight
    if APPLY_AGE_MULTIPLIER:
        final_risk = {k: safe_percent(v * age_multiplier)
                      for k, v in model_risk.items()}
    else:
        final_risk = dict(model_risk)

    # The hazard head makes model_risk monotone; a constant multiplier and the
    # 0-100 clip both preserve that, so no re-sorting is needed here.
    risk_5y = final_risk.get("5_year", list(final_risk.values())[-1])

    return {
        "patient_feature_raw": feat,
        "feature_debug": debug,
        "model_risk": model_risk,
        "uncalibrated_risk": uncalibrated,
        "final_risk": final_risk,
        "risk_level": calculate_risk_level(risk_5y),
        "age_group": age_group,
        "age_multiplier": age_multiplier,
    }


def calculate_exam_contributions(metadata, file_bytes_by_name, full_final_risk):
    """Leave-one-exam-out ablation on the 5-year figure."""
    exams = metadata["exams"]
    full_5y = float(full_final_risk.get("5_year", list(full_final_risk.values())[-1]))

    rows = []
    if len(exams) < 2:
        return [{
            "exam_index": 0,
            "exam_date": exams[0]["exam_date"],
            "risk_without_exam_5y": None,
            "risk_drop_5y": None,
            "contribution_percent": 100.0,
            "note": "Only one exam supplied; ablation is not meaningful.",
        }], {"method": "leave_one_exam_out", "usable": False}

    for i, exam in enumerate(exams):
        out = run_inference(metadata, file_bytes_by_name, exclude_exam_index=i)
        without_5y = float(out["final_risk"].get(
            "5_year", list(out["final_risk"].values())[-1]))
        rows.append({
            "exam_index": i,
            "exam_id": f"exam_{i + 1}",
            "exam_date": exam["exam_date"],
            "risk_without_exam_5y": round(without_5y, 3),
            "risk_drop_5y": round(full_5y - without_5y, 3),
        })

    drops = [max(r["risk_drop_5y"], 0.0) for r in rows]
    total = float(sum(drops))
    for r, d in zip(rows, drops):
        if total >= MIN_TOTAL_POSITIVE_DROP_FOR_PERCENT:
            r["contribution_percent"] = round(100.0 * d / total, 2)
        else:
            r["contribution_percent"] = round(100.0 / len(rows), 2)
        r["impact_level"] = classify_impact(abs(r["risk_drop_5y"]))

    meta = {
        "method": "leave_one_exam_out",
        "usable": total >= MIN_TOTAL_POSITIVE_DROP_FOR_PERCENT,
        "total_positive_drop_5y": round(total, 3),
        "note": ("Contributions are split evenly when the total measured drop is "
                 "small, because percentage shares of a near-zero total are noise."),
    }
    return rows, meta


def calculate_asymmetry_ablation(metadata, file_bytes_by_name, full_final_risk):
    """Re-score with the asymmetry blocks zeroed."""
    out = run_inference(metadata, file_bytes_by_name, disable_asymmetry=True)
    without = out["final_risk"]
    full_5y = float(full_final_risk.get("5_year", list(full_final_risk.values())[-1]))
    without_5y = float(without.get("5_year", list(without.values())[-1]))
    change = full_5y - without_5y

    return {
        "method": "zero_asymmetry_feature_ablation",
        "risk_without_asymmetry": {k: round(float(v), 3) for k, v in without.items()},
        "risk_change_from_asymmetry": {
            k: round(float(full_final_risk[k]) - float(without.get(k, 0.0)), 3)
            for k in full_final_risk},
        "risk_without_asymmetry_5y": round(without_5y, 3),
        "asymmetry_risk_change_5y": round(change, 3),
        "impact_level": classify_impact(abs(change)),
        "interpretation": ("asymmetry_increased_risk" if change > 0 else
                           "asymmetry_reduced_risk" if change < 0 else
                           "no_measured_change"),
        "note": "Approximate interpretability. Re-runs the model with L/R "
                "asymmetry evidence removed.",
    }


# ============================================================
# ROUTES
# ============================================================

@app.get("/health")
def health():
    return {
        "status": "ok" if artifacts else "model_not_loaded",
        "model_loaded": bool(artifacts),
        "artifact_path": str(ARTIFACTS_PATH),
        "n_qubits": artifacts.get("n_qubits"),
        "n_blocks": artifacts.get("n_blocks"),
        "horizons": artifacts.get("horizons"),
        "head": artifacts.get("head", "discrete_time_hazard"),
        "calibrated": bool(artifacts.get("calibrators")),
        "version": "0.2",
    }


@app.post("/qml-future-risk-view-aware/")
async def qml_future_risk_view_aware(
    metadata_json: str = Form(...),
    files: List[UploadFile] = File(...),
):
    if not artifacts:
        raise HTTPException(status_code=503, detail="Model artifacts not loaded")

    metadata = parse_metadata(metadata_json)
    file_bytes = await read_files_by_filename(files)

    inference = run_inference(metadata, file_bytes)

    final_risk = inference["final_risk"]
    model_risk = inference["model_risk"]
    age_group = inference["age_group"]
    age_multiplier = inference["age_multiplier"]

    exam_rows, exam_meta = calculate_exam_contributions(
        metadata, file_bytes, final_risk)
    asym = calculate_asymmetry_ablation(metadata, file_bytes, final_risk)

    risk_5y = float(final_risk.get("5_year", list(final_risk.values())[-1]))

    explanation = [
        "Each exam's four views were reduced to radiomic descriptors and "
        "combined into one exam feature.",
        "Left/right asymmetry was computed for CC and MLO pairs.",
        "Exams were recency weighted with lambda %.2f, so recent exams carry "
        "more influence." % float(artifacts["recency_lambda"]),
        "A %d-qubit data re-uploading circuit produced yearly hazards, which "
        "accumulate into a monotone 1-5 year risk curve."
        % int(artifacts["n_qubits"]),
        "Age group %s applied a final multiplier of %.2f."
        % (age_group, age_multiplier),
    ]

    image_level_results = []
    for row in exam_rows:
        i = row["exam_index"]
        exam = metadata["exams"][i]
        pct = row.get("contribution_percent") or 0.0
        for view_key, filename in exam["views"].items():
            image_level_results.append({
                "filename": filename,
                "exam_index": i,
                "exam_date": exam["exam_date"],
                "view": view_key,
                "image_contribution_percent": pct,
            })

    return {
            "status": "success",
            "model": {
            "name": "EMBED view-aware QML future-risk model",
            "type": artifacts.get("model_type", "View-aware QML VQC"),
            "clinically_validated": False,
            "artifact_path": str(ARTIFACTS_PATH),
        },
        "patient_summary": {
            "patient_age": float(metadata["patient_age"]),
            "age_group": age_group,
            "number_of_exams": len(metadata["exams"]),
            "yearly_future_risk": final_risk,
            "5_year_risk_score": round(risk_5y, 2),
            "final_patient_qml_risk_level": inference["risk_level"],
            "highest_risk_year": highest_risk_year_from_dict(final_risk),
            "risk_curve": make_risk_curve_points(final_risk),
        },
        "image_level_results": image_level_results, 
        "future_risk": {
            "age_adjusted_risk": final_risk,
            "risk_level": inference["risk_level"],
            "highest_risk_year": highest_risk_year_from_dict(final_risk),
        },
        "age_adjustment": {
            "age_group": age_group,
            "age_multiplier": age_multiplier,
            "age_multiplier_used": APPLY_AGE_MULTIPLIER,
            "strategy": "external_age_group_multiplier",
            "risk_before_age_multiplier": model_risk,
            "note": "Applied after the model, per the architecture document. "
                    "These weights are a prototype and are not fitted on EMBED.",
        },
        "calibration": {
            "calibrated": bool(artifacts.get("calibrators")),
            "method": artifacts.get("calibration", {}).get("method", "none"),
            "uncalibrated_risk_before_age": inference["uncalibrated_risk"],
            "note": ("Raw hazards are inflated by the training pos_weight. "
                     "Without calibration the percentages are not "
                     "probabilities -- run 05_calibrate.py."),
        },
        "exam_contributions": exam_rows,
        "exam_contribution_meta": exam_meta,
        "asymmetry_analysis": asym,
        "feature_debug": inference["feature_debug"],
        "model_info": {
            "model_type": "EMBED QML sequential future-risk (hazard head)",
            "version": "0.2",
            "n_qubits": int(artifacts["n_qubits"]),
            "n_blocks": int(artifacts["n_blocks"]),
            "horizon_years": list(artifacts["horizons"]),
            "recency_lambda": float(artifacts["recency_lambda"]),
            "head": artifacts.get("head", "discrete_time_hazard"),
            "feature_source": "radiomic descriptors (%d per image)" % N_FEATURES,
            "monotone_by_construction": True,
        },
        "important_limitation": (
            "Research prototype, not a clinically validated future-cancer "
            "probability. Held-out test AUC is approximately 0.62 at one year "
            "and 0.66 at five years, so the ranking is informative but the "
            "absolute percentages are not calibrated and should not be read as "
            "a patient's actual probability of developing cancer. Age "
            "multipliers are applied post hoc and were not fitted on EMBED."
        ),
    }


@app.post("/qml-future-risk/predict/sequence")
async def qml_future_risk_sequence(
    metadata_json: str = Form(...),
    files: List[UploadFile] = File(...),
):
    """Alias kept for the endpoint name used in the training design document."""
    return await qml_future_risk_view_aware(metadata_json=metadata_json, files=files)
