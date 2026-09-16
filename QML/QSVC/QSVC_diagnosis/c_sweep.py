import sys
import importlib.util

# =========================================================
# CONFIG
# =========================================================
QSVC_MODULE_PATH = "/Users/jackguo/Documents/GitHub/Q-INTERVAL-Lite/QML/QSVC/qsvc.py"

N_FEATURES_OPTIONS = [4, 6, 8, 10, 12, 16]
REPS_OPTIONS = [1, 2]

# =========================================================
# Load qsvc.py as a module
# =========================================================
spec = importlib.util.spec_from_file_location("qsvc_module", QSVC_MODULE_PATH)
qsvc_module = importlib.util.module_from_spec(spec)
sys.modules["qsvc_module"] = qsvc_module
spec.loader.exec_module(qsvc_module)


def main():
    results = []

    for reps in REPS_OPTIONS:
        for n_features in N_FEATURES_OPTIONS:
            tag = f"concentration_sweep_{n_features}f_reps{reps}"
            print(f"\n{'=' * 70}")
            print(f"n_features={n_features}  reps={reps}")
            print("=" * 70)

            try:
                out = qsvc_module.run_qsvc_experiment(
                    n_features=n_features,
                    reps=reps,
                    tag=tag,
                    save_model=False,
                    make_plots=False,
                )
                train_acc = out["train_metrics"]["accuracy"]
                test_acc = out["test_metrics"]["accuracy"]
                gap = train_acc - test_acc

                results.append({
                    "n_features": n_features, "reps": reps,
                    "train_acc": train_acc, "test_acc": test_acc, "gap": gap,
                })
            except Exception as e:
                print(f"  [failed] {e}")

    print("\n" + "=" * 70)
    print("SUMMARY: train/test gap by qubit count and circuit depth")
    print("=" * 70)
    print(f"{'n_features':>10} {'reps':>6} {'train_acc':>10} {'test_acc':>10} {'gap':>8}")
    for r in results:
        flag = "  <-- large gap, likely concentrated" if r["gap"] > 0.35 else ""
        print(f"{r['n_features']:>10} {r['reps']:>6} {r['train_acc']:>10.4f} "
              f"{r['test_acc']:>10.4f} {r['gap']:>8.4f}{flag}")

    best = min(
        [r for r in results if r["gap"] < 0.35] or results,
        key=lambda r: -r["test_acc"]
    )
    print(f"\nBest test accuracy among combinations WITHOUT a large train/test gap:")
    print(f"  n_features={best['n_features']}  reps={best['reps']}  "
          f"test_acc={best['test_acc']:.4f}  gap={best['gap']:.4f}")


if __name__ == "__main__":
    main()