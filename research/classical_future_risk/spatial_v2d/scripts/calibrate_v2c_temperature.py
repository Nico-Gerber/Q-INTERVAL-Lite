import json
from pathlib import Path

import numpy as np
import pandas as pd
import torch

from v2_hazard.evaluation.metrics import (
    evaluate_cumulative_predictions,
)
from v2_hazard.training.losses import (
    MaskedHazardBCELoss,
    hazard_logits_to_cumulative_risk,
)


ROOT = Path(__file__).resolve().parents[1]

prediction_path = (
    ROOT / "outputs/predictions/"
    "v2c_none_seed42_job17108579_validation.csv"
)

predictions = pd.read_csv(
    prediction_path
)

patient_indices = predictions[
    "patient_index"
].to_numpy(dtype=np.int64)

all_at_risk = np.load(
    ROOT
    / "data/derived/"
    "hazard_at_risk_masks.npy"
)

at_risk = all_at_risk[
    patient_indices
].astype(np.float32)

hazard_targets = np.column_stack([
    predictions[f"target_hazard_{year}yr"]
    for year in range(1, 6)
]).astype(np.float32)

hazard_probabilities = np.column_stack([
    predictions[f"predicted_hazard_{year}yr"]
    for year in range(1, 6)
]).astype(np.float32)

risk_targets = np.column_stack([
    predictions[f"target_risk_{year}yr"]
    for year in range(1, 6)
]).astype(np.float32)

risk_probabilities = np.column_stack([
    predictions[f"predicted_risk_{year}yr"]
    for year in range(1, 6)
]).astype(np.float32)

assert hazard_targets.shape == (334, 5)
assert at_risk.shape == (334, 5)
assert np.isfinite(hazard_probabilities).all()
assert np.array_equal(
    hazard_targets <= at_risk,
    np.ones((334, 5), dtype=bool),
)

epsilon = 1e-7

logits = torch.logit(
    torch.from_numpy(
        hazard_probabilities
    ).double().clamp(
        epsilon,
        1.0 - epsilon,
    )
)

targets_tensor = torch.from_numpy(
    hazard_targets
).double()

at_risk_tensor = torch.from_numpy(
    at_risk
).double()

criterion = MaskedHazardBCELoss()

before_nll = float(
    criterion(
        logits,
        targets_tensor,
        at_risk_tensor,
    ).item()
)

log_temperature = torch.zeros(
    (),
    dtype=torch.float64,
    requires_grad=True,
)

optimizer = torch.optim.LBFGS(
    [log_temperature],
    lr=0.1,
    max_iter=200,
    tolerance_grad=1e-12,
    tolerance_change=1e-12,
    line_search_fn="strong_wolfe",
)

def closure():
    optimizer.zero_grad()

    temperature = torch.exp(
        log_temperature
    )

    loss = criterion(
        logits / temperature,
        targets_tensor,
        at_risk_tensor,
    )

    loss.backward()
    return loss


optimizer.step(closure)

temperature = float(
    torch.exp(log_temperature).item()
)

assert np.isfinite(temperature)
assert 0.05 < temperature < 20.0

with torch.no_grad():
    calibrated_logits = (
        logits / temperature
    )

    after_nll = float(
        criterion(
            calibrated_logits,
            targets_tensor,
            at_risk_tensor,
        ).item()
    )

    calibrated_hazards_tensor, calibrated_risks_tensor = (
        hazard_logits_to_cumulative_risk(
            calibrated_logits
        )
    )

    _, reconstructed_risks_tensor = (
        hazard_logits_to_cumulative_risk(
            logits
        )
    )

calibrated_hazards = (
    calibrated_hazards_tensor.numpy()
)
calibrated_risks = (
    calibrated_risks_tensor.numpy()
)
reconstructed_risks = (
    reconstructed_risks_tensor.numpy()
)

assert np.max(
    np.abs(
        reconstructed_risks
        - risk_probabilities
    )
) < 1e-5

before_metrics = (
    evaluate_cumulative_predictions(
        risk_targets,
        risk_probabilities,
    )
)

after_metrics = (
    evaluate_cumulative_predictions(
        risk_targets,
        calibrated_risks,
    )
)

before_mean_ece = float(np.mean([
    values[
        "expected_calibration_error"
    ]
    for values
    in before_metrics["per_horizon"].values()
]))

after_mean_ece = float(np.mean([
    values[
        "expected_calibration_error"
    ]
    for values
    in after_metrics["per_horizon"].values()
]))

assert after_nll <= before_nll + 1e-12
assert (
    after_metrics[
        "monotonicity_violation_rate"
    ] == 0.0
)

calibrated_output = predictions.copy()

for index, year in enumerate(
    range(1, 6)
):
    calibrated_output[
        f"calibrated_hazard_{year}yr"
    ] = calibrated_hazards[:, index]

    calibrated_output[
        f"calibrated_risk_{year}yr"
    ] = calibrated_risks[:, index]

calibrated_prediction_path = (
    ROOT / "outputs/predictions/"
    "v2c_none_seed42_job17108579_"
    "validation_temperature_scaled.csv"
)

calibrated_output.to_csv(
    calibrated_prediction_path,
    index=False,
)

result = {
    "model": "V2CStructuredHazardLSTM",
    "checkpoint":
        "checkpoints/"
        "v2c_none_seed42_job17108579_best.pt",
    "fitting_split": "validation",
    "validation_patients": 334,
    "method": "single_temperature_scaling",
    "temperature": temperature,
    "test_set_loaded": False,
    "before": {
        "masked_hazard_nll": before_nll,
        "mean_brier_score":
            before_metrics["mean_brier_score"],
        "mean_expected_calibration_error":
            before_mean_ece,
        "metrics": before_metrics,
    },
    "after": {
        "masked_hazard_nll": after_nll,
        "mean_brier_score":
            after_metrics["mean_brier_score"],
        "mean_expected_calibration_error":
            after_mean_ece,
        "metrics": after_metrics,
    },
}

metrics_path = (
    ROOT / "outputs/metrics/"
    "v2c_temperature_calibration_validation.json"
)

metrics_path.write_text(
    json.dumps(result, indent=2) + "\n",
    encoding="utf-8",
)

calibration_rows = []
bin_edges = np.linspace(0.0, 1.0, 11)

stages = [
    ("before", risk_probabilities),
    ("after", calibrated_risks),
]

for stage, stage_probabilities in stages:
    for index, year in enumerate(
        range(1, 6)
    ):
        probabilities = (
            stage_probabilities[:, index]
        )
        targets = risk_targets[:, index]

        bin_indices = np.digitize(
            probabilities,
            bin_edges[1:-1],
            right=False,
        )

        for bin_index in range(10):
            selected = (
                bin_indices == bin_index
            )

            if not selected.any():
                continue

            calibration_rows.append({
                "stage": stage,
                "horizon": f"{year}yr",
                "bin": bin_index + 1,
                "lower_bound":
                    float(bin_edges[bin_index]),
                "upper_bound":
                    float(bin_edges[bin_index + 1]),
                "patients":
                    int(selected.sum()),
                "mean_predicted_risk":
                    float(
                        probabilities[selected].mean()
                    ),
                "observed_event_rate":
                    float(
                        targets[selected].mean()
                    ),
            })

calibration_bins = pd.DataFrame(
    calibration_rows
)

calibration_bins_path = (
    ROOT / "outputs/metrics/"
    "v2c_temperature_calibration_bins.csv"
)

calibration_bins.to_csv(
    calibration_bins_path,
    index=False,
)

print("Temperature:", temperature)
print("Before NLL:", before_nll)
print("After NLL:", after_nll)
print(
    "Before mean Brier:",
    before_metrics["mean_brier_score"],
)
print(
    "After mean Brier:",
    after_metrics["mean_brier_score"],
)
print("Before mean ECE:", before_mean_ece)
print("After mean ECE:", after_mean_ece)
print("Metrics:", metrics_path)
print("Calibration bins:", calibration_bins_path)
print(
    "Calibrated predictions:",
    calibrated_prediction_path,
)
print("V2C TEMPERATURE CALIBRATION: PASS")
