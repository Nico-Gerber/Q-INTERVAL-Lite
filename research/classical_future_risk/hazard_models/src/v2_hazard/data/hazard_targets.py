"""Discrete-time hazard target construction for 1-to-5-year risk."""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np
from numpy.typing import NDArray


NUM_INTERVALS = 5

EVENT_INTERVAL_TO_INDEX = {
    "cancer_within_1yr": 0,
    "cancer_between_1_and_2yr": 1,
    "cancer_between_2_and_3yr": 2,
    "cancer_between_3_and_4yr": 3,
    "cancer_between_4_and_5yr": 4,
}

NON_EVENT_INTERVAL = "no_cancer_within_5yr"


def build_hazard_targets(
    event_intervals: Sequence[str],
) -> tuple[NDArray[np.float32], NDArray[np.float32]]:
    """
    Convert patient event intervals into hazard targets and at-risk masks.

    Hazard targets contain a single positive value in the interval where
    cancer occurs. Non-event patients have zero targets for all intervals.

    The at-risk mask includes every interval up to and including the event.
    Post-event intervals are excluded from the loss. Patients without cancer
    during five years remain at risk across all five intervals.
    """
    intervals = np.asarray(event_intervals, dtype=object)

    if intervals.ndim != 1:
        raise ValueError(
            f"event_intervals must be one-dimensional, got {intervals.shape}"
        )

    targets = np.zeros(
        (len(intervals), NUM_INTERVALS),
        dtype=np.float32,
    )
    at_risk_masks = np.zeros_like(targets)

    for patient_index, raw_interval in enumerate(intervals):
        interval = str(raw_interval)

        if interval == NON_EVENT_INTERVAL:
            at_risk_masks[patient_index, :] = 1.0
            continue

        if interval not in EVENT_INTERVAL_TO_INDEX:
            raise ValueError(
                f"Unknown event interval at patient index "
                f"{patient_index}: {interval!r}"
            )

        event_index = EVENT_INTERVAL_TO_INDEX[interval]

        targets[patient_index, event_index] = 1.0
        at_risk_masks[patient_index, : event_index + 1] = 1.0

    validate_hazard_targets(targets, at_risk_masks)
    return targets, at_risk_masks


def hazards_to_cumulative_risk(
    hazards: NDArray[np.floating],
) -> NDArray[np.float32]:
    """
    Convert conditional interval hazards into cumulative 1-to-5-year risk.
    """
    hazard_array = np.asarray(hazards, dtype=np.float32)

    if hazard_array.ndim != 2:
        raise ValueError(
            f"hazards must have shape (patients, intervals), "
            f"got {hazard_array.shape}"
        )

    if hazard_array.shape[1] != NUM_INTERVALS:
        raise ValueError(
            f"Expected {NUM_INTERVALS} hazard intervals, "
            f"got {hazard_array.shape[1]}"
        )

    if not np.all(np.isfinite(hazard_array)):
        raise ValueError("Hazards contain non-finite values")

    if np.any((hazard_array < 0.0) | (hazard_array > 1.0)):
        raise ValueError("Hazards must be between zero and one")

    survival = np.cumprod(1.0 - hazard_array, axis=1)
    return (1.0 - survival).astype(np.float32)


def validate_hazard_targets(
    targets: NDArray[np.floating],
    at_risk_masks: NDArray[np.floating],
) -> None:
    """Validate hazard targets and their corresponding at-risk masks."""
    targets = np.asarray(targets)
    at_risk_masks = np.asarray(at_risk_masks)

    if targets.shape != at_risk_masks.shape:
        raise ValueError(
            f"Target shape {targets.shape} does not match "
            f"mask shape {at_risk_masks.shape}"
        )

    if targets.ndim != 2 or targets.shape[1] != NUM_INTERVALS:
        raise ValueError(
            f"Expected shape (patients, {NUM_INTERVALS}), "
            f"got {targets.shape}"
        )

    if not np.all(np.isin(targets, [0.0, 1.0])):
        raise ValueError("Hazard targets must be binary")

    if not np.all(np.isin(at_risk_masks, [0.0, 1.0])):
        raise ValueError("At-risk masks must be binary")

    if np.any(targets.sum(axis=1) > 1.0):
        raise ValueError("A patient cannot have events in multiple intervals")

    if np.any(targets > at_risk_masks):
        raise ValueError("Every event interval must be included in the mask")

    mask_differences = np.diff(at_risk_masks, axis=1)
    if np.any(mask_differences > 0.0):
        raise ValueError(
            "At-risk masks cannot return to one after reaching zero"
        )
