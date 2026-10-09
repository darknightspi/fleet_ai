"""
FleetGuard AI - Model Training Pipeline.

Trains a calibrated Random Forest classifier on the UCI AI4I 2020 dataset:
- Stratified 5-fold cross-validation
- Class-imbalance mitigation (balanced class weights)
- Physics-based feature engineering
- Metric tracking (Precision, Recall, F1, ROC-AUC, PR-AUC, Brier score, Confusion Matrix)
- Probability calibration
- Feature-order preservation & training range serialization
- Saves artifacts to ml/models/ and evaluation/results/
"""

from __future__ import annotations

import json
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV, calibration_curve
from sklearn.ensemble import RandomForestClassifier
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
from sklearn.model_selection import StratifiedKFold
from sklearn.pipeline import Pipeline

from ml.config import (
    CONFUSION_MATRIX_PATH,
    CV_SPLITS,
    DATASET_PATH,
    EVALUATION_DIR,
    FEATURE_IMPORTANCE_PATH,
    METRICS_PATH,
    MODEL_CARD_PATH,
    MODEL_PATH,
    MODELS_DIR,
    RANDOM_STATE,
    REPO_ROOT,
    RF_HYPERPARAMS,
)
from ml.data_loader import (
    get_feature_matrix_and_target,
    load_dataset,
    print_dataset_diagnostics,
    validate_dataset,
)
from ml.feature_engineering import AI4IFeatureTransformer


def evaluate_fold(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    y_proba: np.ndarray,
) -> Dict[str, float]:
    """Calculate comprehensive evaluation metrics for binary classification."""
    cm = confusion_matrix(y_true, y_pred, labels=[0, 1])
    tn, fp, fn, tp = cm.ravel()

    return {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "precision": float(precision_score(y_true, y_pred, zero_division=0)),
        "recall": float(recall_score(y_true, y_pred, zero_division=0)),
        "f1": float(f1_score(y_true, y_pred, zero_division=0)),
        "roc_auc": float(roc_auc_score(y_true, y_proba)),
        "pr_auc": float(average_precision_score(y_true, y_proba)),
        "brier_score": float(brier_score_loss(y_true, y_proba)),
        "true_positives": int(tp),
        "false_positives": int(fp),
        "true_negatives": int(tn),
        "false_negatives": int(fn),
    }


def run_stratified_cv(
    X: pd.DataFrame,
    y: pd.Series,
    n_splits: int = CV_SPLITS,
    random_state: int = RANDOM_STATE,
) -> Dict[str, Any]:
    """
    Execute Stratified 5-Fold Cross-Validation on the dataset.

    Args:
        X: Raw non-leakage feature dataframe.
        y: Target series.
        n_splits: Number of CV folds.
        random_state: Seed for fold stratification.

    Returns:
        Dictionary containing fold-level metrics and aggregated summary statistics.
    """
    skf = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=random_state)

    fold_results: List[Dict[str, Any]] = []
    raw_rf_metrics: List[Dict[str, float]] = []
    calibrated_metrics: List[Dict[str, float]] = []
    aggregate_cm = np.zeros((2, 2), dtype=int)

    oof_preds = np.zeros(len(y))
    oof_probas = np.zeros(len(y))

    print(f"Starting {n_splits}-Fold Stratified Cross-Validation...")

    for fold_idx, (train_idx, val_idx) in enumerate(skf.split(X, y), 1):
        X_train_raw, X_val_raw = X.iloc[train_idx], X.iloc[val_idx]
        y_train, y_val = y.iloc[train_idx], y.iloc[val_idx]

        # Fit transformer strictly on training fold
        transformer = AI4IFeatureTransformer()
        X_train_trans = transformer.fit_transform(X_train_raw)
        X_val_trans = transformer.transform(X_val_raw)

        # Initialize Base Random Forest with class_weight='balanced'
        base_rf = RandomForestClassifier(**RF_HYPERPARAMS)
        base_rf.fit(X_train_trans, y_train)

        # Evaluate base RF
        y_val_pred_raw = base_rf.predict(X_val_trans)
        y_val_proba_raw = base_rf.predict_proba(X_val_trans)[:, 1]
        metrics_raw = evaluate_fold(y_val.values, y_val_pred_raw, y_val_proba_raw)
        raw_rf_metrics.append(metrics_raw)

        # Calibrated Classifier (using isotonic/sigmoid calibration on internal cv)
        calibrated_clf = CalibratedClassifierCV(
            estimator=RandomForestClassifier(**RF_HYPERPARAMS),
            method="sigmoid",
            cv=3,
        )
        calibrated_clf.fit(X_train_trans, y_train)

        y_val_pred_cal = calibrated_clf.predict(X_val_trans)
        y_val_proba_cal = calibrated_clf.predict_proba(X_val_trans)[:, 1]
        metrics_cal = evaluate_fold(y_val.values, y_val_pred_cal, y_val_proba_cal)
        calibrated_metrics.append(metrics_cal)

        oof_preds[val_idx] = y_val_pred_raw
        oof_probas[val_idx] = y_val_proba_raw

        cm = confusion_matrix(y_val, y_val_pred_raw, labels=[0, 1])
        aggregate_cm += cm

        fold_summary = {
            "fold": fold_idx,
            "train_samples": len(train_idx),
            "val_samples": len(val_idx),
            "val_positives": int(y_val.sum()),
            "raw_rf_metrics": metrics_raw,
            "calibrated_metrics": metrics_cal,
        }
        fold_results.append(fold_summary)
        print(
            f"  Fold {fold_idx}: Precision={metrics_raw['precision']:.4f}, "
            f"Recall={metrics_raw['recall']:.4f}, F1={metrics_raw['f1']:.4f}, "
            f"ROC-AUC={metrics_raw['roc_auc']:.4f}, PR-AUC={metrics_raw['pr_auc']:.4f}"
        )

    # Compute mean & standard deviation across folds
    def aggregate_metric_list(metric_list: List[Dict[str, float]]) -> Dict[str, Dict[str, float]]:
        keys = ["accuracy", "precision", "recall", "f1", "roc_auc", "pr_auc", "brier_score"]
        agg = {}
        for k in keys:
            vals = [m[k] for m in metric_list]
            agg[k] = {
                "mean": float(np.mean(vals)),
                "std": float(np.std(vals)),
                "min": float(np.min(vals)),
                "max": float(np.max(vals)),
            }
        return agg

    summary = {
        "n_splits": n_splits,
        "raw_rf_aggregated": aggregate_metric_list(raw_rf_metrics),
        "calibrated_rf_aggregated": aggregate_metric_list(calibrated_metrics),
        "oof_overall_metrics": evaluate_fold(y.values, oof_preds, oof_probas),
        "aggregate_confusion_matrix": {
            "tn": int(aggregate_cm[0, 0]),
            "fp": int(aggregate_cm[0, 1]),
            "fn": int(aggregate_cm[1, 0]),
            "tp": int(aggregate_cm[1, 1]),
        },
        "folds": fold_results,
    }

    return summary


def train_full_model(
    X: pd.DataFrame,
    y: pd.Series,
) -> Tuple[AI4IFeatureTransformer, RandomForestClassifier, CalibratedClassifierCV, Dict[str, float]]:
    """
    Train final feature transformer, base Random Forest, and calibrated model on full dataset.

    Returns:
        Tuple of (transformer, base_rf, calibrated_rf, feature_importances).
    """
    transformer = AI4IFeatureTransformer()
    X_trans = transformer.fit_transform(X)

    # Base RF for feature importances and raw model
    base_rf = RandomForestClassifier(**RF_HYPERPARAMS)
    base_rf.fit(X_trans, y)

    # Calibrated Classifier
    calibrated_clf = CalibratedClassifierCV(
        estimator=RandomForestClassifier(**RF_HYPERPARAMS),
        method="sigmoid",
        cv=5,
    )
    calibrated_clf.fit(X_trans, y)

    # Extract feature importances
    feature_names = transformer.get_feature_names_out()
    importances = base_rf.feature_importances_
    feat_imp_dict = {
        name: float(imp)
        for name, imp in sorted(
            zip(feature_names, importances), key=lambda item: item[1], reverse=True
        )
    }

    return transformer, base_rf, calibrated_clf, feat_imp_dict


def generate_model_card(
    cv_results: Dict[str, Any],
    dataset_summary: Dict[str, Any],
    feature_importances: Dict[str, float],
    training_ranges: Dict[str, Dict[str, float]],
) -> str:
    """Generate Markdown Model Card documentation."""
    rf_agg = cv_results["raw_rf_aggregated"]
    cm = cv_results["aggregate_confusion_matrix"]

    card = f"""# FleetGuard AI - Predictive Maintenance Model Card

## Model Details
- **Model Name:** AI4I Failure Classifier (`failure_clf.joblib`)
- **Model Type:** Balanced Random Forest Classifier with Calibrated Probability Post-processing
- **Version:** 1.0.0
- **Training Timestamp:** {datetime.now().isoformat()}
- **Framework:** scikit-learn
- **Random Seed:** {RANDOM_STATE}
- **Artifact Path:** `ml/models/failure_clf.joblib`

## Intended Use
- **Primary Use Case:** Detection and predictive alert generation for industrial machinery / equipment degradation and machine failure modes (Heat Dissipation, Power Failure, Overstrain, Tool Wear, Random).
- **Secondary Use Case (FleetGuard Integration):** Surrogate predictive degradation engine mapping commercial vehicle telemetry (RPM, torque, coolant/ambient temperature, duty cycle) to degradation risk indicators.

## Training Data & Integrity
- **Dataset:** UCI AI4I 2020 Predictive Maintenance Dataset (`dataset/ai4i2020.csv`)
- **Total Records:** {dataset_summary['rows']}
- **Total Features (Engineered):** 12 (derived from 6 raw non-leakage features)
- **Target Variable:** `Machine failure` (Binary: 0 = Normal, 1 = Failure)
- **Class Distribution:** 
  - Normal (0): {dataset_summary['target_distribution']['negative_0']} ({100 - dataset_summary['target_distribution']['positive_ratio']*100:.2f}%)
  - Failure (1): {dataset_summary['target_distribution']['positive_1']} ({dataset_summary['target_distribution']['positive_ratio']*100:.2f}%)
- **Target Leakage Prevention:** 
  - Excluded identifier columns (`UDI`, `Product ID`).
  - Excluded component failure mode columns (`TWF`, `HDF`, `PWF`, `OSF`, `RNF`) from feature inputs.

## Feature Engineering
The pipeline computes physics-grounded operational interaction features:
1. **`Temp_Diff_K`**: Process Temperature - Air Temperature (Key indicator for Heat Dissipation Failure).
2. **`Power_W`**: Rotational Speed [rpm] * Torque [Nm] * (2π / 60) (Detects Power Failure outside 3.5kW-9.0kW).
3. **`Tool_Wear_Torque`**: Torque [Nm] * Tool Wear [min] (Detects Overstrain Failure).
4. **`Torque_Speed_Ratio`**: Torque [Nm] / Rotational Speed [rpm].
5. **`Type_H`, `Type_L`, `Type_M`**: One-hot encoded product quality variants.

## Evaluation & Cross-Validation Results (Stratified 5-Fold)
All metrics computed out-of-fold across 5 stratified folds:

| Metric | Mean (5-Fold CV) | Std Dev |
|---|---|---|
| **Accuracy** | {rf_agg['accuracy']['mean']:.4f} | ±{rf_agg['accuracy']['std']:.4f} |
| **Precision** | {rf_agg['precision']['mean']:.4f} | ±{rf_agg['precision']['std']:.4f} |
| **Recall** | {rf_agg['recall']['mean']:.4f} | ±{rf_agg['recall']['std']:.4f} |
| **F1-Score** | {rf_agg['f1']['mean']:.4f} | ±{rf_agg['f1']['std']:.4f} |
| **ROC-AUC** | {rf_agg['roc_auc']['mean']:.4f} | ±{rf_agg['roc_auc']['std']:.4f} |
| **PR-AUC (Avg Precision)** | {rf_agg['pr_auc']['mean']:.4f} | ±{rf_agg['pr_auc']['std']:.4f} |
| **Brier Score (Calibration)** | {rf_agg['brier_score']['mean']:.4f} | ±{rf_agg['brier_score']['std']:.4f} |

### Aggregate Confusion Matrix (10,000 Out-of-Fold Samples)
- **True Negatives (TN):** {cm['tn']}
- **False Positives (FP):** {cm['fp']}
- **False Negatives (FN):** {cm['fn']}
- **True Positives (TP):** {cm['tp']}

## Feature Importances
Ranked relative contribution to failure classification:
"""
    for feat, imp in feature_importances.items():
        card += f"- **`{feat}`**: {imp * 100:.2f}%\n"

    card += """
## Supported Operational Ranges (Training Envelope)
When inference inputs exceed these boundaries, `model_in_range` is flagged as `False`:
"""
    for feat, stats in training_ranges.items():
        card += f"- **`{feat}`**: Min = `{stats['min']:.2f}`, Max = `{stats['max']:.2f}`, Mean = `{stats['mean']:.2f}`\n"

    card += """
## Vehicle Telemetry Mapping & Crucial Limitations
> [!WARNING]
> **Domain Discrepancy & Validation Boundary:**
> 1. **Synthetic/Industrial Machine Basis:** The AI4I 2020 dataset models a CNC milling tool. Measurements represent spindle speeds, milling tool torque, and cutting tool wear.
> 2. **Surrogate Mapping:** FleetGuard maps vehicle RPM, engine torque, coolant temperature, and operating hours to these features for architectural and predictive demonstration.
> 3. **Validation Disclaimer:** High cross-validation performance on AI4I **does NOT** certify or prove real-world commercial vehicle / heavy-duty truck failure prediction accuracy. Field deployment on vehicles requires actual CAN bus and J1939 fault telemetry.
"""
    return card


def run_training_pipeline() -> Dict[str, Any]:
    """Execute complete end-to-end training and serialization pipeline."""
    start_time = time.time()
    print("=" * 70)
    print("FLEETGUARD AI - MODEL TRAINING PIPELINE")
    print("=" * 70)

    # 1. Ensure directories exist
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    EVALUATION_DIR.mkdir(parents=True, exist_ok=True)

    # 2. Load and Validate Dataset
    print(f"Loading AI4I dataset from: {DATASET_PATH}")
    df = load_dataset(DATASET_PATH)
    diag = validate_dataset(df)
    print_dataset_diagnostics(diag)

    # 3. Extract clean non-leakage feature matrix
    X, y = get_feature_matrix_and_target(df)
    print(f"Features: {X.columns.tolist()}")

    # 4. Run Stratified 5-Fold Cross Validation
    cv_summary = run_stratified_cv(X, y, n_splits=CV_SPLITS, random_state=RANDOM_STATE)

    # 5. Train full model
    print("Training final model on complete dataset...")
    transformer, base_rf, calibrated_clf, feat_importances = train_full_model(X, y)

    # 6. Assemble artifact bundle
    model_bundle = {
        "model": calibrated_clf,
        "base_model": base_rf,
        "transformer": transformer,
        "feature_names_in": transformer.feature_names_in_,
        "feature_names_out": transformer.feature_names_out_,
        "training_ranges": transformer.training_ranges_,
        "cv_metrics": cv_summary,
        "feature_importances": feat_importances,
        "metadata": {
            "created_at": datetime.now().isoformat(),
            "training_samples": len(df),
            "target_column": "Machine failure",
            "random_state": RANDOM_STATE,
            "version": "1.0.0",
        },
    }

    # 7. Save Model Bundle
    print(f"Saving model bundle to: {MODEL_PATH}")
    joblib.dump(model_bundle, MODEL_PATH, compress=3)

    # 8. Save Metrics & Evaluation Results
    print(f"Saving evaluation metrics to: {METRICS_PATH}")
    with open(METRICS_PATH, "w") as f:
        json.dump(cv_summary, f, indent=2)

    with open(CONFUSION_MATRIX_PATH, "w") as f:
        json.dump(cv_summary["aggregate_confusion_matrix"], f, indent=2)

    with open(FEATURE_IMPORTANCE_PATH, "w") as f:
        json.dump(feat_importances, f, indent=2)

    # 9. Generate and Save Model Card
    print(f"Saving model card to: {MODEL_CARD_PATH}")
    model_card = generate_model_card(
        cv_results=cv_summary,
        dataset_summary=diag,
        feature_importances=feat_importances,
        training_ranges=transformer.training_ranges_,
    )
    with open(MODEL_CARD_PATH, "w", encoding="utf-8") as f:
        f.write(model_card)

    elapsed = time.time() - start_time
    print("=" * 70)
    print(f"Training pipeline completed successfully in {elapsed:.2f}s.")
    print("=" * 70)

    return {
        "cv_summary": cv_summary,
        "dataset_summary": diag,
        "feature_importances": feat_importances,
        "model_path": str(MODEL_PATH),
        "model_card_path": str(MODEL_CARD_PATH),
        "metrics_path": str(METRICS_PATH),
    }


if __name__ == "__main__":
    run_training_pipeline()
