"""Build the deployable artifacts for qsvc_engine.py and check them against the original results.
Writes qsvc_export/models/qsvc/ and copies qsvc_engine.py next to it. The whole qsvc_export folder
is what would be copied into the app. Nothing in the app repo is touched by this script.
"""
import os
import shutil
import sys
import time
import joblib
import numpy as np
import pennylane as qml
import torch
from PIL import Image
from sklearn.decomposition import PCA
from sklearn.preprocessing import MinMaxScaler, StandardScaler
import qsvc_engine  
from pathlib import Path 

THIS_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, THIS_DIR)

CACHE = os.path.join(THIS_DIR, "finetune_outputs", "finetuned_combat_cache.npz")
FT_WEIGHTS = os.path.join(THIS_DIR, "finetune_outputs", "resnet18_finetuned.pth")
QSVC_BUNDLE = os.path.join(THIS_DIR, "qsvc_outputs", "finetuned_nocombat_model.joblib")
EXPORT_DIR = os.path.join(THIS_DIR, "qsvc_export")
ART_DIR = os.path.join(EXPORT_DIR, "models", "qsvc")
os.makedirs(ART_DIR, exist_ok=True)

LABEL_IDS = {"normal": 0, "benign": 1, "malignant": 2}
SEED = 42

c = np.load(CACHE, allow_pickle=True)
Z_train, Z_test = c["Z_train_raw"], c["Z_test_raw"]
y_test = np.array([LABEL_IDS[v] for v in c["y_test"]])
bundle = joblib.load(QSVC_BUNDLE)
svc = bundle["svc_model"]

#refit the preprocessing exactly as combat_train.fit_and_write_csv did
scaler = StandardScaler().fit(Z_train)
pca = PCA(n_components=12, random_state=SEED).fit(scaler.transform(Z_train))
mm1 = MinMaxScaler(feature_range=(0.0, np.pi)).fit(pca.transform(scaler.transform(Z_train)))
std2, mm2 = bundle["std_scaler"], bundle["mm_scaler"]

chain = lambda Z: mm2.transform(std2.transform(mm1.transform(pca.transform(scaler.transform(Z)))))
err = np.abs(chain(Z_train) - bundle["X_train_sub"]).max()
print(f"Preprocessing rebuild check: max abs difference from the QSVC training inputs = {err:.2e}")
if err > 1e-5:
    sys.exit("Rebuilt preprocessing does not reproduce the QSVC training inputs. Stopping.")
joblib.dump({"scaler": scaler, "pca": pca, "mm1": mm1, "std2": std2, "mm2": mm2},
            os.path.join(ART_DIR, "preprocessing.joblib"))

#statevectors of the support vectors only (other training rows have zero dual weight)
qsvc_engine.ART_DIR = Path(ART_DIR)
circuit = qsvc_engine._circuit_factory()
sv_idx = np.asarray(svc.support_)
print(f"Computing {len(sv_idx)} support-vector statevectors...")
t0 = time.time()
sv_states = np.array([np.asarray(circuit(x), dtype=np.complex64) for x in bundle["X_train_sub"][sv_idx]])
print(f"  done in {time.time() - t0:.0f}s, {sv_states.nbytes / 1e6:.0f} MB")
np.save(os.path.join(ART_DIR, "sv_states.npy"), sv_states)
joblib.dump({"svc": svc, "support_idx": sv_idx, "n_train": len(bundle["X_train_sub"])},
            os.path.join(ART_DIR, "svc.joblib"))

#network weights + engine file
shutil.copy(FT_WEIGHTS, os.path.join(ART_DIR, "resnet18_finetuned.pth"))
shutil.copy(os.path.join(THIS_DIR, "qsvc_engine.py"), os.path.join(EXPORT_DIR, "qsvc_engine.py"))

#check: quantum stage over the whole test set must reproduce the original accuracy
qsvc_engine._state.clear()
print("\nCheck 1: quantum stage on all test features (original qsvc.py accuracy was "
      f"{bundle['test_accuracy']:.4f})")
t0 = time.time()
preds_svc, preds_proba = [], []
for z in Z_test:
    probs, svc_label = qsvc_engine.predict_features(z.astype(np.float64))
    preds_svc.append(svc_label)
    preds_proba.append(int(np.argmax(probs)))
preds_svc, preds_proba = np.array(preds_svc), np.array(preds_proba)
print(f"  SVC label accuracy:        {(preds_svc == y_test).mean():.4f}")
print(f"  argmax(probability) accuracy: {(preds_proba == y_test).mean():.4f}  "
      f"(agrees with SVC label on {(preds_svc == preds_proba).mean():.1%})   [{time.time() - t0:.0f}s]")

# check: real images through the full image path must agree with the cached-feature path
print("\nCheck 2: full image path on 30 test images from the external drive")
import importlib.util  # noqa: E402
_spec = importlib.util.spec_from_file_location("dann_train_module", os.path.join(THIS_DIR, "dann_train.py"))
dann_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(dann_module)

n_check = 30
agree = 0
for i in range(n_check):
    path = dann_module.resolve_image_path(c["f_test"][i], dann_module.IMAGE_BASE_FOLDER)
    with open(path, "rb") as fh:
        out = qsvc_engine.classify_view(fh.read(), with_occlusion=False)
    agree += int(out["prediction"] == preds_proba[i])
print(f"  image path agrees with the cached-feature path on {agree}/{n_check} images")

t0 = time.time()
with open(dann_module.resolve_image_path(c["f_test"][0], dann_module.IMAGE_BASE_FOLDER), "rb") as fh:
    out = qsvc_engine.classify_view(fh.read(), with_occlusion=True)
print(f"  one image with Grad-CAM: {time.time() - t0:.2f}s, prediction={out['result']}, "
      f"probabilities={out['class_probabilities']}, gradcam keys={sorted(out['gradcam'])}")

print(f"\nExport folder ready: {EXPORT_DIR}")
