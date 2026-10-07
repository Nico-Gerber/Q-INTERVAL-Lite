import unittest

import numpy as np

from v2_hazard.evaluation.metrics import (
    evaluate_cumulative_predictions,
    expected_calibration_error,
)


class EvaluationMetricTests(unittest.TestCase):
    def setUp(self):
        self.targets = np.array(
            [
                [1, 1, 1, 1, 1],
                [0, 1, 1, 1, 1],
                [0, 0, 1, 1, 1],
                [0, 0, 0, 1, 1],
                [0, 0, 0, 0, 0],
            ],
            dtype=np.float32,
        )

    def test_perfect_predictions(self):
        metrics = evaluate_cumulative_predictions(
            self.targets,
            self.targets,
        )

        self.assertEqual(metrics["mean_auroc"], 1.0)
        self.assertEqual(metrics["mean_auprc"], 1.0)
        self.assertEqual(
            metrics["mean_brier_score"],
            0.0,
        )
        self.assertEqual(
            metrics[
                "patients_with_monotonicity_violation"
            ],
            0,
        )

    def test_monotonicity_violation_is_detected(self):
        predictions = self.targets.copy()
        predictions[0] = [0.1, 0.4, 0.3, 0.8, 0.9]

        metrics = evaluate_cumulative_predictions(
            self.targets,
            predictions,
        )

        self.assertEqual(
            metrics[
                "patients_with_monotonicity_violation"
            ],
            1,
        )

    def test_calibration_shape_mismatch_is_rejected(self):
        with self.assertRaisesRegex(
            ValueError,
            "must match",
        ):
            expected_calibration_error(
                np.zeros(5),
                np.zeros(4),
            )


if __name__ == "__main__":
    unittest.main()
