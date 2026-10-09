"""
FleetGuard AI - Data Loader & Validation Test Suite.
"""

from pathlib import Path

import pandas as pd
import pytest

from ml.config import DATASET_PATH, LEAKAGE_COLUMNS, RAW_FEATURE_COLUMNS, REPO_ROOT, TARGET_COLUMN
from ml.data_loader import (
    get_feature_matrix_and_target,
    load_dataset,
    resolve_dataset_path,
    validate_dataset,
)


def test_resolve_dataset_path_exists():
    """Verify that dataset path resolves relative to repo root and exists."""
    path = resolve_dataset_path()
    assert path.exists(), f"Dataset not found at {path}"
    assert path.name == "ai4i2020.csv"
    assert "dataset" in str(path)


def test_resolve_dataset_path_missing_raises():
    """Verify clear error message when invalid path is requested."""
    with pytest.raises(FileNotFoundError) as exc_info:
        resolve_dataset_path("non_existent_folder/ai4i2020.csv")
    assert "AI4I dataset not found" in str(exc_info.value)


def test_load_and_validate_dataset_schema():
    """Verify loaded dataframe adheres to AI4I dataset schema."""
    df = load_dataset()
    assert isinstance(df, pd.DataFrame)
    assert len(df) == 10000
    assert df.shape[1] == 14

    summary = validate_dataset(df)
    assert summary["rows"] == 10000
    assert summary["missing_values_total"] == 0
    assert summary["duplicate_rows"] == 0
    assert summary["target_distribution"]["positive_1"] == 339
    assert summary["target_distribution"]["negative_0"] == 9661


def test_target_leakage_prevention():
    """
    CRITICAL TEST: Ensure feature matrix X excludes:
    - Identifiers: UDI, Product ID
    - Component failure modes: TWF, HDF, PWF, OSF, RNF
    - Target: Machine failure
    """
    df = load_dataset()
    X, y = get_feature_matrix_and_target(df)

    assert TARGET_COLUMN not in X.columns
    for leakage_col in LEAKAGE_COLUMNS:
        assert leakage_col not in X.columns, f"Target leakage! {leakage_col} found in feature matrix X."

    assert list(X.columns) == RAW_FEATURE_COLUMNS
    assert len(y) == len(df)
    assert set(y.unique()) == {0, 1}


def test_validate_dataset_malformed_raises():
    """Verify ValueError is raised when dataset is malformed or missing target."""
    bad_df = pd.DataFrame({"colA": [1, 2], "colB": [3, 4]})
    with pytest.raises(ValueError) as exc_info:
        validate_dataset(bad_df)
    assert "missing required columns" in str(exc_info.value)
