"""
FleetGuard AI - Time Series Degradation Test Suite.
"""

import pytest

from ml.timeseries import SCENARIO_CONFIGS, generate_fleet_timeseries


def test_generate_fleet_timeseries_all_scenarios():
    """Verify all defined degradation scenarios generate valid 61 time steps."""
    for scenario_key in SCENARIO_CONFIGS.keys():
        res = generate_fleet_timeseries(scenario=scenario_key, vehicle_id="001")
        assert res["scenario"] == scenario_key
        assert len(res["time_steps"]) == 61  # 0 to 60 minutes inclusive
        assert res["vehicle_id"] == "001"

        step0 = res["time_steps"][0]
        assert step0["minute"] == 0
        assert "telemetry" in step0
        assert "physics" in step0
        assert "failure_probability" in step0
        assert "risk_level" in step0
        assert isinstance(step0["failure_probability"], float)
        assert 0.0 <= step0["failure_probability"] <= 1.0


def test_heat_dissipation_transition_normal_to_failure():
    """Verify heat dissipation scenario transitions from healthy normal state to abnormal failure state."""
    res = generate_fleet_timeseries(scenario="heat_dissipation", vehicle_id="003")

    # Initial state (0 to 15 min): Low risk
    step0 = res["time_steps"][0]
    assert step0["risk_level"] == "LOW"
    assert step0["failure_probability"] < 0.15

    # Degraded final state (45 to 60 min): High or Critical failure risk
    step55 = res["time_steps"][55]
    assert step55["failure_probability"] > 0.70
    assert step55["risk_level"] in ("HIGH", "CRITICAL")
    assert step55["failure_predicted"] is True

    # Check that anomaly events are recorded
    assert len(res["anomaly_events"]) >= 1


def test_normal_cruise_maintains_healthy_state():
    """Verify normal cruise remains low failure risk throughout all 60 minutes."""
    res = generate_fleet_timeseries(scenario="normal_cruise", vehicle_id="001")
    for step in res["time_steps"]:
        assert step["risk_level"] == "LOW"
        assert step["failure_probability"] < 0.15
        assert step["failure_predicted"] is False
