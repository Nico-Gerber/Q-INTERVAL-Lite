"""Build repaired-cohort splits while preserving the frozen test cohort."""

from __future__ import annotations

import hashlib
from pathlib import Path

import numpy as np
import pandas as pd


PROJECT = Path("/fred/oz508/EMBED/classical_future_risk_vihanga")
REBUILD = PROJECT / "v2_hazard_sprint05/rebuild_repaired"
OLD_SPLITS = PROJECT / "splits/patient_splits.csv"
PATIENTS = REBUILD / "manifests/patient_anchor_manifest.csv"
OUTPUT = REBUILD / "splits/patient_splits.csv"

RISK_COLUMNS = [f"risk_{year}yr" for year in range(1, 6)]
OUTPUT_COLUMNS = [
    "empi_anon",
    "split",
    "stratification_group",
    "event_interval",
    "outcome_type",
    "anchor_acc_anon",
    "anchor_date",
    *RISK_COLUMNS,
]

EVENT_INTERVALS = {
    (1, 1, 1, 1, 1): "cancer_within_1yr",
    (0, 1, 1, 1, 1): "cancer_between_1_and_2yr",
    (0, 0, 1, 1, 1): "cancer_between_2_and_3yr",
    (0, 0, 0, 1, 1): "cancer_between_3_and_4yr",
    (0, 0, 0, 0, 1): "cancer_between_4_and_5yr",
    (0, 0, 0, 0, 0): "no_cancer_within_5yr",
}


def stable_key(patient_id: str) -> str:
    return hashlib.sha256(f"42:{patient_id}".encode()).hexdigest()


def add_target_columns(table: pd.DataFrame) -> pd.DataFrame:
    table = table.copy()
    patterns = [
        tuple(int(value) for value in row)
        for row in table[RISK_COLUMNS].to_numpy()
    ]
    unknown = sorted(set(patterns) - set(EVENT_INTERVALS))
    if unknown:
        raise RuntimeError(f"Unknown cumulative label patterns: {unknown}")

    table["event_interval"] = [EVENT_INTERVALS[p] for p in patterns]
    table["stratification_group"] = [
        int("".join(str(value) for value in pattern))
        for pattern in patterns
    ]
    return table


def choose_validation_patients(
    added: pd.DataFrame,
    number_needed: int,
) -> set[str]:
    if not 0 <= number_needed <= len(added):
        raise RuntimeError("Invalid number of added validation patients")
    if number_needed == 0:
        return set()

    counts = added["stratification_group"].value_counts().sort_index()
    exact = counts * number_needed / len(added)
    quotas = np.floor(exact).astype(int)
    remaining = number_needed - int(quotas.sum())

    remainder_order = pd.DataFrame(
        {
            "group": counts.index,
            "remainder": (exact - quotas).to_numpy(),
        }
    ).sort_values(
        ["remainder", "group"],
        ascending=[False, True],
    )

    for group in remainder_order.head(remaining)["group"]:
        quotas.loc[group] += 1

    selected: set[str] = set()
    for group, quota in quotas.items():
        candidates = added[
            added["stratification_group"] == group
        ].copy()
        candidates["_stable_key"] = candidates["empi_anon"].map(stable_key)
        candidates = candidates.sort_values("_stable_key")
        selected.update(candidates.head(int(quota))["empi_anon"])

    if len(selected) != number_needed:
        raise RuntimeError("Validation allocation produced the wrong size")
    return selected


def main() -> None:
    if OUTPUT.exists():
        raise FileExistsError(f"Output already exists: {OUTPUT}")

    old = pd.read_csv(
        OLD_SPLITS,
        dtype={"empi_anon": "string"},
        low_memory=False,
    )
    patients = pd.read_csv(
        PATIENTS,
        dtype={"empi_anon": "string", "anchor_acc_anon": "string"},
        low_memory=False,
    )

    if old["empi_anon"].duplicated().any():
        raise RuntimeError("Frozen split contains duplicate patients")
    if patients["empi_anon"].duplicated().any():
        raise RuntimeError("Rebuilt manifest contains duplicate patients")

    patients = add_target_columns(patients)
    old_assignment = old.set_index("empi_anon")["split"]
    patients["split"] = patients["empi_anon"].map(old_assignment)

    retained = patients[patients["split"].notna()].copy()
    added = patients[patients["split"].isna()].copy()

    target_validation_size = round(0.15 * len(patients))
    retained_validation_size = int((retained["split"] == "validation").sum())
    validation_needed = target_validation_size - retained_validation_size

    validation_ids = choose_validation_patients(added, validation_needed)
    patients.loc[patients["empi_anon"].isin(validation_ids), "split"] = "validation"
    patients.loc[patients["split"].isna(), "split"] = "train"

    old_ids = set(old["empi_anon"])
    new_ids = set(patients["empi_anon"])
    added_ids = new_ids - old_ids
    retained_ids = new_ids & old_ids

    retained_check = patients[
        patients["empi_anon"].isin(retained_ids)
    ].set_index("empi_anon")["split"]
    expected_retained = old_assignment.reindex(retained_check.index)
    if (retained_check != expected_retained).any():
        raise RuntimeError("A retained patient's frozen split changed")
    if set(patients.loc[patients["split"] == "test", "empi_anon"]) != (
        set(old.loc[old["split"] == "test", "empi_anon"]) & new_ids
    ):
        raise RuntimeError("The surviving frozen test cohort changed")
    if set(patients.loc[patients["split"] == "test", "empi_anon"]) & added_ids:
        raise RuntimeError("A newly added patient entered the test split")

    split_order = {"train": 0, "validation": 1, "test": 2}
    output = patients[OUTPUT_COLUMNS].copy()
    output["_split_order"] = output["split"].map(split_order)
    output["_patient_order"] = pd.to_numeric(output["empi_anon"], errors="raise")
    output = output.sort_values(["_split_order", "_patient_order"])
    output = output.drop(columns=["_split_order", "_patient_order"])

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    temporary = OUTPUT.with_suffix(".csv.tmp")
    output.to_csv(temporary, index=False)
    temporary.replace(OUTPUT)

    print("Stable repaired split created")
    print("Patients:", len(output))
    print("Retained patients:", len(retained_ids))
    print("Removed frozen patients:", len(old_ids - new_ids))
    print("New patients:", len(added_ids))
    print("New validation patients:", len(validation_ids))
    print("New test patients: 0")
    print("\nSplit counts")
    print(output["split"].value_counts().to_string())
    print("\nEvent intervals by split")
    print(
        output.groupby(["split", "event_interval"], dropna=False)
        .size()
        .to_string()
    )
    print("\nOutput:", OUTPUT)


if __name__ == "__main__":
    main()
