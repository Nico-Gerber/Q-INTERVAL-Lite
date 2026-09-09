import io
import os
import pickle
import tempfile
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import pennylane as qml
from PIL import Image

warnings.filterwarnings("ignore")

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


ARTIFACTS_PATH = Path(os.environ.get(
    "QESFRP_ARTIFACTS", Path(__file__).resolve().parent / "models" / "qesfrp.pkl"))

VIEW_KEYS = ["L-CC", "R-CC", "L-MLO", "R-MLO"]
RISK_BANDS = [(3.0, "Low Risk"), (8.0, "Medium Risk"), (float("inf"), "High Risk")]
AGE_MULTIPLIERS = {"Under 30": 0.70, "30-39": 1.02, "40-49": 1.04, "50-59": 1.08,
                   "60-69": 1.15, "70-79": 1.25, "80+": 1.50}
RISE = 0.40
MIN_DROP_FOR_PERCENT = 1.0

_loaded = False
_artifacts = {}
_backbone = {}
_model = None


# ============================================================
# IMAGE MEASUREMENTS
# ============================================================

WORK_SIZE = 500          # matches the Sprint 5 pipeline's 500x500 output
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
# QUANTUM CIRCUIT AND RISK HEAD
# ============================================================

class QuantumEncoder(nn.Module):
    """Data re-uploading circuit whose readout is the reusable representation.

    Returns 2*n_qubits values: single-qubit <Z> and neighbouring <ZZ>. The
    correlators matter -- with <Z> alone the readout stays close to linear in
    the encoded angles and there is little for a downstream head to use.
    """

    def __init__(self, n_qubits=12, n_blocks=5, seed=42,
                 device="default.qubit", diff_method="backprop"):
        super().__init__()
        self.n_qubits, self.n_blocks = n_qubits, n_blocks
        self.batched = (diff_method == "backprop")

        g = torch.Generator().manual_seed(seed)
        self.enc_scale = nn.Parameter(torch.ones(n_blocks, n_qubits))
        self.enc_shift = nn.Parameter(torch.zeros(n_blocks, n_qubits))
        self.theta = nn.Parameter(0.1 * torch.randn(n_blocks, n_qubits, 3,
                                                    generator=g))

        dev = qml.device(device, wires=n_qubits)

        @qml.qnode(dev, interface="torch", diff_method=diff_method)
        def circuit(x, theta, enc_scale, enc_shift):
            for b in range(n_blocks):
                for q in range(n_qubits):
                    qml.RY(enc_scale[b, q] * x[..., q] + enc_shift[b, q], wires=q)
                for q in range(n_qubits):
                    qml.RY(theta[b, q, 0], wires=q)
                    qml.RZ(theta[b, q, 1], wires=q)
                    qml.RY(theta[b, q, 2], wires=q)
                for q in range(n_qubits):
                    qml.CNOT(wires=[q, (q + 1) % n_qubits])
                if b % 2 == 1:
                    for q in range(0, n_qubits - 2, 2):
                        qml.CZ(wires=[q, q + 2])
            obs = [qml.expval(qml.PauliZ(q)) for q in range(n_qubits)]
            obs += [qml.expval(qml.PauliZ(q) @ qml.PauliZ((q + 1) % n_qubits))
                    for q in range(n_qubits)]
            return obs

        self.circuit = circuit

    def forward(self, x):
        if self.batched:
            return torch.stack(self.circuit(x, self.theta, self.enc_scale,
                                            self.enc_shift), dim=-1).float()
        rows = [torch.stack(self.circuit(x[i], self.theta, self.enc_scale,
                                         self.enc_shift), dim=-1).float()
                for i in range(x.shape[0])]
        return torch.stack(rows, dim=0)

class SequentialRiskModel(nn.Module):
    """Frozen quantum encoder per exam, then a temporal head."""

    def __init__(self, encoder, readout_dim, n_horizons=5, freeze=True,
                 use_timing=False, n_asym=6):
        super().__init__()
        self.encoder = encoder
        self.use_timing = use_timing
        if freeze:
            for p in self.encoder.parameters():
                p.requires_grad = False
        # current readout, recency-weighted readout, delta, asymmetry trend,
        # and optionally the timing scalars
        d = readout_dim * 3 + n_asym + (3 if use_timing else 0)
        self.head = nn.Sequential(
            nn.Linear(d, 32), nn.ReLU(), nn.Linear(32, n_horizons))
        nn.init.zeros_(self.head[-1].bias)

    def encode_exams(self, x_flat):
        return self.encoder(x_flat)

    def forward(self, cur, rec, dlt, scal, asym):
        parts = [cur, rec, dlt, asym]
        if self.use_timing:
            parts.insert(3, scal)
        return self.head(torch.cat(parts, dim=-1))


def cumulative_risk(logits):
    h = torch.sigmoid(logits)
    return 1.0 - torch.cumprod(1.0 - h + 1e-8, dim=1)

def cumulative_risk(hazard_logits):
    """h_t -> F_t = 1 - prod(1 - h_j). Monotone non-decreasing by construction."""
    h = torch.sigmoid(hazard_logits)
    return 1.0 - torch.cumprod(1.0 - h + 1e-8, dim=1)


# ============================================================
# CONTRACT
# ============================================================

def initialise():
    """Load the artifact and rebuild the circuit it describes. Runs once."""
    global _loaded, _artifacts, _backbone, _model

    if _loaded:
        return

    if not ARTIFACTS_PATH.exists():
        raise FileNotFoundError(
            "model artifact not found: %s\n"
            "Copy artifacts.pkl there, or set QESFRP_ARTIFACTS." % ARTIFACTS_PATH)

    with open(ARTIFACTS_PATH, "rb") as fh:
        _artifacts = pickle.load(fh)

    _backbone = _artifacts.get("backbone") or {}
    required = ("quantile_transformer", "selected_feature_idx", "angle_scaler",
                "n_qubits", "n_blocks", "encoder_state", "readout_dim")
    missing = [k for k in required if k not in _backbone]
    if missing:
        raise RuntimeError("artifact backbone is missing: %s" % missing)

    enc = QuantumEncoder(_backbone["n_qubits"], _backbone["n_blocks"], seed=42,
                         device=_backbone.get("device", "default.qubit"),
                         diff_method=_backbone.get("diff_method", "backprop"))
    enc.load_state_dict(_backbone["encoder_state"])

    m = SequentialRiskModel(enc, _backbone["readout_dim"],
                            len(_artifacts["horizons"]), freeze=True,
                            use_timing=False, n_asym=6)
    m.load_state_dict(_artifacts["model_state"])
    m.eval()
    _model = m
    _loaded = True


def health():
    return {
        "status": "ok" if _loaded else "model_not_loaded",
        "model_loaded": _loaded,
        "n_qubits": _backbone.get("n_qubits"),
        "n_blocks": _backbone.get("n_blocks"),
        "horizons": _artifacts.get("horizons"),
        "calibrated": bool(_artifacts.get("calibrators")),
        "feature_source": "radiomic descriptors (%d per image)" % N_FEATURES,
        "validated": False,
    }


# ---------------------------------------------------------------- internals

def _age_group(age):
    if age is None:
        return None
    for hi, label in ((30, "Under 30"), (40, "30-39"), (50, "40-49"),
                      (60, "50-59"), (70, "60-69"), (80, "70-79")):
        if age < hi:
            return label
    return "80+"


def _risk_level(r5):
    for threshold, label in RISK_BANDS:
        if r5 < threshold:
            return label
    return "High Risk"


def _descriptor(image_bytes, laterality):
    """One image's 61 measurements. Writes to a temp file so the extractor
    sees exactly what it saw during training."""
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as fh:
        fh.write(image_bytes)
        tmp = fh.name
    try:
        return extract_image_features(tmp, laterality)
    finally:
        try:
            os.remove(tmp)
        except OSError:
            pass


def _exam_vector(exam, disable_asym=False):
    """Four views -> one exam vector, or None if too few views are usable.

    Both sides are needed for an asymmetry comparison. A missing view is
    filled with the mean of the views that are present, which keeps the layout
    intact; fewer than two usable views means the exam is skipped rather than
    silently imputed from nothing.
    """
    views = exam.get("views") or {}
    got = {}
    for vk in VIEW_KEYS:
        raw = views.get(vk)
        if not raw:
            continue
        lat = "L" if vk.startswith("L") else "R"
        try:
            got[vk] = _descriptor(raw, lat)
        except Exception:
            continue

    if len(got) < 2:
        return None, None

    fill = np.mean(np.vstack(list(got.values())), axis=0)
    v = {vk: got.get(vk, fill) for vk in VIEW_KEYS}

    cc_asym = np.abs(v["L-CC"] - v["R-CC"])
    mlo_asym = np.abs(v["L-MLO"] - v["R-MLO"])
    info = {
        "asymmetry_score": float(np.mean(cc_asym) + np.mean(mlo_asym)),
        "views_present": len(got),
    }
    if disable_asym:
        cc_asym = np.zeros_like(cc_asym)
        mlo_asym = np.zeros_like(mlo_asym)

    vec = np.concatenate([
        np.mean(np.vstack([v[k] for k in VIEW_KEYS]), axis=0),
        0.5 * (v["L-CC"] + v["R-CC"]),
        0.5 * (v["L-MLO"] + v["R-MLO"]),
        cc_asym, mlo_asym]).astype(np.float32)
    return vec, info


def _encode(vec):
    """Exam vector -> quantum readout, via the training transform chain."""
    x = _backbone["quantile_transformer"].transform(vec.reshape(1, -1))
    x = np.nan_to_num(x, nan=0.0, posinf=0.0, neginf=0.0)
    if _backbone.get("pca") is not None:
        x = _backbone["pca"].transform(x)
    x = x[:, _backbone["selected_feature_idx"]]
    x = np.clip(_backbone["angle_scaler"].transform(x), -3, 3) * (np.pi / 3)
    with torch.no_grad():
        return _model.encoder(torch.tensor(x, dtype=torch.float32))[0].numpy()


def _predict(built, disable_asym=False):
    """Built exams -> yearly risk percentages, before the age multiplier."""
    lam = float(_artifacts.get("recency_lambda", 0.5))
    built = built[-5:]

    raw = np.vstack([b["vec"] for b in built])
    Z = np.vstack([_encode(r) for r in raw])
    dates = [b["date"] for b in built]
    latest = max(dates)
    yb = np.array([(latest - d).days / 365.25 for d in dates], dtype=np.float32)
    w = np.exp(-lam * yb)
    w = w / w.sum()

    cur = Z[-1]
    rec = (Z * w[:, None]).sum(0)
    dlt = (cur - Z[0]) if len(built) > 1 else np.zeros_like(cur)

    # Asymmetry trend is read from the raw exam vectors, not the readouts: the
    # encoder was fitted for density and has no reason to preserve a
    # left-minus-right signal.
    F = raw.shape[1] // 5
    a_tot = (np.abs(raw[:, 3 * F:4 * F]).mean(1)
             + np.abs(raw[:, 4 * F:5 * F]).mean(1))
    a_mu, a_sd = float(a_tot.mean()), float(a_tot.std() + 1e-8)
    cur_a = float(a_tot[-1])
    if len(built) > 1:
        first = float(a_tot[0])
        rel = (cur_a - first) / max(abs(first), 1e-6)
        slope = (cur_a - first) / max(float(yb[0]), 0.5)
        step = float(a_tot[-1] - a_tot[-2])
    else:
        rel = slope = step = 0.0
    cc_l = float(np.abs(raw[-1, 3 * F:4 * F]).mean())
    ml_l = float(np.abs(raw[-1, 4 * F:5 * F]).mean())
    asym = np.nan_to_num(np.array([
        (cur_a - a_mu) / a_sd, np.clip(rel, -3, 3),
        np.clip(slope / a_sd, -3, 3), np.clip(step / a_sd, -3, 3),
        1.0 if rel > RISE else 0.0, (cc_l - ml_l) / a_sd], dtype=np.float32),
        nan=0.0, posinf=0.0, neginf=0.0)

    scal = np.array([len(built), float(yb[0]), float(yb.mean())],
                    dtype=np.float32)
    t = lambda a: torch.tensor(a, dtype=torch.float32).unsqueeze(0)
    with torch.no_grad():
        logits = _model(t(cur), t(rec), t(dlt), t(scal), t(asym))
        risk = cumulative_risk(logits).numpy()[0]

    return {"%d_year" % h: float(r) * 100.0
            for h, r in zip(_artifacts["horizons"], risk)}, w


def _calibrate(d):
    """Map raw output onto observed event rates.

    Training weights the hazard loss so the model attends to a ~1% event rate.
    That helps ranking and inflates every probability by roughly that factor,
    so raw output can read like 40% one-year risk. Isotonic regression is
    monotone, so this corrects the scale without changing the ordering.
    """
    cal = _artifacts.get("calibrators")
    if not cal:
        return dict(d)
    out, prev = {}, 0.0
    for k, v in d.items():
        v = float(v)
        if k in cal:
            v = float(cal[k].predict([v / 100.0])[0]) * 100.0
        v = max(v, prev)
        prev = v
        out[k] = v
    return out


def _finalise(risk, age):
    risk = _calibrate(risk)
    grp = _age_group(age)
    mult = AGE_MULTIPLIERS.get(grp, 1.0) if grp else 1.0
    out, prev = {}, 0.0
    for k in sorted(risk, key=lambda s: int(s.split("_")[0])):
        v = float(np.clip(risk[k] * mult, 0.0, 100.0))
        v = max(v, prev)
        prev = v
        out[k] = round(v, 2)
    return out


# ------------------------------------------------------------- entrypoint

def run_inference(model_input):
    initialise()

    exams_in = model_input.get("exams") or []
    if not exams_in:
        raise ValueError("at least one exam is required")

    age = model_input.get("patient_age")
    age = float(age) if age is not None else None

    built, skipped = [], []
    for i, ex in enumerate(exams_in):
        vec, info = _exam_vector(ex)
        eid = ex.get("exam_id") or ("exam_%d" % (i + 1))
        date = ex.get("exam_date")
        if vec is None:
            skipped.append({"exam_id": eid, "exam_date": date,
                            "contribution_percent": None})
            continue
        built.append({"exam_id": eid, "exam_date": date, "vec": vec,
                      "date": pd.to_datetime(date), "info": info,
                      "raw": ex})

    if not built:
        raise ValueError("no exam had at least two readable views")

    built.sort(key=lambda b: b["date"])
    risk_raw, _ = _predict(built)
    yearly = _finalise(risk_raw, age)
    r5 = yearly.get("5_year", list(yearly.values())[-1])

    # Per-exam contribution by leave-one-out. With a single exam there is
    # nothing to compare against, so it takes the whole share.
    contributions = {}
    if len(built) > 1:
        drops = {}
        for b in built:
            others = [x for x in built if x is not b]
            without = _finalise(_predict(others)[0], age)
            w5 = without.get("5_year", list(without.values())[-1])
            drops[b["exam_id"]] = max(r5 - w5, 0.0)
        total = sum(drops.values())
        for b in built:
            contributions[b["exam_id"]] = (
                round(100.0 * drops[b["exam_id"]] / total, 2)
                if total >= MIN_DROP_FOR_PERCENT
                else round(100.0 / len(built), 2))
    else:
        contributions[built[0]["exam_id"]] = 100.0

    exams_out = [{"exam_id": b["exam_id"], "exam_date": b["exam_date"],
                  "contribution_percent": contributions.get(b["exam_id"])}
                 for b in built] + skipped

    return {
        "yearly_risk": yearly,
        "risk_level": _risk_level(r5),
        "exams": exams_out,
    }
