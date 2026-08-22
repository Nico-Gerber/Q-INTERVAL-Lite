"""
Systematic experiment driver for the QSVC study.

Each block below runs ONE controlled variable change against a fixed
baseline configuration, and appends a row to qsvc_outputs/experiment_results.csv.
Read the printed accuracy/F1 after each block before deciding whether to run
the next one -- don't run everything blindly; use the results to decide which
branch to pursue further (see the "how to interpret" notes in the chat reply).

Run individual blocks by commenting out the ones you don't want yet -- a full
sweep with 8-qubit kernels and probability=True can take a while.
"""

from qsvc import (
    run_qsvc_experiment, RESULTS_TABLE_PATH
)

BASELINE = dict(
    n_features=4, feature_map="zz", reps=2, entanglement="linear",
    svm_c=1.0, multiclass_strategy="ovo", max_train_samples=1500, seed=42,
)


# ---------------------------------------------------------------
# Experiment 1: number of PCA features / qubits (2, 3, 4)
# Fixed: feature_map, reps, entanglement, svm_c
# Watch: test_accuracy, f1_macro, wall_time_sec as n_features grows
# ---------------------------------------------------------------
for nf in [2, 3, 4]:
    cfg = dict(BASELINE); cfg["n_features"] = nf
    run_qsvc_experiment(**cfg, tag=f"exp2_nfeatures_{nf}")

# ---------------------------------------------------------------
# Experiment 2: feature map (angle vs zz vs pauli), features/qubits fixed at 4
# Fixed: n_features, reps, entanglement, svm_c
# Watch: test_accuracy, f1_macro -- does a more expressive map help or hurt?
# ---------------------------------------------------------------
for fmap in ["angle", "zz", "pauli"]:
    cfg = dict(BASELINE); cfg["feature_map"] = fmap
    run_qsvc_experiment(**cfg, tag=f"exp3_featuremap_{fmap}")

# ---------------------------------------------------------------
# Experiment 3: entanglement structure (linear vs circular vs full), zz map
# Fixed: n_features, feature_map, reps, svm_c
# Watch: test_accuracy -- more connectivity is not guaranteed to help; it can
# also make the kernel too close to uniform (all fidelities collapse toward
# the same value), which hurts SVM separability.
# ---------------------------------------------------------------
for ent in ["linear", "circular", "full"]:
    cfg = dict(BASELINE); cfg["entanglement"] = ent
    run_qsvc_experiment(**cfg, tag=f"exp4_entanglement_{ent}")

# ---------------------------------------------------------------
# Experiment 4: SVM regularization C, kernel/feature map fixed
# Fixed: everything except svm_c
# Watch: train_accuracy vs test_accuracy gap (overfitting/underfitting)
# ---------------------------------------------------------------
for c in [0.1, 1.0, 10.0, 100.0]:
    cfg = dict(BASELINE); cfg["svm_c"] = c
    run_qsvc_experiment(**cfg, tag=f"exp5_svmC_{c}")


print(f"\nAll experiments logged to: {RESULTS_TABLE_PATH}")
print("Load it with pandas and sort by test_accuracy / f1_macro to compare.")