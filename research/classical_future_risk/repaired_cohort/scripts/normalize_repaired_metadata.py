"""Restore exact patient and accession identifiers in repaired clean metadata."""

from pathlib import Path

import pandas as pd


ROOT = Path(
    "/fred/oz508/EMBED/classical_future_risk_vihanga/"
    "v2_hazard_sprint05/rebuild_repaired"
)
SOURCE = Path(
    "/home/ngerber/embed/repair/metadata_clean_repaired.csv"
)
REFERENCE = Path(
    "/fred/oz508/EMBED/tables/EMBED_OpenData_metadata_reduced.csv"
)
OUTPUT = ROOT / "data/metadata_clean_repaired_normalized.csv"


def main() -> None:
    if OUTPUT.exists():
        raise FileExistsError(f"Output already exists: {OUTPUT}")

    repaired = pd.read_csv(
        SOURCE,
        dtype="string",
        low_memory=False,
    )
    reference = pd.read_csv(
        REFERENCE,
        usecols=[
            "anon_dicom_path",
            "empi_anon",
            "acc_anon",
        ],
        dtype="string",
        low_memory=False,
    )

    conflicting = (
        reference.groupby("anon_dicom_path")[["empi_anon", "acc_anon"]]
        .nunique(dropna=False)
        .gt(1)
        .any(axis=1)
        .sum()
    )
    if conflicting:
        raise RuntimeError(
            f"Reference contains {conflicting} conflicting DICOM paths"
        )

    reference = reference.drop_duplicates(
        subset="anon_dicom_path",
        keep="first",
    )
    lookup = reference.set_index("anon_dicom_path")

    exact_patients = repaired["original_dcm_path"].map(
        lookup["empi_anon"]
    )
    exact_accessions = repaired["original_dcm_path"].map(
        lookup["acc_anon"]
    )

    missing = (exact_patients.isna() | exact_accessions.isna()).sum()
    if missing:
        raise RuntimeError(
            f"{missing} repaired rows have no authoritative ID mapping"
        )

    normalized = repaired.copy()
    normalized["empi_anon"] = exact_patients
    normalized["acc_anon"] = exact_accessions

    if normalized["original_dcm_path"].duplicated().any():
        raise RuntimeError("Normalized metadata contains duplicate paths")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    temporary = OUTPUT.with_suffix(".csv.tmp")
    normalized.to_csv(temporary, index=False)
    temporary.replace(OUTPUT)

    print("Normalization completed")
    print("Rows:", len(normalized))
    print("Unique patients:", normalized["empi_anon"].nunique())
    print("Unique accessions:", normalized["acc_anon"].nunique())
    print("Missing patient IDs:", normalized["empi_anon"].isna().sum())
    print("Missing accession IDs:", normalized["acc_anon"].isna().sum())
    print("Output:", OUTPUT)


if __name__ == "__main__":
    main()
