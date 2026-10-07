"""Train and validate one V2D spatial multiview hazard-LSTM experiment."""

from __future__ import annotations

import argparse
import json
import os
import random
import re
import time
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from torch.nn.utils import clip_grad_norm_
from torch.optim import Adam
from torch.utils.data import DataLoader
from v2d_labelclean_components import (
    V2DSpatialDataset,
    V2DSpatialMultiviewHazardLSTM,
)

from v2_hazard.evaluation.metrics import (
    evaluate_cumulative_predictions,
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
PROJECT_ROOT = WORKSPACE
WEIGHT_CONFIG_PATH = (
    WORKSPACE / "configs/hazard_weighting.json"
)

BATCH_SIZE = 8
MAX_EPOCHS = 50
PATIENCE = 10
LEARNING_RATE = 1e-4
WEIGHT_DECAY = 1e-4
GRADIENT_CLIP = 1.0
MINIMUM_IMPROVEMENT = 1e-6


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--weighting",
        required=True,
        choices=["none", "sqrt", "capped_raw_50"],
    )
    parser.add_argument("--run-name", required=True)
    parser.add_argument("--seed", type=int, default=42)

    arguments = parser.parse_args()

    if not re.fullmatch(
        r"[A-Za-z0-9_.-]+",
        arguments.run_name,
    ):
        raise ValueError(
            "Run name contains unsupported characters"
        )

    return arguments


def set_reproducible_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)

    torch.backends.cudnn.benchmark = False
    torch.backends.cudnn.deterministic = True


def cumulative_targets(
    hazard_targets: torch.Tensor,
) -> torch.Tensor:
    return torch.clamp(
        torch.cumsum(hazard_targets, dim=1),
        max=1.0,
    )


def write_json(path: Path, value: dict | list) -> None:
    temporary_path = path.with_suffix(
        path.suffix + ".tmp"
    )

    temporary_path.write_text(
        json.dumps(value, indent=2) + "\n",
        encoding="utf-8",
    )

    temporary_path.replace(path)


def run_training_epoch(
    model: V2DSpatialMultiviewHazardLSTM,
    loader: DataLoader,
    criterion: MaskedHazardBCELoss,
    optimizer: Adam,
    device: torch.device,
) -> float:
    model.train()

    weighted_loss_sum = 0.0
    valid_interval_count = 0.0

    for batch in loader:
        features = batch["sequence_features"].to(
            device,
            non_blocking=True,
        )
        temporal_features = batch[
            "temporal_features"
        ].to(
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

        optimizer.zero_grad(set_to_none=True)

        logits = model(
                features,
                temporal_features,
                sequence_mask,
        )
        loss = criterion(logits, targets, at_risk)

        if not torch.isfinite(loss):
            raise RuntimeError(
                "Non-finite training loss encountered"
            )

        loss.backward()

        gradient_norm = clip_grad_norm_(
            model.parameters(),
            GRADIENT_CLIP,
        )

        if not torch.isfinite(gradient_norm):
            raise RuntimeError(
                "Non-finite gradient norm encountered"
            )

        optimizer.step()

        batch_valid_count = float(
            at_risk.sum().item()
        )

        weighted_loss_sum += (
            float(loss.item()) * batch_valid_count
        )
        valid_interval_count += batch_valid_count

    return weighted_loss_sum / valid_interval_count


def run_validation(
    model: V2DSpatialMultiviewHazardLSTM,
    loader: DataLoader,
    criterion: MaskedHazardBCELoss,
    device: torch.device,
) -> tuple[float, dict, dict[str, np.ndarray]]:
    model.eval()

    loss_sum = 0.0
    valid_interval_count = 0.0

    patient_indices = []
    hazard_targets = []
    predicted_hazards = []
    target_risks = []
    predicted_risks = []

    with torch.no_grad():
        for batch in loader:
            features = batch["sequence_features"].to(
                device,
                non_blocking=True,
            )
            temporal_features = batch[
                "temporal_features"
            ].to(
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

            logits = model(
                features,
                temporal_features,
                sequence_mask,
        )
            loss = criterion(logits, targets, at_risk)

            hazards, cumulative_risk = (
                hazard_logits_to_cumulative_risk(logits)
            )

            batch_valid_count = float(
                at_risk.sum().item()
            )

            loss_sum += (
                float(loss.item()) * batch_valid_count
            )
            valid_interval_count += batch_valid_count

            patient_indices.append(
                batch["patient_index"].numpy()
            )
            hazard_targets.append(
                targets.cpu().numpy()
            )
            predicted_hazards.append(
                hazards.cpu().numpy()
            )
            target_risks.append(
                cumulative_targets(targets)
                .cpu()
                .numpy()
            )
            predicted_risks.append(
                cumulative_risk.cpu().numpy()
            )

    outputs = {
        "patient_indices": np.concatenate(
            patient_indices
        ),
        "hazard_targets": np.concatenate(
            hazard_targets
        ),
        "predicted_hazards": np.concatenate(
            predicted_hazards
        ),
        "target_risks": np.concatenate(target_risks),
        "predicted_risks": np.concatenate(
            predicted_risks
        ),
    }

    metrics = evaluate_cumulative_predictions(
        outputs["target_risks"],
        outputs["predicted_risks"],
    )

    validation_loss = (
        loss_sum / valid_interval_count
    )

    return validation_loss, metrics, outputs


def save_predictions(
    path: Path,
    outputs: dict[str, np.ndarray],
) -> None:
    table = pd.DataFrame(
        {
            "patient_index": outputs[
                "patient_indices"
            ]
        }
    )

    for index, year in enumerate(range(1, 6)):
        table[f"target_hazard_{year}yr"] = (
            outputs["hazard_targets"][:, index]
        )
        table[f"predicted_hazard_{year}yr"] = (
            outputs["predicted_hazards"][:, index]
        )
        table[f"target_risk_{year}yr"] = (
            outputs["target_risks"][:, index]
        )
        table[f"predicted_risk_{year}yr"] = (
            outputs["predicted_risks"][:, index]
        )

    table.to_csv(path, index=False)


def main() -> None:
    arguments = parse_arguments()

    if not torch.cuda.is_available():
        raise RuntimeError(
            "CUDA is unavailable. Run through the GPU job."
        )

    set_reproducible_seed(arguments.seed)

    device = torch.device("cuda")
    job_id = os.environ.get("SLURM_JOB_ID", "interactive")

    checkpoint_path = (
        WORKSPACE
        / "checkpoints"
        / f"{arguments.run_name}_best.pt"
    )
    history_path = (
        WORKSPACE
        / "outputs/metrics"
        / f"{arguments.run_name}_history.json"
    )
    prediction_path = (
        WORKSPACE
        / "outputs/predictions"
        / f"{arguments.run_name}_validation.csv"
    )
    summary_path = (
        WORKSPACE
        / "reports"
        / f"{arguments.run_name}_summary.json"
    )

    output_paths = [
        checkpoint_path,
        history_path,
        prediction_path,
        summary_path,
    ]

    for output_path in output_paths:
        if output_path.exists():
            raise FileExistsError(
                f"Output already exists: {output_path}"
            )

    with WEIGHT_CONFIG_PATH.open(
        "r",
        encoding="utf-8",
    ) as file:
        weight_configuration = json.load(file)

    positive_weights = torch.tensor(
        weight_configuration["weights"][
            arguments.weighting
        ],
        dtype=torch.float32,
    )

    train_dataset = V2DSpatialDataset(
        PROJECT_ROOT,
        WORKSPACE,
        "train",
    )
    validation_dataset = V2DSpatialDataset(
        PROJECT_ROOT,
        WORKSPACE,
        "validation",
    )

    loader_generator = torch.Generator()
    loader_generator.manual_seed(arguments.seed)

    train_loader = DataLoader(
        train_dataset,
        batch_size=BATCH_SIZE,
        shuffle=True,
        num_workers=0,
        pin_memory=True,
        generator=loader_generator,
    )

    validation_loader = DataLoader(
        validation_dataset,
        batch_size=BATCH_SIZE,
        shuffle=False,
        num_workers=0,
        pin_memory=True,
    )

    train_targets = torch.from_numpy(
        np.array(
            train_dataset.hazard_targets[
                train_dataset.patient_indices
            ],
            dtype=np.float32,
            copy=True,
        )
    )

    train_at_risk = torch.from_numpy(
        np.array(
            train_dataset.at_risk_masks[
                train_dataset.patient_indices
            ],
            dtype=np.float32,
            copy=True,
        )
    )

    empirical_rates = (
        calculate_empirical_hazard_rates(
            train_targets,
            train_at_risk,
        )
    )

    model = V2DSpatialMultiviewHazardLSTM()

    initial_biases = initialize_hazard_head_bias(
        model.output_head[-1],
        empirical_rates,
    )

    model = model.to(device)

    training_criterion = MaskedHazardBCELoss(
        positive_weights=positive_weights.to(device)
    ).to(device)

    validation_criterion = MaskedHazardBCELoss().to(
        device
    )

    optimizer = Adam(
        model.parameters(),
        lr=LEARNING_RATE,
        weight_decay=WEIGHT_DECAY,
    )

    history = []
    best_validation_loss = float("inf")
    best_epoch = 0
    epochs_without_improvement = 0
    start_time = time.time()

    for epoch in range(1, MAX_EPOCHS + 1):
        training_loss = run_training_epoch(
            model,
            train_loader,
            training_criterion,
            optimizer,
            device,
        )

        (
            validation_loss,
            validation_metrics,
            _,
        ) = run_validation(
            model,
            validation_loader,
            validation_criterion,
            device,
        )

        epoch_record = {
            "epoch": epoch,
            "training_weighted_loss": training_loss,
            "validation_unweighted_nll": (
                validation_loss
            ),
            "validation_mean_auroc": (
                validation_metrics["mean_auroc"]
            ),
            "validation_mean_auprc": (
                validation_metrics["mean_auprc"]
            ),
            "validation_mean_brier_score": (
                validation_metrics[
                    "mean_brier_score"
                ]
            ),
        }

        history.append(epoch_record)
        write_json(history_path, history)

        print(
            f"Epoch {epoch:02d} "
            f"train={training_loss:.6f} "
            f"val_nll={validation_loss:.6f} "
            f"AUROC={validation_metrics['mean_auroc']:.4f} "
            f"AUPRC={validation_metrics['mean_auprc']:.4f} "
            f"Brier={validation_metrics['mean_brier_score']:.6f}"
        )

        improved = (
            validation_loss
            < best_validation_loss
            - MINIMUM_IMPROVEMENT
        )

        if improved:
            best_validation_loss = validation_loss
            best_epoch = epoch
            epochs_without_improvement = 0

            torch.save(
                {
                    "model_name": "V2DSpatialMultiviewHazardLSTM",
                    "model_state_dict": model.state_dict(),
                    "epoch": epoch,
                    "validation_unweighted_nll": (
                        validation_loss
                    ),
                    "validation_metrics": (
                        validation_metrics
                    ),
                    "weighting": arguments.weighting,
                    "positive_weights": (
                        positive_weights.tolist()
                    ),
                    "empirical_hazard_rates": (
                        empirical_rates.tolist()
                    ),
                    "initial_output_biases": (
                        initial_biases.tolist()
                    ),
                    "random_seed": arguments.seed,
                    "model_configuration": {
                        "feature_channels": 2048,
                        "spatial_size": [8, 8],
                        "spatial_embedding_size": 128,
                        "number_of_views": 4,
                        "temporal_input_size": 3,
                        "temporal_embedding_size": 16,
                        "fusion_size": 256,
                        "hidden_size": 128,
                        "output_size": 5,
                        "dropout": 0.3,
                    },
                },
                checkpoint_path,
            )
        else:
            epochs_without_improvement += 1

        if epochs_without_improvement >= PATIENCE:
            print(
                f"Early stopping after epoch {epoch}"
            )
            break

    checkpoint = torch.load(
        checkpoint_path,
        map_location=device,
    )

    model.load_state_dict(
        checkpoint["model_state_dict"]
    )

    (
        final_validation_loss,
        final_validation_metrics,
        validation_outputs,
    ) = run_validation(
        model,
        validation_loader,
        validation_criterion,
        device,
    )

    save_predictions(
        prediction_path,
        validation_outputs,
    )

    elapsed_seconds = time.time() - start_time

    summary = {
        "run_name": arguments.run_name,
        "slurm_job_id": job_id,
        "model": "V2DSpatialMultiviewHazardLSTM",
        "status": "completed",
        "weighting": arguments.weighting,
        "positive_weights": positive_weights.tolist(),
        "random_seed": arguments.seed,
        "parameter_count": sum(
            parameter.numel()
            for parameter in model.parameters()
        ),
        "best_epoch": best_epoch,
        "epochs_completed": len(history),
        "selection_criterion": (
            "minimum validation unweighted "
            "masked negative log-likelihood"
        ),
        "best_validation_unweighted_nll": (
            final_validation_loss
        ),
        "validation_metrics": (
            final_validation_metrics
        ),
        "empirical_hazard_rates": (
            empirical_rates.tolist()
        ),
        "initial_output_biases": (
            initial_biases.tolist()
        ),
        "training_seconds": elapsed_seconds,
        "test_set_evaluated": False,
        "device": torch.cuda.get_device_name(device),
        "torch_version": torch.__version__,
        "cuda_version": torch.version.cuda,
        "outputs": {
            "checkpoint": str(checkpoint_path),
            "history": str(history_path),
            "validation_predictions": (
                str(prediction_path)
            ),
        },
    }

    write_json(summary_path, summary)

    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
