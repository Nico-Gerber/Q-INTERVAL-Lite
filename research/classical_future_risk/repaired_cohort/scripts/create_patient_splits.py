import hashlib
import os

import numpy as np
import pandas as pd


PROJECT_DIR = "/fred/oz508/EMBED/classical_future_risk_vihanga/v2_hazard_sprint05/rebuild_repaired"

PATIENT_MANIFEST = os.path.join(
    PROJECT_DIR,
    "manifests",
    "patient_anchor_manifest.csv",
)

EXAM_MANIFEST = os.path.join(
    PROJECT_DIR,
    "manifests",
    "exam_manifest.csv",
)

IMAGE_MANIFEST = os.path.join(
    PROJECT_DIR,
    "manifests",
    "image_manifest.csv",
)

SPLIT_OUTPUT = os.path.join(
    PROJECT_DIR,
    "splits",
    "patient_splits.csv",
)

RANDOM_SEED = 42
VALIDATION_RATIO = 0.15
TEST_RATIO = 0.15

RISK_COLUMNS = [
    "risk_1yr",
    "risk_2yr",
    "risk_3yr",
    "risk_4yr",
    "risk_5yr",
]


if os.path.exists(SPLIT_OUTPUT):
    raise FileExistsError(
        "The split file already exists and was not overwritten:\n"
        + SPLIT_OUTPUT
    )


print("Loading corrected manifests...")

patients = pd.read_csv(
    PATIENT_MANIFEST,
    low_memory=False,
)

exams = pd.read_csv(
    EXAM_MANIFEST,
    usecols=[
        "empi_anon",
        "acc_anon",
    ],
    low_memory=False,
)

images = pd.read_csv(
    IMAGE_MANIFEST,
    usecols=[
        "empi_anon",
        "acc_anon",
        "filename",
    ],
    low_memory=False,
)


# Validate the patient manifest.
if patients["empi_anon"].duplicated().any():
    raise RuntimeError(
        "The patient manifest contains duplicate patients."
    )

for column in RISK_COLUMNS:
    patients[column] = pd.to_numeric(
        patients[column],
        errors="raise",
    ).astype(int)

    if not patients[column].isin([0, 1]).all():
        raise RuntimeError(
            f"{column} contains a value other than 0 or 1."
        )


# Confirm that cumulative labels never change from 1 back to 0.
risk_array = patients[RISK_COLUMNS].to_numpy()

if np.any(np.diff(risk_array, axis=1) < 0):
    raise RuntimeError(
        "The cumulative risk labels are not monotonic."
    )


# Create a label pattern for stratification.
# Examples:
# 00000 = no cancer within five years
# 11111 = cancer within one year
# 01111 = cancer after year one but within year two
patients["stratification_group"] = (
    patients[RISK_COLUMNS]
    .astype(str)
    .agg("".join, axis=1)
)


group_names = {
    "00000": "no_cancer_within_5yr",
    "00001": "cancer_between_4_and_5yr",
    "00011": "cancer_between_3_and_4yr",
    "00111": "cancer_between_2_and_3yr",
    "01111": "cancer_between_1_and_2yr",
    "11111": "cancer_within_1yr",
}

patients["event_interval"] = (
    patients["stratification_group"]
    .map(group_names)
)


if patients["event_interval"].isna().any():
    unknown_patterns = sorted(
        patients.loc[
            patients["event_interval"].isna(),
            "stratification_group",
        ].unique()
    )

    raise RuntimeError(
        "Unexpected label patterns found: "
        + str(unknown_patterns)
    )


# Perform a deterministic stratified patient split.
rng = np.random.default_rng(RANDOM_SEED)

split_records = []


for group_name, group in patients.groupby(
    "stratification_group",
    sort=True,
):
    patient_ids = (
        group["empi_anon"]
        .sort_values()
        .to_numpy(copy=True)
    )

    rng.shuffle(patient_ids)

    group_size = len(patient_ids)

    # Every current group contains at least eight patients.
    # Keep at least one patient from each group in validation
    # and testing.
    validation_count = max(
        1,
        int(round(group_size * VALIDATION_RATIO)),
    )

    test_count = max(
        1,
        int(round(group_size * TEST_RATIO)),
    )

    training_count = (
        group_size
        - validation_count
        - test_count
    )

    if training_count < 1:
        raise RuntimeError(
            f"Stratification group {group_name} "
            "is too small to split safely."
        )

    training_ids = patient_ids[
        :training_count
    ]

    validation_ids = patient_ids[
        training_count:
        training_count + validation_count
    ]

    test_ids = patient_ids[
        training_count + validation_count:
    ]

    for patient_id in training_ids:
        split_records.append(
            {
                "empi_anon": patient_id,
                "split": "train",
            }
        )

    for patient_id in validation_ids:
        split_records.append(
            {
                "empi_anon": patient_id,
                "split": "validation",
            }
        )

    for patient_id in test_ids:
        split_records.append(
            {
                "empi_anon": patient_id,
                "split": "test",
            }
        )


split_assignment = pd.DataFrame(
    split_records
)


if split_assignment["empi_anon"].duplicated().any():
    raise RuntimeError(
        "A patient was assigned to more than one split."
    )

if set(split_assignment["empi_anon"]) != set(
    patients["empi_anon"]
):
    raise RuntimeError(
        "The split does not contain every patient."
    )


patient_splits = patients.merge(
    split_assignment,
    on="empi_anon",
    how="left",
    validate="one_to_one",
)


split_order = {
    "train": 0,
    "validation": 1,
    "test": 2,
}

patient_splits["_split_order"] = (
    patient_splits["split"].map(split_order)
)

patient_splits = patient_splits.sort_values(
    [
        "_split_order",
        "stratification_group",
        "empi_anon",
    ]
).drop(
    columns=["_split_order"]
).reset_index(drop=True)


output_columns = [
    "empi_anon",
    "split",
    "stratification_group",
    "event_interval",
    "outcome_type",
    "anchor_acc_anon",
    "anchor_date",
] + RISK_COLUMNS


patient_splits = patient_splits[
    output_columns
]


# Verify that every examination and image can receive a split.
exam_check = exams.merge(
    patient_splits[
        ["empi_anon", "split"]
    ],
    on="empi_anon",
    how="left",
    validate="many_to_one",
)

image_check = images.merge(
    patient_splits[
        ["empi_anon", "split"]
    ],
    on="empi_anon",
    how="left",
    validate="many_to_one",
)


if exam_check["split"].isna().any():
    raise RuntimeError(
        "Some examinations do not have a patient split."
    )

if image_check["split"].isna().any():
    raise RuntimeError(
        "Some images do not have a patient split."
    )


# Save atomically after all checks have passed.
temporary_output = SPLIT_OUTPUT + ".tmp"

patient_splits.to_csv(
    temporary_output,
    index=False,
)

os.replace(
    temporary_output,
    SPLIT_OUTPUT,
)


def sha256_file(path):
    digest = hashlib.sha256()

    with open(path, "rb") as file_handle:
        for block in iter(
            lambda: file_handle.read(1024 * 1024),
            b"",
        ):
            digest.update(block)

    return digest.hexdigest()


print("\nPATIENT SPLIT COMPLETE")
print("=" * 76)
print("Random seed:", RANDOM_SEED)
print("Split file:", SPLIT_OUTPUT)

print("\nPATIENT COUNTS")
print("=" * 76)
print(
    patient_splits["split"]
    .value_counts()
    .reindex(
        ["train", "validation", "test"]
    )
)

print("\nEXAMINATION COUNTS")
print("=" * 76)
print(
    exam_check["split"]
    .value_counts()
    .reindex(
        ["train", "validation", "test"]
    )
)

print("\nIMAGE COUNTS")
print("=" * 76)
print(
    image_check["split"]
    .value_counts()
    .reindex(
        ["train", "validation", "test"]
    )
)

print("\nEVENT-INTERVAL STRATIFICATION")
print("=" * 76)
print(
    pd.crosstab(
        patient_splits["event_interval"],
        patient_splits["split"],
    )
    .reindex(
        columns=[
            "train",
            "validation",
            "test",
        ]
    )
)

print("\nPOSITIVE PATIENTS BY HORIZON")
print("=" * 76)

for year in range(1, 6):
    label = f"risk_{year}yr"

    counts = (
        patient_splits.groupby("split")[label]
        .sum()
        .reindex(
            ["train", "validation", "test"]
        )
        .astype(int)
    )

    print(f"\n{year}-year")
    print(counts.to_string())

print("\nMANIFEST CHECKSUMS")
print("=" * 76)
print(
    "patient_anchor_manifest.csv:",
    sha256_file(PATIENT_MANIFEST),
)
print(
    "exam_manifest.csv:",
    sha256_file(EXAM_MANIFEST),
)
print(
    "image_manifest.csv:",
    sha256_file(IMAGE_MANIFEST),
)

print("\nVALIDATION")
print("=" * 76)
print("PASS: every patient was assigned exactly once")
print("PASS: no patient appears in multiple splits")
print("PASS: every label interval is represented in each split")
print("PASS: every examination received a split")
print("PASS: every image received a split")
print("PASS: the corrected manifests were not modified")
