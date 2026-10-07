import argparse
import ast
import json
from pathlib import Path

import numpy as np
import pandas as pd
import torch
import torch.nn as nn

from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    roc_auc_score,
)

ROOT = Path(
    "/fred/oz508/EMBED/classical_future_risk_vihanga/"
    "v2_hazard_sprint06"
)

parser = argparse.ArgumentParser()
parser.add_argument("--job-id", required=True)
args = parser.parse_args()

checkpoint_path = (
    ROOT / "checkpoints"
    / f"lstm_baseline_{args.job_id}.pt"
)

prediction_path = (
    ROOT / "outputs/predictions"
    / f"repaired_baseline_{args.job_id}_validation.csv"
)

metrics_path = (
    ROOT / "outputs/metrics"
    / f"repaired_baseline_{args.job_id}_validation.json"
)

source_path = ROOT / "scripts/train_repaired_baseline.py"
tree = ast.parse(source_path.read_text())

class_node = next(
    node
    for node in tree.body
    if isinstance(node, ast.ClassDef)
    and node.name == "FutureRiskLSTM"
)

namespace = {
    "torch": torch,
    "nn": nn,
}

exec(
    compile(
        ast.Module(
            body=[class_node],
            type_ignores=[],
        ),
        str(source_path),
        "exec",
    ),
    namespace,
)

FutureRiskLSTM = namespace["FutureRiskLSTM"]

checkpoint = torch.load(
    checkpoint_path,
    map_location="cpu",
)

namespace.update(
    {
        "INPUT_SIZE": checkpoint["input_size"],
        "COMPRESSED_SIZE": checkpoint["compressed_size"],
        "HIDDEN_SIZE": checkpoint["hidden_size"],
        "OUTPUT_SIZE": checkpoint["output_size"],
        "DROPOUT": checkpoint["dropout"],
    }
)

model = FutureRiskLSTM()

model.load_state_dict(
    checkpoint["model_state_dict"]
)
model.eval()

sequences = np.load(
    ROOT / "features/patient_sequences_5x6149.npy"
).astype(np.float32)

labels = np.load(
    ROOT / "features/patient_labels_1to5yr.npy"
).astype(np.float32)

masks = np.load(
    ROOT / "features/patient_sequence_masks.npy"
).astype(np.float32)

metadata = pd.read_csv(
    ROOT / "features/patient_sequence_metadata.csv",
    low_memory=False,
)

validation_indices = np.where(
    metadata["split"].eq("validation").to_numpy()
)[0]

assert len(validation_indices) == 334
assert metadata.iloc[
    validation_indices
]["split"].eq("validation").all()

validation_sequences = torch.from_numpy(
    sequences[validation_indices]
)

validation_masks = torch.from_numpy(
    masks[validation_indices]
)

validation_labels = labels[
    validation_indices
]

with torch.no_grad():
    logits = model(
        validation_sequences,
        validation_masks,
    )

    probabilities = (
        torch.sigmoid(logits)
        .cpu()
        .numpy()
    )

assert probabilities.shape == (334, 5)
assert np.isfinite(probabilities).all()


def expected_calibration_error(
    true_labels,
    predicted_probabilities,
    number_of_bins=10,
):
    edges = np.linspace(
        0.0,
        1.0,
        number_of_bins + 1,
    )

    result = 0.0

    for index in range(number_of_bins):
        selected = (
            predicted_probabilities >= edges[index]
        ) & (
            predicted_probabilities
            <= edges[index + 1]
        )

        if selected.any():
            result += selected.mean() * abs(
                true_labels[selected].mean()
                - predicted_probabilities[selected].mean()
            )

    return float(result)

rows = []

for year in range(1, 6):
    index = year - 1
    true_values = validation_labels[:, index]
    predicted_values = probabilities[:, index]

    rows.append(
        {
            "horizon": f"{year}yr",
            "patients": len(true_values),
            "positives": int(true_values.sum()),
            "auroc": float(
                roc_auc_score(
                    true_values,
                    predicted_values,
                )
            ),
            "auprc": float(
                average_precision_score(
                    true_values,
                    predicted_values,
                )
            ),
            "brier_score": float(
                brier_score_loss(
                    true_values,
                    predicted_values,
                )
            ),
            "expected_calibration_error": (
                expected_calibration_error(
                    true_values,
                    predicted_values,
                )
            ),
        }
    )

prediction_data = metadata.iloc[
    validation_indices
][
    [
        "patient_index",
        "empi_anon",
        "split",
    ]
].reset_index(drop=True)

for year in range(1, 6):
    prediction_data[
        f"target_risk_{year}yr"
    ] = validation_labels[:, year - 1]

    prediction_data[
        f"predicted_risk_{year}yr"
    ] = probabilities[:, year - 1]

prediction_data.to_csv(
    prediction_path,
    index=False,
)

clipped = np.clip(
    probabilities,
    1e-7,
    1.0 - 1e-7,
)

unweighted_bce = -np.mean(
    validation_labels * np.log(clipped)
    + (1.0 - validation_labels)
    * np.log(1.0 - clipped)
)

metrics = {
    "job_id": args.job_id,
    "random_seed": checkpoint["random_seed"],
    "best_epoch": checkpoint["best_epoch"],
    "validation_patients": len(validation_indices),
    "test_set_loaded": False,
    "validation_unweighted_bce": float(
        unweighted_bce
    ),
    "per_horizon": rows,
    "mean_auroc": float(
        np.mean([row["auroc"] for row in rows])
    ),
    "mean_auprc": float(
        np.mean([row["auprc"] for row in rows])
    ),
    "mean_brier_score": float(
        np.mean([
            row["brier_score"]
            for row in rows
        ])
    ),
    "mean_expected_calibration_error": float(
        np.mean([
            row["expected_calibration_error"]
            for row in rows
        ])
    ),
    "monotonicity_violation_rate": float(
        np.mean(
            np.any(
                np.diff(
                    probabilities,
                    axis=1,
                ) < 0,
                axis=1,
            )
        )
    ),
}

metrics_path.write_text(
    json.dumps(metrics, indent=2) + "\n",
    encoding="utf-8",
)

print(json.dumps(metrics, indent=2))
print("Predictions:", prediction_path)
print("Metrics:", metrics_path)
print("VALIDATION-ONLY EVALUATION: PASS")
