"""Frontend-compatible inference adapter for Mammo-CLIP B5 V2D.

Public integration contract:
    initialise()
    health()
    run_inference(model_input)

This module is intentionally separate from the active V2C adapter until
deployment parity and performance tests have passed.
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

from .mammoclip.efficientnet_custom import EfficientNet
from .v2d_components import V2DSpatialMultiviewHazardLSTM


MODEL_DIRECTORY = Path(__file__).resolve().parent / "models"
MAMMOCLIP_CHECKPOINT_PATH = MODEL_DIRECTORY / "b5-model-best-epoch-7.tar"
V2D_CHECKPOINT_PATH = (
    MODEL_DIRECTORY / "final_selected_v2d_mammoclip_b5.pt"
)

VIEW_SLOTS = ("L-CC", "R-CC", "L-MLO", "R-MLO")
MAX_EXAMS = 5
MIN_EXAMS = 2
MIN_SESSIONS = MIN_EXAMS
MAX_SESSIONS = MAX_EXAMS
FEATURE_CHANNELS = 2048
NATIVE_SPATIAL_SIZE = 16
SPATIAL_SIZE = 8
IMAGE_HEIGHT = 500
IMAGE_WIDTH = 500
DAYS_PER_YEAR = 365.25
RECENCY_DECAY_PER_YEAR = 0.5
NORMALIZATION_MEAN = 0.3089279
NORMALIZATION_STD = 0.25053555408335154

# Provisional research-only categories retained from the current endpoint.
LOW_MODERATE_THRESHOLD_PERCENT = 5.0
MODERATE_HIGH_THRESHOLD_PERCENT = 20.0

_loaded = False
_device: torch.device | None = None
_image_encoder: EfficientNet | None = None
_model: V2DSpatialMultiviewHazardLSTM | None = None


def _load_trusted_checkpoint(path: Path) -> Any:
    """Load a project-owned checkpoint across supported PyTorch versions."""
    try:
        return torch.load(
            path,
            map_location="cpu",
            weights_only=False,
        )
    except TypeError:
        return torch.load(path, map_location="cpu")


def initialise() -> None:
    """Load the frozen Mammo-CLIP encoder and selected V2D model once."""
    global _loaded, _device, _image_encoder, _model

    if _loaded:
        return

    if not MAMMOCLIP_CHECKPOINT_PATH.is_file():
        raise FileNotFoundError(
            "Mammo-CLIP checkpoint not found: "
            f"{MAMMOCLIP_CHECKPOINT_PATH}"
        )
    if not V2D_CHECKPOINT_PATH.is_file():
        raise FileNotFoundError(
            f"V2D checkpoint not found: {V2D_CHECKPOINT_PATH}"
        )

    device = torch.device(
        "cuda" if torch.cuda.is_available() else "cpu"
    )

    mammoclip_checkpoint = _load_trusted_checkpoint(
        MAMMOCLIP_CHECKPOINT_PATH
    )
    encoder_configuration = mammoclip_checkpoint["config"]["model"][
        "image_encoder"
    ]
    if (
        encoder_configuration["name"]
        != "tf_efficientnet_b5_ns-detect"
    ):
        raise ValueError(
            "Unexpected Mammo-CLIP image encoder: "
            f"{encoder_configuration['name']}"
        )

    encoder_weights = {
        key.removeprefix("image_encoder."): value
        for key, value in mammoclip_checkpoint["model"].items()
        if key.startswith("image_encoder.")
    }
    if not encoder_weights:
        raise ValueError(
            "Mammo-CLIP checkpoint contains no image-encoder weights."
        )

    image_encoder = EfficientNet.from_name(
        "efficientnet-b5",
        num_classes=1,
    )
    load_result = image_encoder.load_state_dict(
        encoder_weights,
        strict=True,
    )
    if load_result.missing_keys or load_result.unexpected_keys:
        raise ValueError(
            "Mammo-CLIP image-encoder weights did not load strictly."
        )
    for parameter in image_encoder.parameters():
        parameter.requires_grad = False
    image_encoder.to(device).eval()

    del mammoclip_checkpoint
    del encoder_weights

    v2d_checkpoint = _load_trusted_checkpoint(V2D_CHECKPOINT_PATH)
    if (
        v2d_checkpoint.get("model_name")
        != "V2DSpatialMultiviewHazardLSTM"
    ):
        raise ValueError(
            "The selected checkpoint is not a V2D spatial model."
        )

    configuration = v2d_checkpoint.get("model_configuration", {})
    model_arguments = {
        "feature_channels": configuration.get(
            "feature_channels", FEATURE_CHANNELS
        ),
        "spatial_embedding_size": configuration.get(
            "spatial_embedding_size", 128
        ),
        "temporal_embedding_size": configuration.get(
            "temporal_embedding_size", 16
        ),
        "fusion_size": configuration.get("fusion_size", 256),
        "hidden_size": configuration.get("hidden_size", 128),
        "output_size": configuration.get("output_size", 5),
        "dropout": configuration.get("dropout", 0.3),
    }
    model = V2DSpatialMultiviewHazardLSTM(**model_arguments)
    model.load_state_dict(
        v2d_checkpoint["model_state_dict"],
        strict=True,
    )
    model.to(device).eval()

    _device = device
    _image_encoder = image_encoder
    _model = model
    _loaded = True


def health() -> dict[str, Any]:
    return {
        "status": "ok" if _loaded else "model_not_loaded",
        "model_loaded": _loaded,
        "engine": "mammoclip_b5_v2d",
        "device": None if _device is None else str(_device),
    }


def _parse_model_input(model_input: Any) -> list[dict[str, Any]]:
    if not isinstance(model_input, dict):
        raise ValueError("model_input must be an object.")

    exams = model_input.get("exams")
    if not isinstance(exams, list):
        raise ValueError("model_input must contain an exams list.")
    if not MIN_EXAMS <= len(exams) <= MAX_EXAMS:
        raise ValueError(
            "Mammo-CLIP V2D requires between two and five examinations."
        )

    parsed: list[dict[str, Any]] = []
    exam_ids: set[str] = set()
    exam_dates = set()

    for position, exam in enumerate(exams, start=1):
        if not isinstance(exam, dict):
            raise ValueError(
                f"Examination {position} must be an object."
            )

        exam_id = exam.get("exam_id")
        if not isinstance(exam_id, str) or not exam_id.strip():
            raise ValueError(
                f"Examination {position} has no valid exam_id."
            )
        if exam_id in exam_ids:
            raise ValueError(f"Duplicate exam_id: {exam_id}")
        exam_ids.add(exam_id)

        date_text = exam.get("exam_date")
        if not isinstance(date_text, str):
            raise ValueError(
                f"Examination {position} has no valid exam_date."
            )
        try:
            exam_date = datetime.strptime(
                date_text,
                "%Y-%m-%d",
            ).date()
        except ValueError as error:
            raise ValueError(
                f"Examination {position} exam_date must use YYYY-MM-DD."
            ) from error
        if exam_date in exam_dates:
            raise ValueError(
                "Each examination must have a different date."
            )
        exam_dates.add(exam_date)

        views = exam.get("views")
        if not isinstance(views, dict):
            raise ValueError(
                f"Examination {position} must contain a views object."
            )
        unknown = sorted(set(views) - set(VIEW_SLOTS))
        if unknown:
            raise ValueError(
                f"Unsupported mammography views: {unknown}"
            )

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
                    f"Examination {position} view {view} must contain "
                    "image bytes or None."
                )
            valid_views[view] = payload

        if not valid_views:
            raise ValueError(
                f"Examination {position} contains no mammogram image."
            )

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


def _decode_and_normalize_image(payload: bytes) -> torch.Tensor:
    try:
        with Image.open(BytesIO(payload)) as source:
            image = source.convert("RGB")
            if image.size != (IMAGE_WIDTH, IMAGE_HEIGHT):
                raise ValueError(
                    "Mammo-CLIP V2D requires 500 x 500 pixel images; "
                    f"received {image.size[0]} x {image.size[1]}."
                )
            array = np.asarray(image, dtype=np.float32)
    except ValueError:
        raise
    except Exception as error:
        raise ValueError(
            "A supplied mammogram could not be decoded."
        ) from error

    array -= float(array.min())
    maximum = float(array.max())
    if maximum <= 0.0:
        raise ValueError(
            "A supplied mammogram has no usable intensity range."
        )
    array /= maximum
    array = (array - NORMALIZATION_MEAN) / NORMALIZATION_STD
    array = np.ascontiguousarray(array.transpose(2, 0, 1))
    return torch.from_numpy(array)


def _extract_spatial_features(
    exams: list[dict[str, Any]],
    batch_size: int | None = None,
) -> dict[tuple[int, str], np.ndarray]:
    assert _image_encoder is not None and _device is not None

    if batch_size is None:
        batch_size = 4 if _device.type == "cuda" else 1

    items: list[tuple[int, str, bytes]] = []
    for exam_index, exam in enumerate(exams):
        for view in VIEW_SLOTS:
            payload = exam["views"].get(view)
            if payload is not None:
                items.append((exam_index, view, payload))

    feature_cache: dict[tuple[int, str], np.ndarray] = {}
    for start in range(0, len(items), batch_size):
        batch = items[start : start + batch_size]
        image_batch = torch.stack(
            [
                _decode_and_normalize_image(payload)
                for _, _, payload in batch
            ]
        ).to(_device)

        with torch.inference_mode():
            native = _image_encoder.extract_features(image_batch)
            expected_native = (
                len(batch),
                FEATURE_CHANNELS,
                NATIVE_SPATIAL_SIZE,
                NATIVE_SPATIAL_SIZE,
            )
            if tuple(native.shape) != expected_native:
                raise RuntimeError(
                    "Unexpected Mammo-CLIP spatial-feature shape: "
                    f"{tuple(native.shape)}"
                )
            pooled = nn.functional.adaptive_avg_pool2d(
                native,
                (SPATIAL_SIZE, SPATIAL_SIZE),
            )
            features = pooled.float().cpu().numpy()

        expected_features = (
            len(batch),
            FEATURE_CHANNELS,
            SPATIAL_SIZE,
            SPATIAL_SIZE,
        )
        if features.shape != expected_features:
            raise RuntimeError(
                "Unexpected pooled spatial-feature shape: "
                f"{features.shape}"
            )
        if not np.isfinite(features).all():
            raise RuntimeError(
                "Mammo-CLIP feature extraction produced a non-finite value."
            )

        for (exam_index, view, _), feature in zip(batch, features):
            feature_cache[(exam_index, view)] = feature

    return feature_cache


def _recency_values(
    exams: list[dict[str, Any]],
) -> tuple[np.ndarray, np.ndarray]:
    anchor_date = exams[-1]["exam_date"]
    days_before_anchor = np.asarray(
        [
            (anchor_date - exam["exam_date"]).days
            for exam in exams
        ],
        dtype=np.float32,
    )
    raw = np.exp(
        -RECENCY_DECAY_PER_YEAR
        * (days_before_anchor / DAYS_PER_YEAR)
    ).astype(np.float32)
    weights = raw / raw.sum()
    return days_before_anchor, weights.astype(np.float32)


def _build_model_arrays(
    exams: list[dict[str, Any]],
    feature_cache: dict[tuple[int, str], np.ndarray],
    removed_image: tuple[int, str] | None = None,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    days_before_anchor, recency_weights = _recency_values(exams)
    sequence = np.zeros(
        (
            MAX_EXAMS,
            len(VIEW_SLOTS),
            FEATURE_CHANNELS,
            SPATIAL_SIZE,
            SPATIAL_SIZE,
        ),
        dtype=np.float32,
    )
    temporal = np.zeros((MAX_EXAMS, 3), dtype=np.float32)
    sequence_mask = np.zeros(MAX_EXAMS, dtype=np.float32)

    gap_days = np.zeros(len(exams), dtype=np.float32)
    if len(exams) > 1:
        gap_days[1:] = (
            days_before_anchor[:-1] - days_before_anchor[1:]
        )

    for exam_index in range(len(exams)):
        available_count = 0
        for view_index, view in enumerate(VIEW_SLOTS):
            key = (exam_index, view)
            if key == removed_image:
                continue
            feature = feature_cache.get(key)
            if feature is None:
                continue
            sequence[exam_index, view_index] = feature
            available_count += 1

        if available_count == 0:
            raise ValueError(
                "An examination cannot be built without an image."
            )

        temporal[exam_index, 0] = recency_weights[exam_index]
        temporal[exam_index, 1] = (
            gap_days[exam_index] / DAYS_PER_YEAR
        )
        temporal[exam_index, 2] = (
            days_before_anchor[exam_index] / DAYS_PER_YEAR
        )
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

    with torch.inference_mode():
        prediction = _model.predict_risk(
            sequence_tensor,
            temporal_tensor,
            mask_tensor,
        )

    risks = (
        prediction["cumulative_risk"]
        .squeeze(0)
        .cpu()
        .numpy()
        .astype(float)
    )
    if risks.shape != (5,) or not np.isfinite(risks).all():
        raise RuntimeError(
            "Mammo-CLIP V2D produced invalid cumulative risks."
        )
    if np.any(risks < -1e-7) or np.any(risks > 1.0 + 1e-7):
        raise RuntimeError(
            "Mammo-CLIP V2D produced risks outside [0, 1]."
        )
    if np.any(np.diff(risks) < -1e-7):
        raise RuntimeError(
            "Mammo-CLIP V2D produced non-monotonic cumulative risks."
        )
    return np.clip(risks, 0.0, 1.0)


def _exam_contributions(
    exams: list[dict[str, Any]],
    feature_cache: dict[tuple[int, str], np.ndarray],
    full_risks: np.ndarray,
) -> list[float | None]:
    raw_impacts = np.zeros(len(exams), dtype=np.float64)
    evaluated = np.zeros(len(exams), dtype=bool)

    for exam_index, _exam in enumerate(exams):
        available_views = [
            view
            for view in VIEW_SLOTS
            if (exam_index, view) in feature_cache
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
            contributions.append(
                100.0 * float(raw_impacts[index]) / total_impact
            )
    return contributions


def _risk_level(five_year_risk_percent: float) -> str:
    if five_year_risk_percent >= MODERATE_HIGH_THRESHOLD_PERCENT:
        return "high"
    if five_year_risk_percent >= LOW_MODERATE_THRESHOLD_PERCENT:
        return "moderate"
    return "low"


def run_inference(model_input: Any) -> dict[str, Any]:
    """Run Mammo-CLIP V2D using the shared future-risk contract."""
    initialise()
    exams = _parse_model_input(model_input)
    feature_cache = _extract_spatial_features(exams)
    sequence, temporal, sequence_mask = _build_model_arrays(
        exams,
        feature_cache,
    )
    risks = _predict(sequence, temporal, sequence_mask)
    contributions = _exam_contributions(
        exams,
        feature_cache,
        risks,
    )
    risk_percent = risks * 100.0

    return {
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
