from pathlib import Path
import pandas as pd


SOURCE_ROOT = Path("/fred/oz508/EMBED")

CLEAN_MANIFEST = SOURCE_ROOT / "clean_output" / "metadata_clean.csv"
FULL_METADATA = SOURCE_ROOT / "tables" / "EMBED_OpenData_metadata.csv"
CLINICAL_TABLE = SOURCE_ROOT / "tables" / "EMBED_OpenData_clinical.csv"


def count_exams(frame):
    return len(
        frame[
            ["empi_anon", "acc_anon"]
        ].drop_duplicates()
    )


def print_stage(name, frame):
    print(
        f"{name}: "
        f"images={len(frame):,}, "
        f"exams={count_exams(frame):,}, "
        f"patients={frame['empi_anon'].nunique():,}"
    )


print("Loading cleaned-image manifest...")

clean = pd.read_csv(
    CLEAN_MANIFEST,
    usecols=[
        "filename",
        "empi_anon",
        "acc_anon",
        "study_date_anon",
        "ImageLateralityFinal",
        "ViewPosition",
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
        "acc_anon",
        "anon_dicom_path",
        "StudyDescription",
        "SeriesDescription",
        "FinalImageType",
        "ImageLateralityFinal",
        "ViewPosition",
        "spot_mag",
    ],
    dtype={
        "empi_anon": "string",
        "acc_anon": "string",
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

clinical["study_date_anon"] = pd.to_datetime(
    clinical["study_date_anon"],
    errors="coerce",
)

clinical["path_severity"] = pd.to_numeric(
    clinical["path_severity"],
    errors="coerce",
)


print("\nSOURCE LINKAGE")
print("=" * 70)

print("Clean rows:", len(clean))
print(
    "Duplicate clean source paths:",
    clean["original_dcm_path"].duplicated().sum(),
)

print("Full metadata rows:", len(metadata))
print(
    "Duplicate metadata paths:",
    metadata["anon_dicom_path"].duplicated().sum(),
)


metadata = metadata.rename(
    columns={
        "empi_anon": "metadata_empi_anon",
        "acc_anon": "metadata_acc_anon",
        "ImageLateralityFinal": "metadata_laterality",
        "ViewPosition": "metadata_view",
    }
)

metadata_unique = metadata.drop_duplicates(
    subset=["anon_dicom_path"],
    keep="first",
)

merged = clean.merge(
    metadata_unique,
    left_on="original_dcm_path",
    right_on="anon_dicom_path",
    how="left",
    indicator=True,
)

matched = merged["_merge"].eq("both")

print("Rows linked to full metadata:", int(matched.sum()))
print("Rows not linked:", int((~matched).sum()))

linked = merged[matched].copy()

patient_mismatch = (
    linked["empi_anon"]
    != linked["metadata_empi_anon"]
).sum()

accession_mismatch = (
    linked["acc_anon"]
    != linked["metadata_acc_anon"]
).sum()

print("Patient-ID mismatches:", int(patient_mismatch))
print("Accession-ID mismatches:", int(accession_mismatch))


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
    linked["metadata_view"]
    .fillna("")
    .astype(str)
    .str.strip()
    .str.upper()
)

laterality = (
    linked["metadata_laterality"]
    .fillna("")
    .astype(str)
    .str.strip()
    .str.upper()
)

spot_mag = pd.to_numeric(
    linked["spot_mag"],
    errors="coerce",
)


linked["is_screening"] = description.str.contains(
    "screen",
    case=False,
    regex=False,
)

linked["is_diagnostic"] = description.str.contains(
    "diagnostic",
    case=False,
    regex=False,
)

linked["is_2d"] = image_type.eq("2D")
linked["is_standard_view"] = view.isin(["CC", "MLO"])
linked["is_standard_laterality"] = laterality.isin(["L", "R"])
linked["is_not_spot_mag"] = spot_mag.isna() | spot_mag.eq(0)

linked["eligible_screening_image"] = (
    linked["is_screening"]
    & linked["is_2d"]
    & linked["is_standard_view"]
    & linked["is_standard_laterality"]
    & linked["is_not_spot_mag"]
)


print("\nIMAGE ELIGIBILITY STAGES")
print("=" * 70)

print_stage("All linked clean images", linked)

print_stage(
    "Screening images",
    linked[linked["is_screening"]],
)

print_stage(
    "Diagnostic images",
    linked[linked["is_diagnostic"]],
)

print_stage(
    "Screening and 2D",
    linked[
        linked["is_screening"]
        & linked["is_2d"]
    ],
)

print_stage(
    "Screening, 2D and standard view",
    linked[
        linked["is_screening"]
        & linked["is_2d"]
        & linked["is_standard_view"]
    ],
)

eligible = linked[
    linked["eligible_screening_image"]
].copy()

print_stage(
    "Final eligible screening images",
    eligible,
)


print("\nMOST COMMON STUDY DESCRIPTIONS")
print("=" * 70)

print(
    linked["StudyDescription"]
    .value_counts(dropna=False)
    .head(20)
)


eligible["view_slot"] = (
    laterality.loc[eligible.index]
    + "_"
    + view.loc[eligible.index]
)

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


print("\nELIGIBLE EXAMINATION STRUCTURE")
print("=" * 70)

print("Eligible examinations:", len(eligible_exams))
print("Eligible patients:", eligible_exams["empi_anon"].nunique())

print("\nAvailable view-slot count per examination:")

print(
    eligible_exams["num_view_slots"]
    .value_counts()
    .sort_index()
)

print(
    "\nExaminations with all four standard views:",
    int((eligible_exams["num_view_slots"] == 4).sum()),
)


# Correct cancer definition:
# severity 0 = invasive cancer
# severity 1 = in-situ cancer

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

eligible_exams = eligible_exams.merge(
    first_cancer,
    on="empi_anon",
    how="left",
)

eligible_exams["days_to_cancer"] = (
    eligible_exams["first_cancer_date"]
    - eligible_exams["exam_date"]
).dt.days


days = eligible_exams["days_to_cancer"]

print("\nCORRECTED SCREENING TIMING")
print("=" * 70)

print(
    "Eligible screening exams without a true-cancer event:",
    int(days.isna().sum()),
)

print(
    "Eligible screening exams before true cancer:",
    int((days > 0).sum()),
)

print(
    "Eligible screening exams on the first cancer date:",
    int((days == 0).sum()),
)

print(
    "Eligible screening exams after first cancer:",
    int((days < 0).sum()),
)


pre_cancer_screening = eligible_exams[
    days > 0
].copy()

history_counts = (
    pre_cancer_screening.groupby("empi_anon")["acc_anon"]
    .nunique()
)


print("\nTRUE-CANCER PATIENTS WITH PRIOR SCREENING EXAMS")
print("=" * 70)

for minimum_exams in [1, 2, 3, 4, 5]:
    count = int((history_counts >= minimum_exams).sum())

    print(
        f"At least {minimum_exams} screening exam(s):",
        count,
    )


longitudinal_patients = history_counts[
    history_counts >= 2
].index

longitudinal_screening = pre_cancer_screening[
    pre_cancer_screening["empi_anon"].isin(
        longitudinal_patients
    )
]

closest_prior_screen = (
    longitudinal_screening.groupby("empi_anon")[
        "days_to_cancer"
    ]
    .min()
)


print("\nLONGITUDINAL SCREENING CANCER PATIENTS")
print("=" * 70)

print(
    "Patients with at least two prior screening exams:",
    len(longitudinal_patients),
)

for year in range(1, 6):
    horizon_days = round(365.25 * year)

    within_horizon = (
        (closest_prior_screen > 0)
        & (closest_prior_screen <= horizon_days)
    )

    print(
        f"Patients with closest screening exam within "
        f"{year} year(s):",
        int(within_horizon.sum()),
    )


print("\nAUDIT NOTES")
print("=" * 70)
print("No source files were changed.")
print("No training manifest was created.")
print("Flagged images were not included.")
print("Cancer-free follow-up has not yet been assessed.")
print("The final cohort may change after censoring rules are applied.")
