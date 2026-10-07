"""Audit class balance and sequence coverage for hazard training."""

from pathlib import Path

import numpy as np
import pandas as pd


WORKSPACE = Path(__file__).resolve().parents[1]
PROJECT_ROOT = WORKSPACE.parent

TARGETS_PATH = WORKSPACE / "data/derived/hazard_targets.npy"
AT_RISK_PATH = WORKSPACE / "data/derived/hazard_at_risk_masks.npy"
METADATA_PATH = WORKSPACE / "data/derived/hazard_target_metadata.csv"
SEQUENCES_PATH = (
    PROJECT_ROOT / "features/patient_sequences_5x6149.npy"
)
SEQUENCE_MASKS_PATH = (
    PROJECT_ROOT / "features/patient_sequence_masks.npy"
)


def main() -> None:
    targets = np.load(TARGETS_PATH, mmap_mode="r")
    at_risk = np.load(AT_RISK_PATH, mmap_mode="r")
    metadata = pd.read_csv(METADATA_PATH)
    sequences = np.load(SEQUENCES_PATH, mmap_mode="r")
    sequence_masks = np.load(SEQUENCE_MASKS_PATH, mmap_mode="r")

    expected_patients = len(metadata)

    arrays = {
        "targets": targets,
        "at_risk": at_risk,
        "sequences": sequences,
        "sequence_masks": sequence_masks,
    }

    for name, array in arrays.items():
        if array.shape[0] != expected_patients:
            raise ValueError(
                f"{name} contains {array.shape[0]} patients, "
                f"expected {expected_patients}"
            )

    print("ARRAY SHAPES")
    for name, array in arrays.items():
        print(f"{name:16s} {array.shape} {array.dtype}")

    print("\nSEQUENCE LENGTH DISTRIBUTION")
    print(
        pd.crosstab(
            metadata["sequence_length"],
            metadata["split"],
            margins=True,
        )
    )

    records = []

    for split_name in ["train", "validation", "test"]:
        patient_mask = metadata["split"].to_numpy() == split_name

        split_targets = np.asarray(targets[patient_mask])
        split_at_risk = np.asarray(at_risk[patient_mask])

        for interval_index in range(5):
            events = int(split_targets[:, interval_index].sum())
            at_risk_count = int(
                split_at_risk[:, interval_index].sum()
            )
            non_events = at_risk_count - events

            positive_weight = (
                non_events / events
                if events > 0
                else float("inf")
            )

            records.append(
                {
                    "split": split_name,
                    "year_interval": interval_index + 1,
                    "patients_at_risk": at_risk_count,
                    "events": events,
                    "non_events": non_events,
                    "event_rate": (
                        events / at_risk_count
                        if at_risk_count > 0
                        else 0.0
                    ),
                    "raw_positive_weight": positive_weight,
                }
            )

    balance = pd.DataFrame(records)

    print("\nHAZARD INTERVAL BALANCE")
    print(
        balance.to_string(
            index=False,
            formatters={
                "event_rate": lambda value: f"{value:.6f}",
                "raw_positive_weight": (
                    lambda value: f"{value:.2f}"
                ),
            },
        )
    )

    print("\nTRAINING EVENT COUNTS")
    train_balance = balance[balance["split"] == "train"]

    print(
        train_balance[
            [
                "year_interval",
                "patients_at_risk",
                "events",
                "raw_positive_weight",
            ]
        ].to_string(
            index=False,
            formatters={
                "raw_positive_weight": (
                    lambda value: f"{value:.2f}"
                ),
            },
        )
    )


if __name__ == "__main__":
    main()
