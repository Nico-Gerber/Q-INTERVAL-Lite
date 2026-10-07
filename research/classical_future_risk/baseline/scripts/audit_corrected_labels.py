from pathlib import Path
import pandas as pd


SOURCE_ROOT = Path("/fred/oz508/EMBED")

CLEAN_MANIFEST = SOURCE_ROOT / "clean_output" / "metadata_clean.csv"
CLINICAL_TABLE = SOURCE_ROOT / "tables" / "EMBED_OpenData_clinical.csv"


print("Loading clean-image manifest...")

clean = pd.read_csv(
    CLEAN_MANIFEST,
    usecols=[
        "filename",
        "empi_anon",
        "acc_anon",
        "study_date_anon",
        "path_severity",
        "cancer_status",
    ],
    dtype={
        "empi_anon": "string",
        "acc_anon": "string",
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

clean["path_severity"] = pd.to_numeric(
    clean["path_severity"],
    errors="coerce",
)

clinical["path_severity"] = pd.to_numeric(
    clinical["path_severity"],
    errors="coerce",
)


print("\nCURRENT PIPELINE LABELS")
print("=" * 60)

print(
    pd.crosstab(
        clean["path_severity"],
        clean["cancer_status"],
        dropna=False,
    )
)


# Lower pathology severity values represent more serious outcomes.
# 0 = invasive cancer
# 1 = in-situ cancer
# Therefore, minimum severity is retained for each accession.

exam_pathology = (
    clinical.groupby(
        ["empi_anon", "acc_anon"],
        as_index=False,
    )
    .agg(
        exam_date=("study_date_anon", "min"),
        worst_path_severity=("path_severity", "min"),
    )
)

true_cancer_exams = exam_pathology[
    exam_pathology["worst_path_severity"].isin([0, 1])
].copy()

first_cancer = (
    true_cancer_exams.dropna(subset=["exam_date"])
    .groupby("empi_anon")["exam_date"]
    .min()
    .rename("first_cancer_date")
)

clean = clean.merge(
    first_cancer,
    on="empi_anon",
    how="left",
)

clean["corrected_days_to_cancer"] = (
    clean["first_cancer_date"]
    - clean["study_date_anon"]
).dt.days

days = clean["corrected_days_to_cancer"]


print("\nCORRECTED COHORT SUMMARY")
print("=" * 60)

print("Clean manifest rows:", len(clean))
print("Unique image filenames:", clean["filename"].nunique())
print("Patients with clean images:", clean["empi_anon"].nunique())
print("Accessions with clean images:", clean["acc_anon"].nunique())

print(
    "True-cancer patients in the clinical table:",
    true_cancer_exams["empi_anon"].nunique(),
)

print(
    "True-cancer patients represented by clean images:",
    clean.loc[
        clean["first_cancer_date"].notna(),
        "empi_anon",
    ].nunique(),
)

print("\nCorrected image timing:")
print("No true-cancer event:", int(days.isna().sum()))
print("Before true cancer:", int((days > 0).sum()))
print("On first cancer date:", int((days == 0).sum()))
print("After first cancer:", int((days < 0).sum()))
print("Invalid image dates:", int(clean["study_date_anon"].isna().sum()))


# Create one row per clean accession before cancer.

pre_cancer_exams = (
    clean.loc[
        days > 0,
        [
            "empi_anon",
            "acc_anon",
            "study_date_anon",
            "corrected_days_to_cancer",
        ],
    ]
    .drop_duplicates(
        subset=["empi_anon", "acc_anon"],
    )
)

history_counts = (
    pre_cancer_exams.groupby("empi_anon")["acc_anon"]
    .nunique()
)


print("\nTRUE-CANCER PATIENTS WITH PRIOR CLEAN ACCESSIONS")
print("=" * 60)

for minimum_exams in [1, 2, 3, 4, 5]:
    count = int((history_counts >= minimum_exams).sum())

    print(
        f"At least {minimum_exams} prior accession(s):",
        count,
    )


# For each cancer patient, find the clean examination closest
# to the first true-cancer date.

closest_prior_exam = (
    pre_cancer_exams.groupby("empi_anon")[
        "corrected_days_to_cancer"
    ]
    .min()
)


print("\nCLOSEST PRIOR EXAMINATION TO CANCER")
print("=" * 60)

for year in range(1, 6):
    horizon_days = round(365.25 * year)

    within_horizon = (
        (closest_prior_exam > 0)
        & (closest_prior_exam <= horizon_days)
    )

    print(
        f"Patients with closest prior exam within {year} year(s):",
        int(within_horizon.sum()),
    )


longitudinal_patients = history_counts[
    history_counts >= 2
].index

longitudinal_closest = closest_prior_exam[
    closest_prior_exam.index.isin(longitudinal_patients)
]


print("\nLONGITUDINAL TRUE-CANCER PATIENTS")
print("=" * 60)

print(
    "Patients with at least two prior clean accessions:",
    len(longitudinal_patients),
)

for year in range(1, 6):
    horizon_days = round(365.25 * year)

    within_horizon = (
        (longitudinal_closest > 0)
        & (longitudinal_closest <= horizon_days)
    )

    print(
        f"Longitudinal patients within {year} year(s):",
        int(within_horizon.sum()),
    )


print("\nAUDIT NOTES")
print("=" * 60)
print("No existing files were changed.")
print("No corrected manifest was created.")
print("Diagnostic and screening exams have not yet been separated.")
print("Cancer-free follow-up and censoring have not yet been assessed.")
print("The counts in this report are audit results, not the final cohort.")
