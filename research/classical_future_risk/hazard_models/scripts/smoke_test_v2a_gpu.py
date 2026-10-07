"""Run one complete V2A training step on an allocated GPU."""

from __future__ import annotations

import json
import math
import os
import random
from pathlib import Path

import numpy as np
import torch
from torch.optim import Adam
from torch.utils.data import DataLoader

from v2_hazard.data.dataset import HazardSequenceDataset
from v2_hazard.models.v2a_hazard_lstm import (
    V2AHazardLSTM,
)
from v2_hazard.training.losses import (
    MaskedHazardBCELoss,
    hazard_logits_to_cumulative_risk,
)


WORKSPACE = Path(__file__).resolve().parents[1]
PROJECT_ROOT = WORKSPACE.parent
WEIGHT_CONFIG_PATH = (
    WORKSPACE / "configs/hazard_weighting.json"
)

RANDOM_SEED = 42
BATCH_SIZE = 8
LEARNING_RATE = 1e-4
WEIGHT_DECAY = 1e-4


def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)


def main() -> None:
    if not torch.cuda.is_available():
        raise RuntimeError(
            "CUDA is unavailable. Run this through Slurm."
        )

    set_seed(RANDOM_SEED)

    device = torch.device("cuda")
    torch.cuda.reset_peak_memory_stats(device)

    with WEIGHT_CONFIG_PATH.open(
        "r",
        encoding="utf-8",
    ) as file:
        weight_configuration = json.load(file)

    positive_weights = torch.tensor(
        weight_configuration["weights"]["sqrt"],
        dtype=torch.float32,
        device=device,
    )

    dataset = HazardSequenceDataset(
        PROJECT_ROOT,
        WORKSPACE,
        "train",
    )

    loader = DataLoader(
        dataset,
        batch_size=BATCH_SIZE,
        shuffle=False,
        num_workers=0,
        pin_memory=True,
    )

    batch = next(iter(loader))

    sequence_features = batch["sequence_features"].to(
        device,
        non_blocking=True,
    )
    sequence_mask = batch["sequence_mask"].to(
        device,
        non_blocking=True,
    )
    hazard_targets = batch["hazard_targets"].to(
        device,
        non_blocking=True,
    )
    at_risk_mask = batch["at_risk_mask"].to(
        device,
        non_blocking=True,
    )

    model = V2AHazardLSTM().to(device)

    criterion = MaskedHazardBCELoss(
        positive_weights=positive_weights
    ).to(device)

    optimizer = Adam(
        model.parameters(),
        lr=LEARNING_RATE,
        weight_decay=WEIGHT_DECAY,
    )

    model.train()
    optimizer.zero_grad(set_to_none=True)

    logits = model(
        sequence_features,
        sequence_mask,
    )

    loss = criterion(
        logits,
        hazard_targets,
        at_risk_mask,
    )

    if not torch.isfinite(loss):
        raise RuntimeError("Smoke-test loss is not finite")

    if not torch.isfinite(logits).all():
        raise RuntimeError("Model logits are not finite")

    loss.backward()

    gradient_square_sum = 0.0
    gradient_parameter_count = 0

    for parameter in model.parameters():
        if parameter.grad is None:
            continue

        if not torch.isfinite(parameter.grad).all():
            raise RuntimeError(
                "A model gradient is not finite"
            )

        gradient_square_sum += float(
            parameter.grad.detach().pow(2).sum().item()
        )
        gradient_parameter_count += parameter.numel()

    if gradient_parameter_count == 0:
        raise RuntimeError("No model gradients were produced")

    gradient_norm = math.sqrt(gradient_square_sum)

    optimizer.step()

    hazards, cumulative_risk = (
        hazard_logits_to_cumulative_risk(logits.detach())
    )

    if not torch.all(
        cumulative_risk[:, 1:]
        >= cumulative_risk[:, :-1]
    ):
        raise RuntimeError(
            "Cumulative-risk predictions are not monotonic"
        )

    torch.cuda.synchronize(device)

    job_id = os.environ.get(
        "SLURM_JOB_ID",
        "interactive",
    )

    report_path = (
        WORKSPACE
        / "reports"
        / f"v2a_gpu_smoke_{job_id}.json"
    )

    if report_path.exists():
        raise FileExistsError(
            f"Report already exists: {report_path}"
        )

    parameter_count = sum(
        parameter.numel()
        for parameter in model.parameters()
    )

    report = {
        "status": "passed",
        "slurm_job_id": job_id,
        "device": torch.cuda.get_device_name(device),
        "torch_version": torch.__version__,
        "cuda_version": torch.version.cuda,
        "random_seed": RANDOM_SEED,
        "batch_size": BATCH_SIZE,
        "weighting_strategy": "sqrt",
        "positive_weights": positive_weights.tolist(),
        "input_shape": list(sequence_features.shape),
        "logit_shape": list(logits.shape),
        "parameter_count": parameter_count,
        "loss": float(loss.item()),
        "gradient_norm": gradient_norm,
        "gradient_parameter_count": gradient_parameter_count,
        "hazard_range": [
            float(hazards.min().item()),
            float(hazards.max().item()),
        ],
        "cumulative_risk_range": [
            float(cumulative_risk.min().item()),
            float(cumulative_risk.max().item()),
        ],
        "cumulative_risk_monotonic": True,
        "peak_gpu_memory_mb": (
            torch.cuda.max_memory_allocated(device)
            / (1024 ** 2)
        ),
    }

    report_path.write_text(
        json.dumps(report, indent=2) + "\n",
        encoding="utf-8",
    )

    print(json.dumps(report, indent=2))
    print(f"Report saved to: {report_path}")


if __name__ == "__main__":
    main()
