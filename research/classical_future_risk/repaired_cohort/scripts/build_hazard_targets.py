"""Build validated hazard targets for the frozen Sprint 04 cohort."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

from v2_hazard.data.hazard_targets import (
    EVENT_INTERVAL_TO_INDEX,
    NON_EVENT_INTERVAL,
    build_hazard_targets,
    hazards_to_cumulative_risk,
)


WORKSPACE = Path(__file__).resolve().parents[1]
PROJECT_ROOT = WORKSPACE

SPLITS_PATH = PROJECT_ROOT / "splits/patient_splits.csv"
METADATA_PATH = (
    PROJECT_ROOT / "features/patient_sequence_metadata.csv"
)
FROZEN_LABELS_PATH = (
    PROJECT_ROOT / "features/patient_labels_1to5yr.npy"
)
OUTPUT_DIR = WORKSPACE / "data/derived"

RISK_COLUMNS = [
    "risk_1yr",
    "risk_2yr",
    "risk_3yr",
    "risk_4yr",
    "risk_5yr",
]


def main() -> None:
    splits = pd.read_csv(SPLITS_PATH)
    metadata = pd.read_csv(METADATA_PATH)
    frozen_labels = np.load(FROZEN_LABELS_PATH, mmap_mode="r")

    if splits["empi_anon"].duplicated().any():
        raise ValueError("Duplicate patients found in patient_splits.csv")

    if metadata["empi_anon"].duplicated().any():
        raise ValueError("Duplicate patients found in sequence metadata")

    expected_indices = np.arange(len(metadata))
    if not np.array_equal(
        metadata["patient_index"].to_numpy(),
        expected_indices,
    ):
        raise ValueError("Metadata patient indices are not sequential")

    split_lookup = splits.set_index("empi_anon")
    aligned = split_lookup.reindex(metadata["empi_anon"])

    if aligned["event_interval"].isna().any():
        raise ValueError("Some metadata patients are missing split records")

    if not np.array_equal(
        aligned["split"].to_numpy(),
        metadata["split"].to_numpy(),
    ):
        raise ValueError("Metadata and patient split assignments disagree")

    if not np.array_equal(
        aligned["outcome_type"].to_numpy(),
        metadata["outcome_type"].to_numpy(),
    ):
        raise ValueError("Metadata and split outcome types disagree")

    event_intervals = aligned["event_interval"].to_numpy()

    hazard_targets, at_risk_masks = build_hazard_targets(
        event_intervals
    )
    reconstructed_labels = hazards_to_cumulative_risk(
        hazard_targets
    )

    if frozen_labels.shape != hazard_targets.shape:
        raise ValueError(
            f"Frozen labels have shape {frozen_labels.shape}, "
            f"but hazard targets have shape {hazard_targets.shape}"
        )

    if not np.array_equal(
        reconstructed_labels,
        np.asarray(frozen_labels),
    ):
        mismatch_count = int(
            np.count_nonzero(
                reconstructed_labels != np.asarray(frozen_labels)
            )
        )
        raise ValueError(
            f"Hazard targets disagree with frozen labels at "
            f"{mismatch_count} positions"
        )

    event_year_bins = pd.Series(event_intervals).map(
        EVENT_INTERVAL_TO_INDEX
    )
    event_year_bins = event_year_bins.fillna(-1).astype(int) + 1

    output_metadata = metadata[
        [
            "patient_index",
            "empi_anon",
            "split",
            "outcome_type",
            "anchor_acc_anon",
            "anchor_date",
            "sequence_length",
        ]
    ].copy()

    output_metadata["event_interval"] = event_intervals
    output_metadata["event_year_bin"] = event_year_bins.to_numpy()
    output_metadata["observed_interval_count"] = (
        at_risk_masks.sum(axis=1).astype(int)
    )

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    targets_path = OUTPUT_DIR / "hazard_targets.npy"
    masks_path = OUTPUT_DIR / "hazard_at_risk_masks.npy"
    metadata_path = OUTPUT_DIR / "hazard_target_metadata.csv"
    summary_path = OUTPUT_DIR / "hazard_target_summary.json"

    np.save(targets_path, hazard_targets)
    np.save(masks_path, at_risk_masks)
    output_metadata.to_csv(metadata_path, index=False)

    interval_counts = {
        str(interval): int(count)
        for interval, count in
        pd.Series(event_intervals).value_counts().items()
    }

    split_counts = {
        str(split): int(count)
        for split, count in metadata["split"].value_counts().items()
    }

    event_count = int(hazard_targets.sum())
    non_event_count = int(
        np.sum(event_intervals == NON_EVENT_INTERVAL)
    )

    summary = {
        "patients": len(metadata),
        "events_within_5yr": event_count,
        "non_events_within_5yr": non_event_count,
        "at_risk_patient_intervals": int(at_risk_masks.sum()),
        "split_counts": split_counts,
        "event_interval_counts": interval_counts,
        "hazard_targets_shape": list(hazard_targets.shape),
        "at_risk_masks_shape": list(at_risk_masks.shape),
        "reproduces_frozen_cumulative_labels": True,
        "source_files": {
            "patient_splits": str(SPLITS_PATH),
            "sequence_metadata": str(METADATA_PATH),
            "frozen_labels": str(FROZEN_LABELS_PATH),
        },
    }

    summary_path.write_text(
        json.dumps(summary, indent=2) + "\n",
        encoding="utf-8",
    )

    print("Hazard target generation completed")
    print(f"Patients: {len(metadata)}")
    print(f"Events within five years: {event_count}")
    print(f"Non-events within five years: {non_event_count}")
    print(f"At-risk patient-intervals: {int(at_risk_masks.sum())}")
    print("Frozen cumulative labels reproduced: yes")
    print(f"Outputs: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
