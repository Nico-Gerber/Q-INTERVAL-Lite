import unittest

import torch

from v2_hazard.models.v2a_hazard_lstm import (
    V2AHazardLSTM,
)


class V2AModelTests(unittest.TestCase):
    def setUp(self):
        torch.manual_seed(42)
        self.model = V2AHazardLSTM()
        self.model.eval()

    def test_output_shapes(self):
        inputs = torch.randn(4, 5, 6149)
        masks = torch.tensor(
            [
                [1, 1, 0, 0, 0],
                [1, 1, 1, 0, 0],
                [1, 1, 1, 1, 0],
                [1, 1, 1, 1, 1],
            ],
            dtype=torch.float32,
        )

        predictions = self.model.predict_risk(
            inputs,
            masks,
        )

        self.assertEqual(
            predictions["logits"].shape,
            (4, 5),
        )
        self.assertEqual(
            predictions["hazards"].shape,
            (4, 5),
        )
        self.assertEqual(
            predictions["cumulative_risk"].shape,
            (4, 5),
        )

    def test_cumulative_risk_is_monotonic(self):
        inputs = torch.randn(4, 5, 6149)
        masks = torch.ones(4, 5)

        cumulative_risk = self.model.predict_risk(
            inputs,
            masks,
        )["cumulative_risk"]

        self.assertTrue(
            torch.all(
                cumulative_risk[:, 1:]
                >= cumulative_risk[:, :-1]
            )
        )

    def test_padded_values_do_not_change_output(self):
        inputs = torch.randn(1, 5, 6149)
        masks = torch.tensor(
            [[1, 1, 0, 0, 0]],
            dtype=torch.float32,
        )

        changed_inputs = inputs.clone()
        changed_inputs[:, 2:, :] = (
            torch.randn_like(changed_inputs[:, 2:, :])
            * 100.0
        )

        with torch.no_grad():
            first_output = self.model(inputs, masks)
            second_output = self.model(
                changed_inputs,
                masks,
            )

        torch.testing.assert_close(
            first_output,
            second_output,
        )

    def test_invalid_mask_is_rejected(self):
        inputs = torch.randn(1, 5, 6149)
        invalid_mask = torch.tensor(
            [[1, 0, 1, 0, 0]],
            dtype=torch.float32,
        )

        with self.assertRaisesRegex(
            ValueError,
            "right padding",
        ):
            self.model(inputs, invalid_mask)

    def test_parameter_count_matches_baseline(self):
        parameter_count = sum(
            parameter.numel()
            for parameter in self.model.parameters()
        )

        self.assertEqual(parameter_count, 1_780_613)


if __name__ == "__main__":
    unittest.main()
