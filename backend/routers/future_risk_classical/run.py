
import json
import math
import os

from datetime import datetime

import io
from pathlib import Path
from functools import lru_cache

import numpy as np
import torch
import torch.nn as nn
from PIL import Image
from torchvision import models, transforms



_MODELS_DIR = Path(__file__).resolve().parent / "models"
 
LSTM_CHECKPOINT_PATH = os.getenv(
    "CLASSICAL_LSTM_CHECKPOINT",
    str(_MODELS_DIR / "lstm_baseline_15691343.pt"),
)
RESNET_WEIGHTS_PATH = os.getenv(
    "CLASSICAL_RESNET_WEIGHTS",
    str(_MODELS_DIR / "resnet50-11ad3fa6.pth"),
)

VIEW_SLOTS = ["L_CC", "R_CC", "L_MLO", "R_MLO"]
RISK_KEYS = ["risk_1yr", "risk_2yr", "risk_3yr", "risk_4yr", "risk_5yr"]
IMAGE_FEATURE_SIZE = 2048
EXAM_FEATURE_SIZE = 6149
MAX_SESSIONS = 5
MIN_SESSIONS = 2
RECENCY_DECAY_PER_YEAR = 0.5


class FutureRiskLSTM(nn.Module):
    def __init__(
        self,
        input_size=6149,
        compressed_size=256,
        hidden_size=128,
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
            num_layers=1,
            batch_first=True,
        )
        self.output_head = nn.Sequential(
            nn.Linear(hidden_size, 64),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(64, output_size),
        )

    def forward(self, inputs, sequence_mask):
        compressed = self.feature_compressor(inputs)
        lstm_output, _ = self.lstm(compressed)
        lengths = sequence_mask.sum(dim=1).long()
        last_valid_indices = lengths - 1
        batch_indices = torch.arange(inputs.size(0), device=inputs.device)
        last_valid_output = lstm_output[batch_indices, last_valid_indices]
        return self.output_head(last_valid_output)


IMAGE_TRANSFORM = transforms.Compose(
    [
        transforms.Grayscale(num_output_channels=3),
        transforms.Resize((512, 512)),
        transforms.ToTensor(),
        transforms.Normalize(
            mean=[0.485, 0.456, 0.406],
            std=[0.229, 0.224, 0.225],
        ),
    ]
)


@lru_cache(maxsize=1)
def _load():
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    resnet, lstm, ckpt = load_models(LSTM_CHECKPOINT_PATH, RESNET_WEIGHTS_PATH, device)
    return resnet, lstm, ckpt, device

def load_request(path):
    with open(path, "r", encoding="utf-8") as handle:
        request = json.load(handle)

    if not isinstance(request, dict):
        raise ValueError("The input JSON must contain an object.")

    sessions = request.get("sessions")
    if not isinstance(sessions, list):
        raise ValueError("The input JSON must contain a 'sessions' list.")
    if not MIN_SESSIONS <= len(sessions) <= MAX_SESSIONS:
        raise ValueError("The baseline requires between 2 and 5 sessions.")

    parsed = []
    used_paths = set()

    for source_position, session in enumerate(sessions, start=1):
        if not isinstance(session, dict):
            raise ValueError(f"Session {source_position} must be an object.")

        date_text = session.get("exam_date")
        if not isinstance(date_text, str):
            raise ValueError(f"Session {source_position} has no valid exam_date.")
        try:
            exam_date = datetime.strptime(date_text, "%Y-%m-%d").date()
        except ValueError as error:
            raise ValueError(
                f"Session {source_position} exam_date must use YYYY-MM-DD."
            ) from error

        images = session.get("images")
        if not isinstance(images, dict):
            raise ValueError(f"Session {source_position} must contain an images object.")

        unknown_views = sorted(set(images) - set(VIEW_SLOTS))
        if unknown_views:
            raise ValueError(
                f"Session {source_position} contains unsupported views: {unknown_views}"
            )

        valid_images = {}
        for view_slot in VIEW_SLOTS:
            image_path = images.get(view_slot)
            if image_path in [None, ""]:
                continue
            if not isinstance(image_path, str):
                raise ValueError(
                    f"Session {source_position} {view_slot} path must be text."
                )
            image_path = os.path.abspath(os.path.expanduser(image_path))
            if not os.path.isfile(image_path):
                raise FileNotFoundError(f"Image was not found: {image_path}")
            if image_path in used_paths:
                raise ValueError(f"An image path was supplied more than once: {image_path}")
            used_paths.add(image_path)
            valid_images[view_slot] = image_path

        if not valid_images:
            raise ValueError(f"Session {source_position} has no available image.")

        parsed.append(
            {
                "source_position": source_position,
                "exam_date": exam_date,
                "exam_date_text": exam_date.isoformat(),
                "images": valid_images,
            }
        )

    if len({session["exam_date"] for session in parsed}) != len(parsed):
        raise ValueError("Each session must have a different exam_date.")

    parsed.sort(key=lambda item: item["exam_date"])
    return request.get("patient_id"), parsed


def select_device(requested):
    if requested == "cuda":
        if not torch.cuda.is_available():
            raise RuntimeError("CUDA was requested but is unavailable.")
        return torch.device("cuda")
    if requested == "cpu":
        return torch.device("cpu")
    return torch.device("cuda" if torch.cuda.is_available() else "cpu")


def load_models(checkpoint_path, resnet_weights_path, device):
    if not os.path.isfile(checkpoint_path):
        raise FileNotFoundError(f"LSTM checkpoint was not found: {checkpoint_path}")
    if not os.path.isfile(resnet_weights_path):
        raise FileNotFoundError(
            f"ResNet50 weights were not found: {resnet_weights_path}"
        )

    resnet = models.resnet50(weights=None)
    resnet_state = torch.load(resnet_weights_path, map_location="cpu")
    resnet.load_state_dict(resnet_state)
    resnet.fc = nn.Identity()
    for parameter in resnet.parameters():
        parameter.requires_grad = False
    resnet.to(device).eval()

    checkpoint = torch.load(checkpoint_path, map_location="cpu")
    lstm = FutureRiskLSTM(
        input_size=int(checkpoint["input_size"]),
        compressed_size=int(checkpoint["compressed_size"]),
        hidden_size=int(checkpoint["hidden_size"]),
        output_size=int(checkpoint["output_size"]),
        dropout=float(checkpoint["dropout"]),
    )
    lstm.load_state_dict(checkpoint["model_state_dict"])
    lstm.to(device).eval()
    return resnet, lstm, checkpoint


def extract_image_features(sessions, resnet, device, batch_size=8):
    items = []
    for session_index, session in enumerate(sessions):
        for view_slot in VIEW_SLOTS:
            path = session["images"].get(view_slot)
            if path is not None:
                items.append((session_index, view_slot, path))

    feature_cache = {}
    for start in range(0, len(items), batch_size):
        batch_items = items[start : start + batch_size]
        tensors = []
        for _, _, path in batch_items:
            with Image.open(path) as image:
                image = image.convert("L")
                tensors.append(IMAGE_TRANSFORM(image))

        image_batch = torch.stack(tensors).to(device)
        with torch.no_grad():
            batch_features = resnet(image_batch).detach().cpu().numpy().astype(np.float32)

        if batch_features.shape != (len(batch_items), IMAGE_FEATURE_SIZE):
            raise RuntimeError(f"Unexpected ResNet50 feature shape: {batch_features.shape}")
        if not np.isfinite(batch_features).all():
            raise RuntimeError("A non-finite ResNet50 feature was produced.")

        for item, feature in zip(batch_items, batch_features):
            session_index, view_slot, _ = item
            feature_cache[(session_index, view_slot)] = feature

    return feature_cache


def calculate_recency_weights(sessions):
    anchor_date = sessions[-1]["exam_date"]
    days_before_anchor = np.asarray(
        [(anchor_date - session["exam_date"]).days for session in sessions],
        dtype=np.float32,
    )
    if np.any(days_before_anchor < 0):
        raise RuntimeError("A session occurs after the selected anchor.")
    raw = np.exp(
        -RECENCY_DECAY_PER_YEAR * (days_before_anchor / 365.25)
    ).astype(np.float32)
    weights = raw / raw.sum()
    return days_before_anchor, weights.astype(np.float32)


def build_exam_feature(view_features, recency_weight):
    available = [
        view_features[slot]
        for slot in VIEW_SLOTS
        if view_features.get(slot) is not None
    ]
    if not available:
        raise ValueError("An examination cannot be built without an image feature.")

    mean_view = np.mean(np.stack(available), axis=0, dtype=np.float32)
    zero = np.zeros(IMAGE_FEATURE_SIZE, dtype=np.float32)

    if view_features.get("L_CC") is not None and view_features.get("R_CC") is not None:
        cc_asymmetry = np.abs(
            view_features["L_CC"] - view_features["R_CC"]
        ).astype(np.float32)
    else:
        cc_asymmetry = zero.copy()

    if (
        view_features.get("L_MLO") is not None
        and view_features.get("R_MLO") is not None
    ):
        mlo_asymmetry = np.abs(
            view_features["L_MLO"] - view_features["R_MLO"]
        ).astype(np.float32)
    else:
        mlo_asymmetry = zero.copy()

    view_mask = np.asarray(
        [1.0 if view_features.get(slot) is not None else 0.0 for slot in VIEW_SLOTS],
        dtype=np.float32,
    )
    result = np.concatenate(
        [
            mean_view,
            cc_asymmetry,
            mlo_asymmetry,
            view_mask,
            np.asarray([recency_weight], dtype=np.float32),
        ]
    ).astype(np.float32)

    if result.shape != (EXAM_FEATURE_SIZE,):
        raise RuntimeError(f"Unexpected examination feature shape: {result.shape}")
    if not np.isfinite(result).all():
        raise RuntimeError("A non-finite examination feature was produced.")
    return result


def build_sequence(sessions, feature_cache, removed_image=None):
    days_before_anchor, recency_weights = calculate_recency_weights(sessions)
    sequence = np.zeros((MAX_SESSIONS, EXAM_FEATURE_SIZE), dtype=np.float32)
    sequence_mask = np.zeros(MAX_SESSIONS, dtype=np.float32)

    for session_index, _ in enumerate(sessions):
        view_features = {}
        for view_slot in VIEW_SLOTS:
            cache_key = (session_index, view_slot)
            if removed_image == cache_key:
                view_features[view_slot] = None
            else:
                view_features[view_slot] = feature_cache.get(cache_key)
        sequence[session_index] = build_exam_feature(
            view_features,
            recency_weights[session_index],
        )
        sequence_mask[session_index] = 1.0

    return sequence, sequence_mask, days_before_anchor, recency_weights


def predict_scores(sequence, sequence_mask, lstm, device):
    sequence_tensor = torch.from_numpy(sequence).unsqueeze(0).to(device)
    mask_tensor = torch.from_numpy(sequence_mask).unsqueeze(0).to(device)
    with torch.no_grad():
        logits = lstm(sequence_tensor, mask_tensor)
        scores = torch.sigmoid(logits).squeeze(0).cpu().numpy().astype(float)
    if scores.shape != (5,) or not np.isfinite(scores).all():
        raise RuntimeError("The LSTM produced invalid scores.")
    return scores


def calculate_contributions(sessions, feature_cache, full_scores, lstm, device):
    image_rows = []
    skipped = []

    for session_index, session in enumerate(sessions):
        available_views = [
            slot for slot in VIEW_SLOTS if (session_index, slot) in feature_cache
        ]
        for view_slot in available_views:
            if len(available_views) <= 1:
                skipped.append(
                    {
                        "session": session_index + 1,
                        "exam_date": session["exam_date_text"],
                        "view": view_slot,
                        "reason": "Removing the only image would leave an empty session.",
                    }
                )
                continue

            sequence, mask, _, _ = build_sequence(
                sessions,
                feature_cache,
                removed_image=(session_index, view_slot),
            )
            ablated_scores = predict_scores(sequence, mask, lstm, device)
            changes = full_scores - ablated_scores
            row = {
                "session": session_index + 1,
                "exam_date": session["exam_date_text"],
                "view": view_slot,
                "score_without_image": {},
                "signed_score_change": {},
                "signed_percentage_point_change": {},
                "relative_absolute_influence_percent": {},
            }
            for index, key in enumerate(RISK_KEYS):
                row["score_without_image"][key] = float(ablated_scores[index])
                row["signed_score_change"][key] = float(changes[index])
                row["signed_percentage_point_change"][key] = float(changes[index] * 100.0)
            image_rows.append(row)

    for index, key in enumerate(RISK_KEYS):
        denominator = sum(
            abs(row["signed_score_change"][key]) for row in image_rows
        )
        for row in image_rows:
            if denominator == 0.0:
                relative = 0.0
            else:
                relative = abs(row["signed_score_change"][key]) / denominator * 100.0
            row["relative_absolute_influence_percent"][key] = float(relative)

    session_rows = []
    for session_index, session in enumerate(sessions):
        rows = [row for row in image_rows if row["session"] == session_index + 1]
        session_row = {
            "session": session_index + 1,
            "exam_date": session["exam_date_text"],
            "evaluated_images": len(rows),
            "total_images": len(session["images"]),
            "summed_signed_score_change": {},
            "summed_signed_percentage_point_change": {},
            "relative_absolute_influence_percent": {},
        }
        for key in RISK_KEYS:
            signed_sum = sum(row["signed_score_change"][key] for row in rows)
            relative_sum = sum(
                row["relative_absolute_influence_percent"][key] for row in rows
            )
            session_row["summed_signed_score_change"][key] = float(signed_sum)
            session_row["summed_signed_percentage_point_change"][key] = float(
                signed_sum * 100.0
            )
            session_row["relative_absolute_influence_percent"][key] = float(relative_sum)
        session_rows.append(session_row)

    return image_rows, session_rows, skipped


def round_floats(value, digits=6):
    if isinstance(value, float):
        if not math.isfinite(value):
            raise RuntimeError("Output contains a non-finite number.")
        return round(value, digits)
    if isinstance(value, dict):
        return {key: round_floats(item, digits) for key, item in value.items()}
    if isinstance(value, list):
        return [round_floats(item, digits) for item in value]
    return value


# new small helper, replaces the innards of extract_image_features
def _pil_to_feature(pil_image, resnet, device):
    tensor = IMAGE_TRANSFORM(pil_image.convert("L")).unsqueeze(0).to(device)
    with torch.no_grad():
        feat = resnet(tensor).detach().cpu().numpy().astype(np.float32).squeeze()
    if feat.shape != (IMAGE_FEATURE_SIZE,) or not np.isfinite(feat).all():
        raise RuntimeError("Bad ResNet feature.")
    return feat


# ===========================================================================
# PUBLIC DROP-IN ENGINE INTERFACE
# ===========================================================================

_INITIALISED = False


def initialise():
    """Required lifecycle hook. Loads/caches the current Classical models once."""
    global _INITIALISED
    if _INITIALISED:
        return

    _load()
    _INITIALISED = True


def health():
    return {
        "status": "ok" if _INITIALISED else "model_not_loaded",
        "model_loaded": _INITIALISED,
        "model_type": "ResNet50 + longitudinal LSTM",
    }


def run_inference(model_input):
    """Run the current Classical model using the shared model-input contract."""
    initialise()

    resnet, lstm, _ckpt, device = _load()

    input_exams = model_input["exams"]

    if not (MIN_SESSIONS <= len(input_exams) <= MAX_SESSIONS):
        raise ValueError(
            f"Between {MIN_SESSIONS} and {MAX_SESSIONS} valid sessions required "
            f"(got {len(input_exams)})."
        )

    model_sessions = []
    feature_cache = {}

    # request_parser already sorts chronologically
    for session_index, exam in enumerate(input_exams):
        available = {}

        for ui_view, image_bytes in exam["views"].items():
            if image_bytes is None:
                continue

            # Classical internals use underscore view keys.
            slot = ui_view.replace("-", "_")

            pil = Image.open(io.BytesIO(image_bytes))
            feature_cache[(session_index, slot)] = _pil_to_feature(
                pil, resnet, device
            )
            available[slot] = True

        if not available:
            raise ValueError(f'{exam["exam_id"]} contains no usable images.')

        exam_date = datetime.strptime(exam["exam_date"], "%Y-%m-%d").date()

        model_sessions.append(
            {
                "exam_date": exam_date,
                "exam_date_text": exam["exam_date"],
                "images": available,
            }
        )

    sequence, mask, _days_before_anchor, _recency_weights = build_sequence(
        model_sessions, feature_cache
    )

    scores = predict_scores(sequence, mask, lstm, device)

    _image_rows, session_rows, _skipped = calculate_contributions(
        model_sessions, feature_cache, scores, lstm, device
    )

    yearly_risk = {
        f"{index + 1}_year": float(scores[index] * 100.0)
        for index in range(5)
    }

    final_5yr_fraction = float(scores[4])
    risk_level = (
        "Low"
        if final_5yr_fraction < 0.30
        else "Moderate"
        if final_5yr_fraction < 0.60
        else "High"
    )

    exam_results = []

    for index, exam in enumerate(input_exams, start=1):
        matching = next(
            (row for row in session_rows if row["session"] == index),
            None,
        )

        contribution = (
            matching["relative_absolute_influence_percent"]["risk_5yr"]
            if matching
            else None
        )

        exam_results.append(
            {
                "exam_id": exam["exam_id"],
                "exam_date": exam["exam_date"],
                "contribution_percent": contribution,
            }
        )

    return {
        "yearly_risk": yearly_risk,
        "risk_level": risk_level,
        "exams": exam_results,
    }
