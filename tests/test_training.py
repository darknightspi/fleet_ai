"""
FleetGuard AI - Model Training & Artifact Validation Test Suite.
"""

from pathlib import Path

import joblib
import pytest

from ml.config import CONFUSION_MATRIX_PATH, FEATURE_IMPORTANCE_PATH, METRICS_PATH, MODEL_CARD_PATH, MODEL_PATH
from ml.data_loader import get_feature_matrix_and_target, load_dataset
from ml.train import run_stratified_cv


def test_artifacts_exist():
    """Verify all training artifacts and reports exist at the expected locations."""
    assert MODEL_PATH.exists(), f"Missing model artifact: {MODEL_PATH}"
    assert MODEL_CARD_PATH.exists(), f"Missing model card: {MODEL_CARD_PATH}"
    assert METRICS_PATH.exists(), f"Missing metrics json: {METRICS_PATH}"
    assert CONFUSION_MATRIX_PATH.exists(), f"Missing confusion matrix json: {CONFUSION_MATRIX_PATH}"
    assert FEATURE_IMPORTANCE_PATH.exists(), f"Missing feature importance json: {FEATURE_IMPORTANCE_PATH}"


def test_model_bundle_integrity():
    """Verify serialized model bundle contains all required components."""
    bundle = joblib.load(MODEL_PATH)
    required_keys = [
        "model",
        "transformer",
        "feature_names_in",
        "feature_names_out",
        "training_ranges",
        "cv_metrics",
        "metadata",
    ]
    for key in required_keys:
        assert key in bundle, f"Key '{key}' missing from model bundle"

    assert bundle["metadata"]["target_column"] == "Machine failure"
    assert len(bundle["feature_names_out"]) == 12


def test_stratified_cv_execution_and_metrics():
    """Verify cross-validation executes and achieves expected metric bounds."""
    df = load_dataset()
    # Test on stratified subset for fast verification
    df_sample = df.sample(n=1000, random_state=42)
    X, y = get_feature_matrix_and_target(df_sample)

    results = run_stratified_cv(X, y, n_splits=3, random_state=42)
    assert results["n_splits"] == 3
    assert "raw_rf_aggregated" in results
    assert "calibrated_rf_aggregated" in results

    agg = results["raw_rf_aggregated"]
    assert agg["roc_auc"]["mean"] > 0.85
