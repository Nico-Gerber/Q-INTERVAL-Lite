"""Training-only initialisation for discrete hazard outputs."""

from __future__ import annotations

import torch
from torch import nn


def calculate_empirical_hazard_rates(
    targets: torch.Tensor,
    at_risk_masks: torch.Tensor,
) -> torch.Tensor:
    """Calculate interval event rates from training patients."""
    if targets.shape != at_risk_masks.shape:
        raise ValueError("Targets and at-risk masks must match")

    if targets.ndim != 2:
        raise ValueError("Targets must have two dimensions")

    targets = targets.float()
    at_risk_masks = at_risk_masks.float()

    event_counts = (
        targets * at_risk_masks
    ).sum(dim=0)

    at_risk_counts = at_risk_masks.sum(dim=0)

    if torch.any(at_risk_counts <= 0):
        raise ValueError(
            "Every interval must contain at-risk patients"
        )

    rates = event_counts / at_risk_counts

    if torch.any((rates <= 0) | (rates >= 1)):
        raise ValueError(
            "Empirical hazard rates must be between zero and one"
        )

    return rates


def initialize_hazard_head_bias(
    output_layer: nn.Linear,
    hazard_rates: torch.Tensor,
) -> torch.Tensor:
    """Initialise output biases with empirical hazard logits."""
    if not isinstance(output_layer, nn.Linear):
        raise TypeError("Output layer must be nn.Linear")

    if output_layer.bias is None:
        raise ValueError("Output layer must have a bias")

    rates = torch.as_tensor(
        hazard_rates,
        dtype=output_layer.bias.dtype,
        device=output_layer.bias.device,
    )

    if rates.ndim != 1:
        raise ValueError(
            "Hazard rates must be one-dimensional"
        )

    if rates.shape[0] != output_layer.out_features:
        raise ValueError(
            "Hazard-rate count does not match output size"
        )

    if not torch.isfinite(rates).all():
        raise ValueError("Hazard rates must be finite")

    if torch.any((rates <= 0) | (rates >= 1)):
        raise ValueError(
            "Hazard rates must be between zero and one"
        )

    bias_logits = torch.log(
        rates / (1.0 - rates)
    )

    with torch.no_grad():
        output_layer.bias.copy_(bias_logits)

    return bias_logits.detach().clone()

