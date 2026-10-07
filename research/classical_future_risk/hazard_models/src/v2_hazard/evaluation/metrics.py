"""Evaluation metrics for cumulative future-risk predictions."""

from __future__ import annotations

import numpy as np
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    roc_auc_score,
)


HORIZON_NAMES = ["1yr", "2yr", "3yr", "4yr", "5yr"]


def expected_calibration_error(
    targets: np.ndarray,
    probabilities: np.ndarray,
    number_of_bins: int = 10,
) -> float:
    """Calculate equal-width expected calibration error."""
    targets = np.asarray(targets, dtype=np.float64)
    probabilities = np.asarray(
        probabilities,
        dtype=np.float64,
    )

    if targets.shape != probabilities.shape:
        raise ValueError(
            "Calibration targets and probabilities must match"
        )

    if targets.ndim != 1:
        raise ValueError(
            "Calibration inputs must be one-dimensional"
        )

    if number_of_bins <= 0:
        raise ValueError(
            "Number of calibration bins must be positive"
        )

    bin_edges = np.linspace(
        0.0,
        1.0,
        number_of_bins + 1,
    )

    bin_indices = np.digitize(
        probabilities,
        bin_edges[1:-1],
        right=False,
    )

    calibration_error = 0.0

    for bin_index in range(number_of_bins):
        in_bin = bin_indices == bin_index
        bin_count = int(in_bin.sum())

        if bin_count == 0:
            continue

        observed_rate = float(targets[in_bin].mean())
        predicted_rate = float(
            probabilities[in_bin].mean()
        )

        calibration_error += (
            bin_count
            / len(targets)
            * abs(observed_rate - predicted_rate)
        )

    return float(calibration_error)


def evaluate_cumulative_predictions(
    targets: np.ndarray,
    probabilities: np.ndarray,
) -> dict:
    """Evaluate discrimination, calibration, and monotonicity."""
    targets = np.asarray(targets, dtype=np.float64)
    probabilities = np.asarray(
        probabilities,
        dtype=np.float64,
    )

    if targets.shape != probabilities.shape:
        raise ValueError(
            "Targets and probabilities must have matching shapes"
        )

    if targets.ndim != 2 or targets.shape[1] != 5:
        raise ValueError(
            "Expected arrays with shape (patients, 5)"
        )

    if not np.isfinite(probabilities).all():
        raise ValueError(
            "Predictions contain non-finite values"
        )

    if np.any(
        (probabilities < 0.0)
        | (probabilities > 1.0)
    ):
        raise ValueError(
            "Predictions must be between zero and one"
        )

    if not np.all(np.isin(targets, [0.0, 1.0])):
        raise ValueError("Targets must be binary")

    per_horizon = {}

    for index, horizon in enumerate(HORIZON_NAMES):
        horizon_targets = targets[:, index]
        horizon_probabilities = probabilities[:, index]

        positive_count = int(horizon_targets.sum())
        negative_count = (
            len(horizon_targets) - positive_count
        )

        if positive_count > 0 and negative_count > 0:
            auroc = float(
                roc_auc_score(
                    horizon_targets,
                    horizon_probabilities,
                )
            )
            auprc = float(
                average_precision_score(
                    horizon_targets,
                    horizon_probabilities,
                )
            )
        else:
            auroc = None
            auprc = None

        per_horizon[horizon] = {
            "patients": len(horizon_targets),
            "positives": positive_count,
            "negatives": negative_count,
            "prevalence": float(
                horizon_targets.mean()
            ),
            "auroc": auroc,
            "auprc": auprc,
            "brier_score": float(
                brier_score_loss(
                    horizon_targets,
                    horizon_probabilities,
                )
            ),
            "expected_calibration_error": (
                expected_calibration_error(
                    horizon_targets,
                    horizon_probabilities,
                )
            ),
        }

    monotonic_violations = np.any(
        np.diff(probabilities, axis=1) < -1e-7,
        axis=1,
    )

    valid_aurocs = [
        metrics["auroc"]
        for metrics in per_horizon.values()
        if metrics["auroc"] is not None
    ]

    valid_auprcs = [
        metrics["auprc"]
        for metrics in per_horizon.values()
        if metrics["auprc"] is not None
    ]

    return {
        "per_horizon": per_horizon,
        "mean_auroc": float(np.mean(valid_aurocs)),
        "mean_auprc": float(np.mean(valid_auprcs)),
        "mean_brier_score": float(
            np.mean(
                [
                    metrics["brier_score"]
                    for metrics in per_horizon.values()
                ]
            )
        ),
        "patients_with_monotonicity_violation": int(
            monotonic_violations.sum()
        ),
        "monotonicity_violation_rate": float(
            monotonic_violations.mean()
        ),
    }
