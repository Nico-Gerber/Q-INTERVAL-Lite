import os
import pickle
import warnings
from io import BytesIO
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


_HERE = Path(__file__).resolve().parent


def _find_artifact():
    env = os.environ.get("QESFRP_ARTIFACTS")
    if env:
        return Path(env)
    for name in ("QeSFRP_V0.4.1.pkl", "qesfrp.pkl"):
        p = _HERE / "models" / name
        if p.exists():
            return p
    found = sorted((_HERE / "models").glob("QeSFRP_*.pkl"),
                   key=lambda p: p.stat().st_mtime)
    return found[-1] if found else _HERE / "models" / "QeSFRP_V0.4.1.pkl"


ARTIFACTS_PATH = _find_artifact()

VIEW_KEYS = ["L-CC", "R-CC", "L-MLO", "R-MLO"]
RISK_BANDS = [(3.0, "Low Risk"), (8.0, "Medium Risk"), (float("inf"), "High Risk")]
AGE_MULTIPLIERS = {"Under 30": 0.70, "30-39": 1.02, "40-49": 1.04, "50-59": 1.08,
                   "60-69": 1.15, "70-79": 1.25, "80+": 1.50}
RISE = 0.40
MIN_DROP_FOR_PERCENT = 1.0

_loaded = False
_artifacts = {}
_backbone = {}
_encoder = None
_heads = []
_extra_mu = None
_extra_sd = None


# ============================================================
# IMAGE MEASUREMENTS  (identical to 02_extract_features.py)
# ============================================================

WORK_SIZE = 500
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
    thr = max(0.05, float(np.percentile(arr, 20)))
    m = arr > thr
    if m.sum() < 0.05 * m.size:
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


def load_array(image_bytes):
    """Bytes -> 500x500 float array in [0,1], exactly as training read PNGs."""
    img = Image.open(BytesIO(image_bytes)).convert("L")
    img = img.resize((WORK_SIZE, WORK_SIZE), Image.BILINEAR)
    return np.asarray(img).astype(np.float32) / 255.0


def descriptors_from_array(arr, laterality):
    """500x500 array -> the 61 Sprint 5 descriptors."""
    if str(laterality).upper().startswith("L"):
        arr = np.fliplr(arr)
    mask = breast_mask(arr)
    tissue = arr[mask]
    feats = []

    st = safe_stats(tissue)
    pct = np.percentile(tissue, [10, 25, 50, 75, 90]) if tissue.size else np.zeros(5)
    feats += [float(mask.mean()), st["mean"], st["std"], st["skew"], st["kurt"]]
    feats += [float(x) for x in pct]
    feats += [float(pct[3] - pct[1]), shannon_entropy(tissue)]

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

    if dense_mask_ref is not None and dense_mask_ref.any() and HAVE_SCIPY:
        edge = np.abs(sobel(dense_mask_ref.astype(np.float32)))
        compact = float(edge.sum()) / max(float(dense_mask_ref.sum()), 1.0)
        rest = mask & ~dense_mask_ref
        contrast = (float(arr[dense_mask_ref].mean()) -
                    (float(arr[rest].mean()) if rest.any() else 0.0))
    else:
        compact, contrast = 0.0, 0.0
    feats += [compact, contrast]

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
        raise RuntimeError("feature length %d != expected %d" % (out.shape[0], N_FEATURES))
    return np.nan_to_num(out, nan=0.0, posinf=0.0, neginf=0.0)


# ============================================================
# SPRINT 6 FEATURES  (identical to s6_10 / s6_11 / s6_20)
# ============================================================

GRID_LEVELS = 32


def grid_features_array(arr, laterality, grid=4, min_tissue=0.25):
    """Same as s6_10_extract_grid.grid_features_array."""
    if str(laterality).upper().startswith("L"):
        arr = np.fliplr(arr)
    mask = breast_mask(arr)
    n = grid * grid
    gm, gs, gc, gh, gf = (np.full(n, np.nan, np.float32) for _ in range(5))
    rows = np.where(mask.mean(axis=1) > 0.01)[0]
    cols = np.where(mask.mean(axis=0) > 0.01)[0]
    if len(rows) >= grid and len(cols) >= grid:
        r_edges = np.linspace(rows[0], rows[-1] + 1, grid + 1).astype(int)
        c_edges = np.linspace(cols[0], cols[-1] + 1, grid + 1).astype(int)
        q = np.clip(arr * (GRID_LEVELS - 1), 0, GRID_LEVELS - 1).astype(np.uint8)
        for i in range(grid):
            for j in range(grid):
                c = i * grid + j
                sl = (slice(r_edges[i], r_edges[i + 1]),
                      slice(c_edges[j], c_edges[j + 1]))
                cm = mask[sl]
                if cm.size == 0:
                    continue
                frac = float(cm.mean())
                gf[c] = frac
                if frac < min_tissue:
                    continue
                v = arr[sl][cm]
                gm[c] = float(v.mean())
                gs[c] = float(v.std())
                if HAVE_SKIMAGE and min(cm.shape) >= 3:
                    qq = q[sl].copy()
                    qq[~cm] = 0
                    try:
                        g = graycomatrix(qq, distances=[1],
                                         angles=[0, np.pi / 4, np.pi / 2, 3 * np.pi / 4],
                                         levels=GRID_LEVELS, symmetric=True, normed=True)
                        gc[c] = float(np.nanmean(graycoprops(g, "contrast")))
                        gh[c] = float(np.nanmean(graycoprops(g, "homogeneity")))
                    except Exception:
                        pass
    tissue = arr[mask]
    v_std = float(tissue.std()) if tissue.size else np.nan
    return {"gm": gm, "gs": gs, "gc": gc, "gh": gh, "v": v_std}


def grid_exam_features(views):
    """views: {('L','CC'): grid dict, ...} -> hotspot, gridtex, texvar dicts.
    Same arithmetic as s6_11_grid_to_exam.exam_rows."""
    hs = {}
    for vp in ("CC", "MLO"):
        L, R = views.get(("L", vp)), views.get(("R", vp))
        for p, name in (("gm", "den"), ("gs", "tex")):
            col = "hs_%s_%s" % (name, vp.lower())
            if L is None or R is None:
                hs[col] = np.nan
                continue
            d = np.abs(np.asarray(L[p], float) - np.asarray(R[p], float))
            hs[col] = float(np.nanmax(d)) if np.isfinite(d).any() else np.nan
    allv = list(views.values())
    if allv:
        gc = np.concatenate([np.asarray(v["gc"], float) for v in allv])
        gh = np.concatenate([np.asarray(v["gh"], float) for v in allv])
        het = [np.nanstd(np.asarray(v["gm"], float)) for v in allv
               if np.isfinite(np.asarray(v["gm"], float)).sum() >= 2]
        gt = {"gt_contrast_mean": float(np.nanmean(gc)) if np.isfinite(gc).any() else np.nan,
              "gt_contrast_p90": float(np.nanpercentile(gc, 90)) if np.isfinite(gc).any() else np.nan,
              "gt_homog_mean": float(np.nanmean(gh)) if np.isfinite(gh).any() else np.nan,
              "gt_heterogeneity": float(np.mean(het)) if het else np.nan}
        gs = np.concatenate([np.asarray(v["gs"], float) for v in allv])
        tv = {"tv_img_mean": float(np.nanmean([v["v"] for v in allv])),
              "tv_cell_mean": float(np.nanmean(gs)) if np.isfinite(gs).any() else np.nan}
    else:
        gt = dict.fromkeys(["gt_contrast_mean", "gt_contrast_p90",
                            "gt_homog_mean", "gt_heterogeneity"], np.nan)
        tv = dict.fromkeys(["tv_img_mean", "tv_cell_mean"], np.nan)
    return {"hotspot": hs, "gridtex": gt, "texvar": tv}


def curve_value(age, curve_ages, curve_vals):
    return np.interp(np.asarray(age, float), curve_ages, curve_vals)


def _slope(t, v):
    t, v = np.asarray(t, float), np.asarray(v, float)
    ok = np.isfinite(t) & np.isfinite(v)
    if ok.sum() < 2 or np.ptp(t[ok]) <= 0:
        return np.nan
    return float(np.polyfit(t[ok], v[ok], 1)[0])


def trend_features(t_years, dens_l, dens_r, ages, curve_ages, curve_vals,
                   min_span=0.5):
    """Same as s6_20_density_trend.trend_features."""
    t = np.asarray(t_years, float)
    dl, dr = np.asarray(dens_l, float), np.asarray(dens_r, float)
    ag = np.asarray(ages, float)
    cur = [x for x in (dl[-1], dr[-1]) if np.isfinite(x)]
    out = {"dens_cur_mean": float(np.mean(cur)) if cur else np.nan,
           "dens_cur_absdiff": float(abs(dl[-1] - dr[-1]))
           if np.isfinite(dl[-1]) and np.isfinite(dr[-1]) else np.nan}
    devs = []
    for d in (dl, dr):
        ok = np.isfinite(t) & np.isfinite(d) & np.isfinite(ag)
        if ok.sum() < 2 or np.ptp(t[ok]) < min_span:
            devs.append(np.nan)
            continue
        obs = _slope(t[ok], d[ok])
        exp = _slope(t[ok], curve_value(ag[ok], curve_ages, curve_vals))
        devs.append(obs - exp if np.isfinite(obs) and np.isfinite(exp) else np.nan)
    fin = [x for x in devs if np.isfinite(x)]
    out["dtr_dev_max"] = float(max(fin)) if fin else np.nan
    out["dtr_dev_mean"] = float(np.mean(fin)) if fin else np.nan
    out["dtr_dev_absdiff"] = (float(abs(devs[0] - devs[1]))
                              if all(np.isfinite(devs)) else np.nan)
    return out


# ============================================================
# QUANTUM CIRCUIT AND RISK HEAD
# ============================================================

class QuantumEncoder(nn.Module):
    """Data re-uploading circuit; readout = 12 <Z> + 12 neighbouring <ZZ>."""

    def __init__(self, n_qubits=12, n_blocks=5, seed=42,
                 device="default.qubit", diff_method="backprop"):
        super().__init__()
        self.n_qubits, self.n_blocks = n_qubits, n_blocks
        self.batched = (diff_method == "backprop")
        g = torch.Generator().manual_seed(seed)
        self.enc_scale = nn.Parameter(torch.ones(n_blocks, n_qubits))
        self.enc_shift = nn.Parameter(torch.zeros(n_blocks, n_qubits))
        self.theta = nn.Parameter(0.1 * torch.randn(n_blocks, n_qubits, 3, generator=g))
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


class RiskHead(nn.Module):
    """Same as 07_train_sequential_backbone.RiskHead."""

    def __init__(self, readout_dim, n_horizons=5, n_asym=6, n_extra=0,
                 use_timing=False, hidden=32):
        super().__init__()
        self.use_timing = use_timing
        self.n_extra = n_extra
        d = readout_dim * 3 + n_asym + n_extra + (3 if use_timing else 0)
        self.net = nn.Sequential(nn.Linear(d, hidden), nn.ReLU(),
                                 nn.Linear(hidden, n_horizons))

    def forward(self, cur, rec, dlt, scal, asym, extra=None):
        parts = [cur, rec, dlt, asym]
        if self.use_timing:
            parts.insert(3, scal)
        if self.n_extra:
            parts.append(extra)
        return self.net(torch.cat(parts, dim=-1))


def cumulative_risk(hazard_logits):
    """h_t -> F_t = 1 - prod(1 - h_j). Monotone non-decreasing by construction."""
    h = torch.sigmoid(hazard_logits)
    return 1.0 - torch.cumprod(1.0 - h + 1e-8, dim=1)


# ============================================================
# CONTRACT
# ============================================================

def initialise():
    """Load the artifact and rebuild the circuit and heads. Runs once."""
    global _loaded, _artifacts, _backbone, _encoder, _heads, _extra_mu, _extra_sd

    if _loaded:
        return
    if not ARTIFACTS_PATH.exists():
        raise FileNotFoundError(
            "model artifact not found: %s\n"
            "Put QeSFRP_V0.4.1.pkl in models/, or set QESFRP_ARTIFACTS." % ARTIFACTS_PATH)

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
    enc.eval()
    _encoder = enc

    cfg = _artifacts.get("head_config") or {
        "readout_dim": _backbone["readout_dim"], "n_horizons": len(_artifacts["horizons"]),
        "n_asym": 6, "n_extra": 0, "hidden": 32,
        "use_timing": not _artifacts.get("drop_timing", True)}
    states = _artifacts.get("heads")
    if not states:
        # V0.2 / V0.3 layout: model_state with encoder.* and head.* keys
        ms = _artifacts["model_state"]
        states = [{"net." + k[len("head."):]: v for k, v in ms.items()
                   if k.startswith("head.")}]
    _heads = []
    for st in states:
        h = RiskHead(cfg["readout_dim"], cfg["n_horizons"], cfg["n_asym"],
                     cfg["n_extra"], cfg["use_timing"], cfg.get("hidden", 32))
        h.load_state_dict(st)
        h.eval()
        _heads.append(h)

    en = _artifacts.get("extra_norm") or {}
    _extra_mu = np.asarray(en.get("mean", []), np.float32)
    _extra_sd = np.asarray(en.get("std", []), np.float32)
    if len(_extra_mu) != cfg["n_extra"]:
        raise RuntimeError("artifact extra_norm has %d entries, head expects %d"
                           % (len(_extra_mu), cfg["n_extra"]))
    _loaded = True


def health():
    return {
        "status": "ok" if _loaded else "model_not_loaded",
        "model_loaded": _loaded,
        "artifact": ARTIFACTS_PATH.name,
        "version": _artifacts.get("version", "0.3 or earlier"),
        "feature_set": _artifacts.get("feature_set", "baseline"),
        "n_qubits": _backbone.get("n_qubits"),
        "n_blocks": _backbone.get("n_blocks"),
        "heads": len(_heads),
        "extra_inputs": len(_extra_mu) if _extra_mu is not None else 0,
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


def _kinds():
    return {e["kind"] for e in _artifacts.get("extra_spec") or []}


def _encode(vec):
    """Exam vector -> quantum readout, via the training transform chain."""
    x = _backbone["quantile_transformer"].transform(vec.reshape(1, -1))
    x = np.nan_to_num(x, nan=0.0, posinf=0.0, neginf=0.0)
    if _backbone.get("pca") is not None:
        x = _backbone["pca"].transform(x)
    x = x[:, _backbone["selected_feature_idx"]]
    x = np.clip(_backbone["angle_scaler"].transform(x), -3, 3) * (np.pi / 3)
    with torch.no_grad():
        return _encoder(torch.tensor(x, dtype=torch.float32))[0].numpy()


def _build_exam(exam):
    """One exam -> dict with exam vector, readout and Sprint 6 inputs, or None
    when fewer than two views are readable (no left-right comparison)."""
    views = exam.get("views") or {}
    kinds = _kinds()
    need_grid = bool(kinds & {"hotspot", "gridtex", "texvar"})
    grid_cfg = (_artifacts.get("deploy") or {}).get("grid", {"grid": 4, "min_tissue": 0.25})
    got, grids = {}, {}
    for vk in VIEW_KEYS:
        raw = views.get(vk)
        if not raw:
            continue
        lat = "L" if vk.startswith("L") else "R"
        try:
            arr = load_array(raw)
            got[vk] = descriptors_from_array(arr, lat)
            if need_grid:
                grids[(lat, vk.split("-")[1])] = grid_features_array(
                    arr, lat, grid_cfg["grid"], grid_cfg["min_tissue"])
        except Exception:
            continue
    if len(got) < 2:
        return None

    fill = np.mean(np.vstack(list(got.values())), axis=0)
    v = {vk: got.get(vk, fill) for vk in VIEW_KEYS}
    cc_asym = np.abs(v["L-CC"] - v["R-CC"])
    mlo_asym = np.abs(v["L-MLO"] - v["R-MLO"])
    vec = np.concatenate([
        np.mean(np.vstack([v[k] for k in VIEW_KEYS]), axis=0),
        0.5 * (v["L-CC"] + v["R-CC"]), 0.5 * (v["L-MLO"] + v["R-MLO"]),
        cc_asym, mlo_asym]).astype(np.float32)

    out = {"vec": vec, "z": _encode(vec),
           "asym_cc": float(cc_asym.mean()), "asym_mlo": float(mlo_asym.mean()),
           "views_present": len(got)}

    if "density_trend" in kinds:
        dm = _artifacts["deploy"]["density"]
        cls = np.asarray(dm["classes"], float)
        dens = {}
        for side in ("L", "R"):
            X = [got[k] for k in VIEW_KEYS if k.startswith(side) and k in got]
            if X:
                p = dm["model"].predict_proba(np.vstack(X))
                dens[side] = float(((p * cls).sum(1)).mean())
            else:
                dens[side] = np.nan
        out["dens_L"], out["dens_R"] = dens["L"], dens["R"]
    if need_grid:
        out["grid"] = grid_exam_features(grids)
    return out


def _exam_table(built, i, age_latest, latest):
    """Exam-level extra tables for built[i], using only exams up to i."""
    tables = {}
    kinds = _kinds()
    if "density_trend" in kinds:
        dm = _artifacts["deploy"]["density"]
        hmax = int(dm["params"].get("max_history", 5))
        w = built[max(0, i - hmax + 1):i + 1]
        t = np.array([(b["date"] - pd.Timestamp("2000-01-01")).days / 365.25 for b in w])
        ages = (np.array([age_latest - (latest - b["date"]).days / 365.25 for b in w])
                if age_latest is not None else np.full(len(w), np.nan))
        tables["density_trend"] = trend_features(
            t, [b["dens_L"] for b in w], [b["dens_R"] for b in w], ages,
            np.asarray(dm["curve_ages"], float), np.asarray(dm["curve_vals"], float),
            float(dm["params"].get("min_span", 0.5)))
    if "grid" in built[i]:
        tables.update(built[i]["grid"])
    return tables


def _extra_vector(built, age_latest):
    """Standardised extra inputs for the LAST exam of `built`, mirroring
    07_train_sequential_backbone.extra_raw + standardisation."""
    spec = _artifacts.get("extra_spec") or []
    if not spec:
        return np.zeros(0, np.float32)
    latest = built[-1]["date"]
    n = len(built)
    cur_tab = _exam_table(built, n - 1, age_latest, latest)
    vals = []
    for e in spec:
        cols = e["columns"]
        src = cur_tab.get(e["kind"], {})
        cur = np.array([src.get(c, np.nan) for c in cols], np.float32)
        vals.append(cur)
        if e["mode"] == "cur_delta":
            first = None
            for j in range(n - 1):
                tj = _exam_table(built, j, age_latest, latest).get(e["kind"], {})
                v = np.array([tj.get(c, np.nan) for c in cols], np.float32)
                if np.isfinite(v).all():
                    first = v
                    break
            vals.append(cur - first if first is not None
                        else np.full(len(cols), np.nan, np.float32))
        vals.append(np.array([float(not np.isfinite(cur).all())], np.float32))
    raw = np.concatenate(vals)
    z = np.clip((raw - _extra_mu) / _extra_sd, -5, 5)
    return np.nan_to_num(z, nan=0.0).astype(np.float32)


def _predict(built, age_latest):
    """Built exams (date-sorted) -> raw yearly risk %, before calibration."""
    lam = float(_artifacts.get("recency_lambda", 0.5))
    built = built[-int(_artifacts.get("max_history", 5)):]
    Z = np.vstack([b["z"] for b in built])
    latest = built[-1]["date"]
    yb = np.array([(latest - b["date"]).days / 365.25 for b in built], dtype=np.float32)
    w = np.exp(-lam * yb)
    w = w / w.sum()
    cur = Z[-1]
    rec = (Z * w[:, None]).sum(0)
    dlt = (cur - Z[0]) if len(built) > 1 else np.zeros_like(cur)

    a_tot = np.array([b["asym_cc"] + b["asym_mlo"] for b in built], np.float32)
    norm = _artifacts.get("asym_norm")
    if norm:                       # v0.4: population statistics from training
        a_mu, a_sd = float(norm["mean"]), float(norm["std"])
    else:                          # v0.3 behaviour, kept for old artifacts
        a_mu, a_sd = float(a_tot.mean()), float(a_tot.std() + 1e-8)
    cur_a = float(a_tot[-1])
    if len(built) > 1:
        first = float(a_tot[0])
        rel = (cur_a - first) / max(abs(first), 1e-6)
        slope = (cur_a - first) / max(float(yb[0]), 0.5)
        step = float(a_tot[-1] - a_tot[-2])
    else:
        rel = slope = step = 0.0
    asym = np.nan_to_num(np.array([
        (cur_a - a_mu) / a_sd, np.clip(rel, -3, 3),
        np.clip(slope / a_sd, -3, 3), np.clip(step / a_sd, -3, 3),
        1.0 if rel > RISE else 0.0,
        (built[-1]["asym_cc"] - built[-1]["asym_mlo"]) / a_sd], dtype=np.float32),
        nan=0.0, posinf=0.0, neginf=0.0)
    scal = np.array([len(built), float(yb[0]), float(yb.mean())], dtype=np.float32)
    extra = _extra_vector(built, age_latest)

    t = lambda a: torch.tensor(a, dtype=torch.float32).unsqueeze(0)
    with torch.no_grad():
        curves = [cumulative_risk(h(t(cur), t(rec), t(dlt), t(scal), t(asym),
                                    t(extra) if len(extra) else None)).numpy()[0]
                  for h in _heads]
    risk = np.mean(curves, axis=0)
    return {"%d_year" % hz: float(r) * 100.0
            for hz, r in zip(_artifacts["horizons"], risk)}


def _calibrate(d):
    """Isotonic, fitted on out-of-fold predictions; monotone, so the ordering
    of patients is unchanged and only the scale is corrected."""
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


def _build_all(model_input):
    exams_in = model_input.get("exams") or []
    if not exams_in:
        raise ValueError("at least one exam is required")
    built, skipped = [], []
    for i, ex in enumerate(exams_in):
        eid = ex.get("exam_id") or ("exam_%d" % (i + 1))
        date = ex.get("exam_date")
        b = _build_exam(ex)
        if b is None:
            skipped.append({"exam_id": eid, "exam_date": date,
                            "contribution_percent": None})
            continue
        b.update({"exam_id": eid, "exam_date": date, "date": pd.to_datetime(date)})
        built.append(b)
    if not built:
        raise ValueError("no exam had at least two readable views")
    built.sort(key=lambda b: b["date"])
    return built, skipped


def predict_raw(model_input):
    """Uncalibrated risk % with no age multiplier. For the parity test only."""
    initialise()
    built, _ = _build_all(model_input)
    age = model_input.get("patient_age")
    return _predict(built, float(age) if age is not None else None)


# ------------------------------------------------------------- entrypoint

def run_inference(model_input):
    initialise()
    age = model_input.get("patient_age")
    age = float(age) if age is not None else None
    built, skipped = _build_all(model_input)

    yearly = _finalise(_predict(built, age), age)
    r5 = yearly.get("5_year", list(yearly.values())[-1])

    # Per-exam contribution by leave-one-out on the 5-year figure. Readouts
    # are cached per exam, so each ablation is only the head. The patient's
    # age belongs to her latest exam; if that exam is left out, her age at the
    # new latest exam is shifted back by the gap.
    contributions = {}
    if len(built) > 1:
        drops = {}
        for b in built:
            others = [x for x in built if x is not b]
            a2 = (age - (built[-1]["date"] - others[-1]["date"]).days / 365.25
                  if age is not None else None)
            without = _finalise(_predict(others, a2), age)
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
