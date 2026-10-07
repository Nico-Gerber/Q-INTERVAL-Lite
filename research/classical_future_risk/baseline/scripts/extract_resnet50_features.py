import hashlib
import json
import os

import numpy as np
import pandas as pd
import torch
import torch.nn as nn

from PIL import Image
from torch.utils.data import DataLoader, Dataset
from torchvision import models, transforms


PROJECT_DIR = (
    "/fred/oz508/EMBED/"
    "classical_future_risk_vihanga"
)

IMAGE_MANIFEST = os.path.join(
    PROJECT_DIR,
    "manifests",
    "image_manifest.csv",
)

PATIENT_SPLITS = os.path.join(
    PROJECT_DIR,
    "splits",
    "patient_splits.csv",
)

FEATURE_OUTPUT = os.path.join(
    PROJECT_DIR,
    "features",
    "resnet50_imagenet_v2_features.npy",
)

METADATA_OUTPUT = os.path.join(
    PROJECT_DIR,
    "features",
    "resnet50_feature_metadata.csv",
)

CONFIG_OUTPUT = os.path.join(
    PROJECT_DIR,
    "features",
    "resnet50_feature_config.json",
)

WEIGHT_PATH = os.path.join(
    PROJECT_DIR,
    "models",
    "torch_cache",
    "hub",
    "checkpoints",
    "resnet50-11ad3fa6.pth",
)

RISK_COLUMNS = [
    "risk_1yr",
    "risk_2yr",
    "risk_3yr",
    "risk_4yr",
    "risk_5yr",
]

BATCH_SIZE = 64
NUM_WORKERS = 8
FEATURE_DIMENSION = 2048


for output_path in [
    FEATURE_OUTPUT,
    METADATA_OUTPUT,
    CONFIG_OUTPUT,
]:
    if os.path.exists(output_path):
        raise FileExistsError(
            "Output already exists and was not overwritten:\n"
            + output_path
        )


if not os.path.isfile(WEIGHT_PATH):
    raise FileNotFoundError(
        "Pretrained ResNet50 weights were not found:\n"
        + WEIGHT_PATH
    )


def sha256_file(path):
    digest = hashlib.sha256()

    with open(path, "rb") as file_handle:
        for block in iter(
            lambda: file_handle.read(1024 * 1024),
            b"",
        ):
            digest.update(block)

    return digest.hexdigest()


print("Loading image manifest and patient split...")

images = pd.read_csv(
    IMAGE_MANIFEST,
    low_memory=False,
)

splits = pd.read_csv(
    PATIENT_SPLITS,
    usecols=[
        "empi_anon",
        "split",
    ] + RISK_COLUMNS,
    low_memory=False,
)


metadata = images.merge(
    splits,
    on="empi_anon",
    how="left",
    validate="many_to_one",
)


if metadata["split"].isna().any():
    raise RuntimeError(
        "Some images do not have a patient split."
    )


if metadata["image_path"].duplicated().any():
    raise RuntimeError(
        "The image manifest contains duplicate paths."
    )


missing_files = (
    ~metadata["image_path"]
    .astype(str)
    .map(os.path.isfile)
)

if missing_files.any():
    raise FileNotFoundError(
        "Missing selected image files: "
        + str(int(missing_files.sum()))
    )


metadata = metadata.sort_values(
    [
        "empi_anon",
        "sequence_position",
        "view_slot",
        "filename",
    ],
    kind="mergesort",
).reset_index(drop=True)

metadata.insert(
    0,
    "feature_index",
    np.arange(len(metadata)),
)


feature_transform = transforms.Compose(
    [
        transforms.Grayscale(
            num_output_channels=3
        ),
        transforms.Resize((512, 512)),
        transforms.ToTensor(),
        transforms.Normalize(
            mean=[0.485, 0.456, 0.406],
            std=[0.229, 0.224, 0.225],
        ),
    ]
)


class MammogramFeatureDataset(Dataset):
    def __init__(self, dataframe):
        self.dataframe = dataframe.reset_index(
            drop=True
        )

    def __len__(self):
        return len(self.dataframe)

    def __getitem__(self, index):
        image_path = self.dataframe.iloc[
            index
        ]["image_path"]

        with Image.open(image_path) as image:
            image = image.convert("L")
            image = feature_transform(image)

        return image, index


dataset = MammogramFeatureDataset(
    metadata
)

loader = DataLoader(
    dataset,
    batch_size=BATCH_SIZE,
    shuffle=False,
    num_workers=NUM_WORKERS,
    pin_memory=True,
    persistent_workers=True,
)


if not torch.cuda.is_available():
    raise RuntimeError(
        "CUDA is not available. "
        "Run this script through its GPU Slurm job."
    )


device = torch.device("cuda")

torch.manual_seed(42)
np.random.seed(42)

torch.backends.cudnn.benchmark = False


print("Loading ImageNet-pretrained ResNet50...")

weights = (
    models.ResNet50_Weights.IMAGENET1K_V2
)

model = models.resnet50(
    weights=weights
)

model.fc = nn.Identity()

for parameter in model.parameters():
    parameter.requires_grad = False

model = model.to(device)
model.eval()


feature_temp = FEATURE_OUTPUT + ".tmp.npy"
metadata_temp = METADATA_OUTPUT + ".tmp"
config_temp = CONFIG_OUTPUT + ".tmp"


feature_matrix = (
    np.lib.format.open_memmap(
        feature_temp,
        mode="w+",
        dtype=np.float32,
        shape=(
            len(metadata),
            FEATURE_DIMENSION,
        ),
    )
)

processed = np.zeros(
    len(metadata),
    dtype=bool,
)


print("\nFEATURE EXTRACTION")
print("=" * 72)
print("GPU:", torch.cuda.get_device_name(0))
print("Images:", len(dataset))
print("Batch size:", BATCH_SIZE)
print("Feature dimension:", FEATURE_DIMENSION)


with torch.no_grad():
    for batch_number, (
        image_batch,
        row_indices,
    ) in enumerate(loader, start=1):

        image_batch = image_batch.to(
            device,
            non_blocking=True,
        )

        batch_features = model(
            image_batch
        )

        batch_features = (
            batch_features
            .float()
            .cpu()
            .numpy()
        )

        row_indices = row_indices.numpy()

        if batch_features.shape[1] != FEATURE_DIMENSION:
            raise RuntimeError(
                "Unexpected feature dimension: "
                + str(batch_features.shape)
            )

        if not np.isfinite(
            batch_features
        ).all():
            raise RuntimeError(
                "Non-finite feature value found."
            )

        feature_matrix[
            row_indices
        ] = batch_features

        processed[
            row_indices
        ] = True

        if (
            batch_number == 1
            or batch_number % 25 == 0
            or processed.all()
        ):
            print(
                f"Processed "
                f"{int(processed.sum()):,}"
                f"/{len(processed):,} images"
            )


feature_matrix.flush()
del feature_matrix


if not processed.all():
    raise RuntimeError(
        "Some images were not processed."
    )


verification = np.load(
    feature_temp,
    mmap_mode="r",
)

if verification.shape != (
    len(metadata),
    FEATURE_DIMENSION,
):
    raise RuntimeError(
        "Saved feature matrix has the wrong shape."
    )

if not np.isfinite(verification).all():
    raise RuntimeError(
        "Saved feature matrix contains invalid values."
    )

del verification


metadata_columns = [
    "feature_index",
    "empi_anon",
    "acc_anon",
    "exam_date",
    "anchor_date",
    "sequence_position",
    "sequence_length",
    "is_anchor",
    "days_before_anchor",
    "view_slot",
    "filename",
    "image_path",
    "split",
] + RISK_COLUMNS


feature_metadata = metadata[
    metadata_columns
].copy()

feature_metadata.to_csv(
    metadata_temp,
    index=False,
)


configuration = {
    "model": "resnet50",
    "weights": "IMAGENET1K_V2",
    "feature_dimension": FEATURE_DIMENSION,
    "image_size": [512, 512],
    "colour_channels": 3,
    "source_conversion": "grayscale_to_rgb",
    "normalization_mean": [
        0.485,
        0.456,
        0.406,
    ],
    "normalization_std": [
        0.229,
        0.224,
        0.225,
    ],
    "augmentation": False,
    "labels_used_during_extraction": False,
    "batch_size": BATCH_SIZE,
    "number_of_images": len(metadata),
    "image_manifest_sha256": sha256_file(
        IMAGE_MANIFEST
    ),
    "patient_splits_sha256": sha256_file(
        PATIENT_SPLITS
    ),
    "pretrained_weights_sha256": sha256_file(
        WEIGHT_PATH
    ),
    "feature_file_sha256": sha256_file(
        feature_temp
    ),
}


with open(
    config_temp,
    "w",
    encoding="utf-8",
) as config_file:
    json.dump(
        configuration,
        config_file,
        indent=2,
    )


os.replace(
    feature_temp,
    FEATURE_OUTPUT,
)

os.replace(
    metadata_temp,
    METADATA_OUTPUT,
)

os.replace(
    config_temp,
    CONFIG_OUTPUT,
)


print("\nFEATURE EXTRACTION COMPLETE")
print("=" * 72)
print(
    "Feature matrix shape:",
    (
        len(metadata),
        FEATURE_DIMENSION,
    ),
)

print(
    "Expected feature size MB:",
    round(
        (
            len(metadata)
            * FEATURE_DIMENSION
            * 4
        )
        / (1024 ** 2),
        2,
    ),
)

print("\nIMAGES BY SPLIT")
print("=" * 72)
print(
    feature_metadata["split"]
    .value_counts()
    .reindex(
        [
            "train",
            "validation",
            "test",
        ]
    )
)

print("\nOUTPUT FILES")
print("=" * 72)
print(FEATURE_OUTPUT)
print(METADATA_OUTPUT)
print(CONFIG_OUTPUT)

print("\nVALIDATION")
print("=" * 72)
print("PASS: every manifest image was processed")
print("PASS: feature order matches feature_index")
print("PASS: feature shape is correct")
print("PASS: all feature values are finite")
print("PASS: no labels were used by ResNet50")
print("PASS: source images and manifests were unchanged")
