from pathlib import Path
import pandas as pd


SOURCE_ROOT = Path("/fred/oz508/EMBED")

CLEAN_MANIFEST = Path("/fred/oz508/EMBED/classical_future_risk_vihanga/v2_hazard_sprint05/rebuild_repaired/data/metadata_clean_repaired_normalized.csv")
FULL_METADATA = SOURCE_ROOT / "tables" / "EMBED_OpenData_metadata.csv"
CLINICAL_TABLE = SOURCE_ROOT / "tables" / "EMBED_OpenData_clinical.csv"


print("Loading cleaned-image manifest...")

clean = pd.read_csv(
    CLEAN_MANIFEST,
    usecols=[
        "filename",
        "empi_anon",
        "acc_anon",
        "study_date_anon",
        "original_dcm_path",
    ],
    dtype={
        "empi_anon": "string",
        "acc_anon": "string",
        "original_dcm_path": "string",
    },
    low_memory=False,
)

print("Loading complete image metadata...")

metadata = pd.read_csv(
    FULL_METADATA,
    usecols=[
        "empi_anon",
        "anon_dicom_path",
        "study_date_anon",
        "StudyDescription",
        "FinalImageType",
        "ImageLateralityFinal",
        "ViewPosition",
        "spot_mag",
    ],
    dtype={
        "empi_anon": "string",
        "anon_dicom_path": "string",
    },
    low_memory=False,
)

print("Loading complete clinical table...")

clinical = pd.read_csv(
    CLINICAL_TABLE,
    usecols=[
        "empi_anon",
        "acc_anon",
        "study_date_anon",
        "path_severity",
    ],
    dtype={
        "empi_anon": "string",
        "acc_anon": "string",
    },
    low_memory=False,
)


clean["study_date_anon"] = pd.to_datetime(
    clean["study_date_anon"],
    errors="coerce",
)

metadata["study_date_anon"] = pd.to_datetime(
    metadata["study_date_anon"],
    errors="coerce",
)

clinical["study_date_anon"] = pd.to_datetime(
    clinical["study_date_anon"],
    errors="coerce",
)

clinical["path_severity"] = pd.to_numeric(
    clinical["path_severity"],
    errors="coerce",
)


# Last recorded mammography date provides the current
# administrative follow-up boundary for each patient.

observation_end = (
    metadata.groupby("empi_anon")["study_date_anon"]
    .max()
    .rename("observation_end_date")
)


# Link cleaned images to their complete metadata.

metadata_link = (
    metadata[
        [
            "anon_dicom_path",
            "StudyDescription",
            "FinalImageType",
            "ImageLateralityFinal",
            "ViewPosition",
            "spot_mag",
        ]
    ]
    .drop_duplicates(
        subset=["anon_dicom_path"],
        keep="first",
    )
)

linked = clean.merge(
    metadata_link,
    left_on="original_dcm_path",
    right_on="anon_dicom_path",
    how="left",
    validate="one_to_one",
)


description = (
    linked["StudyDescription"]
    .fillna("")
    .astype(str)
    .str.strip()
)

image_type = (
    linked["FinalImageType"]
    .fillna("")
    .astype(str)
    .str.strip()
    .str.upper()
)

view = (
    linked["ViewPosition"]
    .fillna("")
    .astype(str)
    .str.strip()
    .str.upper()
)

laterality = (
    linked["ImageLateralityFinal"]
    .fillna("")
    .astype(str)
    .str.strip()
    .str.upper()
)

spot_mag = pd.to_numeric(
    linked["spot_mag"],
    errors="coerce",
)


linked["eligible"] = (
    description.str.contains(
        "screen",
        case=False,
        regex=False,
    )
    & image_type.eq("2D")
    & view.isin(["CC", "MLO"])
    & laterality.isin(["L", "R"])
    & (spot_mag.isna() | spot_mag.eq(0))
)

eligible = linked[
    linked["eligible"]
].copy()

eligible["view_slot"] = laterality.loc[
    eligible.index
] + "_" + view.loc[eligible.index]


# Create one row per eligible screening accession.

eligible_exams = (
    eligible.groupby(
        ["empi_anon", "acc_anon"],
        as_index=False,
    )
    .agg(
        exam_date=("study_date_anon", "min"),
        num_images=("filename", "count"),
        num_view_slots=("view_slot", "nunique"),
    )
)


# Retain the most serious pathology for each accession.
# Severity 0 and 1 represent true breast cancer.

exam_pathology = (
    clinical.groupby(
        ["empi_anon", "acc_anon"],
        as_index=False,
    )
    .agg(
        pathology_date=("study_date_anon", "min"),
        worst_path_severity=("path_severity", "min"),
    )
)

true_cancer_exams = exam_pathology[
    exam_pathology["worst_path_severity"].isin([0, 1])
].copy()

first_cancer = (
    true_cancer_exams.dropna(
        subset=["pathology_date"]
    )
    .groupby("empi_anon")["pathology_date"]
    .min()
    .rename("first_cancer_date")
)


# Identify patients with high-risk or borderline pathology
# but no confirmed breast cancer.

true_cancer_patients = set(
    true_cancer_exams["empi_anon"]
)

ambiguous_pathology_patients = set(
    exam_pathology.loc[
        exam_pathology["worst_path_severity"].isin([2, 3]),
        "empi_anon",
    ]
) - true_cancer_patients


eligible_exams = eligible_exams.merge(
    first_cancer,
    on="empi_anon",
    how="left",
)

eligible_exams = eligible_exams.merge(
    observation_end,
    on="empi_anon",
    how="left",
)

eligible_exams["days_to_cancer"] = (
    eligible_exams["first_cancer_date"]
    - eligible_exams["exam_date"]
).dt.days

eligible_exams["followup_days"] = (
    eligible_exams["observation_end_date"]
    - eligible_exams["exam_date"]
).dt.days


# Count the number of available screening examinations
# up to and including each possible prediction examination.

eligible_exams = eligible_exams.sort_values(
    ["empi_anon", "exam_date", "acc_anon"]
).reset_index(drop=True)

eligible_exams["history_count"] = (
    eligible_exams.groupby("empi_anon")
    .cumcount()
    + 1
)


# A candidate prediction examination must have at least one
# earlier examination, producing a sequence of two or more.
# For cancer patients, the candidate must be before cancer.

candidate_anchors = eligible_exams[
    (eligible_exams["history_count"] >= 2)
    & (
        eligible_exams["first_cancer_date"].isna()
        | (eligible_exams["days_to_cancer"] > 0)
    )
].copy()


print("\nFOLLOW-UP SOURCE")
print("=" * 72)

print(
    "Overall metadata date range:",
    metadata["study_date_anon"].min(),
    "to",
    metadata["study_date_anon"].max(),
)

print("Eligible screening exams:", len(eligible_exams))
print(
    "Eligible screening patients:",
    eligible_exams["empi_anon"].nunique(),
)

print(
    "Candidate anchors with at least two sessions:",
    len(candidate_anchors),
)

print(
    "Patients represented by candidate anchors:",
    candidate_anchors["empi_anon"].nunique(),
)

print(
    "Candidate patients with high-risk or borderline pathology:",
    candidate_anchors.loc[
        candidate_anchors["empi_anon"].isin(
            ambiguous_pathology_patients
        ),
        "empi_anon",
    ].nunique(),
)


print("\nALL CANDIDATE ANCHORS")
print("=" * 72)

for year in range(1, 6):
    horizon_days = round(365.25 * year)

    event_days = candidate_anchors["days_to_cancer"]
    followup_days = candidate_anchors["followup_days"]

    positive = (
        event_days.notna()
        & (event_days > 0)
        & (event_days <= horizon_days)
    )

    known_negative = (
        (event_days > horizon_days)
        | (
            event_days.isna()
            & (followup_days >= horizon_days)
        )
    )

    valid = positive | known_negative
    censored = ~valid

    valid_rows = candidate_anchors[valid]
    positive_rows = candidate_anchors[positive]
    negative_rows = candidate_anchors[known_negative]

    print(f"\n{year}-year horizon")
    print("  Valid anchor samples:", int(valid.sum()))
    print("  Positive anchor samples:", int(positive.sum()))
    print("  Negative anchor samples:", int(known_negative.sum()))
    print("  Censored anchor samples:", int(censored.sum()))
    print(
        "  Valid patients:",
        valid_rows["empi_anon"].nunique(),
    )
    print(
        "  Positive patients:",
        positive_rows["empi_anon"].nunique(),
    )
    print(
        "  Negative patients:",
        negative_rows["empi_anon"].nunique(),
    )


# Compare with a one-anchor-per-patient cohort.
# Select the latest candidate anchor with a known five-year outcome.

five_year_days = round(365.25 * 5)

event_days = candidate_anchors["days_to_cancer"]
followup_days = candidate_anchors["followup_days"]

five_year_positive = (
    event_days.notna()
    & (event_days > 0)
    & (event_days <= five_year_days)
)

five_year_negative = (
    (event_days > five_year_days)
    | (
        event_days.isna()
        & (followup_days >= five_year_days)
    )
)

five_year_valid = (
    five_year_positive
    | five_year_negative
)

one_anchor = (
    candidate_anchors[five_year_valid]
    .sort_values(
        ["empi_anon", "exam_date", "acc_anon"]
    )
    .groupby(
        "empi_anon",
        as_index=False,
    )
    .tail(1)
)


print("\nONE FIVE-YEAR-VALID ANCHOR PER PATIENT")
print("=" * 72)

print("Selected patients:", len(one_anchor))

print(
    "Selected ambiguous pathology patients:",
    one_anchor.loc[
        one_anchor["empi_anon"].isin(
            ambiguous_pathology_patients
        ),
        "empi_anon",
    ].nunique(),
)

for year in range(1, 6):
    horizon_days = round(365.25 * year)

    event_days = one_anchor["days_to_cancer"]

    positive = (
        event_days.notna()
        & (event_days > 0)
        & (event_days <= horizon_days)
    )

    negative = ~positive

    print(f"\n{year}-year horizon")
    print("  Positive patients:", int(positive.sum()))
    print("  Negative patients:", int(negative.sum()))


print("\nAUDIT NOTES")
print("=" * 72)
print("No existing files were changed.")
print("No training manifest was created.")
print("Follow-up currently ends at each patient's last recorded mammogram.")
print("High-risk and borderline patients have not yet been removed.")
print("The one-anchor cohort is a comparison, not a final decision.")
print("Patient-level splitting is required before model training.")
