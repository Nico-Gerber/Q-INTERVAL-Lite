import unittest
from pathlib import Path

import torch
from torch.utils.data import DataLoader

from v2_hazard.data.dataset import HazardSequenceDataset


WORKSPACE = Path(__file__).resolve().parents[1]
PROJECT_ROOT = WORKSPACE.parent


class HazardDatasetTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.train = HazardSequenceDataset(
            PROJECT_ROOT,
            WORKSPACE,
            "train",
        )
        cls.validation = HazardSequenceDataset(
            PROJECT_ROOT,
            WORKSPACE,
            "validation",
        )
        cls.test = HazardSequenceDataset(
            PROJECT_ROOT,
            WORKSPACE,
            "test",
        )

    def test_split_sizes(self):
        self.assertEqual(len(self.train), 1552)
        self.assertEqual(len(self.validation), 331)
        self.assertEqual(len(self.test), 331)

    def test_splits_are_disjoint_and_complete(self):
        train_indices = set(self.train.patient_indices.tolist())
        validation_indices = set(
            self.validation.patient_indices.tolist()
        )
        test_indices = set(self.test.patient_indices.tolist())

        self.assertTrue(train_indices.isdisjoint(validation_indices))
        self.assertTrue(train_indices.isdisjoint(test_indices))
        self.assertTrue(
            validation_indices.isdisjoint(test_indices)
        )

        all_indices = (
            train_indices
            | validation_indices
            | test_indices
        )

        self.assertEqual(all_indices, set(range(2214)))

    def test_sample_shapes_and_types(self):
        sample = self.train[0]

        self.assertEqual(
            sample["sequence_features"].shape,
            (5, 6149),
        )
        self.assertEqual(
            sample["temporal_features"].shape,
            (5, 2),
        )
        self.assertEqual(sample["sequence_mask"].shape, (5,))
        self.assertEqual(sample["hazard_targets"].shape, (5,))
        self.assertEqual(sample["at_risk_mask"].shape, (5,))

        self.assertEqual(
            sample["sequence_features"].dtype,
            torch.float32,
        )
        self.assertEqual(
            sample["temporal_features"].dtype,
            torch.float32,
        )
        self.assertEqual(
            sample["patient_index"].dtype,
            torch.int64,
        )

    def test_dataloader_batch(self):
        loader = DataLoader(
            self.train,
            batch_size=8,
            shuffle=False,
            num_workers=0,
        )

        batch = next(iter(loader))

        self.assertEqual(
            batch["sequence_features"].shape,
            (8, 5, 6149),
        )
        self.assertEqual(
            batch["temporal_features"].shape,
            (8, 5, 2),
        )
        self.assertEqual(
            batch["sequence_mask"].shape,
            (8, 5),
        )
        self.assertEqual(
            batch["hazard_targets"].shape,
            (8, 5),
        )
        self.assertEqual(
            batch["at_risk_mask"].shape,
            (8, 5),
        )
        self.assertEqual(batch["patient_index"].shape, (8,))

    def test_padding_is_zero(self):
        sample = self.train[0]
        padding = sample["sequence_mask"] == 0

        self.assertTrue(
            torch.all(
                sample["sequence_features"][padding] == 0
            )
        )
        self.assertTrue(
            torch.all(
                sample["temporal_features"][padding] == 0
            )
        )


if __name__ == "__main__":
    unittest.main()
