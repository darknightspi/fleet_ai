"""
FleetGuard AI - Feature Engineering & Transformation Pipeline.

Implements domain-specific transformations for the AI4I 2020 dataset:
1. One-hot encoding of product quality Type (H, L, M)
2. Temperature Difference (Process Temp - Air Temp)
3. Power (Rotational Speed * Torque * 2*pi / 60)
4. Tool Wear Strain (Torque * Tool Wear)
5. Torque-Speed Ratio

Preserves exact feature order and computes training range metadata for runtime validation.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple, Union

import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin

from ml.config import (
    ENGINEERED_FEATURE_COLUMNS,
    RAW_CATEGORICAL_FEATURES,
    RAW_FEATURE_COLUMNS,
    RAW_NUMERICAL_FEATURES,
)


class AI4IFeatureTransformer(BaseEstimator, TransformerMixin):
    """
    Deterministic feature transformer for AI4I predictive maintenance data.
    Computes physics-grounded degradation features and tracks feature ranges.
    """

    def __init__(self):
        self.feature_names_in_: List[str] = RAW_FEATURE_COLUMNS.copy()
        self.feature_names_out_: List[str] = ENGINEERED_FEATURE_COLUMNS.copy()
        self.training_ranges_: Dict[str, Dict[str, float]] = {}
        self.is_fitted_: bool = False

    def _compute_engineered_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Apply mathematical and domain transformations."""
        out = pd.DataFrame(index=df.index)

        # One-hot encoding for Type with fixed deterministic columns
        type_col = df["Type"].astype(str).str.upper()
        out["Type_H"] = (type_col == "H").astype(float)
        out["Type_L"] = (type_col == "L").astype(float)
        out["Type_M"] = (type_col == "M").astype(float)

        # Base numerical features
        for col in RAW_NUMERICAL_FEATURES:
            out[col] = df[col].astype(float)

        # 1. Temperature difference (Heat Dissipation Failure indicator)
        out["Temp_Diff_K"] = (
            out["Process temperature [K]"] - out["Air temperature [K]"]
        )

        # 2. Power in Watts: P = Torque (N*m) * (rpm * 2*pi/60)
        # Power Failure (PWF) triggers outside ~3500W to 9000W
        out["Power_W"] = (
            out["Rotational speed [rpm]"] * out["Torque [Nm]"] * (2 * np.pi / 60.0)
        )

        # 3. Tool wear torque interaction (Overstrain Failure indicator)
        out["Tool_Wear_Torque"] = out["Torque [Nm]"] * out["Tool wear [min]"]

        # 4. Torque to Speed ratio
        out["Torque_Speed_Ratio"] = out["Torque [Nm]"] / (
            out["Rotational speed [rpm]"] + 1e-6
        )

        # Ensure exact feature order
        return out[self.feature_names_out_]

    def fit(self, X: pd.DataFrame, y: Optional[Any] = None) -> "AI4IFeatureTransformer":
        """
        Fit the transformer and compute statistical training bounds for all features.

        Args:
            X: Input dataframe with raw features.
            y: Ignored (present for scikit-learn API compatibility).

        Returns:
            Fitted transformer instance.
        """
        if isinstance(X, dict):
            X = pd.DataFrame([X])
        elif not isinstance(X, pd.DataFrame):
            X = pd.DataFrame(X, columns=self.feature_names_in_)

        # Verify required raw features
        missing = [col for col in self.feature_names_in_ if col not in X.columns]
        if missing:
            raise ValueError(f"Input data is missing raw feature columns: {missing}")

        transformed = self._compute_engineered_features(X)

        # Record training ranges for both raw numerical features and engineered features
        self.training_ranges_ = {}
        for col in transformed.columns:
            series = transformed[col].dropna()
            self.training_ranges_[col] = {
                "min": float(series.min()),
                "max": float(series.max()),
                "mean": float(series.mean()),
                "std": float(series.std()),
                "p01": float(series.quantile(0.01)),
                "p99": float(series.quantile(0.99)),
            }

        self.is_fitted_ = True
        return self

    def transform(self, X: Union[pd.DataFrame, Dict[str, Any]]) -> pd.DataFrame:
        """
        Transform raw feature inputs into engineered feature matrix.

        Args:
            X: DataFrame or dict of raw features.

        Returns:
            Transformed DataFrame preserving feature_names_out_ ordering.
        """
        if not self.is_fitted_:
            raise RuntimeError("AI4IFeatureTransformer must be fitted before transforming data.")

        if isinstance(X, dict):
            X_df = pd.DataFrame([X])
        elif isinstance(X, pd.DataFrame):
            X_df = X.copy()
        else:
            X_df = pd.DataFrame(X, columns=self.feature_names_in_)

        missing = [col for col in self.feature_names_in_ if col not in X_df.columns]
        if missing:
            raise ValueError(f"Input data is missing raw feature columns: {missing}")

        return self._compute_engineered_features(X_df)

    def check_input_ranges(
        self,
        X: Union[pd.DataFrame, Dict[str, Any]],
        tolerance_factor: float = 0.05,
    ) -> Tuple[bool, List[Dict[str, Any]]]:
        """
        Validate whether input features fall within observed training distribution ranges.

        Args:
            X: Input DataFrame or single sample dict.
            tolerance_factor: Allowed fraction beyond absolute min/max (default 5%).

        Returns:
            Tuple of (is_in_range: bool, warnings: List[Dict]).
        """
        if not self.is_fitted_:
            raise RuntimeError("Transformer must be fitted to check ranges.")

        if isinstance(X, dict):
            X_df = pd.DataFrame([X])
        else:
            X_df = X.copy()

        transformed = self.transform(X_df)
        all_in_range = True
        warnings: List[Dict[str, Any]] = []

        # Numerical features to validate bounds on
        check_cols = [
            "Air temperature [K]",
            "Process temperature [K]",
            "Rotational speed [rpm]",
            "Torque [Nm]",
            "Tool wear [min]",
            "Power_W",
            "Temp_Diff_K",
        ]

        for _, row in transformed.iterrows():
            sample_warnings = []
            for col in check_cols:
                if col in self.training_ranges_:
                    stat = self.training_ranges_[col]
                    val = float(row[col])
                    span = stat["max"] - stat["min"]
                    lower_bound = stat["min"] - (span * tolerance_factor)
                    upper_bound = stat["max"] + (span * tolerance_factor)

                    if val < lower_bound or val > upper_bound:
                        all_in_range = False
                        sample_warnings.append(
                            {
                                "feature": col,
                                "value": round(val, 2),
                                "training_min": round(stat["min"], 2),
                                "training_max": round(stat["max"], 2),
                                "allowed_min": round(lower_bound, 2),
                                "allowed_max": round(upper_bound, 2),
                                "message": f"Feature '{col}' value {val:.2f} is outside supported range [{stat['min']:.2f}, {stat['max']:.2f}].",
                            }
                        )
            if sample_warnings:
                warnings.extend(sample_warnings)

        return all_in_range, warnings

    def get_feature_names_out(self, input_features: Optional[List[str]] = None) -> List[str]:
        """Scikit-learn API compatibility for output feature names."""
        return self.feature_names_out_.copy()
