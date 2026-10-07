from pathlib import Path

import torch
from torch.utils.data import DataLoader

from v2d_spatial_components import (
    V2DSpatialDataset,
    V2DSpatialMultiviewHazardLSTM,
)


ROOT = Path(__file__).resolve().parents[1]

if not torch.cuda.is_available():
    raise RuntimeError(
        "CUDA is required for this smoke test"
    )

device = torch.device("cuda")

dataset = V2DSpatialDataset(
    ROOT,
    ROOT,
    "validation",
)

loader = DataLoader(
    dataset,
    batch_size=2,
    shuffle=False,
    num_workers=0,
    pin_memory=True,
)

batch = next(iter(loader))

model = V2DSpatialMultiviewHazardLSTM()
model = model.to(device)
model.train()

inputs = batch["sequence_features"].to(
    device,
    non_blocking=True,
)
temporal = batch["temporal_features"].to(
    device,
    non_blocking=True,
)
sequence_mask = batch["sequence_mask"].to(
    device,
    non_blocking=True,
)

logits = model(
    inputs,
    temporal,
    sequence_mask,
)

assert logits.shape == (2, 5)
assert torch.isfinite(logits).all()

smoke_loss = logits.square().mean()
smoke_loss.backward()

gradients = [
    parameter.grad
    for parameter in model.parameters()
    if parameter.grad is not None
]

assert gradients
assert all(
    torch.isfinite(gradient).all()
    for gradient in gradients
)

model.eval()

with torch.no_grad():
    result = model.predict_risk(
        inputs,
        temporal,
        sequence_mask,
    )

    _, attention = model.encode_examinations(
        inputs,
        temporal,
        sequence_mask,
    )

risk = result["cumulative_risk"]

assert risk.shape == (2, 5)
assert torch.isfinite(risk).all()
assert torch.all(risk >= 0)
assert torch.all(risk <= 1)
assert torch.all(
    risk[:, 1:] >= risk[:, :-1]
)

assert attention["spatial"].shape == (
    2, 5, 4, 8, 8
)
assert attention["view"].shape == (
    2, 5, 4
)

print("Device:", torch.cuda.get_device_name(0))
print("Logit shape:", tuple(logits.shape))
print("Risk shape:", tuple(risk.shape))
print("First patient risk:", risk[0].cpu().tolist())
print("V2D GPU SMOKE TEST: PASS")
