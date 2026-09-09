

import io
import os
from pathlib import Path
from functools import lru_cache

import numpy as np
import torch
import torch.nn as nn
from PIL import Image
from torchvision import models, transforms

from fastapi import APIRouter, Request, HTTPException

# --------------------------------------------------------------------------- #
# Config
# --------------------------------------------------------------------------- #

_MODELS_DIR = Path(__file__).resolve().parent / "models"
CNN_MODEL_PATH = os.getenv(
    "CNN_MODEL_PATH", str(_MODELS_DIR / "best_resnet50_embed_5yr_risk.pth")
)
LSTM_MODEL_PATH = os.getenv(
    "LSTM_MODEL_PATH", str(_MODELS_DIR / "best_lstm_future_risk.pth")
)

VIEW_SLOTS = ["L_CC", "R_CC", "L_MLO", "R_MLO"]
RISK_KEYS = ["risk_1yr", "risk_2yr", "risk_3yr", "risk_4yr", "risk_5yr"]
MAX_SESSIONS = 5
CNN_FEATURE_DIM = 2048
LSTM_INPUT_DIM = 6149  # 2048*3 + 4 (mask) + 1 (recency)

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")


# --------------------------------------------------------------------------- #
# Model definition (must match notebook 07 exactly for weight loading)
# --------------------------------------------------------------------------- #

class FutureRiskLSTM(nn.Module):
    def __init__(
        self,
        input_size=6149,
        compressed_size=256,
        hidden_size=128,
        num_layers=1,
        output_size=5,
        dropout=0.3,
    ):
        super().__init__()
        self.feature_compressor = nn.Sequential(
            nn.Linear(input_size, compressed_size),
            nn.ReLU(),
            nn.Dropout(dropout),
        )
        self.lstm = nn.LSTM(
            input_size=compressed_size,
            hidden_size=hidden_size,
            num_layers=num_layers,
            batch_first=True,
        )
        self.output_head = nn.Sequential(
            nn.Linear(hidden_size, 64),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(64, output_size),
        )

    def forward(self, x, mask):
        x = self.feature_compressor(x)
        lstm_output, _ = self.lstm(x)
        lengths = mask.sum(dim=1).long()
        last_indices = lengths - 1
        batch_indices = torch.arange(x.size(0), device=x.device)
        last_outputs = lstm_output[batch_indices, last_indices]
        return self.output_head(last_outputs)


# --------------------------------------------------------------------------- #
# Predictor: loads both models once, holds all inference logic
# --------------------------------------------------------------------------- #

class FutureRiskPredictor:
    def __init__(self, cnn_path: str, lstm_path: str, device: torch.device):
        self.device = device

        # --- ResNet50 feature extractor (final FC stripped) ---
        cnn = models.resnet50(weights=None)
        num_features = cnn.fc.in_features
        cnn.fc = nn.Sequential(nn.Dropout(0.5), nn.Linear(num_features, 5))
        cnn.load_state_dict(torch.load(cnn_path, map_location=device))
        cnn = cnn.to(device).eval()
        self.feature_extractor = nn.Sequential(*list(cnn.children())[:-1])
        self.feature_extractor = self.feature_extractor.to(device).eval()

        # --- LSTM ---
        self.lstm = FutureRiskLSTM().to(device)
        self.lstm.load_state_dict(torch.load(lstm_path, map_location=device))
        self.lstm.eval()

        self.transform = transforms.Compose([
            transforms.Resize((512, 512)),
            transforms.ToTensor(),
            transforms.Normalize(
                mean=[0.485, 0.456, 0.406],
                std=[0.229, 0.224, 0.225],
            ),
        ])

    # ---- image -> 2048 feature ----
    def extract_image_feature(self, image: Image.Image) -> np.ndarray:
        x = self.transform(image.convert("RGB")).unsqueeze(0).to(self.device)
        with torch.no_grad():
            feat = self.feature_extractor(x)
            feat = feat.view(feat.size(0), -1)
        return feat.cpu().numpy().squeeze()

    # ---- {slot: 2048 feature} -> 6149 exam vector ----
    @staticmethod
    def build_session_feature(view_features: dict, recency_weight: float) -> np.ndarray:
        view_mask = [0 if view_features.get(s) is None else 1 for s in VIEW_SLOTS]

        available = [f for f in view_features.values() if f is not None]
        if not available:
            raise ValueError("Session must contain at least one valid image.")
        exam_feature = np.mean(available, axis=0)

        zero = np.zeros(CNN_FEATURE_DIM)
        lcc, rcc = view_features.get("L_CC"), view_features.get("R_CC")
        lmlo, rmlo = view_features.get("L_MLO"), view_features.get("R_MLO")

        cc_asym = np.abs(lcc - rcc) if (lcc is not None and rcc is not None) else zero
        mlo_asym = np.abs(lmlo - rmlo) if (lmlo is not None and rmlo is not None) else zero

        return np.concatenate([
            exam_feature, cc_asym, mlo_asym,
            np.array(view_mask, dtype=float),
            np.array([recency_weight], dtype=float),
        ])

    @staticmethod
    def recency_weights(exam_dates) -> np.ndarray:
        import pandas as pd
        dates = [pd.to_datetime(d) for d in exam_dates]
        latest = max(dates)
        w = np.array([
            np.exp(-0.5 * ((latest - d).days / 365.25)) for d in dates
        ])
        return w / w.sum()

    @staticmethod
    def age_weight(age):
        if age is None:
            return 1.0
        if age < 40:
            return 0.90
        if age < 50:
            return 1.00
        if age < 60:
            return 1.10
        if age < 70:
            return 1.20
        return 1.30

    # ---- run LSTM on a list of {slot: feature} sessions ----
    def _predict_from_session_features(self, session_view_features, recency_w, age):
        seq = np.stack([
            self.build_session_feature(vf, float(w))
            for vf, w in zip(session_view_features, recency_w)
        ]).astype(np.float32)

        seq_t = torch.tensor(seq, dtype=torch.float32).unsqueeze(0).to(self.device)
        mask_t = torch.ones((1, seq.shape[0]), dtype=torch.float32).to(self.device)

        with torch.no_grad():
            probs = torch.sigmoid(self.lstm(seq_t, mask_t)).cpu().numpy().squeeze()

        aw = self.age_weight(age)
        adj = np.clip(probs * aw, 0, 1)
        out = {k: float(adj[i]) for i, k in enumerate(RISK_KEYS)}
        out["age_weight"] = float(aw)
        return out

    # ---- full frontend payload (mirrors notebook frontend_ready_prediction) ----
    def predict(self, sessions, age=None):

        if not sessions:
            raise ValueError("At least one session with one valid image is required.")

        recency_w = self.recency_weights([s["exam_date"] for s in sessions])
        view_feats = [s["features"] for s in sessions]

        base = self._predict_from_session_features(view_feats, recency_w, age)

        # ---- occlusion contributions (feature-level, no CNN re-run) ----
        contribution_rows = []
        for s_idx, feats in enumerate(view_feats):
            present = [v for v in VIEW_SLOTS if feats.get(v) is not None]
            if len(present) <= 1:
                continue  # removing the only image would empty the session
            for slot in present:
                modified = [dict(f) for f in view_feats]
                modified[s_idx][slot] = None
                mod = self._predict_from_session_features(modified, recency_w, age)
                row = {
                    "session": s_idx + 1,
                    "exam_date": str(sessions[s_idx]["exam_date"]),
                    "view": slot,
                }
                for k in RISK_KEYS:
                    row[k + "_contribution"] = base[k] - mod[k]
                contribution_rows.append(row)

        # relative % per year
        for k in RISK_KEYS:
            col = k + "_contribution"
            pct = k + "_relative_contribution_percent"
            total = sum(abs(r[col]) for r in contribution_rows)
            for r in contribution_rows:
                r[pct] = 0.0 if total == 0 else abs(r[col]) / total * 100

        # session-level rollup
        session_contrib = {}
        pct_cols = [k + "_relative_contribution_percent" for k in RISK_KEYS]
        for r in contribution_rows:
            key = (r["session"], r["exam_date"])
            acc = session_contrib.setdefault(
                key, {"session": r["session"], "exam_date": r["exam_date"],
                      **{c: 0.0 for c in pct_cols}}
            )
            for c in pct_cols:
                acc[c] += r[c]

        risk_predictions = {
            f"{i+1}_year": f"{base[RISK_KEYS[i]] * 100:.2f}%" for i in range(5)
        }
        final_5yr = base["risk_5yr"]
        category = "Low" if final_5yr < 0.30 else "Moderate" if final_5yr < 0.60 else "High"

        sessions_summary = []
        for i, feats in enumerate(view_feats, start=1):
            avail = [v for v in VIEW_SLOTS if feats.get(v) is not None]
            sessions_summary.append({
                "session": i,
                "exam_date": str(sessions[i - 1]["exam_date"]),
                "available_views": avail,
                "num_available_views": len(avail),
            })

        contribution_columns = ["session", "exam_date", "view"] + pct_cols
        image_contributions = [
            {c: (round(r[c], 2) if isinstance(r[c], float) else r[c])
             for c in contribution_columns}
            for r in contribution_rows
        ]
        session_contributions = [
            {k: (round(v, 2) if isinstance(v, float) else v) for k, v in acc.items()}
            for acc in session_contrib.values()
        ]

        return {
            "patient_age": age,
            "age_weight": base["age_weight"],
            "num_sessions_used": len(sessions),
            "max_sessions_allowed": MAX_SESSIONS,
            "sessions_used": sessions_summary,
            "risk_predictions": risk_predictions,
            "session_contributions": session_contributions,
            "risk_category": category,
            "image_contributions": image_contributions,
        }


@lru_cache(maxsize=1)
def get_predictor() -> FutureRiskPredictor:
    """Lazy singleton so models load once on first request, not at import."""
    return FutureRiskPredictor(CNN_MODEL_PATH, LSTM_MODEL_PATH, DEVICE)


# --------------------------------------------------------------------------- #
# FastAPI router
# --------------------------------------------------------------------------- #

router = APIRouter(prefix="/future-risk", tags=["future-risk"])


@router.post("")
async def predict_future_risk(request: Request):
 
    form = await request.form()

    age = form.get("age")
    age = int(age) if age not in (None, "") else None

    predictor = get_predictor()

    # group fields by session index
    raw_sessions = {}
    for key in form.keys():
        if not key.startswith("s") or "_" not in key:
            continue
        idx_str, _, rest = key[1:].partition("_")
        if not idx_str.isdigit():
            continue
        i = int(idx_str)
        bucket = raw_sessions.setdefault(i, {"exam_date": None, "files": {}})
        if rest == "date":
            bucket["exam_date"] = form.get(key)
        elif rest in VIEW_SLOTS:
            bucket["files"][rest] = form.get(key)

    # build sessions with extracted features
    sessions = []
    for i in sorted(raw_sessions):
        b = raw_sessions[i]
        if b["exam_date"] is None or not b["files"]:
            continue
        features = {slot: None for slot in VIEW_SLOTS}
        for slot, upload in b["files"].items():
            data = await upload.read()
            img = Image.open(io.BytesIO(data))
            features[slot] = predictor.extract_image_feature(img)
        if all(v is None for v in features.values()):
            continue
        sessions.append({"exam_date": b["exam_date"], "features": features})

    if not sessions:
        raise HTTPException(
            status_code=400,
            detail="At least one session with a valid exam_date and image is required.",
        )

    # sort oldest->newest, keep latest MAX_SESSIONS
    import pandas as pd
    sessions.sort(key=lambda s: pd.to_datetime(s["exam_date"]))
    if len(sessions) > MAX_SESSIONS:
        sessions = sessions[-MAX_SESSIONS:]

    try:
        return predictor.predict(sessions, age=age)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
