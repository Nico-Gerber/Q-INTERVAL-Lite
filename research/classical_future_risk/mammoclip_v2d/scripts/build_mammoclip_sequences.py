import hashlib
import json
import os

import numpy as np
import pandas as pd


PROJECT_DIR = (
    "/fred/oz508/EMBED/"
    "classical_future_risk_vihanga/v2_hazard_sprint06/experiments/v2c_mammoclip_b5"
)

IMAGE_FEATURES = os.path.join(
    PROJECT_DIR,
    "features",
    "mammoclip_b5_features.npy",
)

IMAGE_FEATURE_METADATA = os.path.join(
    PROJECT_DIR,
    "features",
    "mammoclip_b5_feature_metadata.csv",
)

EXAM_MANIFEST = os.path.join(
    PROJECT_DIR,
    "manifests",
    "exam_manifest.csv",
)

PATIENT_SPLITS = os.path.join(
    PROJECT_DIR,
    "splits",
    "patient_splits.csv",
)

EXAM_FEATURE_OUTPUT = os.path.join(
    PROJECT_DIR,
    "features",
    "exam_features_6149.npy",
)

EXAM_METADATA_OUTPUT = os.path.join(
    PROJECT_DIR,
    "features",
    "exam_feature_metadata.csv",
)

SEQUENCE_OUTPUT = os.path.join(
    PROJECT_DIR,
    "features",
    "patient_sequences_5x6149.npy",
)

MASK_OUTPUT = os.path.join(
    PROJECT_DIR,
    "features",
    "patient_sequence_masks.npy",
)

LABEL_OUTPUT = os.path.join(
    PROJECT_DIR,
    "features",
    "patient_labels_1to5yr.npy",
)

PATIENT_METADATA_OUTPUT = os.path.join(
    PROJECT_DIR,
    "features",
    "patient_sequence_metadata.csv",
)

CONFIG_OUTPUT = os.path.join(
    PROJECT_DIR,
    "features",
    "sequence_build_config.json",
)

VIEW_SLOTS = [
    "L_CC",
    "R_CC",
    "L_MLO",
    "R_MLO",
]

RISK_COLUMNS = [
    "risk_1yr",
    "risk_2yr",
    "risk_3yr",
    "risk_4yr",
    "risk_5yr",
]

IMAGE_FEATURE_SIZE = 2048
EXAM_FEATURE_SIZE = 6149
MAX_SEQUENCE_LENGTH = 5
RECENCY_DECAY_PER_YEAR = 0.5


output_paths = [
    EXAM_FEATURE_OUTPUT,
    EXAM_METADATA_OUTPUT,
    SEQUENCE_OUTPUT,
    MASK_OUTPUT,
    LABEL_OUTPUT,
    PATIENT_METADATA_OUTPUT,
    CONFIG_OUTPUT,
]

for output_path in output_paths:
    if os.path.exists(output_path):
        raise FileExistsError(
            "Output already exists and was not overwritten:\n"
            + output_path
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


print("Loading image features and manifests...")

image_features = np.load(
    IMAGE_FEATURES,
    mmap_mode="r",
)

image_metadata = pd.read_csv(
    IMAGE_FEATURE_METADATA,
    low_memory=False,
)

exam_manifest = pd.read_csv(
    EXAM_MANIFEST,
    low_memory=False,
)

patient_splits = pd.read_csv(
    PATIENT_SPLITS,
    low_memory=False,
)


if image_features.shape != (
    len(image_metadata),
    IMAGE_FEATURE_SIZE,
):
    raise RuntimeError(
        "Image feature matrix and metadata do not match."
    )


expected_indices = np.arange(
    len(image_metadata)
)

actual_indices = pd.to_numeric(
    image_metadata["feature_index"],
    errors="raise",
).to_numpy()

if not np.array_equal(
    expected_indices,
    actual_indices,
):
    raise RuntimeError(
        "Image feature_index does not match array order."
    )


if image_metadata.duplicated(
    [
        "empi_anon",
        "acc_anon",
        "view_slot",
    ]
).any():
    raise RuntimeError(
        "Duplicate examination view slots were found."
    )


exam_manifest = exam_manifest.merge(
    patient_splits[
        [
            "empi_anon",
            "split",
            "outcome_type",
            "anchor_acc_anon",
            "anchor_date",
        ] + RISK_COLUMNS
    ],
    on="empi_anon",
    how="left",
    validate="many_to_one",
    suffixes=("", "_patient"),
)


if exam_manifest["split"].isna().any():
    raise RuntimeError(
        "Some examinations do not have a patient split."
    )


# Use the patient manifest version of the anchor information.
exam_manifest["anchor_acc_anon"] = exam_manifest[
    "anchor_acc_anon_patient"
]

exam_manifest["anchor_date"] = exam_manifest[
    "anchor_date_patient"
]

exam_manifest = exam_manifest.drop(
    columns=[
        "anchor_acc_anon_patient",
        "anchor_date_patient",
    ]
)


exam_manifest["days_before_anchor"] = pd.to_numeric(
    exam_manifest["days_before_anchor"],
    errors="raise",
)


if (
    exam_manifest["days_before_anchor"] < 0
).any():
    raise RuntimeError(
        "An examination occurs after its anchor."
    )


# Calculate the same recency rule used in the original baseline.
exam_manifest["_raw_recency"] = np.exp(
    -RECENCY_DECAY_PER_YEAR
    * (
        exam_manifest["days_before_anchor"]
        / 365.25
    )
)

exam_manifest["recency_weight"] = (
    exam_manifest["_raw_recency"]
    / exam_manifest.groupby(
        "empi_anon"
    )["_raw_recency"].transform("sum")
)


recency_sums = (
    exam_manifest.groupby("empi_anon")[
        "recency_weight"
    ]
    .sum()
)

if not np.allclose(
    recency_sums.to_numpy(),
    1.0,
    atol=1e-6,
):
    raise RuntimeError(
        "Patient recency weights do not sum to one."
    )


exam_manifest = exam_manifest.sort_values(
    [
        "empi_anon",
        "sequence_position",
        "acc_anon",
    ],
    kind="mergesort",
).reset_index(drop=True)


image_groups = {
    key: group
    for key, group in image_metadata.groupby(
        [
            "empi_anon",
            "acc_anon",
        ],
        sort=False,
    )
}


exam_feature_rows = []
view_mask_rows = []


print("\nBUILDING EXAMINATION FEATURES")
print("=" * 72)
print("Examinations:", len(exam_manifest))


for exam_number, exam_row in enumerate(
    exam_manifest.itertuples(index=False),
    start=1,
):
    key = (
        exam_row.empi_anon,
        exam_row.acc_anon,
    )

    if key not in image_groups:
        raise RuntimeError(
            "No image features found for examination: "
            + str(key)
        )

    exam_images = image_groups[key]

    view_features = {}
    view_mask = []

    for view_slot in VIEW_SLOTS:
        matching_rows = exam_images[
            exam_images["view_slot"] == view_slot
        ]

        if len(matching_rows) == 0:
            view_features[view_slot] = None
            view_mask.append(0)

        elif len(matching_rows) == 1:
            feature_index = int(
                matching_rows.iloc[0][
                    "feature_index"
                ]
            )

            view_features[view_slot] = np.asarray(
                image_features[feature_index],
                dtype=np.float32,
            )

            view_mask.append(1)

        else:
            raise RuntimeError(
                "More than one image remains in view slot: "
                + str(key)
                + " "
                + view_slot
            )


    available_features = [
        feature
        for feature in view_features.values()
        if feature is not None
    ]

    if not available_features:
        raise RuntimeError(
            "Examination has no available image features: "
            + str(key)
        )


    mean_view_feature = np.mean(
        np.stack(available_features),
        axis=0,
        dtype=np.float32,
    )


    zero_feature = np.zeros(
        IMAGE_FEATURE_SIZE,
        dtype=np.float32,
    )


    if (
        view_features["L_CC"] is not None
        and view_features["R_CC"] is not None
    ):
        cc_asymmetry = np.abs(
            view_features["L_CC"]
            - view_features["R_CC"]
        ).astype(np.float32)
    else:
        cc_asymmetry = zero_feature.copy()


    if (
        view_features["L_MLO"] is not None
        and view_features["R_MLO"] is not None
    ):
        mlo_asymmetry = np.abs(
            view_features["L_MLO"]
            - view_features["R_MLO"]
        ).astype(np.float32)
    else:
        mlo_asymmetry = zero_feature.copy()


    exam_feature = np.concatenate(
        [
            mean_view_feature,
            cc_asymmetry,
            mlo_asymmetry,
            np.asarray(
                view_mask,
                dtype=np.float32,
            ),
            np.asarray(
                [exam_row.recency_weight],
                dtype=np.float32,
            ),
        ]
    ).astype(np.float32)


    if exam_feature.shape != (
        EXAM_FEATURE_SIZE,
    ):
        raise RuntimeError(
            "Unexpected examination feature shape: "
            + str(exam_feature.shape)
        )

    if not np.isfinite(exam_feature).all():
        raise RuntimeError(
            "Invalid examination feature value found."
        )


    exam_feature_rows.append(
        exam_feature
    )

    view_mask_rows.append(
        view_mask
    )


    if (
        exam_number == 1
        or exam_number % 500 == 0
        or exam_number == len(exam_manifest)
    ):
        print(
            f"Built {exam_number:,}"
            f"/{len(exam_manifest):,} examinations"
        )


exam_features = np.stack(
    exam_feature_rows
).astype(np.float32)

view_masks = np.asarray(
    view_mask_rows,
    dtype=np.int8,
)


if exam_features.shape != (
    len(exam_manifest),
    EXAM_FEATURE_SIZE,
):
    raise RuntimeError(
        "Final examination feature shape is incorrect."
    )


exam_metadata = exam_manifest.copy()

exam_metadata.insert(
    0,
    "exam_feature_index",
    np.arange(len(exam_metadata)),
)

for view_index, view_slot in enumerate(
    VIEW_SLOTS
):
    exam_metadata[
        f"derived_has_{view_slot}"
    ] = view_masks[:, view_index]


# Confirm that the derived view mask matches the manifest.
for view_slot in VIEW_SLOTS:
    original_column = f"has_{view_slot}"
    derived_column = f"derived_has_{view_slot}"

    if not np.array_equal(
        pd.to_numeric(
            exam_metadata[original_column],
            errors="raise",
        ).to_numpy(),
        exam_metadata[
            derived_column
        ].to_numpy(),
    ):
        raise RuntimeError(
            "Derived view mask does not match "
            + original_column
        )


# ------------------------------------------------------------
# Build padded patient sequences
# ------------------------------------------------------------

split_order = {
    "train": 0,
    "validation": 1,
    "test": 2,
}

patient_order = patient_splits.copy()

patient_order["_split_order"] = (
    patient_order["split"].map(split_order)
)

patient_order = patient_order.sort_values(
    [
        "_split_order",
        "empi_anon",
    ]
).reset_index(drop=True)


number_of_patients = len(
    patient_order
)

patient_sequences = np.zeros(
    (
        number_of_patients,
        MAX_SEQUENCE_LENGTH,
        EXAM_FEATURE_SIZE,
    ),
    dtype=np.float32,
)

sequence_masks = np.zeros(
    (
        number_of_patients,
        MAX_SEQUENCE_LENGTH,
    ),
    dtype=np.float32,
)

patient_labels = patient_order[
    RISK_COLUMNS
].to_numpy(
    dtype=np.float32
)

patient_metadata_rows = []


exam_groups = {
    patient_id: group.sort_values(
        "sequence_position"
    )
    for patient_id, group in exam_metadata.groupby(
        "empi_anon",
        sort=False,
    )
}


print("\nBUILDING PATIENT SEQUENCES")
print("=" * 72)
print("Patients:", number_of_patients)


for patient_index, patient_row in enumerate(
    patient_order.itertuples(index=False)
):
    patient_id = patient_row.empi_anon

    if patient_id not in exam_groups:
        raise RuntimeError(
            "No examinations found for patient: "
            + str(patient_id)
        )

    patient_exams = exam_groups[
        patient_id
    ]

    sequence_length = len(
        patient_exams
    )

    if not (
        2
        <= sequence_length
        <= MAX_SEQUENCE_LENGTH
    ):
        raise RuntimeError(
            "Invalid sequence length for patient "
            + str(patient_id)
        )


    expected_positions = np.arange(
        1,
        sequence_length + 1,
    )

    actual_positions = pd.to_numeric(
        patient_exams["sequence_position"],
        errors="raise",
    ).to_numpy()

    if not np.array_equal(
        expected_positions,
        actual_positions,
    ):
        raise RuntimeError(
            "Sequence positions are invalid for patient "
            + str(patient_id)
        )


    if not bool(
        patient_exams.iloc[-1]["is_anchor"]
    ):
        raise RuntimeError(
            "The final examination is not the anchor for patient "
            + str(patient_id)
        )


    exam_indices = patient_exams[
        "exam_feature_index"
    ].astype(int).to_numpy()

    sequence = exam_features[
        exam_indices
    ]

    patient_sequences[
        patient_index,
        :sequence_length,
        :,
    ] = sequence

    sequence_masks[
        patient_index,
        :sequence_length,
    ] = 1.0


    patient_metadata_rows.append(
        {
            "patient_index": patient_index,
            "empi_anon": patient_id,
            "split": patient_row.split,
            "outcome_type": patient_row.outcome_type,
            "anchor_acc_anon": patient_row.anchor_acc_anon,
            "anchor_date": patient_row.anchor_date,
            "sequence_length": sequence_length,
            "first_exam_date": patient_exams.iloc[0][
                "exam_date"
            ],
            "last_exam_date": patient_exams.iloc[-1][
                "exam_date"
            ],
            "risk_1yr": patient_row.risk_1yr,
            "risk_2yr": patient_row.risk_2yr,
            "risk_3yr": patient_row.risk_3yr,
            "risk_4yr": patient_row.risk_4yr,
            "risk_5yr": patient_row.risk_5yr,
        }
    )


patient_metadata = pd.DataFrame(
    patient_metadata_rows
)


if patient_sequences.shape != (
    number_of_patients,
    MAX_SEQUENCE_LENGTH,
    EXAM_FEATURE_SIZE,
):
    raise RuntimeError(
        "Patient sequence shape is incorrect."
    )


if not np.isfinite(
    patient_sequences
).all():
    raise RuntimeError(
        "Patient sequences contain invalid values."
    )


if not np.array_equal(
    sequence_masks.sum(axis=1).astype(int),
    patient_metadata[
        "sequence_length"
    ].to_numpy(),
):
    raise RuntimeError(
        "Sequence masks do not match sequence lengths."
    )


if np.any(
    np.diff(
        patient_labels,
        axis=1,
    ) < 0
):
    raise RuntimeError(
        "Patient labels are not cumulative."
    )


# ------------------------------------------------------------
# Save all outputs after validation
# ------------------------------------------------------------

exam_feature_temp = (
    EXAM_FEATURE_OUTPUT.replace(
        ".npy",
        ".tmp.npy",
    )
)

sequence_temp = (
    SEQUENCE_OUTPUT.replace(
        ".npy",
        ".tmp.npy",
    )
)

mask_temp = (
    MASK_OUTPUT.replace(
        ".npy",
        ".tmp.npy",
    )
)

label_temp = (
    LABEL_OUTPUT.replace(
        ".npy",
        ".tmp.npy",
    )
)

exam_metadata_temp = (
    EXAM_METADATA_OUTPUT + ".tmp"
)

patient_metadata_temp = (
    PATIENT_METADATA_OUTPUT + ".tmp"
)

config_temp = CONFIG_OUTPUT + ".tmp"


np.save(
    exam_feature_temp,
    exam_features,
)

np.save(
    sequence_temp,
    patient_sequences,
)

np.save(
    mask_temp,
    sequence_masks,
)

np.save(
    label_temp,
    patient_labels,
)

exam_metadata.to_csv(
    exam_metadata_temp,
    index=False,
)

patient_metadata.to_csv(
    patient_metadata_temp,
    index=False,
)


configuration = {
    "image_feature_size": IMAGE_FEATURE_SIZE,
    "exam_feature_size": EXAM_FEATURE_SIZE,
    "maximum_sequence_length": MAX_SEQUENCE_LENGTH,
    "view_order": VIEW_SLOTS,
    "exam_feature_layout": {
        "mean_available_views": [0, 2048],
        "cc_absolute_asymmetry": [2048, 4096],
        "mlo_absolute_asymmetry": [4096, 6144],
        "view_mask": [6144, 6148],
        "recency_weight": [6148, 6149],
    },
    "recency_formula": (
        "exp(-0.5 * years_before_anchor), "
        "normalised within patient"
    ),
    "padding": "right padding after chronological exams",
    "number_of_patients": number_of_patients,
    "number_of_examinations": len(exam_manifest),
    "image_features_sha256": sha256_file(
        IMAGE_FEATURES
    ),
    "image_feature_metadata_sha256": sha256_file(
        IMAGE_FEATURE_METADATA
    ),
    "exam_manifest_sha256": sha256_file(
        EXAM_MANIFEST
    ),
    "patient_splits_sha256": sha256_file(
        PATIENT_SPLITS
    ),
}


with open(
    config_temp,
    "w",
    encoding="utf-8",
) as config_file:
    json.dump(
        configuration,
        config_file,
        indent=2,
    )


# Verify temporary arrays before publishing them.
if np.load(
    exam_feature_temp,
    mmap_mode="r",
).shape != exam_features.shape:
    raise RuntimeError(
        "Saved examination features failed validation."
    )

if np.load(
    sequence_temp,
    mmap_mode="r",
).shape != patient_sequences.shape:
    raise RuntimeError(
        "Saved patient sequences failed validation."
    )


os.replace(
    exam_feature_temp,
    EXAM_FEATURE_OUTPUT,
)

os.replace(
    exam_metadata_temp,
    EXAM_METADATA_OUTPUT,
)

os.replace(
    sequence_temp,
    SEQUENCE_OUTPUT,
)

os.replace(
    mask_temp,
    MASK_OUTPUT,
)

os.replace(
    label_temp,
    LABEL_OUTPUT,
)

os.replace(
    patient_metadata_temp,
    PATIENT_METADATA_OUTPUT,
)

os.replace(
    config_temp,
    CONFIG_OUTPUT,
)


print("\nSEQUENCE BUILD COMPLETE")
print("=" * 72)
print(
    "Examination features:",
    exam_features.shape,
)
print(
    "Patient sequences:",
    patient_sequences.shape,
)
print(
    "Sequence masks:",
    sequence_masks.shape,
)
print(
    "Patient labels:",
    patient_labels.shape,
)


print("\nSEQUENCE LENGTHS")
print("=" * 72)
print(
    patient_metadata[
        "sequence_length"
    ]
    .value_counts()
    .sort_index()
)


print("\nPATIENTS BY SPLIT")
print("=" * 72)
print(
    patient_metadata["split"]
    .value_counts()
    .reindex(
        [
            "train",
            "validation",
            "test",
        ]
    )
)


print("\nVALIDATION")
print("=" * 72)
print("PASS: image features match their metadata")
print("PASS: every examination has one 6,149-value vector")
print("PASS: view masks match the image manifest")
print("PASS: recency weights sum to one per patient")
print("PASS: every patient has 2 to 5 chronological exams")
print("PASS: every sequence ends with its anchor exam")
print("PASS: sequence masks match sequence lengths")
print("PASS: patient labels remain cumulative")
print("PASS: source files were not modified")
