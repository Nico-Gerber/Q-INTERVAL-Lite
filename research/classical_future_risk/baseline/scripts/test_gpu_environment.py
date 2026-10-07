import os

import pandas as pd
import torch
import torch.nn as nn
import torchvision

from PIL import Image
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


print("SOFTWARE")
print("=" * 72)
print("PyTorch:", torch.__version__)
print("Torchvision:", torchvision.__version__)
print("CUDA build:", torch.version.cuda)
print("CUDA available:", torch.cuda.is_available())


if not torch.cuda.is_available():
    raise RuntimeError(
        "CUDA is not available inside the GPU job."
    )


device = torch.device("cuda")

print("GPU:", torch.cuda.get_device_name(0))
print(
    "GPU memory GB:",
    round(
        torch.cuda.get_device_properties(0).total_memory
        / (1024 ** 3),
        2,
    ),
)


print("\nLOADING SAMPLE IMAGES")
print("=" * 72)

manifest = pd.read_csv(
    IMAGE_MANIFEST,
    usecols=[
        "filename",
        "image_path",
        "view_slot",
    ],
    nrows=4,
)

if len(manifest) != 4:
    raise RuntimeError(
        "Could not load four sample image rows."
    )


transform = transforms.Compose(
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


image_tensors = []

for row in manifest.itertuples(index=False):
    if not os.path.isfile(row.image_path):
        raise FileNotFoundError(
            row.image_path
        )

    with Image.open(row.image_path) as image:
        tensor = transform(
            image.convert("L")
        )

    image_tensors.append(tensor)

    print(
        row.view_slot,
        row.filename,
        tuple(tensor.shape),
    )


batch = torch.stack(
    image_tensors
).to(device)


print("\nRESNET50 GPU FORWARD PASS")
print("=" * 72)

model = models.resnet50(
    weights=None
)

feature_extractor = nn.Sequential(
    *list(model.children())[:-1]
).to(device)

feature_extractor.eval()


with torch.no_grad():
    with torch.cuda.amp.autocast():
        features = feature_extractor(batch)

features = features.flatten(1)


print("Input shape:", tuple(batch.shape))
print("Feature shape:", tuple(features.shape))
print(
    "All features finite:",
    bool(torch.isfinite(features).all()),
)


if tuple(features.shape) != (4, 2048):
    raise RuntimeError(
        "Unexpected ResNet50 feature shape."
    )

if not torch.isfinite(features).all():
    raise RuntimeError(
        "The feature matrix contains invalid values."
    )


print("\nGPU TEST: PASS")
