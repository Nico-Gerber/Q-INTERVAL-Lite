"""Spatial multiview components for the V2D hazard model."""

from pathlib import Path

import numpy as np
import pandas as pd
import torch

from torch import nn
from torch.utils.data import Dataset

def hazard_logits_to_cumulative_risk(
    logits: torch.Tensor,
) -> tuple[torch.Tensor, torch.Tensor]:
    """Convert hazard logits into hazards and cumulative risks."""
    if logits.ndim != 2:
        raise ValueError(
            "Logits must have shape (batch, intervals)"
        )

    hazards = torch.sigmoid(logits)
    survival = torch.cumprod(
        1.0 - hazards,
        dim=1,
    )
    cumulative_risk = 1.0 - survival

    return hazards, cumulative_risk


VALID_SPLITS = {
    "train",
    "validation",
    "test",
}


class V2DSpatialDataset(Dataset):
    """Load aligned spatial maps for one patient split."""

    def __init__(
        self,
        project_root,
        workspace_root,
        split,
    ):
        if split not in VALID_SPLITS:
            raise ValueError(
                f"Unsupported split: {split}"
            )

        project_root = Path(project_root)
        workspace_root = Path(workspace_root)

        self.spatial_features = np.load(
            workspace_root
            / "spatial_features/"
            "mammoclip_b5_spatial_8x8_float16.npy",
            mmap_mode="r",
        )

        self.spatial_indices = np.load(
            workspace_root
            / "spatial_features/"
            "patient_spatial_indices_5x4.npy",
            mmap_mode="r",
        )

        self.sequences = np.load(
            project_root
            / "features/"
            "patient_sequences_5x6149.npy",
            mmap_mode="r",
        )

        self.sequence_masks = np.load(
            project_root
            / "features/"
            "patient_sequence_masks.npy",
            mmap_mode="r",
        )

        self.temporal_features = np.load(
            workspace_root
            / "data/derived/"
            "temporal_features_5x2.npy",
            mmap_mode="r",
        )

        self.hazard_targets = np.load(
            workspace_root
            / "data/derived/"
            "hazard_targets.npy",
            mmap_mode="r",
        )

        self.at_risk_masks = np.load(
            workspace_root
            / "data/derived/"
            "hazard_at_risk_masks.npy",
            mmap_mode="r",
        )

        self.metadata = pd.read_csv(
            workspace_root
            / "data/derived/"
            "hazard_target_metadata.csv"
        )

        expected_shapes = {
            "spatial_features":
                (19054, 2048, 8, 8),
            "spatial_indices":
                (2230, 5, 4),
            "sequences":
                (2230, 5, 6149),
            "sequence_masks":
                (2230, 5),
            "temporal_features":
                (2230, 5, 2),
            "hazard_targets":
                (2230, 5),
            "at_risk_masks":
                (2230, 5),
        }

        for name, expected in expected_shapes.items():
            actual = getattr(self, name).shape

            if actual != expected:
                raise ValueError(
                    f"{name} has shape {actual}, "
                    f"expected {expected}"
                )

        mapped_exam_mask = (
            self.spatial_indices >= 0
        ).any(axis=2)

        if not np.array_equal(
            mapped_exam_mask,
            self.sequence_masks == 1,
        ):
            raise ValueError(
                "Spatial indices disagree with "
                "sequence masks"
            )

        self.patient_indices = self.metadata.loc[
            self.metadata["split"] == split,
            "patient_index",
        ].to_numpy(dtype=np.int64)

        if len(self.patient_indices) == 0:
            raise ValueError(
                f"Split {split!r} is empty"
            )

    def __len__(self):
        return len(self.patient_indices)

    def __getitem__(self, item):
        patient_index = int(
            self.patient_indices[item]
        )

        indices = np.array(
            self.spatial_indices[patient_index],
            dtype=np.int64,
            copy=True,
        )

        available = indices >= 0

        spatial_maps = np.zeros(
            (5, 4, 2048, 8, 8),
            dtype=np.float16,
        )

        spatial_maps[available] = (
            self.spatial_features[
                indices[available]
            ]
        )

        sequence_mask = np.array(
            self.sequence_masks[patient_index],
            dtype=np.float32,
            copy=True,
        )

        recency = np.array(
            self.sequences[
                patient_index,
                :,
                6148:6149,
            ],
            dtype=np.float32,
            copy=True,
        )

        temporal = np.array(
            self.temporal_features[
                patient_index
            ],
            dtype=np.float32,
            copy=True,
        )

        timing_features = np.concatenate(
            [recency, temporal],
            axis=1,
        )

        hazard_targets = np.array(
            self.hazard_targets[
                patient_index
            ],
            dtype=np.float32,
            copy=True,
        )

        at_risk_mask = np.array(
            self.at_risk_masks[
                patient_index
            ],
            dtype=np.float32,
            copy=True,
        )

        return {
            "sequence_features":
                torch.from_numpy(spatial_maps),
            "temporal_features":
                torch.from_numpy(timing_features),
            "sequence_mask":
                torch.from_numpy(sequence_mask),
            "hazard_targets":
                torch.from_numpy(hazard_targets),
            "at_risk_mask":
                torch.from_numpy(at_risk_mask),
            "patient_index": torch.tensor(
                patient_index,
                dtype=torch.long,
            ),
        }


class V2DSpatialMultiviewHazardLSTM(nn.Module):
    """Spatial, multiview and bilateral hazard model."""

    def __init__(
        self,
        feature_channels=2048,
        spatial_embedding_size=128,
        temporal_embedding_size=16,
        fusion_size=256,
        hidden_size=128,
        output_size=5,
        dropout=0.3,
    ):
        super().__init__()

        self.feature_channels = feature_channels
        self.spatial_embedding_size = (
            spatial_embedding_size
        )
        self.output_size = output_size

        self.spatial_encoder = nn.Sequential(
            nn.Conv2d(
                feature_channels,
                spatial_embedding_size,
                kernel_size=1,
            ),
            nn.ReLU(),
            nn.Dropout2d(dropout),
        )

        self.spatial_attention = nn.Conv2d(
            spatial_embedding_size,
            1,
            kernel_size=1,
        )

        self.view_embeddings = nn.Parameter(
            torch.zeros(
                4,
                spatial_embedding_size,
            )
        )

        nn.init.normal_(
            self.view_embeddings,
            mean=0.0,
            std=0.02,
        )

        self.view_attention = nn.Linear(
            spatial_embedding_size,
            1,
        )

        self.timing_encoder = nn.Sequential(
            nn.Linear(
                3,
                temporal_embedding_size,
            ),
            nn.ReLU(),
            nn.Dropout(dropout),
        )

        fusion_input_size = (
            3 * spatial_embedding_size
            + 4
            + temporal_embedding_size
        )

        self.fusion_encoder = nn.Sequential(
            nn.Linear(
                fusion_input_size,
                fusion_size,
            ),
            nn.ReLU(),
            nn.Dropout(dropout),
        )

        self.lstm = nn.LSTM(
            input_size=fusion_size,
            hidden_size=hidden_size,
            num_layers=1,
            batch_first=True,
        )

        self.output_head = nn.Sequential(
            nn.Linear(
                hidden_size,
                64,
            ),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(
                64,
                output_size,
            ),
        )

    def _validate_inputs(
        self,
        inputs,
        temporal_features,
        sequence_mask,
    ):
        expected_input_shape = (
            inputs.shape[0],
            5,
            4,
            self.feature_channels,
            8,
            8,
        )

        if inputs.shape != expected_input_shape:
            raise ValueError(
                f"Spatial inputs have shape "
                f"{inputs.shape}, expected "
                f"{expected_input_shape}"
            )

        expected_temporal_shape = (
            inputs.shape[0],
            5,
            3,
        )

        if (
            temporal_features.shape
            != expected_temporal_shape
        ):
            raise ValueError(
                "Temporal features have an "
                "unexpected shape"
            )

        if sequence_mask.shape != (
            inputs.shape[0],
            5,
        ):
            raise ValueError(
                "Sequence mask has an unexpected shape"
            )

        if not torch.isfinite(inputs).all():
            raise ValueError(
                "Spatial inputs must be finite"
            )

        if not torch.isfinite(
            temporal_features
        ).all():
            raise ValueError(
                "Temporal features must be finite"
            )

        view_mask = (
            torch.amax(
                inputs,
                dim=(3, 4, 5),
            ) > 0
        )

        if not torch.equal(
            view_mask.any(dim=2),
            sequence_mask.bool(),
        ):
            raise ValueError(
                "View availability disagrees "
                "with sequence mask"
            )

        return view_mask

    def encode_views(
        self,
        inputs,
        view_mask,
    ):
        batch_size = inputs.shape[0]

        flattened = inputs.reshape(
            -1,
            self.feature_channels,
            8,
            8,
        ).float()

        encoded = self.spatial_encoder(
            flattened
        )

        attention_logits = self.spatial_attention(
            encoded
        ).flatten(1)

        attention_weights = torch.softmax(
            attention_logits,
            dim=1,
        )

        pooled = (
            encoded.flatten(2)
            * attention_weights.unsqueeze(1)
        ).sum(dim=2)

        pooled = pooled.reshape(
            batch_size,
            5,
            4,
            self.spatial_embedding_size,
        )

        pooled = (
            pooled
            * view_mask.unsqueeze(-1).to(
                pooled.dtype
            )
        )

        attention_weights = (
            attention_weights.reshape(
                batch_size,
                5,
                4,
                8,
                8,
            )
        )

        return pooled, attention_weights

    def fuse_views(
        self,
        pooled_views,
        view_mask,
    ):
        mask = view_mask.unsqueeze(-1)

        view_features = (
            pooled_views
            + self.view_embeddings[
                None, None, :, :
            ]
        )

        view_features = (
            view_features
            * mask.to(view_features.dtype)
        )

        attention_logits = self.view_attention(
            view_features
        ).squeeze(-1)

        attention_logits = (
            attention_logits.masked_fill(
                ~view_mask,
                -1e9,
            )
        )

        view_weights = torch.softmax(
            attention_logits,
            dim=2,
        )

        view_weights = (
            view_weights
            * view_mask.to(
                view_weights.dtype
            )
        )

        view_weights = (
            view_weights
            / view_weights.sum(
                dim=2,
                keepdim=True,
            ).clamp_min(1e-6)
        )

        multiview = (
            view_features
            * view_weights.unsqueeze(-1)
        ).sum(dim=2)

        cc_pair = (
            view_mask[:, :, 0]
            & view_mask[:, :, 1]
        ).unsqueeze(-1)

        mlo_pair = (
            view_mask[:, :, 2]
            & view_mask[:, :, 3]
        ).unsqueeze(-1)

        cc_asymmetry = torch.abs(
            pooled_views[:, :, 0]
            - pooled_views[:, :, 1]
        ) * cc_pair.to(pooled_views.dtype)

        mlo_asymmetry = torch.abs(
            pooled_views[:, :, 2]
            - pooled_views[:, :, 3]
        ) * mlo_pair.to(pooled_views.dtype)

        return (
            multiview,
            cc_asymmetry,
            mlo_asymmetry,
            view_weights,
        )

    def encode_examinations(
        self,
        inputs,
        temporal_features,
        sequence_mask,
    ):
        view_mask = self._validate_inputs(
            inputs,
            temporal_features,
            sequence_mask,
        )

        pooled_views, spatial_weights = (
            self.encode_views(
                inputs,
                view_mask,
            )
        )

        (
            multiview,
            cc_asymmetry,
            mlo_asymmetry,
            view_weights,
        ) = self.fuse_views(
            pooled_views,
            view_mask,
        )

        timing_input = torch.cat(
            [
                temporal_features[:, :, 0:1],
                torch.log1p(
                    temporal_features[:, :, 1:]
                ),
            ],
            dim=2,
        )

        timing_embedding = self.timing_encoder(
            timing_input
        )

        combined = torch.cat(
            [
                multiview,
                cc_asymmetry,
                mlo_asymmetry,
                view_mask.to(multiview.dtype),
                timing_embedding,
            ],
            dim=2,
        )

        fused = self.fusion_encoder(
            combined
        )

        fused = (
            fused
            * sequence_mask.unsqueeze(-1).to(
                fused.dtype
            )
        )

        attention = {
            "spatial": spatial_weights,
            "view": view_weights,
        }

        return fused, attention

    def forward(
        self,
        inputs,
        temporal_features,
        sequence_mask,
    ):
        fused, _ = self.encode_examinations(
            inputs,
            temporal_features,
            sequence_mask,
        )

        lstm_output, _ = self.lstm(
            fused
        )

        lengths = sequence_mask.sum(
            dim=1
        ).long()

        if torch.any(lengths < 1):
            raise ValueError(
                "Every patient needs at least "
                "one examination"
            )

        last_indices = lengths - 1

        batch_indices = torch.arange(
            inputs.shape[0],
            device=inputs.device,
        )

        last_output = lstm_output[
            batch_indices,
            last_indices,
        ]

        return self.output_head(
            last_output
        )

    def predict_risk(
        self,
        inputs,
        temporal_features,
        sequence_mask,
    ):
        logits = self.forward(
            inputs,
            temporal_features,
            sequence_mask,
        )

        hazards, cumulative_risk = (
            hazard_logits_to_cumulative_risk(
                logits
            )
        )

        return {
            "logits": logits,
            "hazards": hazards,
            "cumulative_risk": cumulative_risk,
        }
