import contextlib
import io
import os
import runpy

import numpy as np
import pandas as pd


PROJECT_DIR = "/fred/oz508/EMBED/classical_future_risk_vihanga/v2_hazard_sprint05/rebuild_repaired"

METADATA_CSV = (
    "/fred/oz508/EMBED/tables/"
    "EMBED_OpenData_metadata.csv"
)

MANIFEST_DIR = os.path.join(
    PROJECT_DIR,
    "manifests",
)

VIEW_MODIFIER = (
    "0_ViewCodeSequence_0_"
    "ViewModifierCodeSequence_CodeMeaning"
)

VIEW_SLOTS = [
    "L_CC",
    "R_CC",
    "L_MLO",
    "R_MLO",
]

PATIENT_OUTPUT = os.path.join(
    MANIFEST_DIR,
    "patient_anchor_manifest.csv",
)

EXAM_OUTPUT = os.path.join(
    MANIFEST_DIR,
    "exam_manifest.csv",
)

IMAGE_OUTPUT = os.path.join(
    MANIFEST_DIR,
    "image_manifest.csv",
)


# Do not overwrite an existing completed manifest.
existing_outputs = [
    path
    for path in [
        PATIENT_OUTPUT,
        EXAM_OUTPUT,
        IMAGE_OUTPUT,
    ]
    if os.path.exists(path)
]

if existing_outputs:
    raise FileExistsError(
        "Manifest files already exist. "
        "They were not overwritten:\n"
        + "\n".join(existing_outputs)
    )


print("Reconstructing the audited cohort...")


# Reuse the exact cohort logic from the previous audit.
with contextlib.redirect_stdout(io.StringIO()):
    previous = runpy.run_path(
        os.path.join(
            PROJECT_DIR,
            "scripts",
            "audit_selected_view_slots.py",
        )
    )


one_anchor = previous["one_anchor"].copy()
selected_exams = previous["selected_exams"].copy()
selected_images = previous["selected_images"].copy()


print("Loading image-selection metadata...")


metadata_columns = [
    "anon_dicom_path",
    "PresentationIntentType",
    "ImageType",
    "QualityControlImage",
    "SeriesDescription",
    "SeriesNumber",
    "InstanceNumber",
    "Rows",
    "Columns",
    "BreastImplantPresent",
    VIEW_MODIFIER,
    "DerivationDescription",
    "ProtocolName",
]


metadata = pd.read_csv(
    METADATA_CSV,
    usecols=metadata_columns,
    low_memory=False,
)

metadata = metadata.rename(
    columns={
        "anon_dicom_path": "metadata_dicom_path",
    }
)

metadata = metadata.drop_duplicates(
    subset=["metadata_dicom_path"],
    keep="first",
)


image_candidates = selected_images.merge(
    metadata,
    left_on="original_dcm_path",
    right_on="metadata_dicom_path",
    how="left",
    validate="many_to_one",
)


if image_candidates["metadata_dicom_path"].isna().any():
    raise RuntimeError(
        "Some selected images could not be linked "
        "to the full metadata table."
    )


# ------------------------------------------------------------
# Deterministic duplicate-view selection
# ------------------------------------------------------------

slot_keys = [
    "empi_anon",
    "acc_anon",
    "view_slot",
]


def normalise_text(series):
    return (
        series.fillna("")
        .astype(str)
        .str.strip()
        .str.upper()
    )


image_candidates["_presentation"] = normalise_text(
    image_candidates["PresentationIntentType"]
)

image_candidates["_quality_control"] = normalise_text(
    image_candidates["QualityControlImage"]
)

image_candidates["_modifier"] = normalise_text(
    image_candidates[VIEW_MODIFIER]
)

image_candidates["_implant"] = normalise_text(
    image_candidates["BreastImplantPresent"]
)


# Identify implant-related slots even if the implant field is
# missing from one of the repeated image records.
image_candidates["_implant_signal"] = (
    image_candidates["_implant"].eq("YES")
    | image_candidates["_modifier"].eq(
        "IMPLANT DISPLACED"
    )
)

image_candidates["_slot_has_implant"] = (
    image_candidates.groupby(
        slot_keys
    )["_implant_signal"]
    .transform("max")
    .astype(bool)
)


# Lower ranks are preferred.
image_candidates["_qc_rank"] = np.where(
    image_candidates["_quality_control"].eq("YES"),
    1,
    0,
)

image_candidates["_presentation_rank"] = np.where(
    image_candidates["_presentation"].eq(
        "FOR PRESENTATION"
    ),
    0,
    1,
)


# For implant slots, prefer implant-displaced images.
# Otherwise, prefer an image without a view modifier.
implant_slot = image_candidates[
    "_slot_has_implant"
]

modifier = image_candidates["_modifier"]

image_candidates["_modifier_rank"] = np.select(
    [
        implant_slot
        & modifier.eq("IMPLANT DISPLACED"),

        implant_slot
        & modifier.eq(""),

        implant_slot,

        (~implant_slot)
        & modifier.eq(""),
    ],
    [
        0,
        1,
        2,
        0,
    ],
    default=1,
)


rows = pd.to_numeric(
    image_candidates["Rows"],
    errors="coerce",
)

columns = pd.to_numeric(
    image_candidates["Columns"],
    errors="coerce",
)

image_candidates["_pixel_area"] = (
    rows * columns
).fillna(-1)

image_candidates["_instance_number"] = (
    pd.to_numeric(
        image_candidates["InstanceNumber"],
        errors="coerce",
    )
    .fillna(np.inf)
)

image_candidates["_series_number"] = (
    pd.to_numeric(
        image_candidates["SeriesNumber"],
        errors="coerce",
    )
    .fillna(np.inf)
)


image_candidates["candidate_count"] = (
    image_candidates.groupby(slot_keys)["filename"]
    .transform("size")
)


ranked_images = image_candidates.sort_values(
    slot_keys
    + [
        "_qc_rank",
        "_presentation_rank",
        "_modifier_rank",
        "_pixel_area",
        "_instance_number",
        "_series_number",
        "filename",
    ],
    ascending=[
        True,
        True,
        True,
        True,
        True,
        True,
        False,
        True,
        True,
        True,
    ],
    kind="mergesort",
).copy()


ranked_images["selection_rank"] = (
    ranked_images.groupby(slot_keys)
    .cumcount()
    + 1
)


chosen_images = ranked_images[
    ranked_images["selection_rank"] == 1
].copy()

chosen_images["selection_reason"] = np.where(
    chosen_images["candidate_count"] == 1,
    "only_candidate",
    "ranked_duplicate",
)


if chosen_images.duplicated(slot_keys).any():
    raise RuntimeError(
        "Duplicate view slots remain after selection."
    )

if chosen_images["file_exists"].eq(False).any():
    raise RuntimeError(
        "A selected PNG file is missing."
    )

if chosen_images["_quality_control"].eq("YES").any():
    raise RuntimeError(
        "A quality-control image was selected."
    )


# ------------------------------------------------------------
# Examination manifest
# ------------------------------------------------------------

for date_column in [
    "exam_date",
    "anchor_date",
]:
    selected_exams[date_column] = pd.to_datetime(
        selected_exams[date_column],
        errors="coerce",
    )


exam_manifest = selected_exams[
    [
        "empi_anon",
        "acc_anon",
        "exam_date",
        "anchor_acc_anon",
        "anchor_date",
        "sequence_position",
    ]
].copy()


exam_manifest = exam_manifest.sort_values(
    [
        "empi_anon",
        "exam_date",
        "acc_anon",
    ]
).reset_index(drop=True)


exam_manifest["sequence_length"] = (
    exam_manifest.groupby("empi_anon")[
        "acc_anon"
    ]
    .transform("size")
)


exam_manifest["is_anchor"] = (
    exam_manifest["acc_anon"].eq(
        exam_manifest["anchor_acc_anon"]
    )
    & exam_manifest["exam_date"].eq(
        exam_manifest["anchor_date"]
    )
)


exam_manifest["days_before_anchor"] = (
    exam_manifest["anchor_date"]
    - exam_manifest["exam_date"]
).dt.days


exam_manifest[
    "time_from_previous_exam_days"
] = (
    exam_manifest.groupby("empi_anon")[
        "exam_date"
    ]
    .diff()
    .dt.days
)


# Create the four-view availability mask.
view_presence = (
    chosen_images.assign(present=1)
    .pivot_table(
        index=["empi_anon", "acc_anon"],
        columns="view_slot",
        values="present",
        aggfunc="max",
        fill_value=0,
    )
    .reset_index()
)

view_presence.columns.name = None


for slot in VIEW_SLOTS:
    if slot not in view_presence.columns:
        view_presence[slot] = 0

    view_presence[f"has_{slot}"] = (
        view_presence[slot]
        .astype(int)
    )


view_presence["num_available_views"] = (
    view_presence[
        [
            f"has_{slot}"
            for slot in VIEW_SLOTS
        ]
    ]
    .sum(axis=1)
)


exam_manifest = exam_manifest.merge(
    view_presence[
        [
            "empi_anon",
            "acc_anon",
            "num_available_views",
        ]
        + [
            f"has_{slot}"
            for slot in VIEW_SLOTS
        ]
    ],
    on=["empi_anon", "acc_anon"],
    how="left",
    validate="one_to_one",
)


# Every selected patient must have exactly one anchor.
anchor_counts = (
    exam_manifest.groupby("empi_anon")[
        "is_anchor"
    ]
    .sum()
)

if not anchor_counts.eq(1).all():
    raise RuntimeError(
        "Some patients do not have exactly one anchor."
    )

if not exam_manifest[
    "sequence_length"
].between(2, 5).all():
    raise RuntimeError(
        "A sequence has fewer than 2 or more than 5 exams."
    )


# ------------------------------------------------------------
# Patient anchor manifest and corrected labels
# ------------------------------------------------------------

patient_manifest = one_anchor.copy()

patient_manifest = patient_manifest.rename(
    columns={
        "acc_anon": "anchor_acc_anon",
        "exam_date": "anchor_date",
    }
)


for date_column in [
    "anchor_date",
    "first_cancer_date",
    "observation_end_date",
]:
    patient_manifest[date_column] = pd.to_datetime(
        patient_manifest[date_column],
        errors="coerce",
    )


sequence_summary = (
    exam_manifest.groupby(
        "empi_anon",
        as_index=False,
    )
    .agg(
        sequence_length=(
            "acc_anon",
            "size",
        ),
        first_sequence_date=(
            "exam_date",
            "min",
        ),
        last_sequence_date=(
            "exam_date",
            "max",
        ),
    )
)


patient_manifest = patient_manifest.merge(
    sequence_summary,
    on="empi_anon",
    how="left",
    validate="one_to_one",
)


event_days = pd.to_numeric(
    patient_manifest["days_to_cancer"],
    errors="coerce",
)


for year in range(1, 6):
    horizon_days = round(365.25 * year)

    patient_manifest[
        f"risk_{year}yr"
    ] = (
        event_days.notna()
        & (event_days > 0)
        & (event_days <= horizon_days)
    ).astype(int)

    patient_manifest[
        f"label_known_{year}yr"
    ] = 1


five_year_days = round(365.25 * 5)

patient_manifest["outcome_type"] = np.select(
    [
        event_days.notna()
        & (event_days > 0)
        & (event_days <= five_year_days),

        event_days > five_year_days,
    ],
    [
        "cancer_within_5yr",
        "cancer_after_5yr",
    ],
    default="cancer_free_5yr_followup",
)


label_columns = [
    f"risk_{year}yr"
    for year in range(1, 6)
]


# A cumulative risk label cannot change from 1 back to 0.
label_values = patient_manifest[
    label_columns
].to_numpy()

if np.any(np.diff(label_values, axis=1) < 0):
    raise RuntimeError(
        "The cumulative labels are not monotonic."
    )


patient_columns = [
    "empi_anon",
    "anchor_acc_anon",
    "anchor_date",
    "first_sequence_date",
    "last_sequence_date",
    "sequence_length",
    "history_count",
    "first_cancer_date",
    "observation_end_date",
    "days_to_cancer",
    "followup_days",
    "outcome_type",
] + label_columns + [
    f"label_known_{year}yr"
    for year in range(1, 6)
]


patient_manifest = patient_manifest[
    patient_columns
].sort_values(
    "empi_anon"
).reset_index(drop=True)


# ------------------------------------------------------------
# Image manifest
# ------------------------------------------------------------

image_base = chosen_images.drop(
    columns=[
        "sequence_position",
        "anchor_date",
    ],
    errors="ignore",
)


image_manifest = image_base.merge(
    exam_manifest[
        [
            "empi_anon",
            "acc_anon",
            "exam_date",
            "anchor_date",
            "sequence_position",
            "sequence_length",
            "is_anchor",
            "days_before_anchor",
        ]
    ],
    on=["empi_anon", "acc_anon"],
    how="left",
    validate="many_to_one",
)


image_columns = [
    "empi_anon",
    "acc_anon",
    "exam_date",
    "anchor_date",
    "sequence_position",
    "sequence_length",
    "is_anchor",
    "days_before_anchor",
    "view_slot",
    "filename",
    "image_path",
    "original_dcm_path",
    "candidate_count",
    "selection_reason",
    "PresentationIntentType",
    "ImageType",
    "QualityControlImage",
    "BreastImplantPresent",
    VIEW_MODIFIER,
    "Rows",
    "Columns",
    "SeriesNumber",
    "InstanceNumber",
    "SeriesDescription",
    "ProtocolName",
]


image_manifest = image_manifest[
    image_columns
].sort_values(
    [
        "empi_anon",
        "sequence_position",
        "view_slot",
    ]
).reset_index(drop=True)


exam_columns = [
    "empi_anon",
    "acc_anon",
    "exam_date",
    "anchor_acc_anon",
    "anchor_date",
    "sequence_position",
    "sequence_length",
    "is_anchor",
    "days_before_anchor",
    "time_from_previous_exam_days",
    "num_available_views",
    "has_L_CC",
    "has_R_CC",
    "has_L_MLO",
    "has_R_MLO",
]


exam_manifest = exam_manifest[
    exam_columns
].sort_values(
    [
        "empi_anon",
        "sequence_position",
    ]
).reset_index(drop=True)


# ------------------------------------------------------------
# Final validation
# ------------------------------------------------------------

if patient_manifest["empi_anon"].duplicated().any():
    raise RuntimeError(
        "Duplicate patients exist in the patient manifest."
    )

if exam_manifest.duplicated(
    ["empi_anon", "acc_anon"]
).any():
    raise RuntimeError(
        "Duplicate examinations exist in the exam manifest."
    )

if image_manifest.duplicated(
    [
        "empi_anon",
        "acc_anon",
        "view_slot",
    ]
).any():
    raise RuntimeError(
        "Duplicate view slots exist in the image manifest."
    )

if image_manifest["image_path"].map(
    os.path.isfile
).eq(False).any():
    raise RuntimeError(
        "The image manifest contains a missing file."
    )

patient_ids = set(
    patient_manifest["empi_anon"]
)

exam_patient_ids = set(
    exam_manifest["empi_anon"]
)

image_patient_ids = set(
    image_manifest["empi_anon"]
)

if not (
    patient_ids
    == exam_patient_ids
    == image_patient_ids
):
    raise RuntimeError(
        "Patient IDs differ between manifests."
    )


# Convert dates to a consistent CSV format.
date_columns_by_manifest = [
    (
        patient_manifest,
        [
            "anchor_date",
            "first_sequence_date",
            "last_sequence_date",
            "first_cancer_date",
            "observation_end_date",
        ],
    ),
    (
        exam_manifest,
        [
            "exam_date",
            "anchor_date",
        ],
    ),
    (
        image_manifest,
        [
            "exam_date",
            "anchor_date",
        ],
    ),
]


for dataframe, date_columns in date_columns_by_manifest:
    for column in date_columns:
        dataframe[column] = (
            pd.to_datetime(
                dataframe[column],
                errors="coerce",
            )
            .dt.strftime("%Y-%m-%d")
        )


# Write temporary files first. Final files appear only after
# every validation check has passed.
os.makedirs(
    MANIFEST_DIR,
    exist_ok=True,
)

temporary_outputs = {
    PATIENT_OUTPUT + ".tmp": patient_manifest,
    EXAM_OUTPUT + ".tmp": exam_manifest,
    IMAGE_OUTPUT + ".tmp": image_manifest,
}


for temporary_path, dataframe in temporary_outputs.items():
    dataframe.to_csv(
        temporary_path,
        index=False,
    )


os.replace(
    PATIENT_OUTPUT + ".tmp",
    PATIENT_OUTPUT,
)

os.replace(
    EXAM_OUTPUT + ".tmp",
    EXAM_OUTPUT,
)

os.replace(
    IMAGE_OUTPUT + ".tmp",
    IMAGE_OUTPUT,
)


# ------------------------------------------------------------
# Report
# ------------------------------------------------------------

print("\nMANIFEST CREATION COMPLETE")
print("=" * 76)
print("Patients:", len(patient_manifest))
print("Examinations:", len(exam_manifest))
print("Selected images:", len(image_manifest))

print("\nIMAGE SELECTION")
print("=" * 76)
print("Candidate images:", len(image_candidates))
print(
    "Extra duplicate images excluded:",
    len(image_candidates) - len(image_manifest),
)
print(
    "View slots with multiple candidates:",
    int(
        image_manifest[
            "candidate_count"
        ].gt(1).sum()
    ),
)

print("\nSEQUENCE LENGTHS")
print("=" * 76)
print(
    patient_manifest[
        "sequence_length"
    ]
    .value_counts()
    .sort_index()
)

print("\nAVAILABLE VIEWS PER EXAMINATION")
print("=" * 76)
print(
    exam_manifest[
        "num_available_views"
    ]
    .value_counts()
    .sort_index()
)

print("\nCORRECTED PATIENT LABELS")
print("=" * 76)

for year in range(1, 6):
    label = f"risk_{year}yr"

    print(
        f"{year}-year: "
        f"positive={int(patient_manifest[label].sum())}, "
        f"negative={int((patient_manifest[label] == 0).sum())}"
    )

print("\nOUTCOME TYPES")
print("=" * 76)
print(
    patient_manifest[
        "outcome_type"
    ].value_counts()
)

print("\nOUTPUT FILES")
print("=" * 76)
print(PATIENT_OUTPUT)
print(EXAM_OUTPUT)
print(IMAGE_OUTPUT)

print("\nVALIDATION")
print("=" * 76)
print("PASS: one row per patient anchor")
print("PASS: one row per patient examination")
print("PASS: one image per examination view slot")
print("PASS: all selected PNG files exist")
print("PASS: every patient has 2 to 5 examinations")
print("PASS: every patient has exactly one anchor")
print("PASS: all cumulative labels are monotonic")
print("PASS: source files were not modified")
