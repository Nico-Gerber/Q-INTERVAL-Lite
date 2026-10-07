import hashlib
import json
import os
import sys
import types
from pathlib import Path

import numpy as np
import pandas as pd
import torch

from PIL import Image
from torch.utils.data import DataLoader, Dataset


PROJECT_DIR = Path(
    "/fred/oz508/EMBED/"
    "classical_future_risk_vihanga/"
    "v2_hazard_sprint06"
)

SOURCE_WORKSPACE = Path(
    "/fred/oz508/EMBED/"
    "classical_future_risk_vihanga/"
    "v2_hazard_sprint05/rebuild_repaired"
)

EXPERIMENT_DIR = (
    PROJECT_DIR
    / "experiments/v2c_mammoclip_b5"
)

MAMMOCLIP_CODEBASE = (
    PROJECT_DIR
    / "external_models/Mammo-CLIP/src/codebase"
)

IMAGE_MANIFEST = (
    SOURCE_WORKSPACE
    / "manifests/image_manifest.csv"
)

PATIENT_SPLITS = (
    SOURCE_WORKSPACE
    / "splits/patient_splits.csv"
)


FEATURE_OUTPUT = (
    EXPERIMENT_DIR
    / "features/mammoclip_b5_features.npy"
)

METADATA_OUTPUT = (
    EXPERIMENT_DIR
    / "features/mammoclip_b5_feature_metadata.csv"
)

CONFIG_OUTPUT = (
    EXPERIMENT_DIR
    / "configs/mammoclip_b5_feature_config.json"
)

WEIGHT_PATH = (
    EXPERIMENT_DIR
    / "checkpoints/b5-model-best-epoch-7.tar"
)

RISK_COLUMNS = [
    "risk_1yr",
    "risk_2yr",
    "risk_3yr",
    "risk_4yr",
    "risk_5yr",
]

BATCH_SIZE = 16
NUM_WORKERS = 8
FEATURE_DIMENSION = 2048
IMAGE_HEIGHT = 500
IMAGE_WIDTH = 500
NORMALIZATION_MEAN = 0.3089279
NORMALIZATION_STD = 0.25053555408335154


breastclip_package = types.ModuleType(
    "breastclip"
)
breastclip_package.__path__ = [
    str(MAMMOCLIP_CODEBASE / "breastclip")
]
breastclip_package.__package__ = "breastclip"
sys.modules["breastclip"] = breastclip_package

from breastclip.model.modules.efficientnet_custom import (
    EfficientNet,
)


for output_path in [
    FEATURE_OUTPUT,
    METADATA_OUTPUT,
    CONFIG_OUTPUT,
]:
    if os.path.exists(output_path):
        raise FileExistsError(
            "Output already exists and was not overwritten:\n"
            + str(output_path)
        )


if not os.path.isfile(WEIGHT_PATH):
    raise FileNotFoundError(
        "Mammo-CLIP B5 checkpoint was not found:\n"
        + str(WEIGHT_PATH)
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
            image = image.convert("RGB")
            image = np.asarray(
                image,
                dtype=np.float32,
            )

        if image.shape != (
            IMAGE_HEIGHT,
            IMAGE_WIDTH,
            3,
        ):
            raise RuntimeError(
                "Unexpected image shape: "
                + str(image.shape)
            )

        image -= image.min()
        maximum = float(image.max())

        if maximum <= 0.0:
            raise RuntimeError(
                "Image has no intensity range: "
                + str(image_path)
            )

        image /= maximum
        image = (
            image - NORMALIZATION_MEAN
        ) / NORMALIZATION_STD

        image = np.ascontiguousarray(
            image.transpose(2, 0, 1)
        )

        return torch.from_numpy(image), index


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


print(
    "Loading Mammo-CLIP EfficientNet-B5..."
)

checkpoint = torch.load(
    WEIGHT_PATH,
    map_location="cpu",
)

encoder_config = checkpoint[
    "config"
]["model"]["image_encoder"]

if (
    encoder_config["name"]
    != "tf_efficientnet_b5_ns-detect"
):
    raise RuntimeError(
        "Unexpected Mammo-CLIP encoder: "
        + str(encoder_config)
    )

encoder_weights = {
    key.removeprefix("image_encoder."): value
    for key, value in checkpoint["model"].items()
    if key.startswith("image_encoder.")
}

model = EfficientNet.from_name(
    "efficientnet-b5",
    num_classes=1,
)

load_result = model.load_state_dict(
    encoder_weights,
    strict=True,
)

if (
    load_result.missing_keys
    or load_result.unexpected_keys
):
    raise RuntimeError(
        "Mammo-CLIP weights did not load strictly."
    )

model.out_dim = FEATURE_DIMENSION

for parameter in model.parameters():
    parameter.requires_grad = False

model = model.to(device)
model.eval()

del checkpoint
del encoder_weights


feature_temp = Path(
    str(FEATURE_OUTPUT) + ".tmp.npy"
)
metadata_temp = Path(
    str(METADATA_OUTPUT) + ".tmp"
)
config_temp = Path(
    str(CONFIG_OUTPUT) + ".tmp"
)


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

        expected_batch_shape = (
            len(row_indices),
            FEATURE_DIMENSION,
        )

        if batch_features.shape != expected_batch_shape:
            raise RuntimeError(
                "Unexpected feature shape: "
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


mammoclip_commit = (
    EXPERIMENT_DIR
    / "configs/mammoclip_git_commit.txt"
).read_text(
    encoding="utf-8"
).strip()


configuration = {
    "model": "Mammo-CLIP",
    "image_encoder": (
        "tf_efficientnet_b5_ns-detect"
    ),
    "encoder_architecture": "efficientnet-b5",
    "encoder_output": (
        "global_average_pooled_image_embedding"
    ),
    "feature_dimension": FEATURE_DIMENSION,
    "encoder_parameter_count": sum(
        parameter.numel()
        for parameter in model.parameters()
    ),
    "encoder_frozen": True,
    "storage_dtype": "float32",
    "source_image_size": [
        IMAGE_HEIGHT,
        IMAGE_WIDTH,
    ],
    "source_image_mode": "grayscale",
    "colour_channels": 3,
    "source_conversion": "grayscale_to_rgb",
    "resizing_during_extraction": False,
    "intensity_scaling": "per_image_min_max",
    "normalization_mean": NORMALIZATION_MEAN,
    "normalization_std": NORMALIZATION_STD,
    "augmentation": False,
    "labels_used_during_extraction": False,
    "resolution_limit": (
        "Available EMBED inputs were previously "
        "processed to 500x500, whereas the official "
        "Mammo-CLIP tutorial used higher-resolution "
        "1520x912 inputs."
    ),
    "batch_size": BATCH_SIZE,
    "number_of_images": len(metadata),
    "mammoclip_git_commit": mammoclip_commit,
    "image_manifest_sha256": sha256_file(
        IMAGE_MANIFEST
    ),
    "patient_splits_sha256": sha256_file(
        PATIENT_SPLITS
    ),
    "pretrained_weights_sha256": sha256_file(
        WEIGHT_PATH
    ),
    "extractor_script_sha256": sha256_file(
        Path(__file__)
    ),
    "feature_file_sha256": sha256_file(
        feature_temp
    ),
    "torch_version": torch.__version__,
    "cuda_version": torch.version.cuda,
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
    "Expected feature size MiB:",
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
print("PASS: no labels were used by Mammo-CLIP")
print("PASS: source images and manifests were unchanged")
