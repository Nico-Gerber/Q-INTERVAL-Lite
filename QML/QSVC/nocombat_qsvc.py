"""Run the QSVC on the fine-tuned ResNet18 features with NO ComBat.

This is the deployable pipeline: image -> fine-tuned ResNet18 -> StandardScaler -> PCA(12) -> MinMax -> QSVC.
Nothing in it needs the source dataset, so it works on an uploaded mammogram.
"""
import os
import sys
import importlib.util
import numpy as np

THIS_DIR = os.path.dirname(os.path.abspath(__file__))


def load_module(name, filename):
    spec = importlib.util.spec_from_file_location(name, os.path.join(THIS_DIR, filename))
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


combat_module = load_module("combat_train_module", "combat_train.py")
qsvc_module = load_module("qsvc_module", "qsvc.py")

OUT_DIR = os.path.join(THIS_DIR, "finetune_outputs")
CACHE = os.path.join(OUT_DIR, "finetuned_combat_cache.npz")
CSV = os.path.join(OUT_DIR, "qml_finetuned_nocombat_pca12.csv")
LABEL_IDS = {"normal": 0, "benign": 1, "malignant": 2}

c = np.load(CACHE, allow_pickle=True)
y_train = np.array([LABEL_IDS[v] for v in c["y_train"]])
y_test = np.array([LABEL_IDS[v] for v in c["y_test"]])

combat_module.fit_and_write_csv(
    c["Z_train_raw"], c["Z_test_raw"], y_train, y_test,
    c["f_train"], c["f_test"], c["src_train"], c["src_test"],
    LABEL_IDS, CSV, "FINETUNED-NOCOMBAT",
)

qsvc_module.OUTPUT_DIR = os.path.join(THIS_DIR, "qsvc_outputs")
qsvc_module.RESULTS_TABLE_PATH = os.path.join(qsvc_module.OUTPUT_DIR, "experiment_results.csv")
os.makedirs(qsvc_module.OUTPUT_DIR, exist_ok=True)

result = qsvc_module.run_qsvc_experiment(csv_path=CSV, tag="finetuned_nocombat", make_plots=False)

m = result["test_metrics"]
print(f"\nQuantum test accuracy (fine-tuned, no ComBat): {m['accuracy']:.4f}   macro-F1: {m['f1_macro']:.4f}")
print("Classical RBF-SVM on the same features scored 0.679 in the earlier check.")
