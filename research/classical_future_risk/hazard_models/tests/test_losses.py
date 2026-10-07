import math
import unittest

import torch

from v2_hazard.training.losses import (
    MaskedHazardBCELoss,
    calculate_positive_weights,
    hazard_logits_to_cumulative_risk,
)


class HazardLossTests(unittest.TestCase):
    def test_zero_logits_have_expected_unweighted_loss(self):
        logits = torch.zeros((2, 5))
        targets = torch.zeros((2, 5))
        masks = torch.ones((2, 5))

        loss = MaskedHazardBCELoss()(
            logits,
            targets,
            masks,
        )

        self.assertAlmostEqual(
            loss.item(),
            math.log(2.0),
            places=6,
        )

    def test_post_event_intervals_are_ignored(self):
        targets = torch.tensor(
            [[0, 1, 0, 0, 0]],
            dtype=torch.float32,
        )
        masks = torch.tensor(
            [[1, 1, 0, 0, 0]],
            dtype=torch.float32,
        )

        first_logits = torch.zeros((1, 5))
        second_logits = torch.tensor(
            [[0, 0, 100, -100, 100]],
            dtype=torch.float32,
        )

        loss_function = MaskedHazardBCELoss()

        first_loss = loss_function(
            first_logits,
            targets,
            masks,
        )
        second_loss = loss_function(
            second_logits,
            targets,
            masks,
        )

        self.assertAlmostEqual(
            first_loss.item(),
            second_loss.item(),
            places=6,
        )

    def test_positive_weighting_strategies(self):
        targets = torch.zeros((10, 5))
        masks = torch.ones((10, 5))

        for interval in range(5):
            targets[interval, interval] = 1.0

        raw = calculate_positive_weights(
            targets,
            masks,
            strategy="raw",
        )
        square_root = calculate_positive_weights(
            targets,
            masks,
            strategy="sqrt",
        )
        capped = calculate_positive_weights(
            targets,
            masks,
            strategy="capped_raw",
            cap=5.0,
        )
        unweighted = calculate_positive_weights(
            targets,
            masks,
            strategy="none",
        )

        torch.testing.assert_close(
            raw,
            torch.full((5,), 9.0),
        )
        torch.testing.assert_close(
            square_root,
            torch.full((5,), 3.0),
        )
        torch.testing.assert_close(
            capped,
            torch.full((5,), 5.0),
        )
        torch.testing.assert_close(
            unweighted,
            torch.ones(5),
        )

    def test_zero_positive_interval_is_rejected(self):
        targets = torch.zeros((10, 5))
        masks = torch.ones((10, 5))
        targets[0, 0] = 1.0

        with self.assertRaisesRegex(
            ValueError,
            "Every hazard interval",
        ):
            calculate_positive_weights(
                targets,
                masks,
            )

    def test_cumulative_risk_is_monotonic(self):
        logits = torch.tensor(
            [
                [0.2, -1.0, 0.5, -0.3, 1.2],
                [-2.0, -1.5, -1.0, -0.5, 0.0],
            ],
            dtype=torch.float32,
        )

        hazards, cumulative_risk = (
            hazard_logits_to_cumulative_risk(logits)
        )

        self.assertTrue(
            torch.all((hazards >= 0) & (hazards <= 1))
        )
        self.assertTrue(
            torch.all(
                cumulative_risk[:, 1:]
                >= cumulative_risk[:, :-1]
            )
        )
        self.assertTrue(
            torch.all(
                (cumulative_risk >= 0)
                & (cumulative_risk <= 1)
            )
        )


if __name__ == "__main__":
    unittest.main()
