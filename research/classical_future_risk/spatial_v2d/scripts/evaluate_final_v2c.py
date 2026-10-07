import argparse
import json
from pathlib import Path

import numpy as np
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    roc_auc_score,
)
import torch
from torch.utils.data import DataLoader

from train_v2c import (
    run_validation,
    save_predictions,
)
from v2_hazard.data.dataset import (
    HazardSequenceDataset,
)
from v2_hazard.models.v2c_structured_hazard_lstm import (
    V2CStructuredHazardLSTM,
)
from v2_hazard.training.losses import (
    MaskedHazardBCELoss,
)


ROOT = Path(__file__).resolve().parents[1]

parser = argparse.ArgumentParser()
parser.add_argument(
    "--split",
    choices=["validation", "test"],
    default="validation",
)
parser.add_argument(
    "--confirm-final-test",
    action="store_true",
)
arguments = parser.parse_args()

if (
    arguments.split == "test"
    and not arguments.confirm_final_test
):
    raise RuntimeError(
        "Final test evaluation requires "
        "--confirm-final-test"
    )

checkpoint_path = (
    ROOT / "checkpoints/"
    "v2c_none_seed42_job17108579_best.pt"
)

output_name = (
    f"final_v2c_{arguments.split}"
)

prediction_path = (
    ROOT / "outputs/predictions/"
    f"{output_name}_predictions.csv"
)

metrics_path = (
    ROOT / "outputs/metrics/"
    f"{output_name}_metrics.json"
)

for output_path in [
    prediction_path,
    metrics_path,
]:
    if output_path.exists():
        raise FileExistsError(
            f"Output already exists: {output_path}"
        )

if not torch.cuda.is_available():
    raise RuntimeError(
        "CUDA is required for final evaluation"
    )

torch.manual_seed(42)
torch.cuda.manual_seed_all(42)
torch.backends.cudnn.benchmark = False
torch.backends.cudnn.deterministic = True

device = torch.device("cuda")

checkpoint = torch.load(
    checkpoint_path,
    map_location=device,
)

model_configuration = dict(
    checkpoint["model_configuration"]
)

model_configuration.pop(
    "temporal_input_size",
    None,
)

model = V2CStructuredHazardLSTM(
    **model_configuration
)

model.load_state_dict(
    checkpoint["model_state_dict"]
)
model = model.to(device)
model.eval()

dataset = HazardSequenceDataset(
    ROOT,
    ROOT,
    arguments.split,
)

loader = DataLoader(
    dataset,
    batch_size=64,
    shuffle=False,
    num_workers=0,
    pin_memory=True,
)

criterion = MaskedHazardBCELoss().to(
    device
)

loss, metrics, outputs = run_validation(
    model,
    loader,
    criterion,
    device,
)

expected_patients = {
    "validation": 334,
    "test": 330,
}

assert len(dataset) == expected_patients[
    arguments.split
]
assert outputs["predicted_risks"].shape == (
    len(dataset),
    5,
)
assert (
    metrics["monotonicity_violation_rate"]
    == 0.0
)

save_predictions(
    prediction_path,
    outputs,
)


def discrete_concordance_index(
    hazard_targets,
    at_risk_masks,
    risk_scores,
):
    events = (
        hazard_targets.sum(axis=1) > 0
    )

    times = at_risk_masks.sum(
        axis=1
    ).astype(int)

    event_rows = np.where(events)[0]
    times[event_rows] = (
        hazard_targets[event_rows].argmax(
            axis=1
        ) + 1
    )

    concordant = 0.0
    comparable = 0

    for row in event_rows:
        comparison = times > times[row]

        score_differences = (
            risk_scores[row]
            - risk_scores[comparison]
        )

        concordant += float(
            (score_differences > 0).sum()
        )
        concordant += 0.5 * float(
            (score_differences == 0).sum()
        )
        comparable += int(
            comparison.sum()
        )

    if comparable == 0:
        return None

    return float(
        concordant / comparable
    )


patient_indices = outputs[
    "patient_indices"
].astype(np.int64)

at_risk_masks = np.array(
    dataset.at_risk_masks[
        patient_indices
    ],
    dtype=np.float32,
    copy=True,
)

hazard_targets = outputs[
    "hazard_targets"
]
risk_targets = outputs[
    "target_risks"
]
risk_predictions = outputs[
    "predicted_risks"
]

c_index = discrete_concordance_index(
    hazard_targets,
    at_risk_masks,
    risk_predictions[:, 4],
)

bootstrap_iterations = 2000
random_generator = np.random.default_rng(
    2026
)

bootstrap_values = {
    year: {
        "auroc": [],
        "auprc": [],
        "brier_score": [],
    }
    for year in range(1, 6)
}

bootstrap_c_index = []

for _ in range(bootstrap_iterations):
    sampled = random_generator.integers(
        0,
        len(dataset),
        size=len(dataset),
    )

    for index, year in enumerate(
        range(1, 6)
    ):
        sampled_targets = (
            risk_targets[sampled, index]
        )
        sampled_predictions = (
            risk_predictions[sampled, index]
        )

        if np.unique(
            sampled_targets
        ).size == 2:
            bootstrap_values[year][
                "auroc"
            ].append(
                roc_auc_score(
                    sampled_targets,
                    sampled_predictions,
                )
            )

            bootstrap_values[year][
                "auprc"
            ].append(
                average_precision_score(
                    sampled_targets,
                    sampled_predictions,
                )
            )

        bootstrap_values[year][
            "brier_score"
        ].append(
            brier_score_loss(
                sampled_targets,
                sampled_predictions,
            )
        )

    sampled_c_index = (
        discrete_concordance_index(
            hazard_targets[sampled],
            at_risk_masks[sampled],
            risk_predictions[sampled, 4],
        )
    )

    if sampled_c_index is not None:
        bootstrap_c_index.append(
            sampled_c_index
        )


def confidence_interval(values):
    values = np.asarray(
        values,
        dtype=np.float64,
    )

    return {
        "bootstrap_samples": int(
            len(values)
        ),
        "lower_95": float(
            np.percentile(values, 2.5)
        ),
        "upper_95": float(
            np.percentile(values, 97.5)
        ),
    }


confidence_intervals = {}

for year in range(1, 6):
    confidence_intervals[
        f"{year}yr"
    ] = {
        metric: confidence_interval(values)
        for metric, values
        in bootstrap_values[year].items()
    }

c_index_interval = confidence_interval(
    bootstrap_c_index
)

result = {
    "model": "V2CStructuredHazardLSTM",
    "checkpoint": str(checkpoint_path),
    "split": arguments.split,
    "patients": len(dataset),
    "masked_hazard_nll": loss,
    "calibration_temperature": 1.0,
    "metrics": metrics,
    "discrete_time_c_index": c_index,
    "confidence_intervals":
        confidence_intervals,
    "c_index_confidence_interval":
        c_index_interval,
    "bootstrap_iterations":
        bootstrap_iterations,
    "test_confirmation_supplied":
        arguments.confirm_final_test,
}

metrics_path.write_text(
    json.dumps(result, indent=2) + "\n",
    encoding="utf-8",
)

print(json.dumps(result, indent=2))
print(
    f"FINAL V2C {arguments.split.upper()} "
    "EVALUATION: PASS"
)
