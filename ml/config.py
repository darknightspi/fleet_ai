"""
FleetGuard AI - Machine Learning Configuration.

Centralized configuration for dataset paths, feature sets, target leakage
prevention, training hyperparameters, and vehicle-to-AI4I mapping rules.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List

# Repository Root Resolution
REPO_ROOT: Path = Path(__file__).resolve().parent.parent

# Dataset Configuration
# Strict path resolution relative to repository root
DATASET_RELATIVE_PATH: Path = Path("dataset") / "ai4i2020.csv"
DATASET_PATH: Path = REPO_ROOT / DATASET_RELATIVE_PATH

# Model & Artifact Output Paths
MODELS_DIR: Path = REPO_ROOT / "ml" / "models"
MODEL_PATH: Path = MODELS_DIR / "failure_clf.joblib"
MODEL_CARD_PATH: Path = MODELS_DIR / "model_card.md"

EVALUATION_DIR: Path = REPO_ROOT / "evaluation" / "results"
METRICS_PATH: Path = EVALUATION_DIR / "metrics.json"
CONFUSION_MATRIX_PATH: Path = EVALUATION_DIR / "confusion_matrix.json"
FEATURE_IMPORTANCE_PATH: Path = EVALUATION_DIR / "feature_importance.json"

# Column Definitions
TARGET_COLUMN: str = "Machine failure"

# Leakage columns that MUST NEVER be fed into the model as input features
LEAKAGE_COLUMNS: List[str] = [
    "UDI",
    "Product ID",
    "TWF",  # Tool Wear Failure mode
    "HDF",  # Heat Dissipation Failure mode
    "PWF",  # Power Failure mode
    "OSF",  # Overstrain Failure mode
    "RNF",  # Random Failure mode
]

# Raw features from dataset/ai4i2020.csv
RAW_NUMERICAL_FEATURES: List[str] = [
    "Air temperature [K]",
    "Process temperature [K]",
    "Rotational speed [rpm]",
    "Torque [Nm]",
    "Tool wear [min]",
]

RAW_CATEGORICAL_FEATURES: List[str] = [
    "Type",
]

RAW_FEATURE_COLUMNS: List[str] = RAW_CATEGORICAL_FEATURES + RAW_NUMERICAL_FEATURES

# Engineered feature names produced by the transformer
ENGINEERED_FEATURE_COLUMNS: List[str] = [
    "Type_H",
    "Type_L",
    "Type_M",
    "Air temperature [K]",
    "Process temperature [K]",
    "Rotational speed [rpm]",
    "Torque [Nm]",
    "Tool wear [min]",
    "Temp_Diff_K",
    "Power_W",
    "Tool_Wear_Torque",
    "Torque_Speed_Ratio",
]

# Random state for reproducible training & CV
RANDOM_STATE: int = 42
CV_SPLITS: int = 5

# Baseline Random Forest Hyperparameters
RF_HYPERPARAMS: Dict = {
    "n_estimators": 150,
    "max_depth": 12,
    "min_samples_split": 5,
    "min_samples_leaf": 2,
    "class_weight": "balanced",
    "random_state": RANDOM_STATE,
    "n_jobs": -1,
}

# Supported Vehicle Telemetry to AI4I Mapping Definitions
# Vehicle telemetry features mapped to corresponding AI4I measurements
VEHICLE_TO_AI4I_MAPPING: Dict[str, str] = {
    "ambient_temp_c": "Air temperature [K]",
    "coolant_temp_c": "Process temperature [K]",
    "engine_rpm": "Rotational speed [rpm]",
    "engine_torque_nm": "Torque [Nm]",
    "operating_wear_min": "Tool wear [min]",
    "vehicle_duty_type": "Type",
}

# Physical bounds for sanity checking
AI4I_TRAINING_RANGES_DEFAULT: Dict[str, Dict[str, float]] = {
    "Air temperature [K]": {"min": 295.0, "max": 305.0},
    "Process temperature [K]": {"min": 305.0, "max": 315.0},
    "Rotational speed [rpm]": {"min": 1100.0, "max": 2900.0},
    "Torque [Nm]": {"min": 3.0, "max": 80.0},
    "Tool wear [min]": {"min": 0.0, "max": 260.0},
}
