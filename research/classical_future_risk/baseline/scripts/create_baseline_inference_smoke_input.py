import argparse
import json
import os

import pandas as pd


PROJECT_DIR = "/fred/oz508/EMBED/classical_future_risk_vihanga"
IMAGE_MANIFEST = os.path.join(PROJECT_DIR, "manifests", "image_manifest.csv")
PATIENT_SPLITS = os.path.join(PROJECT_DIR, "splits", "patient_splits.csv")
VIEW_ORDER = ["L_CC", "R_CC", "L_MLO", "R_MLO"]


def parse_arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-json", required=True)
    return parser.parse_args()


def main():
    args = parse_arguments()
    images = pd.read_csv(
        IMAGE_MANIFEST,
        usecols=[
            "empi_anon",
            "acc_anon",
            "exam_date",
            "sequence_position",
            "view_slot",
            "image_path",
        ],
        low_memory=False,
    )
    splits = pd.read_csv(
        PATIENT_SPLITS,
        usecols=["empi_anon", "split"],
        low_memory=False,
    )
    validation_patients = set(
        splits.loc[splits["split"].eq("validation"), "empi_anon"]
    )
    candidates = images[images["empi_anon"].isin(validation_patients)].copy()

    patient_summary = (
        candidates.groupby("empi_anon")
        .agg(
            num_sessions=("acc_anon", "nunique"),
            num_images=("image_path", "count"),
        )
        .reset_index()
        .sort_values(
            ["num_sessions", "num_images", "empi_anon"],
            ascending=[False, False, True],
            kind="mergesort",
        )
    )
    patient_summary = patient_summary[
        patient_summary["num_sessions"].between(2, 5)
    ]
    if patient_summary.empty:
        raise RuntimeError("No validation patient with 2 to 5 sessions was found.")

    patient_id = patient_summary.iloc[0]["empi_anon"]
    selected = candidates[candidates["empi_anon"].eq(patient_id)].copy()
    selected = selected.sort_values(
        ["sequence_position", "view_slot"],
        kind="mergesort",
    )

    sessions = []
    for (_, _), exam_rows in selected.groupby(
        ["sequence_position", "acc_anon"],
        sort=True,
    ):
        images_by_view = {}
        for row in exam_rows.itertuples(index=False):
            if row.view_slot in images_by_view:
                raise RuntimeError("Duplicate view slot found in smoke-test patient.")
            if not os.path.isfile(row.image_path):
                raise FileNotFoundError(row.image_path)
            images_by_view[row.view_slot] = row.image_path

        ordered_images = {
            slot: images_by_view[slot]
            for slot in VIEW_ORDER
            if slot in images_by_view
        }
        sessions.append(
            {
                "exam_date": str(exam_rows.iloc[0]["exam_date"])[:10],
                "images": ordered_images,
            }
        )

    request = {
        "patient_id": "validation_smoke_test_" + str(patient_id),
        "sessions": sessions,
    }
    output_path = os.path.abspath(args.output_json)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    temporary_path = output_path + ".tmp"
    with open(temporary_path, "w", encoding="utf-8") as handle:
        json.dump(request, handle, indent=2)
        handle.write("\n")
    os.replace(temporary_path, output_path)

    print("Smoke-test request created:", output_path)
    print("Validation patient:", patient_id)
    print("Sessions:", len(sessions))
    print("Images:", sum(len(session["images"]) for session in sessions))


if __name__ == "__main__":
    main()
