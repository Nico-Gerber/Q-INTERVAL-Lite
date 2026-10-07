# Mammo-CLIP Image-Cleaning Ablations

This directory preserves two controlled Sprint 06 experiments that tested
whether additional mammogram cleaning improved the Mammo-CLIP spatial V2D
model.

## Experiments

### Full breast masking

The first ablation generated breast-region masks for the full cohort and
removed all image content outside the detected breast region before
Mammo-CLIP feature extraction.

The full-cohort audit covered 19,054 images. The resulting seed-42 V2D model
achieved:

- validation NLL: 0.041829;
- mean AUROC: 0.892146;
- mean AUPRC: 0.636149; and
- mean Brier score: 0.028002.

### Acquisition-label cleaning

The second ablation removed detected annotation and acquisition-label pixels
while retaining the remaining image background. Cleaning changed 17,644 of
19,054 images and removed 17,844,257 detected annotation pixels.

The resulting seed-42 V2D model achieved:

- validation NLL: 0.046596;
- mean AUROC: 0.817835;
- mean AUPRC: 0.559579; and
- mean Brier score: 0.033002.

## Decision

Both experiments were treated as diagnostic single-seed ablations. Neither
replaced the original Mammo-CLIP V2D pipeline because overall validation
performance did not improve consistently. The original image processing and
seed-2026 V2D checkpoint remained frozen as the final model.

## Directory layout

- `masked/`: breast-masking extraction, model, training, and aggregate results.
- `labelclean/`: annotation-cleaning extraction, model, training, and aggregate
  results.
- `scripts/`: selected-case breast-mask audit program.

## Excluded artifacts

Cleaned mammograms, spatial feature arrays, patient-level audit tables,
previews containing mammograms, checkpoints, predictions, and virtual
environments are excluded from Git.