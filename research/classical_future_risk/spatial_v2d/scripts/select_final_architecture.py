import json
from pathlib import Path

import pandas as pd


sources = [
    "reports/current_exam_three_seed_runs.csv",
    "reports/v2b_v2c_three_seed_runs.csv",
    "reports/v2d_three_seed_runs.csv",
]

runs = pd.concat(
    [
        pd.read_csv(path)
        for path in sources
    ],
    ignore_index=True,
)

metrics = [
    "validation_nll",
    "mean_auroc",
    "mean_auprc",
    "mean_brier",
    "monotonicity_violations",
]

summary = runs.groupby(
    "model"
)[metrics].agg(
    ["mean", "std"]
)

selected_model = (
    summary[
        ("validation_nll", "mean")
    ].idxmin()
)

assert selected_model == "V2C"

comparison = {}

for model_name in summary.index:
    comparison[model_name] = {}

    for metric in metrics:
        comparison[model_name][metric] = {
            "mean": float(
                summary.loc[
                    model_name,
                    (metric, "mean"),
                ]
            ),
            "std": float(
                summary.loc[
                    model_name,
                    (metric, "std"),
                ]
            ),
        }

selection = {
    "protocol":
        "configs/final_experiment_protocol.json",
    "selection_data": "validation only",
    "primary_metric":
        "mean unweighted masked negative "
        "log-likelihood across three seeds",
    "selected_model": selected_model,
    "selected_architecture":
        "V2CStructuredHazardLSTM",
    "selected_seed_for_deployment": 42,
    "selected_checkpoint":
        "checkpoints/"
        "v2c_none_seed42_job17108579_best.pt",
    "test_set_evaluated": False,
    "comparison": comparison,
    "decision":
        "V2C had the lowest mean validation NLL "
        "and the highest mean AUROC and AUPRC.",
}

output = Path(
    "reports/final_architecture_selection.json"
)

output.write_text(
    json.dumps(selection, indent=2) + "\n",
    encoding="utf-8",
)

print(json.dumps(selection, indent=2))
print("FINAL ARCHITECTURE SELECTION: PASS")
