# Frozen Final Mammo-CLIP V2D Evaluation

This directory preserves the one-time evaluation of the validation-selected
Mammo-CLIP B5 V2D model on the untouched repaired-cohort test split.

## Selection protocol

The final checkpoint was frozen before test evaluation:

- model: Mammo-CLIP B5 V2D;
- selected seed: 2026;
- selection criterion: minimum validation unweighted masked negative
  log-likelihood;
- validation ensemble decision: retain the seed-2026 single model;
- test data used during model selection: no.

No model, threshold, calibration parameter, or ensemble decision was changed
after test results were observed.

## Test cohort

- patients: 330;
- 1-year positives: 6;
- 2-year positives: 19;
- 3-year positives: 20;
- 4-year positives: 21;
- 5-year positives: 21.

## Final test performance

- unweighted masked NLL: 0.040948;
- mean AUROC: 0.868413;
- mean AUPRC: 0.642404;
- mean Brier score: 0.026016;
- patients with cumulative-risk monotonicity violations: 0.

## Patient-level bootstrap intervals

The final report contains 95% percentile confidence intervals from 1,997 valid
patient-level bootstrap replicates out of 2,000 requested replicates.

## Directory layout

- `scripts/`: frozen test evaluator.
- `slurm/`: one-time test-evaluation job.
- `reports/`: aggregate test metrics and confidence intervals.
- `configs/`: SHA-256 provenance record.

## Excluded artifacts

The selected checkpoint, patient-level test predictions, feature arrays,
mammograms, and private data are excluded from Git. The evaluator depends on
the Mammo-CLIP V2D components archived under `../mammoclip_v2d/`.