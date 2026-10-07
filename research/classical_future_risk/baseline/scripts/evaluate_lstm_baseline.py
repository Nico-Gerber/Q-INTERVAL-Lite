import json
import os

import numpy as np
import pandas as pd

from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    balanced_accuracy_score,
    brier_score_loss,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
    roc_curve,
)


PROJECT_DIR = (
    "/fred/oz508/EMBED/"
    "classical_future_risk_vihanga"
)

TRAINING_RUN_ID = "15691343"

VALIDATION_PREDICTIONS = os.path.join(
    PROJECT_DIR,
    "reports",
    f"lstm_validation_predictions_{TRAINING_RUN_ID}.csv",
)

TEST_PREDICTIONS = os.path.join(
    PROJECT_DIR,
    "reports",
    f"lstm_test_predictions_{TRAINING_RUN_ID}.csv",
)

EVALUATION_RUN_ID = os.environ.get(
    "SLURM_JOB_ID",
    "manual",
)

THRESHOLD_OUTPUT = os.path.join(
    PROJECT_DIR,
    "reports",
    f"baseline_thresholds_{EVALUATION_RUN_ID}.csv",
)

POINT_METRICS_OUTPUT = os.path.join(
    PROJECT_DIR,
    "reports",
    f"baseline_point_metrics_{EVALUATION_RUN_ID}.csv",
)

BOOTSTRAP_OUTPUT = os.path.join(
    PROJECT_DIR,
    "reports",
    f"baseline_bootstrap_ci_{EVALUATION_RUN_ID}.csv",
)

CALIBRATION_OUTPUT = os.path.join(
    PROJECT_DIR,
    "reports",
    f"baseline_calibration_bins_{EVALUATION_RUN_ID}.csv",
)

SUMMARY_OUTPUT = os.path.join(
    PROJECT_DIR,
    "reports",
    f"baseline_evaluation_summary_{EVALUATION_RUN_ID}.json",
)


HORIZONS = [
    "1yr",
    "2yr",
    "3yr",
    "4yr",
    "5yr",
]

RANDOM_SEED = 42
BOOTSTRAP_ITERATIONS = 2000
CALIBRATION_BINS = 5


for output_path in [
    THRESHOLD_OUTPUT,
    POINT_METRICS_OUTPUT,
    BOOTSTRAP_OUTPUT,
    CALIBRATION_OUTPUT,
    SUMMARY_OUTPUT,
]:
    if os.path.exists(output_path):
        raise FileExistsError(
            "Output already exists and was not overwritten:\n"
            + output_path
        )


print("Loading saved patient predictions...")

validation = pd.read_csv(
    VALIDATION_PREDICTIONS,
    low_memory=False,
)

test = pd.read_csv(
    TEST_PREDICTIONS,
    low_memory=False,
)


if len(validation) != 331:
    raise RuntimeError(
        "Unexpected validation patient count."
    )

if len(test) != 331:
    raise RuntimeError(
        "Unexpected test patient count."
    )

if set(validation["empi_anon"]).intersection(
    set(test["empi_anon"])
):
    raise RuntimeError(
        "A patient appears in validation and testing."
    )


def confusion_values(
    true_labels,
    predictions,
):
    tn, fp, fn, tp = confusion_matrix(
        true_labels,
        predictions,
        labels=[0, 1],
    ).ravel()

    specificity = (
        tn / (tn + fp)
        if (tn + fp) > 0
        else np.nan
    )

    return tn, fp, fn, tp, specificity


def select_youden_threshold(
    true_labels,
    probabilities,
):
    false_positive_rate, true_positive_rate, thresholds = (
        roc_curve(
            true_labels,
            probabilities,
        )
    )

    finite = np.isfinite(
        thresholds
    )

    candidate_indices = np.where(
        finite
    )[0]

    if len(candidate_indices) == 0:
        raise RuntimeError(
            "No finite validation threshold was found."
        )

    youden_values = (
        true_positive_rate
        - false_positive_rate
    )

    best_position = candidate_indices[
        np.argmax(
            youden_values[
                candidate_indices
            ]
        )
    ]

    return {
        "threshold": float(
            thresholds[best_position]
        ),
        "validation_sensitivity": float(
            true_positive_rate[best_position]
        ),
        "validation_specificity": float(
            1.0
            - false_positive_rate[
                best_position
            ]
        ),
        "validation_youden_j": float(
            youden_values[best_position]
        ),
    }


def calculate_point_metrics(
    dataset_name,
    horizon,
    true_labels,
    probabilities,
    threshold,
    threshold_source,
):
    predictions = (
        probabilities >= threshold
    ).astype(int)

    tn, fp, fn, tp, specificity = (
        confusion_values(
            true_labels,
            predictions,
        )
    )

    prevalence = float(
        true_labels.mean()
    )

    auprc = average_precision_score(
        true_labels,
        probabilities,
    )

    return {
        "dataset": dataset_name,
        "horizon": horizon,
        "patients": len(true_labels),
        "positives": int(
            true_labels.sum()
        ),
        "prevalence": prevalence,
        "threshold": threshold,
        "threshold_source": threshold_source,
        "accuracy": accuracy_score(
            true_labels,
            predictions,
        ),
        "balanced_accuracy": balanced_accuracy_score(
            true_labels,
            predictions,
        ),
        "precision": precision_score(
            true_labels,
            predictions,
            zero_division=0,
        ),
        "recall_sensitivity": recall_score(
            true_labels,
            predictions,
            zero_division=0,
        ),
        "specificity": specificity,
        "f1": f1_score(
            true_labels,
            predictions,
            zero_division=0,
        ),
        "auroc": roc_auc_score(
            true_labels,
            probabilities,
        ),
        "auprc": auprc,
        "auprc_prevalence_ratio": (
            auprc / prevalence
            if prevalence > 0
            else np.nan
        ),
        "brier_score": brier_score_loss(
            true_labels,
            probabilities,
        ),
        "true_negative": int(tn),
        "false_positive": int(fp),
        "false_negative": int(fn),
        "true_positive": int(tp),
    }


threshold_rows = []
point_metric_rows = []
bootstrap_rows = []
calibration_rows = []
calibration_summary = {}

rng = np.random.default_rng(
    RANDOM_SEED
)


for horizon in HORIZONS:
    validation_true = validation[
        f"true_{horizon}"
    ].to_numpy(dtype=int)

    validation_probability = validation[
        f"probability_{horizon}"
    ].to_numpy(dtype=float)

    test_true = test[
        f"true_{horizon}"
    ].to_numpy(dtype=int)

    test_probability = test[
        f"probability_{horizon}"
    ].to_numpy(dtype=float)


    selected = select_youden_threshold(
        validation_true,
        validation_probability,
    )

    selected_threshold = selected[
        "threshold"
    ]


    threshold_rows.append(
        {
            "horizon": horizon,
            "validation_patients": len(
                validation_true
            ),
            "validation_positives": int(
                validation_true.sum()
            ),
            **selected,
        }
    )


    point_metric_rows.append(
        calculate_point_metrics(
            "test",
            horizon,
            test_true,
            test_probability,
            0.5,
            "fixed_0.5",
        )
    )

    selected_point_metrics = (
        calculate_point_metrics(
            "test",
            horizon,
            test_true,
            test_probability,
            selected_threshold,
            "validation_youden",
        )
    )

    point_metric_rows.append(
        selected_point_metrics
    )


    # Calibration summary.
    prevalence = float(
        test_true.mean()
    )

    mean_probability = float(
        test_probability.mean()
    )

    model_brier = brier_score_loss(
        test_true,
        test_probability,
    )

    null_probabilities = np.full(
        len(test_true),
        prevalence,
        dtype=float,
    )

    null_brier = brier_score_loss(
        test_true,
        null_probabilities,
    )

    brier_skill = (
        1.0 - model_brier / null_brier
        if null_brier > 0
        else np.nan
    )


    sorted_indices = np.argsort(
        test_probability
    )

    bin_indices = np.array_split(
        sorted_indices,
        CALIBRATION_BINS,
    )

    expected_calibration_error = 0.0

    for bin_number, indices in enumerate(
        bin_indices,
        start=1,
    ):
        bin_mean_probability = float(
            test_probability[
                indices
            ].mean()
        )

        bin_observed_rate = float(
            test_true[
                indices
            ].mean()
        )

        bin_weight = (
            len(indices)
            / len(test_true)
        )

        expected_calibration_error += (
            bin_weight
            * abs(
                bin_mean_probability
                - bin_observed_rate
            )
        )

        calibration_rows.append(
            {
                "horizon": horizon,
                "bin": bin_number,
                "patients": len(indices),
                "mean_predicted_probability": (
                    bin_mean_probability
                ),
                "observed_event_rate": (
                    bin_observed_rate
                ),
                "minimum_probability": float(
                    test_probability[
                        indices
                    ].min()
                ),
                "maximum_probability": float(
                    test_probability[
                        indices
                    ].max()
                ),
            }
        )


    calibration_summary[horizon] = {
        "observed_prevalence": prevalence,
        "mean_predicted_probability": (
            mean_probability
        ),
        "brier_score": model_brier,
        "null_brier_score": null_brier,
        "brier_skill_score": brier_skill,
        "expected_calibration_error": float(
            expected_calibration_error
        ),
    }


    # Patient-level bootstrap confidence intervals.
    bootstrap_values = {
        "auroc": [],
        "auprc": [],
        "brier_score": [],
        "precision": [],
        "recall_sensitivity": [],
        "specificity": [],
        "f1": [],
    }


    for _ in range(
        BOOTSTRAP_ITERATIONS
    ):
        sampled_indices = rng.integers(
            0,
            len(test_true),
            size=len(test_true),
        )

        sampled_true = test_true[
            sampled_indices
        ]

        sampled_probability = test_probability[
            sampled_indices
        ]


        # AUROC and AUPRC require both classes.
        if np.unique(
            sampled_true
        ).size < 2:
            continue


        sampled_prediction = (
            sampled_probability
            >= selected_threshold
        ).astype(int)

        (
            _,
            _,
            _,
            _,
            sampled_specificity,
        ) = confusion_values(
            sampled_true,
            sampled_prediction,
        )


        bootstrap_values[
            "auroc"
        ].append(
            roc_auc_score(
                sampled_true,
                sampled_probability,
            )
        )

        bootstrap_values[
            "auprc"
        ].append(
            average_precision_score(
                sampled_true,
                sampled_probability,
            )
        )

        bootstrap_values[
            "brier_score"
        ].append(
            brier_score_loss(
                sampled_true,
                sampled_probability,
            )
        )

        bootstrap_values[
            "precision"
        ].append(
            precision_score(
                sampled_true,
                sampled_prediction,
                zero_division=0,
            )
        )

        bootstrap_values[
            "recall_sensitivity"
        ].append(
            recall_score(
                sampled_true,
                sampled_prediction,
                zero_division=0,
            )
        )

        bootstrap_values[
            "specificity"
        ].append(
            sampled_specificity
        )

        bootstrap_values[
            "f1"
        ].append(
            f1_score(
                sampled_true,
                sampled_prediction,
                zero_division=0,
            )
        )


    point_estimates = {
        "auroc": selected_point_metrics[
            "auroc"
        ],
        "auprc": selected_point_metrics[
            "auprc"
        ],
        "brier_score": selected_point_metrics[
            "brier_score"
        ],
        "precision": selected_point_metrics[
            "precision"
        ],
        "recall_sensitivity": (
            selected_point_metrics[
                "recall_sensitivity"
            ]
        ),
        "specificity": selected_point_metrics[
            "specificity"
        ],
        "f1": selected_point_metrics[
            "f1"
        ],
    }


    for metric_name, values in (
        bootstrap_values.items()
    ):
        values = np.asarray(
            values,
            dtype=float,
        )

        bootstrap_rows.append(
            {
                "horizon": horizon,
                "metric": metric_name,
                "estimate": point_estimates[
                    metric_name
                ],
                "ci_95_lower": float(
                    np.percentile(
                        values,
                        2.5,
                    )
                ),
                "ci_95_upper": float(
                    np.percentile(
                        values,
                        97.5,
                    )
                ),
                "valid_bootstrap_samples": len(
                    values
                ),
                "threshold": (
                    selected_threshold
                    if metric_name
                    in {
                        "precision",
                        "recall_sensitivity",
                        "specificity",
                        "f1",
                    }
                    else np.nan
                ),
            }
        )


thresholds = pd.DataFrame(
    threshold_rows
)

point_metrics = pd.DataFrame(
    point_metric_rows
)

bootstrap_results = pd.DataFrame(
    bootstrap_rows
)

calibration_bins = pd.DataFrame(
    calibration_rows
)


validation_probabilities = np.column_stack(
    [
        validation[
            f"probability_{horizon}"
        ].to_numpy(dtype=float)
        for horizon in HORIZONS
    ]
)

test_probabilities = np.column_stack(
    [
        test[
            f"probability_{horizon}"
        ].to_numpy(dtype=float)
        for horizon in HORIZONS
    ]
)


validation_violation_rate = float(
    np.mean(
        np.any(
            np.diff(
                validation_probabilities,
                axis=1,
            ) < 0,
            axis=1,
        )
    )
)

test_violation_rate = float(
    np.mean(
        np.any(
            np.diff(
                test_probabilities,
                axis=1,
            ) < 0,
            axis=1,
        )
    )
)


summary = {
    "training_run_id": TRAINING_RUN_ID,
    "evaluation_run_id": EVALUATION_RUN_ID,
    "bootstrap_iterations_requested": (
        BOOTSTRAP_ITERATIONS
    ),
    "bootstrap_unit": "patient",
    "threshold_selection": (
        "Youden J selected using validation data only"
    ),
    "test_used_for_threshold_selection": False,
    "confidence_interval_method": (
        "patient-level percentile bootstrap"
    ),
    "calibration_bins": CALIBRATION_BINS,
    "calibration_summary": calibration_summary,
    "validation_monotonic_violation_rate": (
        validation_violation_rate
    ),
    "test_monotonic_violation_rate": (
        test_violation_rate
    ),
}


temporary_outputs = {
    THRESHOLD_OUTPUT + ".tmp": thresholds,
    POINT_METRICS_OUTPUT + ".tmp": point_metrics,
    BOOTSTRAP_OUTPUT + ".tmp": bootstrap_results,
    CALIBRATION_OUTPUT + ".tmp": calibration_bins,
}


for temporary_path, dataframe in (
    temporary_outputs.items()
):
    dataframe.to_csv(
        temporary_path,
        index=False,
    )


summary_temp = SUMMARY_OUTPUT + ".tmp"

with open(
    summary_temp,
    "w",
    encoding="utf-8",
) as summary_file:
    json.dump(
        summary,
        summary_file,
        indent=2,
    )


for temporary_path, final_path in [
    (
        THRESHOLD_OUTPUT + ".tmp",
        THRESHOLD_OUTPUT,
    ),
    (
        POINT_METRICS_OUTPUT + ".tmp",
        POINT_METRICS_OUTPUT,
    ),
    (
        BOOTSTRAP_OUTPUT + ".tmp",
        BOOTSTRAP_OUTPUT,
    ),
    (
        CALIBRATION_OUTPUT + ".tmp",
        CALIBRATION_OUTPUT,
    ),
    (
        summary_temp,
        SUMMARY_OUTPUT,
    ),
]:
    os.replace(
        temporary_path,
        final_path,
    )


print("\nVALIDATION-SELECTED THRESHOLDS")
print("=" * 76)
print(
    thresholds[
        [
            "horizon",
            "validation_positives",
            "threshold",
            "validation_sensitivity",
            "validation_specificity",
        ]
    ].to_string(index=False)
)


print("\nTEST METRICS USING VALIDATION THRESHOLDS")
print("=" * 76)

selected_results = point_metrics[
    point_metrics[
        "threshold_source"
    ].eq("validation_youden")
]

print(
    selected_results[
        [
            "horizon",
            "positives",
            "threshold",
            "auroc",
            "auprc",
            "precision",
            "recall_sensitivity",
            "specificity",
            "f1",
        ]
    ].to_string(index=False)
)


print("\n95% BOOTSTRAP CONFIDENCE INTERVALS")
print("=" * 76)

print(
    bootstrap_results[
        bootstrap_results["metric"].isin(
            [
                "auroc",
                "auprc",
            ]
        )
    ][
        [
            "horizon",
            "metric",
            "estimate",
            "ci_95_lower",
            "ci_95_upper",
            "valid_bootstrap_samples",
        ]
    ].to_string(index=False)
)


print("\nCALIBRATION SUMMARY")
print("=" * 76)

for horizon in HORIZONS:
    values = calibration_summary[
        horizon
    ]

    print(
        f"{horizon}: "
        f"observed={values['observed_prevalence']:.4f}, "
        f"mean_predicted={values['mean_predicted_probability']:.4f}, "
        f"Brier={values['brier_score']:.4f}, "
        f"Brier_skill={values['brier_skill_score']:.4f}, "
        f"ECE={values['expected_calibration_error']:.4f}"
    )


print("\nMONOTONICITY")
print("=" * 76)
print(
    "Validation violation rate:",
    validation_violation_rate,
)
print(
    "Test violation rate:",
    test_violation_rate,
)


print("\nOUTPUT FILES")
print("=" * 76)
print(THRESHOLD_OUTPUT)
print(POINT_METRICS_OUTPUT)
print(BOOTSTRAP_OUTPUT)
print(CALIBRATION_OUTPUT)
print(SUMMARY_OUTPUT)


print("\nVALIDATION")
print("=" * 76)
print("PASS: thresholds selected using validation only")
print("PASS: test labels were not used for threshold selection")
print("PASS: confidence intervals resampled patients")
print("PASS: original predictions and model were unchanged")
