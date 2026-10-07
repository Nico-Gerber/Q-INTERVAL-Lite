"""Compare a three-seed V2D hazard ensemble with the selected seed-2026 run."""

import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import average_precision_score, roc_auc_score


ROOT = Path("experiments/v2c_mammoclip_b5")
PREDICTION_DIR = ROOT / "outputs/predictions"
OUTPUT_DIR = ROOT / "outputs/ensemble_validation"
SEEDS = (42, 123, 2026)
HORIZONS = (1, 2, 3, 4, 5)
EPSILON = 1e-7
RANKING_TOLERANCE = 0.005


def sha256_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def locate_prediction(seed):
    matches = sorted(PREDICTION_DIR.glob(
        f"v2d_mammoclip_b5_none_seed{seed}_job*_validation.csv"
    ))
    if len(matches) != 1:
        raise RuntimeError(
            f"Expected exactly one validation CSV for seed {seed}, found {matches}"
        )
    return matches[0]


def cumulative_risk(hazards):
    return 1.0 - np.cumprod(1.0 - hazards, axis=1)


def expected_calibration_error(targets, predictions, bins=10):
    edges = np.linspace(0.0, 1.0, bins + 1)
    total = len(targets)
    value = 0.0
    for index in range(bins):
        if index == bins - 1:
            selected = (predictions >= edges[index]) & (predictions <= edges[index + 1])
        else:
            selected = (predictions >= edges[index]) & (predictions < edges[index + 1])
        if selected.any():
            value += selected.mean() * abs(
                targets[selected].mean() - predictions[selected].mean()
            )
    return float(value)


def evaluate(name, hazards, target_hazards, target_risks, at_risk):
    hazards = np.clip(hazards, EPSILON, 1.0 - EPSILON)
    risks = cumulative_risk(hazards)
    masked_losses = -(
        target_hazards * np.log(hazards)
        + (1.0 - target_hazards) * np.log(1.0 - hazards)
    )
    nll = float((masked_losses * at_risk).sum() / at_risk.sum())

    per_horizon = {}
    for column, year in enumerate(HORIZONS):
        target = target_risks[:, column]
        prediction = risks[:, column]
        per_horizon[f"{year}yr"] = {
            "patients": int(len(target)),
            "positives": int(target.sum()),
            "auroc": float(roc_auc_score(target, prediction)),
            "auprc": float(average_precision_score(target, prediction)),
            "brier_score": float(np.mean((prediction - target) ** 2)),
            "expected_calibration_error": expected_calibration_error(
                target, prediction
            ),
        }

    summary = {
        "candidate": name,
        "validation_unweighted_masked_nll": nll,
        "mean_auroc": float(np.mean([
            result["auroc"] for result in per_horizon.values()
        ])),
        "mean_auprc": float(np.mean([
            result["auprc"] for result in per_horizon.values()
        ])),
        "mean_brier_score": float(np.mean([
            result["brier_score"] for result in per_horizon.values()
        ])),
        "mean_expected_calibration_error": float(np.mean([
            result["expected_calibration_error"]
            for result in per_horizon.values()
        ])),
        "patients_with_monotonicity_violation": int(
            np.any(np.diff(risks, axis=1) < -1e-7, axis=1).sum()
        ),
        "per_horizon": per_horizon,
    }
    return summary, risks


def main():
    prediction_paths = {seed: locate_prediction(seed) for seed in SEEDS}
    frames = {
        seed: pd.read_csv(path).sort_values("patient_index").reset_index(drop=True)
        for seed, path in prediction_paths.items()
    }

    reference = frames[2026]
    patient_indices = reference["patient_index"].to_numpy(dtype=np.int64)
    if len(patient_indices) != 334 or len(np.unique(patient_indices)) != 334:
        raise RuntimeError("Expected 334 unique validation patients")

    target_hazard_columns = [f"target_hazard_{year}yr" for year in HORIZONS]
    target_risk_columns = [f"target_risk_{year}yr" for year in HORIZONS]
    predicted_hazard_columns = [f"predicted_hazard_{year}yr" for year in HORIZONS]

    for seed, frame in frames.items():
        if not np.array_equal(frame["patient_index"].to_numpy(), patient_indices):
            raise RuntimeError(f"Patient alignment failed for seed {seed}")
        for columns in (target_hazard_columns, target_risk_columns):
            if not np.array_equal(
                frame[columns].to_numpy(), reference[columns].to_numpy()
            ):
                raise RuntimeError(f"Target alignment failed for seed {seed}")

    target_hazards = reference[target_hazard_columns].to_numpy(dtype=np.float64)
    target_risks = reference[target_risk_columns].to_numpy(dtype=np.float64)
    at_risk_all = np.load(
        ROOT / "data/derived/hazard_at_risk_masks.npy", mmap_mode="r"
    )
    at_risk = np.asarray(at_risk_all[patient_indices], dtype=np.float64)

    hazards_by_seed = {
        seed: frame[predicted_hazard_columns].to_numpy(dtype=np.float64)
        for seed, frame in frames.items()
    }
    ensemble_hazards = np.mean(
        np.stack([hazards_by_seed[seed] for seed in SEEDS], axis=0), axis=0
    )

    selected_summary, selected_risks = evaluate(
        "seed_2026", hazards_by_seed[2026], target_hazards, target_risks, at_risk
    )
    ensemble_summary, ensemble_risks = evaluate(
        "three_seed_hazard_ensemble",
        ensemble_hazards,
        target_hazards,
        target_risks,
        at_risk,
    )

    ensemble_selected = bool(
        ensemble_summary["validation_unweighted_masked_nll"]
        < selected_summary["validation_unweighted_masked_nll"]
        and ensemble_summary["mean_brier_score"]
        <= selected_summary["mean_brier_score"]
        and ensemble_summary["mean_auroc"]
        >= selected_summary["mean_auroc"] - RANKING_TOLERANCE
        and ensemble_summary["mean_auprc"]
        >= selected_summary["mean_auprc"] - RANKING_TOLERANCE
        and ensemble_summary["patients_with_monotonicity_violation"] == 0
    )

    decision = {
        "status": "validation_only_pre_test_selection_check",
        "test_set_evaluated": False,
        "method": "arithmetic mean of three yearly hazard probabilities",
        "component_seeds": list(SEEDS),
        "ranking_metric_tolerance": RANKING_TOLERANCE,
        "decision_rule": (
            "Select ensemble only when NLL and Brier improve, AUROC and AUPRC "
            "do not decrease by more than 0.005, and monotonicity violations are zero."
        ),
        "seed_2026": selected_summary,
        "ensemble": ensemble_summary,
        "decision": (
            "select_three_seed_ensemble" if ensemble_selected else "retain_seed_2026"
        ),
        "source_files": {
            str(seed): {
                "path": str(path),
                "sha256": sha256_file(path),
            }
            for seed, path in prediction_paths.items()
        },
    }

    output = reference[["patient_index"] + target_hazard_columns + target_risk_columns].copy()
    for index, year in enumerate(HORIZONS):
        output[f"ensemble_predicted_hazard_{year}yr"] = ensemble_hazards[:, index]
        output[f"ensemble_predicted_risk_{year}yr"] = ensemble_risks[:, index]
        output[f"seed2026_predicted_risk_{year}yr"] = selected_risks[:, index]

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    csv_path = OUTPUT_DIR / "v2d_three_seed_ensemble_validation.csv"
    json_path = OUTPUT_DIR / "v2d_three_seed_ensemble_comparison.json"
    if csv_path.exists() or json_path.exists():
        raise FileExistsError(
            "Ensemble outputs already exist. Review them instead of overwriting."
        )
    output.to_csv(csv_path, index=False)
    json_path.write_text(json.dumps(decision, indent=2) + "\n", encoding="utf-8")

    table = pd.DataFrame([
        {
            "candidate": item["candidate"],
            "nll": item["validation_unweighted_masked_nll"],
            "auroc": item["mean_auroc"],
            "auprc": item["mean_auprc"],
            "brier": item["mean_brier_score"],
            "ece": item["mean_expected_calibration_error"],
        }
        for item in (selected_summary, ensemble_summary)
    ])
    print(table.to_string(index=False))
    print("Decision:", decision["decision"])
    print("Wrote:", csv_path)
    print("Wrote:", json_path)
    print("VALIDATION ENSEMBLE CHECK: PASS")


if __name__ == "__main__":
    main()
