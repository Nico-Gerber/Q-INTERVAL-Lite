import pickle, pathlib
for p in ["QeSFRP_V0.2.pkl", "QeSFRP_V0.3.pkl"]:
    with open(p, "rb") as f:
        obj = pickle.load(f)
print(p, type(obj), list(obj.keys()) if isinstance(obj, dict) else "not a dict")