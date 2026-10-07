# Repaired-Cohort Reconstruction and Validation

This directory preserves the image-derived rebuild used to replace the
temporary frozen-feature development cohort during Sprint 05.

## Repaired cohort

The completed cohort contained:

- 19,054 processed mammograms;
- 4,942 examinations;
- 2,230 longitudinal patient sequences;
- 153 cancer events within five years; and
- 10,671 valid at-risk patient-year intervals.

## Workflow

The archived workflow covers:

1. corrected manifest reconstruction from restored metadata;
2. stable patient-level train, validation, and test splitting;
3. selected-view and follow-up censoring audits;
4. ResNet50 image-feature extraction;
5. 6,149-value examination feature construction;
6. five-examination sequence construction;
7. yearly hazard-target and temporal-feature regeneration;
8. weighting-configuration regeneration;
9. V2A, V2B, and V2C retraining;
10. validation-based model comparison; and
11. frontend inference and training-parity checks.

## Directory layout

- `scripts/`: reconstruction, extraction, audit, and training programs.
- `slurm/`: OzSTAR batch-job definitions.
- `deployment/`: frontend V2C inference adapter and parity checker.
- `configs/`: hazard-weighting configuration.
- `features/`: feature-layout and sequence-build configuration records.
- `data/`: non-patient-level derived-data summaries.
- `outputs/`: aggregate training histories.
- `reports/`: aggregate reconstruction, audit, and validation evidence.
- `manifests/`: SHA-256 provenance and integrity records.

## Excluded artifacts

Mammograms, patient-level arrays, predictions, smoke-test patient inputs,
checkpoints, ResNet50 feature matrices, sequence arrays, deployment archives,
and virtual environments are intentionally excluded from Git.

The deployment code is retained as historical research evidence. The current
application integration is maintained separately under
`backend/routers/future_risk_classical/`.