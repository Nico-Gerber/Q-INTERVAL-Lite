"""One-time final test evaluation for the frozen Mammo-CLIP V2D model."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path

import numpy as np
import torch
from sklearn.metrics import average_precision_score, roc_auc_score
from torch.utils.data import DataLoader

from train_v2d_mammoclip import run_validation, save_predictions
from v2_hazard.training.losses import MaskedHazardBCELoss
from v2d_mammoclip_components import (
    V2DSpatialDataset,
    V2DSpatialMultiviewHazardLSTM,
)


ROOT = Path(__file__).resolve().parents[1]
CHECKPOINT = ROOT / "checkpoints/final_selected_v2d_mammoclip_b5.pt"
SELECTION = ROOT / "configs/final_model_selection.json"
ENSEMBLE_CHECK = (
    ROOT
    / "outputs/ensemble_validation/"
    "v2d_three_seed_ensemble_comparison.json"
)
PREDICTIONS = (
    ROOT
    / "outputs/predictions/"
    "final_selected_v2d_mammoclip_b5_test.csv"
)
SUMMARY = ROOT / "reports/final_selected_v2d_mammoclip_b5_test.json"
BOOTSTRAP_REPLICATES = 2000
BOOTSTRAP_SEED = 20261007
BATCH_SIZE = 8
EPSILON = 1e-7


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json_atomic(path: Path, value: dict) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(value, indent=2) + "\n",
        encoding="utf-8",
    )
    temporary.replace(path)


def masked_nll(targets, predictions, at_risk) -> float:
    predictions = np.clip(predictions, EPSILON, 1.0 - EPSILON)
    losses = -(
        targets * np.log(predictions)
        + (1.0 - targets) * np.log(1.0 - predictions)
    )
    return float((losses * at_risk).sum() / at_risk.sum())


def bootstrap_confidence_intervals(
    outputs: dict[str, np.ndarray],
    at_risk: np.ndarray,
) -> dict:
    rng = np.random.default_rng(BOOTSTRAP_SEED)
    patient_count = len(outputs["patient_indices"])
    target_hazards = outputs["hazard_targets"].astype(np.float64)
    predicted_hazards = outputs["predicted_hazards"].astype(np.float64)
    target_risks = outputs["target_risks"].astype(np.float64)
    predicted_risks = outputs["predicted_risks"].astype(np.float64)

    values = {
        "unweighted_masked_nll": [],
        "mean_auroc": [],
        "mean_auprc": [],
        "mean_brier_score": [],
    }
    valid_replicates = 0

    for _ in range(BOOTSTRAP_REPLICATES):
        sample = rng.integers(0, patient_count, size=patient_count)
        aucs = []
        aprs = []
        briers = []
        valid = True

        for horizon in range(5):
            target = target_risks[sample, horizon]
            prediction = predicted_risks[sample, horizon]
            if np.unique(target).size != 2:
                valid = False
                break
            aucs.append(roc_auc_score(target, prediction))
            aprs.append(average_precision_score(target, prediction))
            briers.append(np.mean((target - prediction) ** 2))

        if not valid:
            continue

        values["unweighted_masked_nll"].append(
            masked_nll(
                target_hazards[sample],
                predicted_hazards[sample],
                at_risk[sample],
            )
        )
        values["mean_auroc"].append(float(np.mean(aucs)))
        values["mean_auprc"].append(float(np.mean(aprs)))
        values["mean_brier_score"].append(float(np.mean(briers)))
        valid_replicates += 1

    if valid_replicates < int(0.9 * BOOTSTRAP_REPLICATES):
        raise RuntimeError(
            f"Only {valid_replicates} valid bootstrap replicates were available"
        )

    intervals = {}
    for name, metric_values in values.items():
        lower, upper = np.percentile(metric_values, [2.5, 97.5])
        intervals[name] = {
            "lower_95_percentile": float(lower),
            "upper_95_percentile": float(upper),
        }

    return {
        "method": "patient-level nonparametric percentile bootstrap",
        "requested_replicates": BOOTSTRAP_REPLICATES,
        "valid_replicates": valid_replicates,
        "random_seed": BOOTSTRAP_SEED,
        "confidence_level": 0.95,
        "intervals": intervals,
    }


def main() -> None:
    if PREDICTIONS.exists() or SUMMARY.exists():
        raise FileExistsError(
            "Final test output already exists. The test evaluation will not be repeated."
        )

    selection = read_json(SELECTION)
    if selection.get("selected_seed") != 2026:
        raise RuntimeError("The frozen selection does not identify seed 2026")
    if selection.get("test_set_evaluated") is not False:
        raise RuntimeError("The selection record does not declare an untouched test set")
    if selection.get("selection_used_test_data") is not False:
        raise RuntimeError("The selection record indicates test data use")

    ensemble = read_json(ENSEMBLE_CHECK)
    if ensemble.get("decision") != "retain_seed_2026":
        raise RuntimeError("The validation ensemble decision is not retain_seed_2026")
    if ensemble.get("test_set_evaluated") is not False:
        raise RuntimeError("The ensemble check indicates prior test evaluation")

    checkpoint = torch.load(CHECKPOINT, map_location="cpu")
    if checkpoint.get("random_seed") != 2026:
        raise RuntimeError("Checkpoint random seed is not 2026")
    if checkpoint.get("weighting") != "none":
        raise RuntimeError("Unexpected checkpoint weighting")

    if not torch.cuda.is_available():
        raise RuntimeError("A CUDA GPU is required for final test evaluation")
    device = torch.device("cuda")

    dataset = V2DSpatialDataset(ROOT, ROOT, "test")
    if len(dataset) != 330:
        raise RuntimeError(f"Expected 330 test patients, found {len(dataset)}")
    loader = DataLoader(
        dataset,
        batch_size=BATCH_SIZE,
        shuffle=False,
        num_workers=0,
        pin_memory=True,
    )

    model = V2DSpatialMultiviewHazardLSTM()
    model.load_state_dict(checkpoint["model_state_dict"], strict=True)
    model = model.to(device)
    criterion = MaskedHazardBCELoss().to(device)

    test_nll, test_metrics, outputs = run_validation(
        model, loader, criterion, device
    )

    expected_indices = dataset.patient_indices
    if not np.array_equal(outputs["patient_indices"], expected_indices):
        raise RuntimeError("Test prediction order does not match test metadata")
    if not np.isfinite(outputs["predicted_risks"]).all():
        raise RuntimeError("Test predictions contain non-finite values")
    if np.any(np.diff(outputs["predicted_risks"], axis=1) < -1e-7):
        raise RuntimeError("Test cumulative risks are not monotonic")

    at_risk = np.asarray(
        dataset.at_risk_masks[outputs["patient_indices"]],
        dtype=np.float64,
    )
    bootstrap = bootstrap_confidence_intervals(outputs, at_risk)

    PREDICTIONS.parent.mkdir(parents=True, exist_ok=True)
    SUMMARY.parent.mkdir(parents=True, exist_ok=True)
    save_predictions(PREDICTIONS, outputs)

    summary = {
        "status": "completed",
        "evaluation_type": "one_time_final_untouched_test_evaluation",
        "model": "V2DSpatialMultiviewHazardLSTM",
        "selected_model": "Mammo-CLIP B5 V2D",
        "selected_seed": 2026,
        "selection_frozen_before_test": True,
        "selection_used_test_data": False,
        "validation_ensemble_decision": "retain_seed_2026",
        "test_set_evaluated": True,
        "test_patients": len(dataset),
        "test_unweighted_masked_nll": float(test_nll),
        "test_metrics": test_metrics,
        "bootstrap_confidence_intervals": bootstrap,
        "patients_with_monotonicity_violation": 0,
        "checkpoint": {
            "path": str(CHECKPOINT),
            "resolved_path": str(CHECKPOINT.resolve()),
            "sha256": sha256_file(CHECKPOINT),
            "best_epoch": checkpoint.get("epoch"),
            "validation_unweighted_nll": checkpoint.get(
                "validation_unweighted_nll"
            ),
        },
        "provenance": {
            "selection_record": str(SELECTION),
            "selection_record_sha256": sha256_file(SELECTION),
            "ensemble_check": str(ENSEMBLE_CHECK),
            "ensemble_check_sha256": sha256_file(ENSEMBLE_CHECK),
            "evaluator_sha256": sha256_file(Path(__file__)),
        },
        "environment": {
            "slurm_job_id": os.environ.get("SLURM_JOB_ID", "not_available"),
            "device": torch.cuda.get_device_name(device),
            "torch_version": torch.__version__,
            "cuda_version": torch.version.cuda,
        },
        "outputs": {
            "test_predictions": str(PREDICTIONS),
            "test_summary": str(SUMMARY),
        },
    }
    write_json_atomic(SUMMARY, summary)

    print(json.dumps(summary, indent=2))
    print("FINAL FROZEN V2D TEST EVALUATION: PASS")


if __name__ == "__main__":
    main()
