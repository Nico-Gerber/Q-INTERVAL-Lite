import unittest

import numpy as np

from v2_hazard.data.hazard_targets import (
    build_hazard_targets,
    hazards_to_cumulative_risk,
)


class HazardTargetTests(unittest.TestCase):
    def test_event_interval_mapping(self):
        intervals = [
            "cancer_within_1yr",
            "cancer_between_1_and_2yr",
            "cancer_between_2_and_3yr",
            "cancer_between_3_and_4yr",
            "cancer_between_4_and_5yr",
            "no_cancer_within_5yr",
        ]

        targets, masks = build_hazard_targets(intervals)

        expected_targets = np.array(
            [
                [1, 0, 0, 0, 0],
                [0, 1, 0, 0, 0],
                [0, 0, 1, 0, 0],
                [0, 0, 0, 1, 0],
                [0, 0, 0, 0, 1],
                [0, 0, 0, 0, 0],
            ],
            dtype=np.float32,
        )

        expected_masks = np.array(
            [
                [1, 0, 0, 0, 0],
                [1, 1, 0, 0, 0],
                [1, 1, 1, 0, 0],
                [1, 1, 1, 1, 0],
                [1, 1, 1, 1, 1],
                [1, 1, 1, 1, 1],
            ],
            dtype=np.float32,
        )

        np.testing.assert_array_equal(targets, expected_targets)
        np.testing.assert_array_equal(masks, expected_masks)

    def test_hazard_targets_reproduce_cumulative_labels(self):
        hazards = np.array(
            [
                [1, 0, 0, 0, 0],
                [0, 1, 0, 0, 0],
                [0, 0, 1, 0, 0],
                [0, 0, 0, 1, 0],
                [0, 0, 0, 0, 1],
                [0, 0, 0, 0, 0],
            ],
            dtype=np.float32,
        )

        cumulative = hazards_to_cumulative_risk(hazards)

        expected = np.array(
            [
                [1, 1, 1, 1, 1],
                [0, 1, 1, 1, 1],
                [0, 0, 1, 1, 1],
                [0, 0, 0, 1, 1],
                [0, 0, 0, 0, 1],
                [0, 0, 0, 0, 0],
            ],
            dtype=np.float32,
        )

        np.testing.assert_array_equal(cumulative, expected)

    def test_unknown_interval_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "Unknown event interval"):
            build_hazard_targets(["unknown_interval"])


if __name__ == "__main__":
    unittest.main()
