"""Drop-in frontend adapter for the Q-Interval-Lite+ V2C model.

Public integration contract:
    initialise()
    health()
    run_inference(model_input)

The module deliberately contains no FastAPI or HTTP-specific code.
"""

from __future__ import annotations

from datetime import datetime
from io import BytesIO
from pathlib import Path
from typing import Any

import numpy as np
import torch
from PIL import Image
from torch import nn
from torchvision import models, transforms


MODEL_DIRECTORY = Path(__file__).resolve().parent / "models"
CHECKPOINT_PATH = MODEL_DIRECTORY / "v2c_model.pt"
RESNET_WEIGHTS_PATH = MODEL_DIRECTORY / "resnet50-11ad3fa6.pth"

VIEW_SLOTS = ("L-CC", "R-CC", "L-MLO", "R-MLO")
IMAGE_FEATURE_SIZE = 2048
EXAM_FEATURE_SIZE = 6149
MIN_EXAMS = 2
MAX_EXAMS = 5
MIN_SESSIONS = MIN_EXAMS
MAX_SESSIONS = MAX_EXAMS
DAYS_PER_YEAR = 365.25
RECENCY_DECAY_PER_YEAR = 0.5

# Provisional research-only categories derived from repaired validation data.
LOW_MODERATE_THRESHOLD_PERCENT = 5.0
MODERATE_HIGH_THRESHOLD_PERCENT = 20.0

_loaded = False
_device: torch.device | None = None
_resnet: nn.Module | None = None
_model: "V2CStructuredHazardLSTM | None" = None


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


class V2CStructuredHazardLSTM(nn.Module):
    """Structured hazard LSTM matching the trained V2C checkpoint."""

    def __init__(
        self,
        input_size: int = 6149,
        global_embedding_size: int = 256,
        asymmetry_embedding_size: int = 128,
        view_embedding_size: int = 16,
        temporal_input_size: int = 2,
        temporal_embedding_size: int = 16,
        fusion_size: int = 256,
        hidden_size: int = 128,
        output_size: int = 5,
        dropout: float = 0.3,
    ) -> None:
        super().__init__()

        if input_size != EXAM_FEATURE_SIZE:
            raise ValueError("V2C requires the 6,149-feature examination layout.")
        if temporal_input_size != 2:
            raise ValueError("V2C requires two explicit temporal features.")

        self.global_encoder = nn.Sequential(
            nn.Linear(2048, global_embedding_size),
            nn.ReLU(),
            nn.Dropout(dropout),
        )
        self.cc_asymmetry_encoder = nn.Sequential(
            nn.Linear(2048, asymmetry_embedding_size),
            nn.ReLU(),
            nn.Dropout(dropout),
        )
        self.mlo_asymmetry_encoder = nn.Sequential(
            nn.Linear(2048, asymmetry_embedding_size),
            nn.ReLU(),
            nn.Dropout(dropout),
        )
        self.view_encoder = nn.Sequential(
            nn.Linear(4, view_embedding_size),
            nn.ReLU(),
            nn.Dropout(dropout),
        )
        self.timing_encoder = nn.Sequential(
            nn.Linear(3, temporal_embedding_size),
            nn.ReLU(),
            nn.Dropout(dropout),
        )

        fusion_input_size = (
            global_embedding_size
            + (2 * asymmetry_embedding_size)
            + view_embedding_size
            + temporal_embedding_size
        )
        self.fusion_encoder = nn.Sequential(
            nn.Linear(fusion_input_size, fusion_size),
            nn.ReLU(),
            nn.Dropout(dropout),
        )
        self.lstm = nn.LSTM(
            input_size=fusion_size,
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

    def forward(
        self,
        inputs: torch.Tensor,
        temporal_features: torch.Tensor,
        sequence_mask: torch.Tensor,
    ) -> torch.Tensor:
        expected_inputs = (inputs.shape[0], MAX_EXAMS, EXAM_FEATURE_SIZE)
        expected_temporal = (inputs.shape[0], MAX_EXAMS, 2)
        expected_mask = (inputs.shape[0], MAX_EXAMS)

        if tuple(inputs.shape) != expected_inputs:
            raise ValueError(
                f"Examination inputs have shape {tuple(inputs.shape)}, "
                f"expected {expected_inputs}."
            )
        if tuple(temporal_features.shape) != expected_temporal:
            raise ValueError(
                f"Temporal inputs have shape {tuple(temporal_features.shape)}, "
                f"expected {expected_temporal}."
            )
        if tuple(sequence_mask.shape) != expected_mask:
            raise ValueError(
                f"Sequence mask has shape {tuple(sequence_mask.shape)}, "
                f"expected {expected_mask}."
            )
        if not torch.isfinite(inputs).all():
            raise ValueError("Examination inputs must be finite.")
        if not torch.isfinite(temporal_features).all():
            raise ValueError("Temporal inputs must be finite.")
        if torch.any(temporal_features < 0):
            raise ValueError("Temporal inputs cannot be negative.")

        view_mask = inputs[..., 6144:6148]
        recency_weight = inputs[..., 6148:6149]
        if not torch.all((view_mask == 0) | (view_mask == 1)):
            raise ValueError("View-mask values must be zero or one.")
        if torch.any((recency_weight < 0) | (recency_weight > 1)):
            raise ValueError("Recency weights must be between zero and one.")

        valid_exam_mask = sequence_mask.unsqueeze(-1)
        timing_features = torch.cat(
            [recency_weight, torch.log1p(temporal_features)], dim=2
        )

        branches = [
            self.global_encoder(inputs[..., 0:2048]),
            self.cc_asymmetry_encoder(inputs[..., 2048:4096]),
            self.mlo_asymmetry_encoder(inputs[..., 4096:6144]),
            self.view_encoder(view_mask),
            self.timing_encoder(timing_features),
        ]
        branches = [branch * valid_exam_mask for branch in branches]
        fused = self.fusion_encoder(torch.cat(branches, dim=2))
        fused = fused * valid_exam_mask

        lstm_output, _ = self.lstm(fused)
        lengths = sequence_mask.sum(dim=1).long()
        if torch.any((lengths < MIN_EXAMS) | (lengths > MAX_EXAMS)):
            raise ValueError("Each patient must have two to five examinations.")

        batch_indices = torch.arange(inputs.size(0), device=inputs.device)
        last_output = lstm_output[batch_indices, lengths - 1]
        return self.output_head(last_output)

    def predict_risk(
        self,
        inputs: torch.Tensor,
        temporal_features: torch.Tensor,
        sequence_mask: torch.Tensor,
    ) -> dict[str, torch.Tensor]:
        logits = self.forward(inputs, temporal_features, sequence_mask)
        hazards = torch.sigmoid(logits)
        survival = torch.cumprod(1.0 - hazards, dim=1)
        cumulative_risk = 1.0 - survival
        return {
            "logits": logits,
            "hazards": hazards,
            "cumulative_risk": cumulative_risk,
        }


def initialise() -> None:
    """Load the feature extractor and V2C model once."""
    global _loaded, _device, _resnet, _model

    if _loaded:
        return

    if not CHECKPOINT_PATH.is_file():
        raise FileNotFoundError(f"V2C checkpoint not found: {CHECKPOINT_PATH}")
    if not RESNET_WEIGHTS_PATH.is_file():
        raise FileNotFoundError(
            f"ResNet50 weights not found: {RESNET_WEIGHTS_PATH}"
        )

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    resnet = models.resnet50(weights=None)
    resnet_state = torch.load(RESNET_WEIGHTS_PATH, map_location="cpu")
    resnet.load_state_dict(resnet_state)
    resnet.fc = nn.Identity()
    for parameter in resnet.parameters():
        parameter.requires_grad = False
    resnet.to(device).eval()

    checkpoint = torch.load(CHECKPOINT_PATH, map_location="cpu")
    if checkpoint.get("model_name") != "V2CStructuredHazardLSTM":
        raise ValueError("The checkpoint is not a V2CStructuredHazardLSTM model.")

    configuration = checkpoint["model_configuration"]
    model = V2CStructuredHazardLSTM(**configuration)
    model.load_state_dict(checkpoint["model_state_dict"], strict=True)
    model.to(device).eval()

    _device = device
    _resnet = resnet
    _model = model
    _loaded = True


def health() -> dict[str, Any]:
    return {
        "status": "ok" if _loaded else "model_not_loaded",
        "model_loaded": _loaded,
    }


def _parse_model_input(model_input: Any) -> list[dict[str, Any]]:
    if not isinstance(model_input, dict):
        raise ValueError("model_input must be an object.")

    exams = model_input.get("exams")
    if not isinstance(exams, list):
        raise ValueError("model_input must contain an exams list.")
    if not MIN_EXAMS <= len(exams) <= MAX_EXAMS:
        raise ValueError("V2C requires between two and five examinations.")

    parsed: list[dict[str, Any]] = []
    exam_ids: set[str] = set()
    exam_dates = set()

    for position, exam in enumerate(exams, start=1):
        if not isinstance(exam, dict):
            raise ValueError(f"Examination {position} must be an object.")

        exam_id = exam.get("exam_id")
        if not isinstance(exam_id, str) or not exam_id.strip():
            raise ValueError(f"Examination {position} has no valid exam_id.")
        if exam_id in exam_ids:
            raise ValueError(f"Duplicate exam_id: {exam_id}")
        exam_ids.add(exam_id)

        date_text = exam.get("exam_date")
        if not isinstance(date_text, str):
            raise ValueError(f"Examination {position} has no valid exam_date.")
        try:
            exam_date = datetime.strptime(date_text, "%Y-%m-%d").date()
        except ValueError as error:
            raise ValueError(
                f"Examination {position} exam_date must use YYYY-MM-DD."
            ) from error
        if exam_date in exam_dates:
            raise ValueError("Each examination must have a different date.")
        exam_dates.add(exam_date)

        views = exam.get("views")
        if not isinstance(views, dict):
            raise ValueError(f"Examination {position} must contain a views object.")
        unknown = sorted(set(views) - set(VIEW_SLOTS))
        if unknown:
            raise ValueError(f"Unsupported mammography views: {unknown}")

        valid_views: dict[str, bytes] = {}
        for view in VIEW_SLOTS:
            payload = views.get(view)
            if payload is None:
                continue
            if isinstance(payload, memoryview):
                payload = payload.tobytes()
            elif isinstance(payload, bytearray):
                payload = bytes(payload)
            if not isinstance(payload, bytes) or len(payload) == 0:
                raise ValueError(
                    f"Examination {position} view {view} must contain image bytes or None."
                )
            valid_views[view] = payload

        if not valid_views:
            raise ValueError(f"Examination {position} contains no mammogram image.")

        parsed.append(
            {
                "exam_id": exam_id,
                "exam_date": exam_date,
                "exam_date_text": exam_date.isoformat(),
                "views": valid_views,
            }
        )

    parsed.sort(key=lambda item: item["exam_date"])
    return parsed


def _extract_image_features(
    exams: list[dict[str, Any]], batch_size: int = 8
) -> dict[tuple[int, str], np.ndarray]:
    assert _resnet is not None and _device is not None

    items: list[tuple[int, str, bytes]] = []
    for exam_index, exam in enumerate(exams):
        for view in VIEW_SLOTS:
            payload = exam["views"].get(view)
            if payload is not None:
                items.append((exam_index, view, payload))

    feature_cache: dict[tuple[int, str], np.ndarray] = {}
    for start in range(0, len(items), batch_size):
        batch = items[start : start + batch_size]
        tensors = []
        for _, _, payload in batch:
            try:
                with Image.open(BytesIO(payload)) as image:
                    tensors.append(IMAGE_TRANSFORM(image.convert("L")))
            except Exception as error:
                raise ValueError("A supplied mammogram could not be decoded.") from error

        image_batch = torch.stack(tensors).to(_device)
        with torch.no_grad():
            features = _resnet(image_batch).detach().cpu().numpy().astype(np.float32)

        if features.shape != (len(batch), IMAGE_FEATURE_SIZE):
            raise RuntimeError(f"Unexpected image-feature shape: {features.shape}")
        if not np.isfinite(features).all():
            raise RuntimeError("Image feature extraction produced a non-finite value.")

        for (exam_index, view, _), feature in zip(batch, features):
            feature_cache[(exam_index, view)] = feature

    return feature_cache


def _recency_values(
    exams: list[dict[str, Any]],
) -> tuple[np.ndarray, np.ndarray]:
    anchor_date = exams[-1]["exam_date"]
    days_before_anchor = np.asarray(
        [(anchor_date - exam["exam_date"]).days for exam in exams],
        dtype=np.float32,
    )
    raw = np.exp(
        -RECENCY_DECAY_PER_YEAR * (days_before_anchor / DAYS_PER_YEAR)
    ).astype(np.float32)
    weights = raw / raw.sum()
    return days_before_anchor, weights.astype(np.float32)


def _build_exam_feature(
    view_features: dict[str, np.ndarray | None], recency_weight: float
) -> np.ndarray:
    available = [
        view_features[view]
        for view in VIEW_SLOTS
        if view_features.get(view) is not None
    ]
    if not available:
        raise ValueError("An examination cannot be built without an image.")

    mean_view = np.mean(np.stack(available), axis=0, dtype=np.float32)
    zero = np.zeros(IMAGE_FEATURE_SIZE, dtype=np.float32)

    if view_features.get("L-CC") is not None and view_features.get("R-CC") is not None:
        cc_asymmetry = np.abs(
            view_features["L-CC"] - view_features["R-CC"]
        ).astype(np.float32)
    else:
        cc_asymmetry = zero.copy()

    if (
        view_features.get("L-MLO") is not None
        and view_features.get("R-MLO") is not None
    ):
        mlo_asymmetry = np.abs(
            view_features["L-MLO"] - view_features["R-MLO"]
        ).astype(np.float32)
    else:
        mlo_asymmetry = zero.copy()

    view_mask = np.asarray(
        [1.0 if view_features.get(view) is not None else 0.0 for view in VIEW_SLOTS],
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
        raise RuntimeError(f"Unexpected examination-feature shape: {result.shape}")
    if not np.isfinite(result).all():
        raise RuntimeError("Examination feature construction produced a non-finite value.")
    return result


def _build_model_arrays(
    exams: list[dict[str, Any]],
    feature_cache: dict[tuple[int, str], np.ndarray],
    removed_image: tuple[int, str] | None = None,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    days_before_anchor, recency_weights = _recency_values(exams)
    sequence = np.zeros((MAX_EXAMS, EXAM_FEATURE_SIZE), dtype=np.float32)
    temporal = np.zeros((MAX_EXAMS, 2), dtype=np.float32)
    sequence_mask = np.zeros(MAX_EXAMS, dtype=np.float32)

    gap_days = np.zeros(len(exams), dtype=np.float32)
    if len(exams) > 1:
        gap_days[1:] = (
            days_before_anchor[:-1] - days_before_anchor[1:]
        )

    for exam_index in range(len(exams)):
        view_features: dict[str, np.ndarray | None] = {}
        for view in VIEW_SLOTS:
            key = (exam_index, view)
            view_features[view] = (
                None if removed_image == key else feature_cache.get(key)
            )

        sequence[exam_index] = _build_exam_feature(
            view_features, float(recency_weights[exam_index])
        )
        temporal[exam_index, 0] = gap_days[exam_index] / DAYS_PER_YEAR
        temporal[exam_index, 1] = days_before_anchor[exam_index] / DAYS_PER_YEAR
        sequence_mask[exam_index] = 1.0

    return sequence, temporal, sequence_mask


def _predict(
    sequence: np.ndarray,
    temporal: np.ndarray,
    sequence_mask: np.ndarray,
) -> np.ndarray:
    assert _model is not None and _device is not None

    sequence_tensor = torch.from_numpy(sequence).unsqueeze(0).to(_device)
    temporal_tensor = torch.from_numpy(temporal).unsqueeze(0).to(_device)
    mask_tensor = torch.from_numpy(sequence_mask).unsqueeze(0).to(_device)

    with torch.no_grad():
        prediction = _model.predict_risk(
            sequence_tensor,
            temporal_tensor,
            mask_tensor
        )

    risks = (
        prediction["cumulative_risk"]
        .squeeze(0)
        .cpu()
        .numpy()
        .astype(float)
    )

    print("\n================ MODEL DEBUG ================")
    print("SESSIONS:", int(sequence_mask.sum()))
    print("MASK:", sequence_mask)

    print("TEMPORAL:")
    print(temporal)

    print("LOGITS:")
    print(prediction["logits"].detach().cpu().numpy())

    print("HAZARDS:")
    print(prediction["hazards"].detach().cpu().numpy())

    print("CUMULATIVE:")
    print(prediction["cumulative_risk"].detach().cpu().numpy())

    print("=============================================\n")

    if risks.shape != (5,) or not np.isfinite(risks).all():
        raise RuntimeError("V2C produced invalid cumulative risks.")

    if np.any(risks < -1e-7) or np.any(risks > 1.0 + 1e-7):
        raise RuntimeError("V2C produced risks outside the interval [0, 1].")

    if np.any(np.diff(risks) < -1e-7):
        raise RuntimeError("V2C produced non-monotonic cumulative risks.")

    return np.clip(risks, 0.0, 1.0)

def _exam_contributions(
    exams: list[dict[str, Any]],
    feature_cache: dict[tuple[int, str], np.ndarray],
    full_risks: np.ndarray,
) -> list[float | None]:
    raw_impacts = np.zeros(len(exams), dtype=np.float64)
    evaluated = np.zeros(len(exams), dtype=bool)

    for exam_index, exam in enumerate(exams):
        available_views = [
            view for view in VIEW_SLOTS if (exam_index, view) in feature_cache
        ]
        if len(available_views) <= 1:
            continue

        for view in available_views:
            sequence, temporal, mask = _build_model_arrays(
                exams,
                feature_cache,
                removed_image=(exam_index, view),
            )
            ablated_risks = _predict(sequence, temporal, mask)
            raw_impacts[exam_index] += float(
                np.mean(np.abs(full_risks - ablated_risks))
            )
            evaluated[exam_index] = True

    total_impact = float(raw_impacts.sum())
    contributions: list[float | None] = []
    for index in range(len(exams)):
        if not evaluated[index]:
            contributions.append(None)
        elif total_impact == 0.0:
            contributions.append(0.0)
        else:
            contributions.append(100.0 * float(raw_impacts[index]) / total_impact)
    return contributions


def _risk_level(five_year_risk_percent: float) -> str:
    if five_year_risk_percent >= MODERATE_HIGH_THRESHOLD_PERCENT:
        return "high"
    if five_year_risk_percent >= LOW_MODERATE_THRESHOLD_PERCENT:
        return "moderate"
    return "low"


def run_inference(model_input: Any) -> dict[str, Any]:
    """Run V2C and return exactly the shared future-risk engine result."""
    initialise()
    exams = _parse_model_input(model_input)
    feature_cache = _extract_image_features(exams)
    sequence, temporal, sequence_mask = _build_model_arrays(exams, feature_cache)
    risks = _predict(sequence, temporal, sequence_mask)
    contributions = _exam_contributions(exams, feature_cache, risks)
    risk_percent = risks * 100.0

    result = {
        "yearly_risk": {
            "1_year": round(float(risk_percent[0]), 6),
            "2_year": round(float(risk_percent[1]), 6),
            "3_year": round(float(risk_percent[2]), 6),
            "4_year": round(float(risk_percent[3]), 6),
            "5_year": round(float(risk_percent[4]), 6),
        },
        "risk_level": _risk_level(float(risk_percent[4])),
        "exams": [
            {
                "exam_id": exam["exam_id"],
                "exam_date": exam["exam_date_text"],
                "contribution_percent": (
                    None
                    if contributions[index] is None
                    else round(float(contributions[index]), 6)
                ),
            }
            for index, exam in enumerate(exams)
        ],
    }
    return result
