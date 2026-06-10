from lime_heatmap import load_artifacts, run_explanation

IMAGE_PATH   = "QML/image/Malignant_3.jpg"
Y_TRUE       = 2   # 0=normal, 1=benign, 2=malignant
TARGET_LABEL = 2

if __name__ == "__main__":
    clf, quantum_weights, pca, scaler = load_artifacts()
    run_explanation(
        image_path      = IMAGE_PATH,
        y_true          = Y_TRUE,
        clf             = clf,
        pca             = pca,
        scaler          = scaler,
        quantum_weights = quantum_weights,
        target_label    = TARGET_LABEL,
        save_path       = "malignant_3_test_heatmap_v2.png",
    )