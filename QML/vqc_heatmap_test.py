"""
test_vqc_heatmap.py — generates vqc_heatmap.png
"""

from vqc_heatmap import load_artifacts, run_explanation

IMAGE_PATH   = "QML/image/Malignant_3.jpg"
Y_TRUE       = 2    # 0=normal, 1=benign, 2=malignant
TARGET_LABEL = 2

if __name__ == "__main__":
    weights, n_qubits, n_layers, n_classes, pca, scaler = load_artifacts()
    run_explanation(
        image_path   = IMAGE_PATH,
        y_true       = Y_TRUE,
        weights      = weights,
        n_qubits     = n_qubits,
        n_layers     = n_layers,
        n_classes    = n_classes,
        pca          = pca,
        scaler       = scaler,
        target_label = TARGET_LABEL,
        save_path    = "vqc_heatmap.png",
    )