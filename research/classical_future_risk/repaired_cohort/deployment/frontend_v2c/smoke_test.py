"""End-to-end smoke test for the drop-in V2C frontend adapter."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import run


VIEW_NAMES = {
    "L_CC": "L-CC",
    "R_CC": "R-CC",
    "L_MLO": "L-MLO",
    "R_MLO": "R-MLO",
}
EXPECTED_RISK_KEYS = {"1_year", "2_year", "3_year", "4_year", "5_year"}


def parse_arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("--path-input-json", required=True)
    parser.add_argument("--output-json", required=True)
    return parser.parse_args()


def build_model_input(path_input_json: str) -> dict:
    with open(path_input_json, "r", encoding="utf-8") as handle:
        source = json.load(handle)

    exams = []
    for index, session in enumerate(source["sessions"], start=1):
        views = {}
        for old_name, new_name in VIEW_NAMES.items():
            image_path = session["images"].get(old_name)
            views[new_name] = None if image_path is None else Path(image_path).read_bytes()
        exams.append(
            {
                "exam_id": f"exam_{index}",
                "exam_date": session["exam_date"],
                "views": views,
            }
        )

    return {
        "patient_age": None,
        "exams": exams,
    }


def validate_result(result: dict, model_input: dict) -> None:
    if set(result) != {"yearly_risk", "risk_level", "exams"}:
        raise AssertionError(f"Unexpected top-level keys: {sorted(result)}")
    if set(result["yearly_risk"]) != EXPECTED_RISK_KEYS:
        raise AssertionError("The yearly_risk keys do not match the contract.")
    if result["risk_level"] not in {"low", "moderate", "high"}:
        raise AssertionError("Unexpected risk_level value.")
    if len(result["exams"]) != len(model_input["exams"]):
        raise AssertionError("The output examination count changed.")

    risks = [
        float(result["yearly_risk"][f"{year}_year"])
        for year in range(1, 6)
    ]
    if not all(math.isfinite(value) and 0.0 <= value <= 100.0 for value in risks):
        raise AssertionError("A yearly risk is invalid.")
    if any(later + 1e-6 < earlier for earlier, later in zip(risks, risks[1:])):
        raise AssertionError("Yearly risks are not monotonic.")

    expected_exams = sorted(model_input["exams"], key=lambda item: item["exam_date"])
    for expected, actual in zip(expected_exams, result["exams"]):
        if set(actual) != {"exam_id", "exam_date", "contribution_percent"}:
            raise AssertionError("An examination output has unexpected keys.")
        if actual["exam_id"] != expected["exam_id"]:
            raise AssertionError("An exam_id changed during inference.")
        if actual["exam_date"] != expected["exam_date"]:
            raise AssertionError("An exam_date changed during inference.")
        contribution = actual["contribution_percent"]
        if contribution is not None and (
            not math.isfinite(float(contribution))
            or not 0.0 <= float(contribution) <= 100.0
        ):
            raise AssertionError("An examination contribution is invalid.")

    contributions = [
        float(item["contribution_percent"])
        for item in result["exams"]
        if item["contribution_percent"] is not None
    ]
    if contributions and sum(contributions) > 0.0:
        if not math.isclose(sum(contributions), 100.0, abs_tol=1e-3):
            raise AssertionError("Examination contributions do not sum to 100%.")


def main():
    arguments = parse_arguments()
    model_input = build_model_input(arguments.path_input_json)

    before = run.health()
    run.initialise()
    after = run.health()
    result = run.run_inference(model_input)
    validate_result(result, model_input)

    output_path = Path(arguments.output_json)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = output_path.with_suffix(output_path.suffix + ".tmp")
    with temporary_path.open("w", encoding="utf-8") as handle:
        json.dump(result, handle, indent=2)
        handle.write("\n")
    temporary_path.replace(output_path)

    print("V2C FRONTEND CONTRACT SMOKE TEST PASSED")
    print("Health before initialise:", before)
    print("Health after initialise:", after)
    print("Risk level:", result["risk_level"])
    print("Yearly risk:", result["yearly_risk"])
    print(
        "Contribution total:",
        round(
            sum(
                float(item["contribution_percent"])
                for item in result["exams"]
                if item["contribution_percent"] is not None
            ),
            6,
        ),
    )
    print("Output:", output_path.resolve())


if __name__ == "__main__":
    main()
