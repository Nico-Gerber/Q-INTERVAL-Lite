import json
import os
import random

import numpy as np
import pandas as pd
import torch
import torch.nn as nn

from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    balanced_accuracy_score,
    brier_score_loss,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from torch.utils.data import DataLoader, TensorDataset


PROJECT_DIR = (
    "/fred/oz508/EMBED/"
    "classical_future_risk_vihanga"
)

SEQUENCE_PATH = os.path.join(
    PROJECT_DIR,
    "features",
    "patient_sequences_5x6149.npy",
)

LABEL_PATH = os.path.join(
    PROJECT_DIR,
    "features",
    "patient_labels_1to5yr.npy",
)

MASK_PATH = os.path.join(
    PROJECT_DIR,
    "features",
    "patient_sequence_masks.npy",
)

METADATA_PATH = os.path.join(
    PROJECT_DIR,
    "features",
    "patient_sequence_metadata.csv",
)

RUN_ID = os.environ.get(
    "SLURM_JOB_ID",
    "manual",
)

MODEL_PATH = os.path.join(
    PROJECT_DIR,
    "models",
    f"lstm_baseline_{RUN_ID}.pt",
)

HISTORY_PATH = os.path.join(
    PROJECT_DIR,
    "reports",
    f"lstm_training_history_{RUN_ID}.csv",
)

METRICS_PATH = os.path.join(
    PROJECT_DIR,
    "reports",
    f"lstm_metrics_{RUN_ID}.csv",
)

SUMMARY_PATH = os.path.join(
    PROJECT_DIR,
    "reports",
    f"lstm_summary_{RUN_ID}.json",
)

VALIDATION_PREDICTIONS_PATH = os.path.join(
    PROJECT_DIR,
    "reports",
    f"lstm_validation_predictions_{RUN_ID}.csv",
)

TEST_PREDICTIONS_PATH = os.path.join(
    PROJECT_DIR,
    "reports",
    f"lstm_test_predictions_{RUN_ID}.csv",
)


RISK_COLUMNS = [
    "risk_1yr",
    "risk_2yr",
    "risk_3yr",
    "risk_4yr",
    "risk_5yr",
]

HORIZON_NAMES = [
    "1yr",
    "2yr",
    "3yr",
    "4yr",
    "5yr",
]

RANDOM_SEED = 42
INPUT_SIZE = 6149
COMPRESSED_SIZE = 256
HIDDEN_SIZE = 128
OUTPUT_SIZE = 5
DROPOUT = 0.3
BATCH_SIZE = 64
MAX_EPOCHS = 50
EARLY_STOPPING_PATIENCE = 10
LEARNING_RATE = 1e-4
WEIGHT_DECAY = 1e-4
CLASSIFICATION_THRESHOLD = 0.5


for output_path in [
    MODEL_PATH,
    HISTORY_PATH,
    METRICS_PATH,
    SUMMARY_PATH,
    VALIDATION_PREDICTIONS_PATH,
    TEST_PREDICTIONS_PATH,
]:
    if os.path.exists(output_path):
        raise FileExistsError(
            "Output already exists and was not overwritten:\n"
            + output_path
        )


def set_reproducible_seed(seed):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)

    torch.backends.cudnn.benchmark = False
    torch.backends.cudnn.deterministic = True


set_reproducible_seed(
    RANDOM_SEED
)


print("Loading LSTM sequence data...")

sequences = np.load(
    SEQUENCE_PATH
).astype(np.float32)

labels = np.load(
    LABEL_PATH
).astype(np.float32)

masks = np.load(
    MASK_PATH
).astype(np.float32)

metadata = pd.read_csv(
    METADATA_PATH,
    low_memory=False,
)


expected_sequence_shape = (
    len(metadata),
    5,
    INPUT_SIZE,
)

if sequences.shape != expected_sequence_shape:
    raise RuntimeError(
        "Unexpected sequence shape: "
        + str(sequences.shape)
    )

if labels.shape != (
    len(metadata),
    OUTPUT_SIZE,
):
    raise RuntimeError(
        "Unexpected label shape."
    )

if masks.shape != (
    len(metadata),
    5,
):
    raise RuntimeError(
        "Unexpected mask shape."
    )

if not np.array_equal(
    metadata["patient_index"].to_numpy(),
    np.arange(len(metadata)),
):
    raise RuntimeError(
        "patient_index does not match array order."
    )

if np.any(
    np.diff(labels, axis=1) < 0
):
    raise RuntimeError(
        "Labels are not cumulative."
    )


split_indices = {}

for split_name in [
    "train",
    "validation",
    "test",
]:
    split_indices[split_name] = np.where(
        metadata["split"].eq(
            split_name
        ).to_numpy()
    )[0]


if any(
    len(indices) == 0
    for indices in split_indices.values()
):
    raise RuntimeError(
        "One or more dataset splits are empty."
    )


def create_dataset(indices):
    return TensorDataset(
        torch.from_numpy(
            sequences[indices]
        ),
        torch.from_numpy(
            labels[indices]
        ),
        torch.from_numpy(
            masks[indices]
        ),
    )


training_dataset = create_dataset(
    split_indices["train"]
)

validation_dataset = create_dataset(
    split_indices["validation"]
)

test_dataset = create_dataset(
    split_indices["test"]
)


loader_generator = torch.Generator()
loader_generator.manual_seed(
    RANDOM_SEED
)


training_loader = DataLoader(
    training_dataset,
    batch_size=BATCH_SIZE,
    shuffle=True,
    generator=loader_generator,
)

validation_loader = DataLoader(
    validation_dataset,
    batch_size=BATCH_SIZE,
    shuffle=False,
)

test_loader = DataLoader(
    test_dataset,
    batch_size=BATCH_SIZE,
    shuffle=False,
)


training_labels = labels[
    split_indices["train"]
]

positive_counts = training_labels.sum(
    axis=0
)

negative_counts = (
    len(training_labels)
    - positive_counts
)

if np.any(positive_counts == 0):
    raise RuntimeError(
        "A training horizon has no positive patients."
    )

positive_weights = (
    negative_counts
    / positive_counts
).astype(np.float32)


class FutureRiskLSTM(nn.Module):
    def __init__(self):
        super().__init__()

        self.feature_compressor = nn.Sequential(
            nn.Linear(
                INPUT_SIZE,
                COMPRESSED_SIZE,
            ),
            nn.ReLU(),
            nn.Dropout(DROPOUT),
        )

        self.lstm = nn.LSTM(
            input_size=COMPRESSED_SIZE,
            hidden_size=HIDDEN_SIZE,
            num_layers=1,
            batch_first=True,
        )

        self.output_head = nn.Sequential(
            nn.Linear(
                HIDDEN_SIZE,
                64,
            ),
            nn.ReLU(),
            nn.Dropout(DROPOUT),
            nn.Linear(
                64,
                OUTPUT_SIZE,
            ),
        )

    def forward(self, inputs, sequence_mask):
        compressed = self.feature_compressor(
            inputs
        )

        lstm_output, _ = self.lstm(
            compressed
        )

        lengths = sequence_mask.sum(
            dim=1
        ).long()

        last_valid_indices = lengths - 1

        batch_indices = torch.arange(
            inputs.size(0),
            device=inputs.device,
        )

        last_valid_output = lstm_output[
            batch_indices,
            last_valid_indices,
        ]

        return self.output_head(
            last_valid_output
        )


if not torch.cuda.is_available():
    raise RuntimeError(
        "CUDA is unavailable. "
        "Run through the GPU Slurm job."
    )


device = torch.device("cuda")

model = FutureRiskLSTM().to(
    device
)

criterion = nn.BCEWithLogitsLoss(
    pos_weight=torch.tensor(
        positive_weights,
        dtype=torch.float32,
        device=device,
    )
)

optimizer = torch.optim.Adam(
    model.parameters(),
    lr=LEARNING_RATE,
    weight_decay=WEIGHT_DECAY,
)


def run_training_epoch():
    model.train()

    total_loss = 0.0
    total_patients = 0

    for (
        sequence_batch,
        label_batch,
        mask_batch,
    ) in training_loader:

        sequence_batch = sequence_batch.to(
            device,
            non_blocking=True,
        )

        label_batch = label_batch.to(
            device,
            non_blocking=True,
        )

        mask_batch = mask_batch.to(
            device,
            non_blocking=True,
        )

        optimizer.zero_grad()

        logits = model(
            sequence_batch,
            mask_batch,
        )

        loss = criterion(
            logits,
            label_batch,
        )

        loss.backward()

        torch.nn.utils.clip_grad_norm_(
            model.parameters(),
            max_norm=5.0,
        )

        optimizer.step()

        batch_size = sequence_batch.size(0)

        total_loss += (
            loss.item()
            * batch_size
        )

        total_patients += batch_size

    return total_loss / total_patients


def evaluate(loader):
    model.eval()

    total_loss = 0.0
    total_patients = 0

    probability_batches = []
    label_batches = []

    with torch.no_grad():
        for (
            sequence_batch,
            label_batch,
            mask_batch,
        ) in loader:

            sequence_batch = sequence_batch.to(
                device,
                non_blocking=True,
            )

            label_batch = label_batch.to(
                device,
                non_blocking=True,
            )

            mask_batch = mask_batch.to(
                device,
                non_blocking=True,
            )

            logits = model(
                sequence_batch,
                mask_batch,
            )

            loss = criterion(
                logits,
                label_batch,
            )

            probabilities = torch.sigmoid(
                logits
            )

            batch_size = sequence_batch.size(0)

            total_loss += (
                loss.item()
                * batch_size
            )

            total_patients += batch_size

            probability_batches.append(
                probabilities.cpu().numpy()
            )

            label_batches.append(
                label_batch.cpu().numpy()
            )

    return (
        total_loss / total_patients,
        np.vstack(probability_batches),
        np.vstack(label_batches),
    )


print("\nTRAINING CONFIGURATION")
print("=" * 76)
print("GPU:", torch.cuda.get_device_name(0))
print("Training patients:", len(training_dataset))
print("Validation patients:", len(validation_dataset))
print("Test patients:", len(test_dataset))
print("Batch size:", BATCH_SIZE)
print("Maximum epochs:", MAX_EPOCHS)
print("Early-stopping patience:", EARLY_STOPPING_PATIENCE)

print("\nTRAINING POSITIVE COUNTS")
print("=" * 76)

for horizon, positive, negative, weight in zip(
    HORIZON_NAMES,
    positive_counts,
    negative_counts,
    positive_weights,
):
    print(
        f"{horizon}: "
        f"positive={int(positive)}, "
        f"negative={int(negative)}, "
        f"pos_weight={weight:.4f}"
    )


history_rows = []

best_validation_loss = float("inf")
best_epoch = 0
epochs_without_improvement = 0

temporary_model_path = (
    MODEL_PATH + ".tmp"
)


print("\nTRAINING")
print("=" * 76)


for epoch in range(
    1,
    MAX_EPOCHS + 1,
):
    training_loss = (
        run_training_epoch()
    )

    (
        validation_loss,
        validation_probabilities,
        validation_labels,
    ) = evaluate(
        validation_loader
    )

    history_rows.append(
        {
            "epoch": epoch,
            "training_loss": training_loss,
            "validation_loss": validation_loss,
        }
    )

    improved = (
        validation_loss
        < best_validation_loss - 1e-6
    )

    if improved:
        best_validation_loss = (
            validation_loss
        )

        best_epoch = epoch
        epochs_without_improvement = 0

        checkpoint = {
            "model_state_dict": model.state_dict(),
            "input_size": INPUT_SIZE,
            "compressed_size": COMPRESSED_SIZE,
            "hidden_size": HIDDEN_SIZE,
            "output_size": OUTPUT_SIZE,
            "dropout": DROPOUT,
            "risk_columns": RISK_COLUMNS,
            "positive_weights": (
                positive_weights.tolist()
            ),
            "best_epoch": best_epoch,
            "best_validation_loss": (
                best_validation_loss
            ),
            "random_seed": RANDOM_SEED,
        }

        torch.save(
            checkpoint,
            temporary_model_path,
        )

        os.replace(
            temporary_model_path,
            MODEL_PATH,
        )

    else:
        epochs_without_improvement += 1

    print(
        f"Epoch {epoch:02d}/{MAX_EPOCHS} | "
        f"train={training_loss:.6f} | "
        f"validation={validation_loss:.6f} | "
        f"best_epoch={best_epoch}"
    )

    if (
        epochs_without_improvement
        >= EARLY_STOPPING_PATIENCE
    ):
        print(
            "Early stopping triggered."
        )
        break


history = pd.DataFrame(
    history_rows
)

history.to_csv(
    HISTORY_PATH,
    index=False,
)


# Load the checkpoint chosen using validation data.
checkpoint = torch.load(
    MODEL_PATH,
    map_location=device,
)

model.load_state_dict(
    checkpoint["model_state_dict"]
)


# Test data is evaluated only after model selection.
(
    final_validation_loss,
    validation_probabilities,
    validation_true_labels,
) = evaluate(
    validation_loader
)

(
    final_test_loss,
    test_probabilities,
    test_true_labels,
) = evaluate(
    test_loader
)


def calculate_metrics(
    dataset_name,
    true_labels,
    probabilities,
):
    predictions = (
        probabilities
        >= CLASSIFICATION_THRESHOLD
    ).astype(int)

    rows = []

    for horizon_index, horizon_name in enumerate(
        HORIZON_NAMES
    ):
        y_true = true_labels[
            :,
            horizon_index,
        ].astype(int)

        y_probability = probabilities[
            :,
            horizon_index,
        ]

        y_prediction = predictions[
            :,
            horizon_index,
        ]

        tn, fp, fn, tp = confusion_matrix(
            y_true,
            y_prediction,
            labels=[0, 1],
        ).ravel()

        specificity = (
            tn / (tn + fp)
            if (tn + fp) > 0
            else np.nan
        )

        rows.append(
            {
                "dataset": dataset_name,
                "horizon": horizon_name,
                "patients": len(y_true),
                "positives": int(y_true.sum()),
                "prevalence": float(y_true.mean()),
                "threshold": CLASSIFICATION_THRESHOLD,
                "accuracy": accuracy_score(
                    y_true,
                    y_prediction,
                ),
                "balanced_accuracy": balanced_accuracy_score(
                    y_true,
                    y_prediction,
                ),
                "precision": precision_score(
                    y_true,
                    y_prediction,
                    zero_division=0,
                ),
                "recall_sensitivity": recall_score(
                    y_true,
                    y_prediction,
                    zero_division=0,
                ),
                "specificity": specificity,
                "f1": f1_score(
                    y_true,
                    y_prediction,
                    zero_division=0,
                ),
                "auroc": roc_auc_score(
                    y_true,
                    y_probability,
                ),
                "auprc": average_precision_score(
                    y_true,
                    y_probability,
                ),
                "brier_score": brier_score_loss(
                    y_true,
                    y_probability,
                ),
                "true_negative": int(tn),
                "false_positive": int(fp),
                "false_negative": int(fn),
                "true_positive": int(tp),
            }
        )

    return pd.DataFrame(rows)


validation_metrics = calculate_metrics(
    "validation",
    validation_true_labels,
    validation_probabilities,
)

test_metrics = calculate_metrics(
    "test",
    test_true_labels,
    test_probabilities,
)

metrics = pd.concat(
    [
        validation_metrics,
        test_metrics,
    ],
    ignore_index=True,
)

metrics.to_csv(
    METRICS_PATH,
    index=False,
)


def create_prediction_file(
    indices,
    true_labels,
    probabilities,
    output_path,
):
    prediction_metadata = metadata.iloc[
        indices
    ][
        [
            "patient_index",
            "empi_anon",
            "split",
            "anchor_acc_anon",
            "anchor_date",
            "sequence_length",
        ]
    ].reset_index(drop=True)

    for horizon_index, horizon_name in enumerate(
        HORIZON_NAMES
    ):
        prediction_metadata[
            f"true_{horizon_name}"
        ] = true_labels[
            :,
            horizon_index,
        ].astype(int)

        prediction_metadata[
            f"probability_{horizon_name}"
        ] = probabilities[
            :,
            horizon_index,
        ]

        prediction_metadata[
            f"prediction_{horizon_name}"
        ] = (
            probabilities[
                :,
                horizon_index,
            ]
            >= CLASSIFICATION_THRESHOLD
        ).astype(int)

    prediction_metadata.to_csv(
        output_path,
        index=False,
    )


create_prediction_file(
    split_indices["validation"],
    validation_true_labels,
    validation_probabilities,
    VALIDATION_PREDICTIONS_PATH,
)

create_prediction_file(
    split_indices["test"],
    test_true_labels,
    test_probabilities,
    TEST_PREDICTIONS_PATH,
)


validation_violation_rate = float(
    np.mean(
        np.any(
            np.diff(
                validation_probabilities,
                axis=1,
            ) < 0,
            axis=1,
        )
    )
)

test_violation_rate = float(
    np.mean(
        np.any(
            np.diff(
                test_probabilities,
                axis=1,
            ) < 0,
            axis=1,
        )
    )
)


summary = {
    "run_id": RUN_ID,
    "random_seed": RANDOM_SEED,
    "best_epoch": best_epoch,
    "best_validation_loss": best_validation_loss,
    "final_validation_loss": final_validation_loss,
    "final_test_loss": final_test_loss,
    "training_patients": len(training_dataset),
    "validation_patients": len(validation_dataset),
    "test_patients": len(test_dataset),
    "training_positive_counts": (
        positive_counts.astype(int).tolist()
    ),
    "positive_weights": (
        positive_weights.tolist()
    ),
    "validation_probability_monotonic_violation_rate": (
        validation_violation_rate
    ),
    "test_probability_monotonic_violation_rate": (
        test_violation_rate
    ),
    "test_used_for_model_selection": False,
    "classification_threshold": (
        CLASSIFICATION_THRESHOLD
    ),
}


with open(
    SUMMARY_PATH,
    "w",
    encoding="utf-8",
) as summary_file:
    json.dump(
        summary,
        summary_file,
        indent=2,
    )


print("\nTRAINING COMPLETE")
print("=" * 76)
print("Best epoch:", best_epoch)
print(
    "Best validation loss:",
    round(best_validation_loss, 6),
)
print(
    "Final test loss:",
    round(final_test_loss, 6),
)

print("\nTEST METRICS")
print("=" * 76)
print(
    test_metrics[
        [
            "horizon",
            "positives",
            "auroc",
            "auprc",
            "precision",
            "recall_sensitivity",
            "specificity",
            "f1",
            "brier_score",
        ]
    ].to_string(index=False)
)

print("\nMONOTONICITY CHECK")
print("=" * 76)
print(
    "Validation violation rate:",
    validation_violation_rate,
)
print(
    "Test violation rate:",
    test_violation_rate,
)

print("\nOUTPUT FILES")
print("=" * 76)
print(MODEL_PATH)
print(HISTORY_PATH)
print(METRICS_PATH)
print(SUMMARY_PATH)
print(VALIDATION_PREDICTIONS_PATH)
print(TEST_PREDICTIONS_PATH)

print("\nVALIDATION")
print("=" * 76)
print("PASS: fixed patient-level split used")
print("PASS: weighted loss calculated from training patients")
print("PASS: validation set used for model selection")
print("PASS: test set was not used for model selection")
print("PASS: best validation checkpoint restored")
print("PASS: patient-level predictions saved")
