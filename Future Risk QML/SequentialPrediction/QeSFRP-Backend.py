"""
Test client for the view-aware EMBED QML backend.

Usage example:
python test_view_aware_qml_backend_request.py \
  --url http://127.0.0.1:8000/qml-future-risk-view-aware/ \
  --age 32 \
  --exam exam_1 2021-04-10 L-CC=exam1_lcc.png R-CC=exam1_rcc.png L-MLO=exam1_lmlo.png R-MLO=exam1_rmlo.png \
  --exam exam_2 2026-04-21 L-CC=exam2_lcc.png R-CC=exam2_rcc.png L-MLO=exam2_lmlo.png R-MLO=exam2_rmlo.png

Notes:
- The file paths after L-CC= etc. must point to real local image files.
- The backend metadata will use only the basename, so uploaded filenames match metadata.
"""

import argparse
import json
from pathlib import Path

import requests

VIEW_KEYS = ["L-CC", "R-CC", "L-MLO", "R-MLO"]


def parse_exam(values):
    if len(values) != 6:
        raise ValueError(
            "Each --exam needs: exam_id exam_date L-CC=path R-CC=path L-MLO=path R-MLO=path"
        )

    exam_id = values[0]
    exam_date = values[1]
    view_items = values[2:]

    views = {}
    file_paths = []

    for item in view_items:
        if "=" not in item:
            raise ValueError(f"Bad view item: {item}. Expected VIEW=path")
        key, path = item.split("=", 1)
        if key not in VIEW_KEYS:
            raise ValueError(f"Bad view key: {key}. Must be one of {VIEW_KEYS}")
        p = Path(path)
        if not p.exists():
            raise FileNotFoundError(f"Missing image file: {p}")
        views[key] = p.name
        file_paths.append(p)

    missing = [v for v in VIEW_KEYS if v not in views]
    if missing:
        raise ValueError(f"Exam {exam_id} missing views: {missing}")

    return {"exam_id": exam_id, "exam_date": exam_date, "views": views}, file_paths


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:8000/qml-future-risk-view-aware/")
    parser.add_argument("--age", type=float, required=True)
    parser.add_argument(
        "--exam",
        action="append",
        nargs=6,
        required=True,
        metavar=("EXAM_ID", "EXAM_DATE", "LCC", "RCC", "LMLO", "RMLO"),
        help="Example: --exam exam_1 2021-04-10 L-CC=a.png R-CC=b.png L-MLO=c.png R-MLO=d.png",
    )
    parser.add_argument("--output", default="view_aware_backend_response.json")
    args = parser.parse_args()

    exams = []
    all_file_paths = []
    for exam_values in args.exam:
        exam, file_paths = parse_exam(exam_values)
        exams.append(exam)
        all_file_paths.extend(file_paths)

    metadata = {"patient_age": args.age, "exams": exams}

    files = []
    opened = []
    try:
        for p in all_file_paths:
            f = open(p, "rb")
            opened.append(f)
            files.append(("files", (p.name, f, "image/png")))

        response = requests.post(
            args.url,
            data={"metadata_json": json.dumps(metadata)},
            files=files,
            timeout=300,
        )

        print("Status:", response.status_code)
        print(response.text[:2000])
        response.raise_for_status()

        data = response.json()
        with open(args.output, "w", encoding="utf-8") as out:
            json.dump(data, out, indent=2)
        print("\nSaved full response to:", args.output)

        print("\nFinal age-adjusted risk:")
        print(json.dumps(data.get("future_risk", {}).get("age_adjusted_risk", {}), indent=2))

        print("\nExam contributions:")
        print(json.dumps(data.get("exam_contributions", []), indent=2))

    finally:
        for f in opened:
            f.close()


if __name__ == "__main__":
    main()
