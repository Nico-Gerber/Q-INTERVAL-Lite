import unittest

import torch

from v2_hazard.models.v2b_temporal_hazard_lstm import (
    V2BTemporalHazardLSTM,
)


class V2BModelTests(unittest.TestCase):
    def setUp(self):
        torch.manual_seed(42)
        self.model = V2BTemporalHazardLSTM()
        self.model.eval()

        self.inputs = torch.randn(4, 5, 6149)
        self.temporal = torch.rand(4, 5, 2)

        self.masks = torch.tensor(
            [
                [1, 1, 0, 0, 0],
                [1, 1, 1, 0, 0],
                [1, 1, 1, 1, 0],
                [1, 1, 1, 1, 1],
            ],
            dtype=torch.float32,
        )

    def test_output_shapes(self):
        predictions = self.model.predict_risk(
            self.inputs,
            self.temporal,
            self.masks,
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
        cumulative_risk = self.model.predict_risk(
            self.inputs,
            self.temporal,
            self.masks,
        )["cumulative_risk"]

        self.assertTrue(
            torch.all(
                cumulative_risk[:, 1:]
                >= cumulative_risk[:, :-1]
            )
        )

    def test_valid_temporal_change_affects_output(self):
        first_temporal = self.temporal.clone()
        second_temporal = self.temporal.clone()

        second_temporal[:, :2, :] += 2.0

        with torch.no_grad():
            first_output = self.model(
                self.inputs,
                first_temporal,
                self.masks,
            )
            second_output = self.model(
                self.inputs,
                second_temporal,
                self.masks,
            )

        self.assertFalse(
            torch.allclose(first_output, second_output)
        )

    def test_padded_temporal_values_are_ignored(self):
        inputs = self.inputs[:1].clone()
        temporal = self.temporal[:1].clone()
        mask = self.masks[:1].clone()

        changed_temporal = temporal.clone()
        changed_temporal[:, 2:, :] = 1000.0

        with torch.no_grad():
            first_output = self.model(
                inputs,
                temporal,
                mask,
            )
            second_output = self.model(
                inputs,
                changed_temporal,
                mask,
            )

        torch.testing.assert_close(
            first_output,
            second_output,
        )

    def test_negative_temporal_value_is_rejected(self):
        invalid_temporal = self.temporal.clone()
        invalid_temporal[0, 0, 0] = -1.0

        with self.assertRaisesRegex(
            ValueError,
            "cannot be negative",
        ):
            self.model(
                self.inputs,
                invalid_temporal,
                self.masks,
            )

    def test_parameter_count_is_controlled(self):
        parameter_count = sum(
            parameter.numel()
            for parameter in self.model.parameters()
        )

        self.assertEqual(parameter_count, 1_788_853)


if __name__ == "__main__":
    unittest.main()
