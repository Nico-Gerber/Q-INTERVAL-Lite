"""Loss and prediction functions for discrete-time hazard modelling."""

from __future__ import annotations

import torch
from torch import nn
from torch.nn import functional as F


VALID_WEIGHTING_STRATEGIES = {
    "none",
    "raw",
    "sqrt",
    "capped_raw",
}


def calculate_positive_weights(
    targets: torch.Tensor,
    at_risk_masks: torch.Tensor,
    strategy: str = "sqrt",
    cap: float = 50.0,
) -> torch.Tensor:
    """Calculate interval weights from training patients only."""
    if targets.shape != at_risk_masks.shape:
        raise ValueError("Targets and at-risk masks must match")

    if targets.ndim != 2:
        raise ValueError("Targets must have two dimensions")

    if strategy not in VALID_WEIGHTING_STRATEGIES:
        raise ValueError(
            f"Unknown weighting strategy: {strategy!r}"
        )

    targets = targets.float()
    at_risk_masks = at_risk_masks.float()

    positive_counts = (
        targets * at_risk_masks
    ).sum(dim=0)

    negative_counts = (
        (1.0 - targets) * at_risk_masks
    ).sum(dim=0)

    if torch.any(positive_counts <= 0):
        raise ValueError(
            "Every hazard interval must contain a training event"
        )

    raw_weights = negative_counts / positive_counts

    if strategy == "none":
        return torch.ones_like(raw_weights)

    if strategy == "raw":
        return raw_weights

    if strategy == "sqrt":
        return torch.sqrt(raw_weights)

    if cap <= 0:
        raise ValueError("Weight cap must be positive")

    return torch.clamp(raw_weights, max=cap)


class MaskedHazardBCELoss(nn.Module):
    """Binary cross-entropy applied only while patients are at risk."""

    def __init__(
        self,
        positive_weights: torch.Tensor | None = None,
    ) -> None:
        super().__init__()

        if positive_weights is None:
            positive_weights = torch.empty(0)

        if positive_weights.ndim != 1:
            raise ValueError(
                "Positive weights must be one-dimensional"
            )

        if positive_weights.numel() > 0:
            if not torch.isfinite(positive_weights).all():
                raise ValueError(
                    "Positive weights must be finite"
                )

            if torch.any(positive_weights <= 0):
                raise ValueError(
                    "Positive weights must be greater than zero"
                )

        self.register_buffer(
            "positive_weights",
            positive_weights.float(),
        )

    def forward(
        self,
        logits: torch.Tensor,
        targets: torch.Tensor,
        at_risk_masks: torch.Tensor,
    ) -> torch.Tensor:
        if logits.shape != targets.shape:
            raise ValueError("Logits and targets must match")

        if logits.shape != at_risk_masks.shape:
            raise ValueError(
                "Logits and at-risk masks must match"
            )

        if logits.ndim != 2:
            raise ValueError(
                "Hazard tensors must have shape "
                "(batch, intervals)"
            )

        if (
            self.positive_weights.numel() > 0
            and self.positive_weights.shape[0]
            != logits.shape[1]
        ):
            raise ValueError(
                "Positive-weight count does not match "
                "the number of hazard intervals"
            )

        valid_count = at_risk_masks.sum()

        if valid_count <= 0:
            raise ValueError(
                "Batch contains no valid at-risk intervals"
            )

        positive_weights = (
            self.positive_weights
            if self.positive_weights.numel() > 0
            else None
        )

        element_losses = F.binary_cross_entropy_with_logits(
            logits,
            targets,
            reduction="none",
            pos_weight=positive_weights,
        )

        masked_loss = element_losses * at_risk_masks

        return masked_loss.sum() / valid_count


def hazard_logits_to_cumulative_risk(
    logits: torch.Tensor,
) -> tuple[torch.Tensor, torch.Tensor]:
    """
    Convert hazard logits into conditional hazards and cumulative risk.
    """
    if logits.ndim != 2:
        raise ValueError(
            "Logits must have shape (batch, intervals)"
        )

    hazards = torch.sigmoid(logits)
    survival = torch.cumprod(1.0 - hazards, dim=1)
    cumulative_risk = 1.0 - survival

    return hazards, cumulative_risk
