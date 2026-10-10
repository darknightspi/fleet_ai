"""Contract checks for the Flask endpoints used by the React dashboard."""

import pytest

from app import app
from fleet_registry import hardware_registry


@pytest.fixture(autouse=True)
def clear_hardware_registry():
    hardware_registry.clear()
    yield
    hardware_registry.clear()


def test_health_endpoint_reports_model_state():
    response = app.test_client().get("/api/health")
    assert response.status_code == 200
    body = response.get_json()
    assert body["status"] == "healthy"
    assert isinstance(body["model_loaded"], bool)
    assert isinstance(body["mock_mode"], bool)


def test_fleet_endpoint_returns_seeded_vehicles_with_prediction_contract():
    response = app.test_client().get("/api/fleet")
    assert response.status_code == 200
    fleet = response.get_json()
    assert len(fleet) == 8
    assert [vehicle["id"] for vehicle in fleet] == [f"{number:03d}" for number in range(1, 9)]
    required = {
        "id", "source", "model", "duty", "ambient_temp_c", "coolant_temp_c", "engine_rpm",
        "engine_torque_nm", "operating_wear_min", "failure_predicted",
        "failure_probability", "risk_level", "model_in_range",
    }
    for vehicle in fleet:
        assert required <= vehicle.keys()
        assert vehicle["source"] == "Simulated"
        assert 0 <= vehicle["failure_probability"] <= 1
        assert vehicle["risk_level"] in {"LOW", "MEDIUM", "HIGH", "CRITICAL"}
        assert isinstance(vehicle["model_in_range"], bool)


def test_hardware_unit_registers_only_after_valid_telemetry_and_reuses_identity():
    client = app.test_client()
    body = {
        "device_id": "esp32:rc:alpha",
        "model": "RC car",
        "telemetry": {"speed_kmph": 12.5, "engine_rpm": 850},
    }

    rejected = client.post("/api/hardware/telemetry", json={
        "device_id": "esp32:rc:failed",
        "telemetry": {},
    })
    assert rejected.status_code == 400
    assert len(client.get("/api/fleet").get_json()) == 8

    registered = client.post("/api/hardware/telemetry", json=body)
    assert registered.status_code == 201
    assert registered.get_json()["unit"]["id"] == "101"
    assert registered.get_json()["unit"]["connectivity"] == "Online"

    updated = client.post("/api/hardware/telemetry", json={
        **body,
        "telemetry": {"speed_kmph": 14.0},
    })
    assert updated.status_code == 200
    assert updated.get_json()["unit"]["id"] == "101"
    assert updated.get_json()["unit"]["telemetry_seq"] == 2

    second = client.post("/api/hardware/telemetry", json={
        "device_id": "esp32:rc:bravo",
        "telemetry": {"speed_kmph": 8.0},
    })
    assert second.get_json()["unit"]["id"] == "102"
    fleet = client.get("/api/fleet").get_json()
    assert len(fleet) == 10
    assert [unit["id"] for unit in fleet[-2:]] == ["101", "102"]
    assert all(unit["source"] == "Hardware" for unit in fleet[-2:])
    assert fleet[-2]["failure_probability"] is None
    assert fleet[-2]["risk_level"] == "UNKNOWN"


def test_hardware_disconnect_retains_record_and_last_telemetry():
    client = app.test_client()
    registered = client.post("/api/hardware/telemetry", json={
        "device_id": "esp32:rc:alpha",
        "telemetry": {"speed_kmph": 12.5},
    })
    unit_id = registered.get_json()["unit"]["id"]

    disconnected = client.post("/api/hardware/disconnect", json={"device_id": "esp32:rc:alpha"})
    assert disconnected.status_code == 200
    fleet_unit = next(
        unit for unit in client.get("/api/fleet").get_json() if unit["id"] == unit_id
    )
    assert fleet_unit["connectivity"] == "Offline"
    assert fleet_unit["telemetry"] == {"speed_kmph": 12.5}
    assert client.post("/api/hardware/disconnect", json={"device_id": "unknown"}).status_code == 404

    reconnected = client.post("/api/hardware/telemetry", json={
        "device_id": "esp32:rc:alpha",
        "telemetry": {"speed_kmph": 13.0},
    })
    assert reconnected.status_code == 200
    assert reconnected.get_json()["unit"]["id"] == unit_id
    assert len(client.get("/api/fleet").get_json()) == 9


def test_hardware_session_becomes_stale_after_telemetry_timeout():
    from datetime import datetime, timedelta, timezone

    client = app.test_client()
    client.post("/api/hardware/telemetry", json={
        "device_id": "esp32:rc:alpha",
        "telemetry": {"speed_kmph": 12.5},
    })
    old_time = datetime.now(timezone.utc) + timedelta(seconds=61)
    unit = hardware_registry.list_units(now=old_time)[0]
    assert unit["connectivity"] == "Stale"


def test_metrics_endpoint_has_stable_top_level_contract():
    response = app.test_client().get("/api/metrics")
    assert response.status_code == 200
    assert {"cv_metrics", "feature_importances", "model_card_available"} <= response.get_json().keys()
