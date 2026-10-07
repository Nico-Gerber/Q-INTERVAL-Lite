"""Create reproducible training-only hazard weighting settings."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
import torch

from v2_hazard.training.losses import (
    calculate_positive_weights,
)


WORKSPACE = Path(__file__).resolve().parents[1]

TARGETS_PATH = WORKSPACE / "data/derived/hazard_targets.npy"
AT_RISK_PATH = (
    WORKSPACE / "data/derived/hazard_at_risk_masks.npy"
)
METADATA_PATH = (
    WORKSPACE / "data/derived/hazard_target_metadata.csv"
)
OUTPUT_PATH = WORKSPACE / "configs/hazard_weighting.json"

CAP = 50.0


def main() -> None:
    targets = np.load(TARGETS_PATH, mmap_mode="r")
    at_risk = np.load(AT_RISK_PATH, mmap_mode="r")
    metadata = pd.read_csv(METADATA_PATH)

    train_mask = metadata["split"].to_numpy() == "train"

    train_targets = torch.from_numpy(
        np.array(
            targets[train_mask],
            dtype=np.float32,
            copy=True,
        )
    )
    train_at_risk = torch.from_numpy(
        np.array(
            at_risk[train_mask],
            dtype=np.float32,
            copy=True,
        )
    )

    positive_counts = (
        train_targets * train_at_risk
    ).sum(dim=0)

    negative_counts = (
        (1.0 - train_targets) * train_at_risk
    ).sum(dim=0)

    at_risk_counts = train_at_risk.sum(dim=0)

    strategies = {
        "none": calculate_positive_weights(
            train_targets,
            train_at_risk,
            strategy="none",
        ),
        "raw_reference": calculate_positive_weights(
            train_targets,
            train_at_risk,
            strategy="raw",
        ),
        "sqrt": calculate_positive_weights(
            train_targets,
            train_at_risk,
            strategy="sqrt",
        ),
        "capped_raw_50": calculate_positive_weights(
            train_targets,
            train_at_risk,
            strategy="capped_raw",
            cap=CAP,
        ),
    }

    configuration = {
        "training_patients": int(train_mask.sum()),
        "intervals": [
            "0_to_1_year",
            "1_to_2_years",
            "2_to_3_years",
            "3_to_4_years",
            "4_to_5_years",
        ],
        "patients_at_risk": [
            int(value)
            for value in at_risk_counts.tolist()
        ],
        "positive_counts": [
            int(value)
            for value in positive_counts.tolist()
        ],
        "negative_counts": [
            int(value)
            for value in negative_counts.tolist()
        ],
        "weights": {
            name: [
                float(value)
                for value in weights.tolist()
            ]
            for name, weights in strategies.items()
        },
        "planned_experiments": {
            "primary": "sqrt",
            "controls": [
                "none",
                "capped_raw_50",
            ],
            "raw_reference_trained": False,
        },
        "selection_data": "validation_only",
        "test_set_usage": "final_selected_model_only",
        "loss_normalization": (
            "sum of masked element losses divided by "
            "valid at-risk patient-interval count"
        ),
        "reason": (
            "Raw inverse-frequency weights exceed 160 for "
            "years 3 to 5. Square-root weighting is the "
            "primary setting, with unweighted and capped "
            "controls used to assess stability and calibration."
        ),
    }

    if OUTPUT_PATH.exists():
        raise FileExistsError(
            f"Output already exists: {OUTPUT_PATH}"
        )

    OUTPUT_PATH.write_text(
        json.dumps(configuration, indent=2) + "\n",
        encoding="utf-8",
    )

    print("Hazard weighting configuration created")
    print(f"Training patients: {int(train_mask.sum())}")
    print(
        "Positive counts:",
        [int(value) for value in positive_counts.tolist()],
    )

    for name, weights in strategies.items():
        formatted = [
            round(float(value), 4)
            for value in weights.tolist()
        ]
        print(f"{name}: {formatted}")


if __name__ == "__main__":
    main()
