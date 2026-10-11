import sys, time
import numpy as np, pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.svm import SVC
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import accuracy_score, balanced_accuracy_score, f1_score

CACHE = sys.argv[1]
N_COMPONENTS = 12
c = np.load(CACHE, allow_pickle=True)
Xtr, Xte = c["Z_train_harm"], c["Z_test_harm"]
ytr, yte = c["y_train"], c["y_test"]
sr_tr, sr_te = c["src_train"], c["src_test"]
print(f"train {Xtr.shape}, test {Xte.shape}, sources: {dict(pd.Series(sr_te).value_counts())}")

sc = StandardScaler().fit(Xtr)
Xtr_s, Xte_s = sc.transform(Xtr), sc.transform(Xte)
pca = PCA(N_COMPONENTS, random_state=42).fit(Xtr_s)
Ptr, Pte = pca.transform(Xtr_s), pca.transform(Xte_s)
print(f"PCA{N_COMPONENTS} keeps {pca.explained_variance_ratio_.sum():.1%} of the variance\n")

def timed(name, model, A, B, y, yt):
    t = time.time(); p = model.fit(A, y).predict(B)
    return p, time.time() - t

# TEST 1: how much DIAGNOSIS signal do the features hold, independent of the quantum model?
print("TEST 1  diagnosis accuracy with classical models (chance 33.3%)")
models = {
  "logistic regression": lambda: LogisticRegression(max_iter=2000, C=0.1),
  "random forest":       lambda: RandomForestClassifier(200, n_jobs=-1, random_state=0),
}
best_pred = None
for feat, (A, B) in {"512-d harmonised": (Xtr_s, Xte_s), f"{N_COMPONENTS}-d PCA": (Ptr, Pte)}.items():
    for mname, mk in models.items():
        p, sec = timed(mname, mk(), A, B, ytr, yte)
        print(f"  {feat:17s} {mname:20s} acc={accuracy_score(yte,p):.3f}  macro-F1={f1_score(yte,p,average='macro'):.3f}  ({sec:.0f}s)")
        if feat.startswith(str(N_COMPONENTS)) and mname == "random forest":
            best_pred = p
p, sec = timed("rbf", SVC(C=1.0, kernel="rbf"), Ptr, Pte, ytr, yte)
print(f"  {N_COMPONENTS}-d PCA          classical RBF-SVM        acc={accuracy_score(yte,p):.3f}  macro-F1={f1_score(yte,p,average='macro'):.3f}  ({sec:.0f}s)  <- classical twin of the quantum kernel")
rbf_pred = p

# TEST 2: what does knowing only the SOURCE give you? (the shortcut baseline)
maj = pd.DataFrame({"s": sr_tr, "y": ytr}).groupby("s")["y"].agg(lambda v: v.value_counts().index[0])
p_src = np.array([maj.get(s, "malignant") for s in sr_te])
print(f"\nTEST 2  predict diagnosis from source label alone: acc={accuracy_score(yte,p_src):.3f}  (any model must beat this to be reading tissue)")

# TEST 3: does accuracy hold up inside each source, not just overall?
print("\nTEST 3  per-source diagnosis accuracy (classical RBF-SVM on the 12-d features)")
rows = []
for s in sorted(set(sr_te)):
    m = sr_te == s
    if m.sum() >= 50:
        rows.append((s, m.sum(), accuracy_score(yte[m], rbf_pred[m]), accuracy_score(yte[m], p_src[m])))
for s, n, a, b in rows:
    print(f"  {s:10s} n={n:5d}  model={a:.3f}   source-only baseline={b:.3f}")
print(f"  macro average over sources: model={np.mean([r[2] for r in rows]):.3f}   source-only baseline={np.mean([r[3] for r in rows]):.3f}")

# TEST 4: how much SOURCE is left after ComBat? (balanced accuracy, chance = 1/n_sources)
print(f"\nTEST 4  source leakage after ComBat (chance for balanced accuracy = {1/len(set(sr_te)):.3f}, majority-class rate = {pd.Series(sr_te).value_counts(normalize=True).iloc[0]:.3f})")
for feat, (A, B) in {"512-d harmonised": (Xtr_s, Xte_s), f"{N_COMPONENTS}-d PCA": (Ptr, Pte)}.items():
    for mname, mk in models.items():
        p, sec = timed(mname, mk(), A, B, sr_tr, sr_te)
        print(f"  {feat:17s} {mname:20s} acc={accuracy_score(sr_te,p):.3f}  balanced acc={balanced_accuracy_score(sr_te,p):.3f}")
