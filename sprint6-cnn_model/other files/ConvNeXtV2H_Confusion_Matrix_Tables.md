# ConvNeXt V2-Huge — held-out evaluation, confusion matrix

Trial `P1_long_noaug__long_noaug__seed42__20bacba3c8`, 2048×1024, `model-input/3`.
n = 2,937, which matches the test partition exactly (see §2.7 counts), so these are held-out
images. Single-seed pilot stopped at 21 of 60 fine-tuning epochs — see
`R10b_SELECTION_DEVIATION.md`.

## Table 1 — Confusion matrix (counts)

Rows are the true class, columns the predicted class.

| True \ Predicted | Normal | Benign | Malignant | **Total** |
|---|---:|---:|---:|---:|
| **Normal** | **669** | 75 | 27 | 771 |
| **Benign** | 123 | **524** | 254 | 901 |
| **Malignant** | 80 | 255 | **930** | 1,265 |
| **Total predicted** | 872 | 854 | 1,211 | **2,937** |

## Table 2 — Confusion matrix (row %, i.e. per-class recall)

Each row sums to 100%. The diagonal is the recall for that class.

| True \ Predicted | Normal | Benign | Malignant |
|---|---:|---:|---:|
| **Normal** | **86.8%** | 9.7% | 3.5% |
| **Benign** | 13.7% | **58.2%** | 28.2% |
| **Malignant** | 6.3% | 20.2% | **73.5%** |

## Table 3 — Per-class performance

| Class | Support | Predicted | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|
| Normal | 771 | 872 | 0.767 | 0.868 | 0.814 |
| Benign | 901 | 854 | 0.614 | 0.582 | 0.597 |
| Malignant | 1,265 | 1,211 | 0.768 | 0.735 | 0.751 |
| **Macro average** | 2,937 | — | 0.716 | 0.728 | **0.721** |
| **Weighted average** | 2,937 | — | — | 0.723 | 0.721 |

**Overall accuracy: 0.723** (2,123 / 2,937 correct).

## Table 4 — Malignant versus the rest

Collapsing Normal and Benign into one negative class, for comparison with binary
screening figures.

| Quantity | Value |
|---|---:|
| Sensitivity (malignant recall) | 0.735 |
| Specificity | 0.832 |
| Positive predictive value | 0.768 |
| Malignant cases missed entirely (called Normal) | 80 of 1,265 (6.3%) |

## Reading the matrix

- **Benign is the weak class**, as it was on validation: F1 0.597, and the single largest
  error block in the whole matrix is 254 benign cases predicted malignant (28.2% of all
  benign). The model over-calls benign lesions as malignant rather than missing them.
- **The malignant errors are mostly one step, not two.** Of 335 malignant cases not
  recognised, 255 (76%) were called benign and only 80 (24%) were called normal. A benign
  call still routes a patient to follow-up; a normal call does not, so the 6.3% figure is the
  one that matters clinically, not the 26.5% total miss rate.
- **Normal is the strongest class** (recall 86.8%), and only 27 normal cases (3.5%) were
  called malignant.
- **Test tracks validation closely** — macro-F1 0.721 on held-out against 0.735 on
  validation, and Benign F1 0.597 against 0.626. The small drop is what you would expect
  from honest selection; it is not evidence of overfitting to the validation set.

## Caveats to carry with these numbers

1. **Single-seed.** One draw from the training procedure, no measured run-to-run variance.
2. **Time-budget stop.** 21 of 60 fine-tuning epochs; the stopping rule had not fired. These
   are a **lower bound** on the recipe.
3. **Not comparable with the demo run** at 760×456, which is a different input contract.
4. Confirm from the surrounding notebook output whether this is the **calibrated** or the
   **raw** matrix. Calibration changes the probabilities and so can move the argmax; the
   notebook prints both, and the per-source block that follows this one is labelled
   calibrated. Label whichever you quote.
