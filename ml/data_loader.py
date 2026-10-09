"""
FleetGuard AI - Data Loader & Dataset Validator.

Loads, validates, and inspects the UCI AI4I 2020 Predictive Maintenance dataset.
Guarantees target leakage prevention by stripping identifier and failure mode columns.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

import pandas as pd

from ml.config import (
    DATASET_PATH,
    LEAKAGE_COLUMNS,
    RAW_CATEGORICAL_FEATURES,
    RAW_FEATURE_COLUMNS,
    RAW_NUMERICAL_FEATURES,
    REPO_ROOT,
    TARGET_COLUMN,
)


def resolve_dataset_path(custom_path: Optional[str | Path] = None) -> Path:
    """
    Resolve dataset path relative to repository root.

    Args:
        custom_path: Optional custom relative or absolute path.

    Returns:
        Resolved absolute Path.

    Raises:
        FileNotFoundError: If the CSV file does not exist at resolved path.
    """
    if custom_path is None:
        target_path = DATASET_PATH
    else:
        p = Path(custom_path)
        target_path = p if p.is_absolute() else (REPO_ROOT / p)

    resolved = target_path.resolve()
    if not resolved.exists():
        raise FileNotFoundError(
            f"AI4I dataset not found at '{resolved}'.\n"
            f"Expected location: '{DATASET_PATH}'.\n"
            f"Please verify that 'dataset/ai4i2020.csv' exists relative to repo root '{REPO_ROOT}'."
        )
    return resolved


def validate_dataset(df: pd.DataFrame) -> Dict[str, Any]:
    """
    Validate the structure, schema, and content of the AI4I dataset.

    Args:
        df: Input pandas DataFrame.

    Returns:
        Dictionary containing dataset diagnostics and verification metrics.

    Raises:
        ValueError: If required columns are missing, data types are malformed,
                    or target distribution is invalid.
    """
    if df.empty:
        raise ValueError("AI4I dataset is empty (0 rows).")

    # Required columns check
    expected_all_cols = (
        ["UDI", "Product ID", "Type"]
        + RAW_NUMERICAL_FEATURES
        + [TARGET_COLUMN, "TWF", "HDF", "PWF", "OSF", "RNF"]
    )
    missing_cols = [col for col in expected_all_cols if col not in df.columns]
    if missing_cols:
        raise ValueError(
            f"AI4I dataset is missing required columns: {missing_cols}.\n"
            f"Available columns: {df.columns.tolist()}"
        )

    # Check target column
    if TARGET_COLUMN not in df.columns:
        raise ValueError(f"Target column '{TARGET_COLUMN}' is missing from dataset.")

    unique_targets = set(df[TARGET_COLUMN].dropna().unique())
    if not unique_targets.issubset({0, 1}):
        raise ValueError(
            f"Target column '{TARGET_COLUMN}' must be binary (0 or 1), found: {unique_targets}"
        )

    # Missing values check
    missing_counts = df.isnull().sum().to_dict()
    total_missing = sum(missing_counts.values())

    # Duplicate rows check
    duplicate_count = int(df.duplicated().sum())

    # Target class distribution
    class_counts = df[TARGET_COLUMN].value_counts().to_dict()
    pos_count = class_counts.get(1, 0)
    neg_count = class_counts.get(0, 0)
    pos_ratio = pos_count / len(df) if len(df) > 0 else 0.0

    # Failure mode statistics
    failure_modes = ["TWF", "HDF", "PWF", "OSF", "RNF"]
    failure_mode_counts = {
        col: int(df[col].sum()) for col in failure_modes if col in df.columns
    }

    # Data types check
    for num_col in RAW_NUMERICAL_FEATURES:
        if not pd.api.types.is_numeric_dtype(df[num_col]):
            raise ValueError(
                f"Column '{num_col}' expected numeric type, got {df[num_col].dtype}"
            )

    valid_types = {"L", "M", "H"}
    observed_types = set(df["Type"].dropna().unique())
    if not observed_types.issubset(valid_types):
        raise ValueError(
            f"Column 'Type' contains invalid product types: {observed_types - valid_types}"
        )

    summary = {
        "shape": df.shape,
        "rows": len(df),
        "columns": df.columns.tolist(),
        "dtypes": {col: str(dtype) for col, dtype in df.dtypes.items()},
        "missing_values_total": total_missing,
        "missing_values_per_col": missing_counts,
        "duplicate_rows": duplicate_count,
        "target_distribution": {
            "negative_0": neg_count,
            "positive_1": pos_count,
            "positive_ratio": round(pos_ratio, 4),
        },
        "failure_mode_breakdown": failure_mode_counts,
        "leakage_columns_detected": [col for col in LEAKAGE_COLUMNS if col in df.columns],
    }

    return summary


def load_dataset(custom_path: Optional[str | Path] = None) -> pd.DataFrame:
    """
    Load dataset from CSV, resolving path relative to repo root, and validate it.

    Args:
        custom_path: Optional custom path.

    Returns:
        Validated pandas DataFrame.
    """
    resolved_path = resolve_dataset_path(custom_path)
    try:
        df = pd.read_csv(resolved_path)
    except Exception as e:
        raise ValueError(f"Failed to read CSV at '{resolved_path}': {e}") from e

    # Perform validation
    validate_dataset(df)
    return df


def get_feature_matrix_and_target(
    df: pd.DataFrame,
) -> Tuple[pd.DataFrame, pd.Series]:
    """
    Extract features X and target y, strictly removing leakage columns.

    Args:
        df: Raw validated dataset DataFrame.

    Returns:
        Tuple of (X, y) where X contains only valid non-leakage raw features.
    """
    if TARGET_COLUMN not in df.columns:
        raise ValueError(f"Target column '{TARGET_COLUMN}' not found in dataframe.")

    y = df[TARGET_COLUMN].copy()

    # Drop target and all known leakage/identifier columns
    cols_to_drop = [TARGET_COLUMN] + [
        col for col in LEAKAGE_COLUMNS if col in df.columns
    ]
    X = df.drop(columns=cols_to_drop).copy()

    # Ensure only expected raw features remain in correct order
    remaining_cols = X.columns.tolist()
    expected_cols = RAW_FEATURE_COLUMNS
    missing_raw = [c for c in expected_cols if c not in remaining_cols]
    if missing_raw:
        raise ValueError(f"Feature matrix is missing raw features: {missing_raw}")

    # Retain strictly the expected raw features
    X = X[expected_cols].copy()
    return X, y


def print_dataset_diagnostics(summary: Dict[str, Any]) -> None:
    """Format and print dataset diagnostics to standard output."""
    print("=" * 60)
    print("FLEETGUARD AI - AI4I DATASET VERIFICATION REPORT")
    print("=" * 60)
    print(f"Shape: {summary['shape'][0]} rows x {summary['shape'][1]} columns")
    print(f"Total Missing Values: {summary['missing_values_total']}")
    print(f"Duplicate Rows: {summary['duplicate_rows']}")
    print(
        f"Target Class Distribution (Machine failure): "
        f"0: {summary['target_distribution']['negative_0']} ({100 - summary['target_distribution']['positive_ratio']*100:.2f}%), "
        f"1: {summary['target_distribution']['positive_1']} ({summary['target_distribution']['positive_ratio']*100:.2f}%)"
    )
    print("Failure Mode Breakdown:")
    for mode, count in summary["failure_mode_breakdown"].items():
        print(f"  - {mode}: {count}")
    print(f"Leakage columns excluded from features: {summary['leakage_columns_detected']}")
    print("=" * 60)


if __name__ == "__main__":
    df_raw = load_dataset()
    diag = validate_dataset(df_raw)
    print_dataset_diagnostics(diag)
    X_mat, y_vec = get_feature_matrix_and_target(df_raw)
    print(f"Clean Feature Matrix X shape: {X_mat.shape}")
    print(f"Target vector y shape: {y_vec.shape}")
