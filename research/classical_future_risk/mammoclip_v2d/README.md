# Mammo-CLIP B5 Longitudinal Hazard Models

This directory preserves the Sprint 06 Mammo-CLIP experiments that replaced
ImageNet ResNet50 representations with breast-imaging-specific features.

## Feature extraction

The frozen Mammo-CLIP EfficientNet-B5 encoder was evaluated in two forms:

- a 2,048-value globally pooled embedding for the structured V2C model; and
- a 2,048-channel 8x8 spatial map for the attention-based V2D model.

The spatial maps were stored as float16 during experimentation. Large feature
arrays are excluded from Git.

## Model variants

### Mammo-CLIP V2C

The global embedding experiment constructed a 6,149-value examination vector:

- mean available-view embedding;
- absolute CC bilateral asymmetry;
- absolute MLO bilateral asymmetry;
- four-value view-availability mask; and
- recency weight.

### Mammo-CLIP V2D

The spatial experiment used:

- learned spatial attention over each 8x8 view map;
- learned fusion across L-CC, R-CC, L-MLO, and R-MLO;
- bilateral CC and MLO asymmetry;
- explicit timing and recency features;
- an LSTM across up to five examinations; and
- five discrete yearly hazards converted to monotonic cumulative risk.

## Model selection

Three random seeds were trained for the final Mammo-CLIP V2D candidate.
Selection used validation data only. The seed-2026 checkpoint was frozen
because it achieved the lowest validation unweighted masked negative
log-likelihood. A validation-only ensemble check did not replace the selected
single model.

The untouched test evaluation is archived separately under
`../final_evaluation/`.

## Directory layout

- `scripts/`: extraction, sequence-building, model, training, and validation
  selection programs.
- `slurm/`: OzSTAR extraction and training jobs.
- `configs/`: extraction, training, model-selection, and integrity records.
- `features/`: sequence-layout configuration.
- `spatial_features/`: spatial-layout configuration and index summary.
- `outputs/`: aggregate histories and validation ensemble comparison.
- `reports/`: aggregate extraction and validation evidence.

## Excluded artifacts

Mammograms, feature arrays, patient indices, predictions, checkpoints,
Mammo-CLIP pretrained weights, third-party source trees, and virtual
environments are excluded from Git.