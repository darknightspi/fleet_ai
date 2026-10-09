"""Contract checks for the Flask endpoints used by the React dashboard."""

from app import app


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
    required = {
        "id", "model", "duty", "ambient_temp_c", "coolant_temp_c", "engine_rpm",
        "engine_torque_nm", "operating_wear_min", "failure_predicted",
        "failure_probability", "risk_level", "model_in_range",
    }
    for vehicle in fleet:
        assert required <= vehicle.keys()
        assert 0 <= vehicle["failure_probability"] <= 1
        assert vehicle["risk_level"] in {"LOW", "MEDIUM", "HIGH", "CRITICAL"}
        assert isinstance(vehicle["model_in_range"], bool)


def test_metrics_endpoint_has_stable_top_level_contract():
    response = app.test_client().get("/api/metrics")
    assert response.status_code == 200
    assert {"cv_metrics", "feature_importances", "model_card_available"} <= response.get_json().keys()
