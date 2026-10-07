import unittest

import torch
from torch import nn

from v2_hazard.training.initialization import (
    calculate_empirical_hazard_rates,
    initialize_hazard_head_bias,
)


class HazardInitializationTests(unittest.TestCase):
    def test_empirical_rates_respect_at_risk_masks(self):
        targets = torch.tensor(
            [
                [1, 0],
                [0, 1],
                [0, 0],
                [0, 0],
            ],
            dtype=torch.float32,
        )

        masks = torch.tensor(
            [
                [1, 0],
                [1, 1],
                [1, 1],
                [1, 1],
            ],
            dtype=torch.float32,
        )

        rates = calculate_empirical_hazard_rates(
            targets,
            masks,
        )

        expected = torch.tensor(
            [1.0 / 4.0, 1.0 / 3.0],
            dtype=torch.float32,
        )

        torch.testing.assert_close(rates, expected)

    def test_output_bias_matches_hazard_logits(self):
        layer = nn.Linear(4, 2)
        rates = torch.tensor([0.1, 0.2])

        bias_logits = initialize_hazard_head_bias(
            layer,
            rates,
        )

        expected = torch.log(
            rates / (1.0 - rates)
        )

        torch.testing.assert_close(
            bias_logits,
            expected,
        )
        torch.testing.assert_close(
            layer.bias.detach(),
            expected,
        )

    def test_invalid_rate_is_rejected(self):
        layer = nn.Linear(4, 2)

        with self.assertRaisesRegex(
            ValueError,
            "between zero and one",
        ):
            initialize_hazard_head_bias(
                layer,
                torch.tensor([0.0, 0.2]),
            )


if __name__ == "__main__":
    unittest.main()
