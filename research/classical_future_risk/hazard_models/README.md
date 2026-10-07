# Discrete Hazard Model Research

This directory preserves the Sprint 05 research implementation that replaced
direct cumulative-risk prediction with discrete yearly hazard modelling.

## Scope

The archived workflow includes:

1. yearly hazard-target and at-risk-mask construction;
2. explicit temporal-gap feature generation;
3. masked hazard binary cross-entropy loss;
4. empirical hazard-rate output-bias initialisation;
5. patient-level evaluation metrics;
6. V2A, V2B, and V2C model variants;
7. weighting and multiseed experiments;
8. unit and GPU smoke tests; and
9. aggregate validation evidence.

## Model variants

- **V2A:** base longitudinal hazard LSTM.
- **V2B:** hazard model with explicit examination timing.
- **V2C:** structured model separating global, bilateral-asymmetry, view-mask,
  and temporal evidence before longitudinal aggregation.

## Directory layout

- `src/`: reusable datasets, models, losses, initialisation, and metrics.
- `scripts/`: target generation, feature generation, training, and smoke tests.
- `tests/`: unit tests for targets, datasets, losses, metrics, and model variants.
- `slurm/`: OzSTAR batch-job definitions.
- `configs/`: hazard-weighting configuration.
- `data/`: non-patient-level derived-data summaries.
- `outputs/`: aggregate training histories.
- `reports/`: aggregate audits and validation summaries.
- `manifests/`: SHA-256 provenance records.

## Excluded artifacts

Patient-level arrays, predictions, checkpoints, mammograms, virtual
environments, and private metadata are intentionally excluded from Git.
Checksum records may therefore refer to large artifacts retained in controlled
project storage.

The repaired-cohort reconstruction is archived separately under
`../repaired_cohort/`.