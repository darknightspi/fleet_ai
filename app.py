"""
FleetGuard AI - Application Server & REST API.

Provides:
- Web dashboard interface for live telemetry simulation & fleet monitoring
- REST API for predictive maintenance inference
- Mock mode fallback when trained artifacts are absent
- Model evaluation & feature importance endpoints
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

from flask import Flask, jsonify, render_template, request

from ml.config import (
    FEATURE_IMPORTANCE_PATH,
    METRICS_PATH,
    MODEL_PATH,
    REPO_ROOT,
)
from ml.inference import FleetGuardPredictor

app = Flask(
    __name__,
    template_folder=str(REPO_ROOT / "templates"),
    static_folder=str(REPO_ROOT / "static"),
)

# Initialize predictor
predictor = FleetGuardPredictor(model_path=MODEL_PATH)

# Simulated Fleet Data
SIMULATED_FLEET = [
    {
        "id": "FL-101",
        "model": "Freightliner Cascadia",
        "duty": "heavy",
        "ambient_temp_c": 26.0,
        "coolant_temp_c": 36.2,
        "engine_rpm": 1520,
        "engine_torque_nm": 42.5,
        "operating_wear_min": 50,
    },
    {
        "id": "FL-102",
        "model": "Kenworth T680",
        "duty": "medium",
        "ambient_temp_c": 28.5,
        "coolant_temp_c": 38.0,
        "engine_rpm": 1560,
        "engine_torque_nm": 44.0,
        "operating_wear_min": 90,
    },
    {
        "id": "FL-103",
        "model": "Volvo VNL 860",
        "duty": "heavy",
        "ambient_temp_c": 31.0,
        "coolant_temp_c": 37.2,
        "engine_rpm": 1310,
        "engine_torque_nm": 50.0,
        "operating_wear_min": 120,
    },
    {
        "id": "FL-104",
        "model": "Peterbilt 579",
        "duty": "medium",
        "ambient_temp_c": 25.0,
        "coolant_temp_c": 35.0,
        "engine_rpm": 1480,
        "engine_torque_nm": 40.0,
        "operating_wear_min": 30,
    },
    {
        "id": "FL-105",
        "model": "Mack Anthem",
        "duty": "heavy",
        "ambient_temp_c": 27.0,
        "coolant_temp_c": 38.5,
        "engine_rpm": 2800,
        "engine_torque_nm": 72.0,
        "operating_wear_min": 160,
    },
    {
        "id": "FL-106",
        "model": "International LT",
        "duty": "light",
        "ambient_temp_c": 24.5,
        "coolant_temp_c": 34.8,
        "engine_rpm": 1490,
        "engine_torque_nm": 38.0,
        "operating_wear_min": 75,
    },
    {
        "id": "FL-107",
        "model": "Western Star 49X",
        "duty": "heavy",
        "ambient_temp_c": 28.0,
        "coolant_temp_c": 38.2,
        "engine_rpm": 1410,
        "engine_torque_nm": 66.0,
        "operating_wear_min": 220,
    },
    {
        "id": "FL-108",
        "model": "Kenworth W990",
        "duty": "medium",
        "ambient_temp_c": 25.5,
        "coolant_temp_c": 36.0,
        "engine_rpm": 1530,
        "engine_torque_nm": 43.0,
        "operating_wear_min": 60,
    },
]


@app.route("/")
def index():
    """Render main dashboard."""
    return render_template("index.html")


@app.route("/api/health", methods=["GET"])
def health():
    """Health and model readiness check."""
    return jsonify(
        {
            "status": "healthy",
            "model_loaded": predictor.model is not None,
            "mock_mode": predictor.is_mock_mode,
            "artifact_path": str(MODEL_PATH),
        }
    )


@app.route("/api/predict", methods=["POST"])
def predict():
    """Run prediction on vehicle telemetry or AI4I features."""
    data = request.get_json(force=True) or {}
    force_mock = data.pop("force_mock", False)

    # Use instance or temporary mock instance
    active_predictor = FleetGuardPredictor(force_mock_mode=True) if force_mock else predictor
    result = active_predictor.predict(data, is_vehicle_telemetry=True)
    return jsonify(result)


@app.route("/api/fleet", methods=["GET"])
def get_fleet():
    """Return simulated fleet with real-time risk predictions."""
    fleet_with_preds = []
    for truck in SIMULATED_FLEET:
        pred = predictor.predict(truck, is_vehicle_telemetry=True)
        truck_entry = truck.copy()
        truck_entry["failure_predicted"] = pred["failure_predicted"]
        truck_entry["failure_probability"] = pred["failure_probability"]
        truck_entry["risk_level"] = pred["risk_level"]
        truck_entry["model_in_range"] = pred["model_in_range"]
        fleet_with_preds.append(truck_entry)
    return jsonify(fleet_with_preds)


@app.route("/api/metrics", methods=["GET"])
def get_metrics():
    """Return model cross-validation results and feature importances."""
    cv_metrics = {}
    feat_importances = {}

    if METRICS_PATH.exists():
        with open(METRICS_PATH, "r") as f:
            cv_metrics = json.load(f)

    if FEATURE_IMPORTANCE_PATH.exists():
        with open(FEATURE_IMPORTANCE_PATH, "r") as f:
            feat_importances = json.load(f)

    return jsonify(
        {
            "cv_metrics": cv_metrics,
            "feature_importances": feat_importances,
            "model_card_available": (REPO_ROOT / "ml" / "models" / "model_card.md").exists(),
        }
    )


from ml.timeseries import generate_fleet_timeseries


@app.route("/api/timeseries", methods=["GET"])
def get_timeseries():
    """Return 60-minute time-series telemetry and failure progression for a vehicle/scenario."""
    scenario = request.args.get("scenario", "heat_dissipation")
    vehicle_id = request.args.get("vehicle_id", "FL-101")
    force_mock = request.args.get("mock", "false").lower() == "true"

    active_predictor = FleetGuardPredictor(force_mock_mode=True) if force_mock else predictor
    result = generate_fleet_timeseries(
        scenario=scenario,
        vehicle_id=vehicle_id,
        predictor=active_predictor,
    )
    return jsonify(result)


if __name__ == "__main__":
    print("=" * 60)
    print("Starting FleetGuard AI Server at http://127.0.0.1:5000")
    print(f"Model Artifact: {MODEL_PATH} (Mock Mode: {predictor.is_mock_mode})")
    print("=" * 60)
    app.run(host="127.0.0.1", port=5000, debug=False)
