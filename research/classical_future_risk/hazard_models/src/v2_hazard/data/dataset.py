"""PyTorch dataset for feature-based longitudinal hazard modelling."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
import torch
from torch.utils.data import Dataset


VALID_SPLITS = {"train", "validation", "test"}


class HazardSequenceDataset(Dataset):
    """Load aligned sequence, temporal, target, and mask arrays."""

    def __init__(
        self,
        project_root: str | Path,
        workspace_root: str | Path,
        split: str,
    ) -> None:
        if split not in VALID_SPLITS:
            raise ValueError(
                f"Unknown split {split!r}. "
                f"Expected one of {sorted(VALID_SPLITS)}"
            )

        project_root = Path(project_root)
        workspace_root = Path(workspace_root)

        self.split = split

        self.sequences = np.load(
            project_root
            / "features/patient_sequences_5x6149.npy",
            mmap_mode="r",
        )
        self.sequence_masks = np.load(
            project_root
            / "features/patient_sequence_masks.npy",
            mmap_mode="r",
        )
        self.temporal_features = np.load(
            workspace_root
            / "data/derived/temporal_features_5x2.npy",
            mmap_mode="r",
        )
        self.hazard_targets = np.load(
            workspace_root
            / "data/derived/hazard_targets.npy",
            mmap_mode="r",
        )
        self.at_risk_masks = np.load(
            workspace_root
            / "data/derived/hazard_at_risk_masks.npy",
            mmap_mode="r",
        )

        metadata_path = (
            workspace_root
            / "data/derived/hazard_target_metadata.csv"
        )
        self.metadata = pd.read_csv(metadata_path)

        self._validate_alignment()

        self.patient_indices = self.metadata.loc[
            self.metadata["split"] == split,
            "patient_index",
        ].to_numpy(dtype=np.int64)

        if len(self.patient_indices) == 0:
            raise ValueError(f"Split {split!r} contains no patients")

    def _validate_alignment(self) -> None:
        patient_count = len(self.metadata)

        expected_shapes = {
            "sequences": (patient_count, 5, 6149),
            "sequence_masks": (patient_count, 5),
            "temporal_features": (patient_count, 5, 2),
            "hazard_targets": (patient_count, 5),
            "at_risk_masks": (patient_count, 5),
        }

        arrays = {
            "sequences": self.sequences,
            "sequence_masks": self.sequence_masks,
            "temporal_features": self.temporal_features,
            "hazard_targets": self.hazard_targets,
            "at_risk_masks": self.at_risk_masks,
        }

        for name, expected_shape in expected_shapes.items():
            actual_shape = arrays[name].shape

            if actual_shape != expected_shape:
                raise ValueError(
                    f"{name} has shape {actual_shape}, "
                    f"expected {expected_shape}"
                )

        expected_indices = np.arange(patient_count)

        if not np.array_equal(
            self.metadata["patient_index"].to_numpy(),
            expected_indices,
        ):
            raise ValueError("Patient indices are not sequential")

        actual_splits = set(self.metadata["split"].unique())

        if not actual_splits.issubset(VALID_SPLITS):
            raise ValueError(
                f"Unexpected metadata splits: {actual_splits}"
            )

        if not np.all(
            np.isin(self.sequence_masks, [0.0, 1.0])
        ):
            raise ValueError("Sequence masks must be binary")

        if not np.all(
            np.isin(self.hazard_targets, [0.0, 1.0])
        ):
            raise ValueError("Hazard targets must be binary")

        if not np.all(
            np.isin(self.at_risk_masks, [0.0, 1.0])
        ):
            raise ValueError("At-risk masks must be binary")

        if np.any(self.hazard_targets > self.at_risk_masks):
            raise ValueError(
                "Hazard events occur outside the at-risk mask"
            )

    def __len__(self) -> int:
        return len(self.patient_indices)

    def __getitem__(
        self,
        item: int,
    ) -> dict[str, torch.Tensor]:
        patient_index = int(self.patient_indices[item])

        sequence_features = torch.from_numpy(
            np.array(
                self.sequences[patient_index],
                dtype=np.float32,
                copy=True,
            )
        )

        temporal_features = torch.from_numpy(
            np.array(
                self.temporal_features[patient_index],
                dtype=np.float32,
                copy=True,
            )
        )

        sequence_mask = torch.from_numpy(
            np.array(
                self.sequence_masks[patient_index],
                dtype=np.float32,
                copy=True,
            )
        )

        hazard_targets = torch.from_numpy(
            np.array(
                self.hazard_targets[patient_index],
                dtype=np.float32,
                copy=True,
            )
        )

        at_risk_mask = torch.from_numpy(
            np.array(
                self.at_risk_masks[patient_index],
                dtype=np.float32,
                copy=True,
            )
        )

        return {
            "sequence_features": sequence_features,
            "temporal_features": temporal_features,
            "sequence_mask": sequence_mask,
            "hazard_targets": hazard_targets,
            "at_risk_mask": at_risk_mask,
            "patient_index": torch.tensor(
                patient_index,
                dtype=torch.long,
            ),
        }
