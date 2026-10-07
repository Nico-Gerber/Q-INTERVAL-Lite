import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(
    "/fred/oz508/EMBED/"
    "classical_future_risk_vihanga/"
    "v2_hazard_sprint06"
)

SPATIAL_METADATA = (
    ROOT / "spatial_features/"
    "resnet50_spatial_metadata.csv"
)

EXAM_METADATA = (
    ROOT / "features/"
    "exam_feature_metadata.csv"
)

PATIENT_METADATA = (
    ROOT / "features/"
    "patient_sequence_metadata.csv"
)

SEQUENCE_MASKS = (
    ROOT / "features/"
    "patient_sequence_masks.npy"
)

OUTPUT_INDEX = (
    ROOT / "spatial_features/"
    "patient_spatial_indices_5x4.npy"
)

OUTPUT_SUMMARY = (
    ROOT / "spatial_features/"
    "patient_spatial_index_summary.json"
)

VIEW_SLOTS = [
    "L_CC",
    "R_CC",
    "L_MLO",
    "R_MLO",
]

for output_path in [
    OUTPUT_INDEX,
    OUTPUT_SUMMARY,
]:
    if output_path.exists():
        raise FileExistsError(
            f"Output already exists: {output_path}"
        )

spatial = pd.read_csv(
    SPATIAL_METADATA,
    low_memory=False,
)

exams = pd.read_csv(
    EXAM_METADATA,
    low_memory=False,
)

patients = pd.read_csv(
    PATIENT_METADATA,
    low_memory=False,
)

sequence_masks = np.load(
    SEQUENCE_MASKS,
    mmap_mode="r",
)

assert len(spatial) == 19054
assert len(exams) == 4942
assert len(patients) == 2230
assert sequence_masks.shape == (2230, 5)

if not spatial["view_slot"].isin(
    VIEW_SLOTS
).all():
    raise RuntimeError(
        "Unsupported spatial view slot found"
    )

duplicate_keys = spatial.duplicated(
    [
        "empi_anon",
        "acc_anon",
        "view_slot",
    ]
)

if duplicate_keys.any():
    raise RuntimeError(
        "Duplicate patient-exam-view rows found"
    )

exam_lookup = exams[
    [
        "empi_anon",
        "acc_anon",
        "sequence_position",
    ]
].drop_duplicates()

patient_lookup = patients[
    [
        "patient_index",
        "empi_anon",
    ]
]

mapped = spatial.merge(
    exam_lookup,
    on=["empi_anon", "acc_anon"],
    how="left",
    validate="many_to_one",
)

if not np.array_equal(
    mapped["sequence_position_x"].to_numpy(),
    mapped["sequence_position_y"].to_numpy(),
):
    raise RuntimeError(
        "Spatial and examination sequence "
        "positions disagree"
    )

mapped["sequence_position"] = mapped[
    "sequence_position_x"
]

mapped = mapped.drop(
    columns=[
        "sequence_position_x",
        "sequence_position_y",
    ]
)

mapped = mapped.merge(
    patient_lookup,
    on="empi_anon",
    how="left",
    validate="many_to_one",
)

if mapped[
    [
        "patient_index",
        "sequence_position",
    ]
].isna().any().any():
    raise RuntimeError(
        "A spatial image could not be mapped"
    )

mapped["view_index"] = mapped[
    "view_slot"
].map(
    {
        slot: index
        for index, slot in enumerate(VIEW_SLOTS)
    }
)

positions = mapped[
    "sequence_position"
].to_numpy(dtype=np.int64) - 1

if np.any(
    (positions < 0) | (positions >= 5)
):
    raise RuntimeError(
        "Invalid sequence position found"
    )

spatial_indices = np.full(
    (2230, 5, 4),
    -1,
    dtype=np.int64,
)

spatial_indices[
    mapped["patient_index"].to_numpy(
        dtype=np.int64
    ),
    positions,
    mapped["view_index"].to_numpy(
        dtype=np.int64
    ),
] = mapped["feature_index"].to_numpy(
    dtype=np.int64
)

available_views = (
    spatial_indices >= 0
)

mapped_exam_mask = available_views.any(
    axis=2
)

expected_exam_mask = (
    np.asarray(sequence_masks) == 1
)

if not np.array_equal(
    mapped_exam_mask,
    expected_exam_mask,
):
    raise RuntimeError(
        "Spatial examination mapping disagrees "
        "with sequence masks"
    )

if int(available_views.sum()) != 19054:
    raise RuntimeError(
        "Not every spatial image was assigned"
    )

valid_indices = spatial_indices[
    available_views
]

if (
    valid_indices.min() != 0
    or valid_indices.max() != 19053
    or len(np.unique(valid_indices)) != 19054
):
    raise RuntimeError(
        "Spatial feature indices are incomplete"
    )

view_counts = available_views.sum(
    axis=2
)

valid_view_counts = view_counts[
    expected_exam_mask
]

np.save(
    OUTPUT_INDEX,
    spatial_indices,
)


def sha256_file(path):
    digest = hashlib.sha256()

    with Path(path).open("rb") as handle:
        for block in iter(
            lambda: handle.read(1024 * 1024),
            b"",
        ):
            digest.update(block)

    return digest.hexdigest()


summary = {
    "shape": list(spatial_indices.shape),
    "dtype": str(spatial_indices.dtype),
    "patients": len(patients),
    "examinations": int(
        expected_exam_mask.sum()
    ),
    "mapped_images": int(
        available_views.sum()
    ),
    "missing_view_slots": int(
        (
            expected_exam_mask[:, :, None]
            & ~available_views
        ).sum()
    ),
    "images_by_view": {
        slot: int(
            available_views[:, :, index].sum()
        )
        for index, slot in enumerate(VIEW_SLOTS)
    },
    "examinations_by_view_count": {
        str(count): int(
            (valid_view_counts == count).sum()
        )
        for count in range(1, 5)
    },
    "patients_by_split": {
        key: int(value)
        for key, value in patients[
            "split"
        ].value_counts().items()
    },
}

summary["source_sha256"] = {
    "spatial_metadata": sha256_file(
        SPATIAL_METADATA
    ),
    "exam_metadata": sha256_file(
        EXAM_METADATA
    ),
    "patient_metadata": sha256_file(
        PATIENT_METADATA
    ),
    "sequence_masks": sha256_file(
        SEQUENCE_MASKS
    ),
}

summary["output_index_sha256"] = sha256_file(
    OUTPUT_INDEX
)

temporary_summary = OUTPUT_SUMMARY.with_suffix(
    ".json.tmp"
)

temporary_summary.write_text(
    json.dumps(summary, indent=2) + "\n",
    encoding="utf-8",
)

temporary_summary.replace(
    OUTPUT_SUMMARY
)

print("V2D SPATIAL INDEX COMPLETE")
print(json.dumps(summary, indent=2))
print("Index:", OUTPUT_INDEX)
print("Summary:", OUTPUT_SUMMARY)
print("V2D SPATIAL ALIGNMENT: PASS")
