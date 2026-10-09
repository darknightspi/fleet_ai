"""
FleetGuard AI - Feature Engineering Test Suite.
"""

import numpy as np
import pandas as pd
import pytest

from ml.config import ENGINEERED_FEATURE_COLUMNS, RAW_FEATURE_COLUMNS
from ml.feature_engineering import AI4IFeatureTransformer


@pytest.fixture
def sample_raw_data() -> pd.DataFrame:
    """Provide standard sample row."""
    return pd.DataFrame(
        [
            {
                "Type": "M",
                "Air temperature [K]": 298.1,
                "Process temperature [K]": 308.6,
                "Rotational speed [rpm]": 1551,
                "Torque [Nm]": 42.8,
                "Tool wear [min]": 10,
            },
            {
                "Type": "L",
                "Air temperature [K]": 300.0,
                "Process temperature [K]": 310.0,
                "Rotational speed [rpm]": 1400,
                "Torque [Nm]": 50.0,
                "Tool wear [min]": 200,
            },
        ]
    )


def test_feature_transformer_computations(sample_raw_data):
    """Verify mathematical transformations and exact column preservation."""
    transformer = AI4IFeatureTransformer()
    transformed = transformer.fit_transform(sample_raw_data)

    assert list(transformed.columns) == ENGINEERED_FEATURE_COLUMNS
    assert transformer.is_fitted_

    # Check sample 0 transformations
    row0 = transformed.iloc[0]
    assert row0["Type_M"] == 1.0
    assert row0["Type_L"] == 0.0
    assert row0["Type_H"] == 0.0

    # Temp diff = 308.6 - 298.1 = 10.5
    assert pytest.approx(row0["Temp_Diff_K"], rel=1e-3) == 10.5

    # Power = 1551 * 42.8 * (2 * pi / 60)
    expected_power = 1551 * 42.8 * (2 * np.pi / 60.0)
    assert pytest.approx(row0["Power_W"], rel=1e-3) == expected_power

    # Tool wear * torque = 10 * 42.8 = 428.0
    assert pytest.approx(row0["Tool_Wear_Torque"], rel=1e-3) == 428.0


def test_feature_transformer_order_preservation(sample_raw_data):
    """Verify that feature ordering is guaranteed across transforms."""
    transformer = AI4IFeatureTransformer()
    transformer.fit(sample_raw_data)

    trans1 = transformer.transform(sample_raw_data)
    trans2 = transformer.transform(sample_raw_data.iloc[::-1])

    assert list(trans1.columns) == list(trans2.columns)
    assert list(trans1.columns) == ENGINEERED_FEATURE_COLUMNS


def test_training_ranges_and_boundary_checks(sample_raw_data):
    """Verify training range metadata tracking and out-of-range flagging."""
    transformer = AI4IFeatureTransformer()
    transformer.fit(sample_raw_data)

    assert len(transformer.training_ranges_) > 0
    assert "Torque [Nm]" in transformer.training_ranges_

    # In-range check
    in_range, warnings = transformer.check_input_ranges(sample_raw_data.iloc[0:1])
    assert in_range
    assert len(warnings) == 0

    # Out-of-range check (extreme RPM = 8000)
    extreme_sample = sample_raw_data.iloc[0:1].copy()
    extreme_sample["Rotational speed [rpm]"] = 8000
    in_range_ext, warnings_ext = transformer.check_input_ranges(extreme_sample)
    assert not in_range_ext
    assert len(warnings_ext) > 0
    assert any("Rotational speed [rpm]" in w["feature"] for w in warnings_ext)
