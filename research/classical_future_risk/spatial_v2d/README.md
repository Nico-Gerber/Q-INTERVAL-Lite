# Sprint 06 Spatial V2D Architecture Research

This directory preserves the Sprint 06 experiments used to compare repaired
global-feature models with a spatial, multiview longitudinal hazard model.

## Scope

The archived work includes:

1. repaired baseline validation;
2. current-examination-only ablations;
3. multiseed V2B and V2C retraining;
4. ResNet50 spatial feature extraction;
5. patient-to-spatial-feature index construction;
6. spatial attention over 8x8 feature maps;
7. learned attention across four mammographic views;
8. bilateral CC and MLO asymmetry evidence;
9. temporal feature fusion;
10. longitudinal LSTM hazard prediction;
11. three-seed V2D validation; and
12. validation-only architecture and calibration selection.

## V2D input layout

For each patient, the V2D model consumes up to five chronological
examinations. Each examination supports four view slots:

- L-CC
- R-CC
- L-MLO
- R-MLO

Each available image is represented by a 2,048-channel 8x8 spatial feature
map. Missing views and right-padded examinations are governed by explicit
masks.

## Directory layout

- `scripts/`: spatial extraction, indexing, model components, training,
  evaluation, calibration, and selection programs.
- `slurm/`: OzSTAR job definitions.
- `configs/`: experiment protocol and weighting configuration.
- `spatial_features/`: non-patient-level spatial-layout summaries.
- `outputs/`: aggregate training and validation histories.
- `reports/`: aggregate architecture-comparison evidence.
- `manifests/`: SHA-256 provenance records.

## Excluded artifacts

Spatial feature arrays, patient spatial indices, predictions, model
checkpoints, mammograms, virtual environments, and patient-level data are
excluded from Git. JSON configuration and aggregate result files are retained.

Mammo-CLIP V2C and V2D experiments are archived separately under
`../mammoclip_v2d/`.