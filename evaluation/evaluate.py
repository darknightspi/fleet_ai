"""
FleetGuard AI - Model Evaluation & Calibration Verification.

Loads the serialized model bundle, runs evaluation against dataset,
verifies probability calibration, and prints evaluation metrics.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import calibration_curve
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    brier_score_loss,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)

from ml.config import DATASET_PATH, MODEL_PATH, TARGET_COLUMN
from ml.data_loader import get_feature_matrix_and_target, load_dataset


def evaluate_saved_model(
    model_path: Path = MODEL_PATH,
    dataset_path: Path = DATASET_PATH,
) -> Dict[str, Any]:
    """
    Load serialized model and evaluate on the full dataset.

    Args:
        model_path: Path to failure_clf.joblib
        dataset_path: Path to dataset/ai4i2020.csv

    Returns:
        Evaluation metrics dictionary.
    """
    if not model_path.exists():
        raise FileNotFoundError(f"Model artifact not found at '{model_path}'. Run training first.")

    bundle = joblib.load(model_path)
    model = bundle["model"]
    transformer = bundle["transformer"]

    df = load_dataset(dataset_path)
    X, y = get_feature_matrix_and_target(df)

    X_trans = transformer.transform(X)
    y_pred = model.predict(X_trans)
    y_proba = model.predict_proba(X_trans)[:, 1]

    cm = confusion_matrix(y, y_pred, labels=[0, 1])
    tn, fp, fn, tp = cm.ravel()

    prob_true, prob_pred = calibration_curve(y, y_proba, n_bins=10, strategy="uniform")

    metrics = {
        "accuracy": float(accuracy_score(y, y_pred)),
        "precision": float(precision_score(y, y_pred, zero_division=0)),
        "recall": float(recall_score(y, y_pred, zero_division=0)),
        "f1": float(f1_score(y, y_pred, zero_division=0)),
        "roc_auc": float(roc_auc_score(y, y_proba)),
        "pr_auc": float(average_precision_score(y, y_proba)),
        "brier_score": float(brier_score_loss(y, y_proba)),
        "confusion_matrix": {
            "tn": int(tn),
            "fp": int(fp),
            "fn": int(fn),
            "tp": int(tp),
        },
        "calibration_curve": {
            "prob_true": [round(float(p), 4) for p in prob_true],
            "prob_pred": [round(float(p), 4) for p in prob_pred],
        },
    }

    print("=" * 60)
    print("FLEETGUARD AI - MODEL EVALUATION REPORT")
    print("=" * 60)
    print(f"Accuracy:        {metrics['accuracy']:.4f}")
    print(f"Precision:       {metrics['precision']:.4f}")
    print(f"Recall:          {metrics['recall']:.4f}")
    print(f"F1-Score:        {metrics['f1']:.4f}")
    print(f"ROC-AUC:         {metrics['roc_auc']:.4f}")
    print(f"PR-AUC:          {metrics['pr_auc']:.4f}")
    print(f"Brier Score:     {metrics['brier_score']:.4f}")
    print("Confusion Matrix:")
    print(f"  TN: {tn:<5}  FP: {fp:<5}")
    print(f"  FN: {fn:<5}  TP: {tp:<5}")
    print("=" * 60)

    return metrics


if __name__ == "__main__":
    evaluate_saved_model()
