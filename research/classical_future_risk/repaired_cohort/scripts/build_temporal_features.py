"""Build explicit temporal features aligned with patient sequences."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd


WORKSPACE = Path(__file__).resolve().parents[1]
PROJECT_ROOT = WORKSPACE

EXAM_METADATA_PATH = (
    PROJECT_ROOT / "features/exam_feature_metadata.csv"
)
PATIENT_METADATA_PATH = (
    PROJECT_ROOT / "features/patient_sequence_metadata.csv"
)
SEQUENCE_MASK_PATH = (
    PROJECT_ROOT / "features/patient_sequence_masks.npy"
)

OUTPUT_PATH = (
    WORKSPACE / "data/derived/temporal_features_5x2.npy"
)
SUMMARY_PATH = (
    WORKSPACE / "data/derived/temporal_feature_summary.json"
)

DAYS_PER_YEAR = 365.25
MAX_SEQUENCE_LENGTH = 5


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()

    with path.open("rb") as file:
        for block in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(block)

    return digest.hexdigest()


def main() -> None:
    exam_metadata = pd.read_csv(EXAM_METADATA_PATH)
    patient_metadata = pd.read_csv(PATIENT_METADATA_PATH)
    sequence_masks = np.load(
        SEQUENCE_MASK_PATH,
        mmap_mode="r",
    )

    patient_count = len(patient_metadata)

    if sequence_masks.shape != (
        patient_count,
        MAX_SEQUENCE_LENGTH,
    ):
        raise ValueError(
            f"Unexpected sequence-mask shape: "
            f"{sequence_masks.shape}"
        )

    expected_indices = np.arange(patient_count)

    if not np.array_equal(
        patient_metadata["patient_index"].to_numpy(),
        expected_indices,
    ):
        raise ValueError("Patient indices are not sequential")

    if exam_metadata["exam_feature_index"].duplicated().any():
        raise ValueError("Duplicate examination feature indices")

    expected_exam_indices = np.arange(len(exam_metadata))

    if not np.array_equal(
        exam_metadata["exam_feature_index"].to_numpy(),
        expected_exam_indices,
    ):
        raise ValueError(
            "Examination feature indices are not sequential"
        )

    exam_groups = {
        patient_id: group.sort_values("sequence_position")
        for patient_id, group in exam_metadata.groupby(
            "empi_anon",
            sort=False,
        )
    }

    temporal_features = np.zeros(
        (
            patient_count,
            MAX_SEQUENCE_LENGTH,
            2,
        ),
        dtype=np.float32,
    )

    for patient in patient_metadata.itertuples(index=False):
        patient_index = int(patient.patient_index)
        patient_id = patient.empi_anon
        sequence_length = int(patient.sequence_length)

        if patient_id not in exam_groups:
            raise ValueError(
                f"Missing examinations for patient {patient_id}"
            )

        exams = exam_groups[patient_id]

        if len(exams) != sequence_length:
            raise ValueError(
                f"Sequence-length mismatch for patient {patient_id}"
            )

        expected_positions = np.arange(
            1,
            sequence_length + 1,
        )

        positions = pd.to_numeric(
            exams["sequence_position"],
            errors="raise",
        ).to_numpy()

        if not np.array_equal(positions, expected_positions):
            raise ValueError(
                f"Invalid sequence positions for patient {patient_id}"
            )

        exam_dates = pd.to_datetime(
            exams["exam_date"],
            errors="raise",
        )

        if not exam_dates.is_monotonic_increasing:
            raise ValueError(
                f"Examinations are not chronological for "
                f"patient {patient_id}"
            )

        anchor_flags = (
            exams["is_anchor"]
            .astype(str)
            .str.lower()
            .map({"true": True, "false": False})
        )

        if anchor_flags.isna().any():
            raise ValueError(
                f"Invalid anchor indicator for patient {patient_id}"
            )

        if int(anchor_flags.sum()) != 1:
            raise ValueError(
                f"Patient {patient_id} does not have exactly "
                f"one anchor"
            )

        if not bool(anchor_flags.iloc[-1]):
            raise ValueError(
                f"Final examination is not the anchor for "
                f"patient {patient_id}"
            )

        days_before_anchor = pd.to_numeric(
            exams["days_before_anchor"],
            errors="raise",
        ).to_numpy(dtype=np.float64)

        if np.any(days_before_anchor < 0):
            raise ValueError(
                f"Negative days-before-anchor value for "
                f"patient {patient_id}"
            )

        if days_before_anchor[-1] != 0:
            raise ValueError(
                f"Anchor timing is not zero for patient {patient_id}"
            )

        expected_gap_days = np.zeros(
            sequence_length,
            dtype=np.float64,
        )

        expected_gap_days[1:] = (
            days_before_anchor[:-1]
            - days_before_anchor[1:]
        )

        if np.any(expected_gap_days < 0):
            raise ValueError(
                f"Negative examination gap for patient {patient_id}"
            )

        stored_gap_days = pd.to_numeric(
            exams["time_from_previous_exam_days"],
            errors="coerce",
        ).to_numpy(dtype=np.float64)

        if not np.isnan(stored_gap_days[0]):
            raise ValueError(
                f"First examination gap should be missing for "
                f"patient {patient_id}"
            )

        if np.isnan(stored_gap_days[1:]).any():
            raise ValueError(
                f"Missing examination gap for patient {patient_id}"
            )

        if not np.allclose(
            stored_gap_days[1:],
            expected_gap_days[1:],
            atol=1e-6,
        ):
            raise ValueError(
                f"Stored examination gaps disagree for "
                f"patient {patient_id}"
            )

        if int(sequence_masks[patient_index].sum()) != sequence_length:
            raise ValueError(
                f"Sequence mask disagrees for patient {patient_id}"
            )

        temporal_features[
            patient_index,
            :sequence_length,
            0,
        ] = expected_gap_days / DAYS_PER_YEAR

        temporal_features[
            patient_index,
            :sequence_length,
            1,
        ] = days_before_anchor / DAYS_PER_YEAR

    if not np.isfinite(temporal_features).all():
        raise ValueError("Temporal features contain invalid values")

    if np.any(temporal_features < 0):
        raise ValueError("Temporal features contain negative values")

    valid_features = temporal_features[
        np.asarray(sequence_masks, dtype=bool)
    ]

    positive_gaps = valid_features[
        valid_features[:, 0] > 0,
        0,
    ]

    summary = {
        "patients": patient_count,
        "examinations": len(exam_metadata),
        "shape": list(temporal_features.shape),
        "dtype": str(temporal_features.dtype),
        "layout": {
            "0": "years_since_previous_examination",
            "1": "years_before_anchor",
        },
        "first_examination_gap": 0.0,
        "padding": "right-padded zeros, governed by sequence mask",
        "positive_gap_years": {
            "minimum": float(positive_gaps.min()),
            "median": float(np.median(positive_gaps)),
            "maximum": float(positive_gaps.max()),
        },
        "years_before_anchor": {
            "minimum": float(valid_features[:, 1].min()),
            "median": float(np.median(valid_features[:, 1])),
            "maximum": float(valid_features[:, 1].max()),
        },
        "source_sha256": {
            "exam_metadata": sha256_file(EXAM_METADATA_PATH),
            "patient_metadata": sha256_file(
                PATIENT_METADATA_PATH
            ),
            "sequence_masks": sha256_file(SEQUENCE_MASK_PATH),
        },
    }

    if OUTPUT_PATH.exists() or SUMMARY_PATH.exists():
        raise FileExistsError(
            "Temporal output already exists and was not overwritten"
        )

    np.save(OUTPUT_PATH, temporal_features)

    SUMMARY_PATH.write_text(
        json.dumps(summary, indent=2) + "\n",
        encoding="utf-8",
    )

    print("Temporal feature generation completed")
    print(f"Patients: {patient_count}")
    print(f"Examinations: {len(exam_metadata)}")
    print(f"Output shape: {temporal_features.shape}")
    print(
        "Positive gap years: "
        f"min={positive_gaps.min():.4f}, "
        f"median={np.median(positive_gaps):.4f}, "
        f"max={positive_gaps.max():.4f}"
    )
    print(
        "Years before anchor: "
        f"min={valid_features[:, 1].min():.4f}, "
        f"median={np.median(valid_features[:, 1]):.4f}, "
        f"max={valid_features[:, 1].max():.4f}"
    )


if __name__ == "__main__":
    main()
