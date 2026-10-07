import json
from pathlib import Path

import pandas as pd


runs_to_use = [
    (42, "17128238"),
    (123, "17128299"),
    (2026, "17128302"),
]

rows = []

for seed, job in runs_to_use:
    path = Path(
        "reports/"
        f"v2d_none_seed{seed}_"
        f"job{job}_summary.json"
    )

    result = json.loads(
        path.read_text()
    )
    metrics = result["validation_metrics"]

    assert result["status"] == "completed"
    assert result["random_seed"] == seed
    assert result["test_set_evaluated"] is False

    rows.append({
        "model": "V2D",
        "seed": seed,
        "job_id": job,
        "best_epoch": result["best_epoch"],
        "validation_nll":
            result[
                "best_validation_unweighted_nll"
            ],
        "mean_auroc": metrics["mean_auroc"],
        "mean_auprc": metrics["mean_auprc"],
        "mean_brier":
            metrics["mean_brier_score"],
        "monotonicity_violations":
            metrics[
                "monotonicity_violation_rate"
            ],
    })

v2d_runs = pd.DataFrame(rows)

v2d_runs.to_csv(
    "reports/v2d_three_seed_runs.csv",
    index=False,
)

v2b_v2c_runs = pd.read_csv(
    "reports/v2b_v2c_three_seed_runs.csv"
)

current_exam_runs = pd.read_csv(
    "reports/current_exam_three_seed_runs.csv"
)

all_runs = pd.concat(
    [
        current_exam_runs,
        v2b_v2c_runs,
        v2d_runs,
    ],
    ignore_index=True,
)

assert len(v2d_runs) == 3
assert set(all_runs["model"]) == {
    "CurrentExam",
    "V2B",
    "V2C",
    "V2D",
}

metric_columns = [
    "validation_nll",
    "mean_auroc",
    "mean_auprc",
    "mean_brier",
    "monotonicity_violations",
]

summary = all_runs.groupby(
    "model"
)[metric_columns].agg(
    ["mean", "std"]
)

summary.to_csv(
    "reports/"
    "current_exam_v2b_v2c_v2d_comparison.csv"
)

print("V2D RUNS")
print(v2d_runs.to_string(index=False))

print("\nFOUR-MODEL COMPARISON")
print(summary.to_string())

print("\nV2D THREE-SEED VERIFICATION: PASS")
