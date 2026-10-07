import unittest

import torch

from v2_hazard.models.v2c_structured_hazard_lstm import (
    V2CStructuredHazardLSTM,
)


class V2CModelTests(unittest.TestCase):
    def setUp(self):
        torch.manual_seed(42)

        self.model = V2CStructuredHazardLSTM()
        self.model.eval()

        self.masks = torch.tensor(
            [
                [1, 1, 0, 0, 0],
                [1, 1, 1, 0, 0],
                [1, 1, 1, 1, 0],
                [1, 1, 1, 1, 1],
            ],
            dtype=torch.float32,
        )

        self.inputs = torch.randn(4, 5, 6149)

        self.inputs[..., 6144:6148] = torch.randint(
            0,
            2,
            (4, 5, 4),
        ).float()

        self.inputs[..., 6148:6149] = torch.rand(
            4,
            5,
            1,
        )

        self.temporal = torch.rand(4, 5, 2)

        valid_exam_mask = self.masks.unsqueeze(-1)
        self.inputs *= valid_exam_mask
        self.temporal *= valid_exam_mask

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

    def test_branch_embedding_shapes(self):
        fused, branches = self.model.encode_examinations(
            self.inputs,
            self.temporal,
            self.masks,
        )

        self.assertEqual(fused.shape, (4, 5, 256))

        expected_shapes = {
            "global": (4, 5, 256),
            "cc_asymmetry": (4, 5, 128),
            "mlo_asymmetry": (4, 5, 128),
            "view": (4, 5, 16),
            "timing": (4, 5, 16),
        }

        self.assertEqual(
            set(branches),
            set(expected_shapes),
        )

        for name, expected_shape in expected_shapes.items():
            self.assertEqual(
                branches[name].shape,
                expected_shape,
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

    def test_padded_values_do_not_change_output(self):
        inputs = self.inputs[:1].clone()
        temporal = self.temporal[:1].clone()
        mask = self.masks[:1].clone()

        changed_inputs = inputs.clone()
        changed_temporal = temporal.clone()

        changed_inputs[:, 2:, :6144] = 1000.0
        changed_inputs[:, 2:, 6144:6148] = 1.0
        changed_inputs[:, 2:, 6148:6149] = 1.0
        changed_temporal[:, 2:, :] = 1000.0

        with torch.no_grad():
            first_output = self.model(
                inputs,
                temporal,
                mask,
            )
            second_output = self.model(
                changed_inputs,
                changed_temporal,
                mask,
            )

        torch.testing.assert_close(
            first_output,
            second_output,
        )

    def test_invalid_view_mask_is_rejected(self):
        invalid_inputs = self.inputs.clone()
        invalid_inputs[0, 0, 6144] = 0.5

        with self.assertRaisesRegex(
            ValueError,
            "must be binary",
        ):
            self.model(
                invalid_inputs,
                self.temporal,
                self.masks,
            )

    def test_invalid_recency_weight_is_rejected(self):
        invalid_inputs = self.inputs.clone()
        invalid_inputs[0, 0, 6148] = 1.5

        with self.assertRaisesRegex(
            ValueError,
            "cannot exceed one",
        ):
            self.model(
                invalid_inputs,
                self.temporal,
                self.masks,
            )

    def test_padded_branch_embeddings_are_zero(self):
        _, branches = self.model.encode_examinations(
            self.inputs,
            self.temporal,
            self.masks,
        )

        for embedding in branches.values():
            padded_values = embedding[
                self.masks == 0
            ]

            torch.testing.assert_close(
                padded_values,
                torch.zeros_like(padded_values),
            )

    def test_valid_timing_change_affects_output(self):
        changed_temporal = self.temporal.clone()

        changed_temporal[:, :2, :] += 2.0

        with torch.no_grad():
            first_output = self.model(
                self.inputs,
                self.temporal,
                self.masks,
            )
            second_output = self.model(
                self.inputs,
                changed_temporal,
                self.masks,
            )

        self.assertFalse(
            torch.allclose(first_output, second_output)
        )

    def test_parameter_count_is_controlled(self):
        parameter_count = sum(
            parameter.numel()
            for parameter in self.model.parameters()
        )

        self.assertEqual(parameter_count, 1_394_965)

    def test_incompatible_feature_layout_is_rejected(self):
        with self.assertRaisesRegex(
            ValueError,
            "requires the frozen 6149-feature layout",
        ):
            V2CStructuredHazardLSTM(input_size=6000)


if __name__ == "__main__":
    unittest.main()
