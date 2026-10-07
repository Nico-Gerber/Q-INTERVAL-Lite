"""Run one GPU training step for a V2 candidate."""

from __future__ import annotations

import argparse
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
from v2_hazard.models.v2b_temporal_hazard_lstm import (
    V2BTemporalHazardLSTM,
)
from v2_hazard.models.v2c_structured_hazard_lstm import (
    V2CStructuredHazardLSTM,
)
from v2_hazard.training.initialization import (
    calculate_empirical_hazard_rates,
    initialize_hazard_head_bias,
)
from v2_hazard.training.losses import (
    MaskedHazardBCELoss,
    hazard_logits_to_cumulative_risk,
)


WORKSPACE = Path(__file__).resolve().parents[1]
PROJECT_ROOT = WORKSPACE.parent

EXPECTED_PARAMETERS = {
    "v2a": 1_780_613,
    "v2b": 1_788_853,
    "v2c": 1_394_965,
}


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--model",
        required=True,
        choices=sorted(EXPECTED_PARAMETERS),
    )
    return parser.parse_args()


def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)


def main() -> None:
    arguments = parse_arguments()

    if not torch.cuda.is_available():
        raise RuntimeError(
            "CUDA is unavailable. Run through Slurm."
        )

    set_seed(42)

    device = torch.device("cuda")
    torch.cuda.reset_peak_memory_stats(device)

    dataset = HazardSequenceDataset(
        PROJECT_ROOT,
        WORKSPACE,
        "train",
    )

    loader = DataLoader(
        dataset,
        batch_size=8,
        shuffle=False,
        num_workers=0,
        pin_memory=True,
    )

    batch = next(iter(loader))

    sequence_features = batch["sequence_features"].to(
        device,
        non_blocking=True,
    )
    temporal_features = batch["temporal_features"].to(
        device,
        non_blocking=True,
    )
    sequence_mask = batch["sequence_mask"].to(
        device,
        non_blocking=True,
    )
    targets = batch["hazard_targets"].to(
        device,
        non_blocking=True,
    )
    at_risk = batch["at_risk_mask"].to(
        device,
        non_blocking=True,
    )

    all_targets = torch.from_numpy(
        np.array(
            dataset.hazard_targets[
                dataset.patient_indices
            ],
            dtype=np.float32,
            copy=True,
        )
    )

    all_at_risk = torch.from_numpy(
        np.array(
            dataset.at_risk_masks[
                dataset.patient_indices
            ],
            dtype=np.float32,
            copy=True,
        )
    )

    empirical_rates = calculate_empirical_hazard_rates(
        all_targets,
        all_at_risk,
    )

    with (
        WORKSPACE / "configs/hazard_weighting.json"
    ).open("r", encoding="utf-8") as file:
        weighting = json.load(file)

    positive_weights = torch.tensor(
        weighting["weights"]["sqrt"],
        dtype=torch.float32,
        device=device,
    )

    if arguments.model == "v2a":
        model = V2AHazardLSTM()
    elif arguments.model == "v2b":
        model = V2BTemporalHazardLSTM()
    else:
        model = V2CStructuredHazardLSTM()

    initial_biases = initialize_hazard_head_bias(
        model.output_head[-1],
        empirical_rates,
    )

    model = model.to(device)

    parameter_count = sum(
        parameter.numel()
        for parameter in model.parameters()
    )

    if parameter_count != EXPECTED_PARAMETERS[
        arguments.model
    ]:
        raise RuntimeError(
            f"Unexpected parameter count: {parameter_count}"
        )

    criterion = MaskedHazardBCELoss(
        positive_weights
    ).to(device)

    optimizer = Adam(
        model.parameters(),
        lr=1e-4,
        weight_decay=1e-4,
    )

    model.train()
    optimizer.zero_grad(set_to_none=True)

    if arguments.model == "v2a":
        logits = model(
            sequence_features,
            sequence_mask,
        )
    else:
        logits = model(
            sequence_features,
            temporal_features,
            sequence_mask,
        )

    loss = criterion(logits, targets, at_risk)

    if not torch.isfinite(loss):
        raise RuntimeError("Loss is not finite")

    loss.backward()

    gradient_square_sum = 0.0
    gradient_parameter_count = 0

    for parameter in model.parameters():
        if parameter.grad is None:
            continue

        if not torch.isfinite(parameter.grad).all():
            raise RuntimeError("Gradient is not finite")

        gradient_square_sum += float(
            parameter.grad.detach().pow(2).sum().item()
        )
        gradient_parameter_count += parameter.numel()

    if gradient_parameter_count != parameter_count:
        raise RuntimeError(
            "Not all parameters received gradients"
        )

    gradient_norm = math.sqrt(gradient_square_sum)
    optimizer.step()

    hazards, cumulative_risk = (
        hazard_logits_to_cumulative_risk(
            logits.detach()
        )
    )

    if not torch.all(
        cumulative_risk[:, 1:]
        >= cumulative_risk[:, :-1]
    ):
        raise RuntimeError(
            "Cumulative risk is not monotonic"
        )

    torch.cuda.synchronize(device)

    job_id = os.environ.get(
        "SLURM_JOB_ID",
        "interactive",
    )

    report_path = (
        WORKSPACE
        / "reports"
        / f"{arguments.model}_gpu_smoke_{job_id}.json"
    )

    if report_path.exists():
        raise FileExistsError(
            f"Report already exists: {report_path}"
        )

    report = {
        "status": "passed",
        "model": arguments.model,
        "slurm_job_id": job_id,
        "device": torch.cuda.get_device_name(device),
        "torch_version": torch.__version__,
        "cuda_version": torch.version.cuda,
        "parameter_count": parameter_count,
        "input_shape": list(sequence_features.shape),
        "temporal_shape": list(
            temporal_features.shape
        ),
        "logit_shape": list(logits.shape),
        "empirical_hazard_rates": (
            empirical_rates.tolist()
        ),
        "initial_output_biases": (
            initial_biases.tolist()
        ),
        "loss": float(loss.item()),
        "gradient_norm": gradient_norm,
        "gradient_parameter_count": (
            gradient_parameter_count
        ),
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
