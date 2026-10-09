"""
FleetGuard AI - Inference & Fleet Telemetry Integration Test Suite.
"""

import pytest

from ml.inference import FleetGuardPredictor


@pytest.fixture
def predictor() -> FleetGuardPredictor:
    """Initialize standard predictor."""
    return FleetGuardPredictor()


def test_predictor_loaded_or_mock(predictor):
    """Verify predictor initializes cleanly without exceptions."""
    assert predictor is not None
    assert predictor.training_ranges is not None


def test_vehicle_telemetry_to_ai4i_mapping(predictor):
    """Verify mapping vehicle sensor signals to AI4I domain inputs."""
    vehicle_telemetry = {
        "ambient_temp_c": 25.0,        # 25°C -> 298.15K
        "coolant_temp_c": 35.0,        # 35°C -> 308.15K
        "engine_rpm": 1600.0,
        "engine_torque_nm": 45.0,
        "operating_wear_min": 50.0,
        "vehicle_duty_type": "heavy",  # -> 'H'
    }

    mapped = predictor.map_vehicle_telemetry_to_ai4i(vehicle_telemetry)
    assert pytest.approx(mapped["Air temperature [K]"], rel=1e-3) == 298.15
    assert pytest.approx(mapped["Process temperature [K]"], rel=1e-3) == 308.15
    assert mapped["Rotational speed [rpm]"] == 1600.0
    assert mapped["Torque [Nm]"] == 45.0
    assert mapped["Tool wear [min]"] == 50.0
    assert mapped["Type"] == "H"


def test_inference_normal_in_range(predictor):
    """Verify normal vehicle telemetry operates in range."""
    normal_telemetry = {
        "ambient_temp_c": 27.0,
        "coolant_temp_c": 37.0,
        "engine_rpm": 1500.0,
        "engine_torque_nm": 40.0,
        "operating_wear_min": 30.0,
        "vehicle_duty_type": "medium",
    }

    res = predictor.predict(normal_telemetry, is_vehicle_telemetry=True)
    assert isinstance(res, dict)
    assert res["model_in_range"] is True
    assert len(res["out_of_range_warnings"]) == 0
    assert "failure_predicted" in res
    assert "failure_probability" in res
    assert "disclaimer" in res
    assert res["risk_level"] in ("LOW", "MEDIUM", "HIGH", "CRITICAL")


def test_inference_out_of_range_sets_flag_false(predictor):
    """
    CRITICAL TEST: Ensure model_in_range = False when telemetry exceeds supported training ranges.
    """
    abnormal_telemetry = {
        "ambient_temp_c": 120.0,       # Extreme 120°C -> 393K (outside ~295K-305K)
        "coolant_temp_c": 150.0,       # Extreme 150°C -> 423K
        "engine_rpm": 8500.0,          # Extreme RPM (outside 1100-2900 rpm)
        "engine_torque_nm": 350.0,     # Extreme torque (outside 3-80 Nm)
        "operating_wear_min": 1000.0,  # Extreme wear
        "vehicle_duty_type": "heavy",
    }

    res = predictor.predict(abnormal_telemetry, is_vehicle_telemetry=True)
    assert res["model_in_range"] is False
    assert len(res["out_of_range_warnings"]) > 0


def test_mock_mode_fallback():
    """Verify mock mode produces predictable heuristic outputs without model file."""
    mock_predictor = FleetGuardPredictor(force_mock_mode=True)
    assert mock_predictor.is_mock_mode is True

    res = mock_predictor.predict(
        {
            "Air temperature [K]": 298.1,
            "Process temperature [K]": 308.6,
            "Rotational speed [rpm]": 1500,
            "Torque [Nm]": 40.0,
            "Tool wear [min]": 10,
            "Type": "M",
        }
    )
    assert res["mode"] == "MOCK_MODE"
    assert "failure_predicted" in res
    assert isinstance(res["failure_probability"], float)
