"""
FleetGuard AI - Time Series Telemetry & Degradation Generator.

Generates multi-step temporal telemetry trajectories showing vehicle state transitions:
- Normal cruise baseline
- Progressive component degradation (wear, thermal drift, power imbalance)
- Transition into abnormal failure state (HDF, OSF, PWF, TWF)
- Real-time ML scoring for each time step with out-of-range detection
"""

from __future__ import annotations

import math
from typing import Any, Dict, List, Optional

import numpy as np

from ml.inference import FleetGuardPredictor


SCENARIO_CONFIGS = {
    "heat_dissipation": {
        "title": "Thermal Overheat & Heat Dissipation Breakdown",
        "description": "Demonstrates transition from normal highway driving (ΔT > 10K) to cooling system degradation where radiator fan fails, causing coolant temp to surge while airflow drops (ΔT < 8.6K and RPM < 1380), triggering Heat Dissipation Failure (HDF).",
        "duration_minutes": 60,
        "base": {"ambient_temp_c": 26.0, "coolant_temp_c": 36.5, "rpm": 1600.0, "torque": 42.0, "wear": 30.0, "duty": "medium"},
    },
    "overstrain": {
        "title": "Mechanical Overstrain & Tool Wear Escalation",
        "description": "Simulates heavy uphill payload hauling where engine torque increases while component wear accumulates past critical thresholds (Torque × Wear > 11,000), triggering Overstrain Failure (OSF).",
        "duration_minutes": 60,
        "base": {"ambient_temp_c": 25.0, "coolant_temp_c": 36.0, "rpm": 1450.0, "torque": 45.0, "wear": 120.0, "duty": "heavy"},
    },
    "power_spike": {
        "title": "Drivetrain Imbalance & Power Failure Spike",
        "description": "Simulates aggressive acceleration causing rapid RPM and torque fluctuations where operational power exceeds the stable 3.5kW - 9.0kW envelope, triggering Power Failure (PWF).",
        "duration_minutes": 60,
        "base": {"ambient_temp_c": 24.0, "coolant_temp_c": 35.0, "rpm": 1500.0, "torque": 40.0, "wear": 60.0, "duty": "heavy"},
    },
    "normal_cruise": {
        "title": "Nominal Long-Haul Highway Cruise",
        "description": "Shows stable vehicle telemetry over a 60-minute duration with standard minor road oscillations, maintaining low failure risk throughout.",
        "duration_minutes": 60,
        "base": {"ambient_temp_c": 25.0, "coolant_temp_c": 35.5, "rpm": 1520.0, "torque": 42.0, "wear": 40.0, "duty": "medium"},
    },
}


def generate_fleet_timeseries(
    scenario: str = "heat_dissipation",
    vehicle_id: str = "FL-101",
    predictor: Optional[FleetGuardPredictor] = None,
) -> Dict[str, Any]:
    """
    Generate a 60-minute time series trajectory and score every step with ML predictor.

    Args:
        scenario: One of 'heat_dissipation', 'overstrain', 'power_spike', 'normal_cruise'.
        vehicle_id: Identifier of the vehicle.
        predictor: Optional FleetGuardPredictor instance.

    Returns:
        Structured time-series dataset with step-by-step telemetry and ML risk outputs.
    """
    if predictor is None:
        predictor = FleetGuardPredictor()

    cfg = SCENARIO_CONFIGS.get(scenario, SCENARIO_CONFIGS["heat_dissipation"])
    duration = cfg["duration_minutes"]
    base = cfg["base"]

    np.random.seed(42 if scenario != "normal_cruise" else 100)

    time_steps: List[Dict[str, Any]] = []
    anomaly_events: List[Dict[str, Any]] = []

    for t in range(duration + 1):
        progress = t / duration  # 0.0 to 1.0
        noise = np.random.normal(0, 0.5)

        # Baseline progression logic
        if scenario == "heat_dissipation":
            # Normal for first 20 min, then cooling efficiency degrades
            if t < 20:
                ambient = base["ambient_temp_c"] + np.random.normal(0, 0.2)
                coolant = base["coolant_temp_c"] + np.random.normal(0, 0.3)
                rpm = base["rpm"] + np.random.normal(0, 15)
                torque = base["torque"] + np.random.normal(0, 1.0)
            elif t < 38:
                # Degradation onset
                ambient = base["ambient_temp_c"] + 2.0 * (t - 20) / 18 + np.random.normal(0, 0.3)
                coolant = base["coolant_temp_c"] + 1.2 * (t - 20) / 18 + np.random.normal(0, 0.4)
                rpm = base["rpm"] - 150 * (t - 20) / 18 + np.random.normal(0, 20)
                torque = base["torque"] + 4.0 * (t - 20) / 18 + np.random.normal(0, 1.2)
                if t == 25:
                    anomaly_events.append({"time": t, "type": "WARNING", "title": "Coolant Temp Rise Detected", "desc": "Cooling delta narrowing towards critical threshold."})
            else:
                # Critical abnormal state (ΔT < 8.6K and RPM < 1380)
                ambient = 31.0 + np.random.normal(0, 0.4)
                coolant = 37.2 + np.random.normal(0, 0.4)
                rpm = 1310 + np.random.normal(0, 25)
                torque = 52.0 + np.random.normal(0, 1.5)
                if t == 40:
                    anomaly_events.append({"time": t, "type": "CRITICAL", "title": "Heat Dissipation Failure (HDF) Triggered", "desc": "Process/Air temp difference collapsed below 8.6K at low engine speed."})

            wear = base["wear"] + (t * 0.4)

        elif scenario == "overstrain":
            if t < 18:
                ambient = base["ambient_temp_c"] + np.random.normal(0, 0.2)
                coolant = base["coolant_temp_c"] + np.random.normal(0, 0.2)
                rpm = base["rpm"] + np.random.normal(0, 15)
                torque = base["torque"] + np.random.normal(0, 1.0)
                wear = base["wear"] + t * 0.5
            elif t < 35:
                ambient = base["ambient_temp_c"] + 1.0 + np.random.normal(0, 0.2)
                coolant = base["coolant_temp_c"] + 1.5 * (t - 18) / 17 + np.random.normal(0, 0.3)
                rpm = base["rpm"] - 50 + np.random.normal(0, 20)
                torque = base["torque"] + 15.0 * (t - 18) / 17 + np.random.normal(0, 1.5)
                wear = base["wear"] + (18 * 0.5) + (t - 18) * 2.0
                if t == 22:
                    anomaly_events.append({"time": t, "type": "WARNING", "title": "High Torque Incline Hauling", "desc": "Torque exceeding 55 N·m under heavy vehicle load."})
            else:
                ambient = 28.0 + np.random.normal(0, 0.3)
                coolant = 38.5 + np.random.normal(0, 0.4)
                rpm = 1380 + np.random.normal(0, 25)
                torque = 68.0 + np.random.normal(0, 2.0)
                wear = 180 + (t - 35) * 2.5
                if t == 38:
                    anomaly_events.append({"time": t, "type": "CRITICAL", "title": "Overstrain Failure (OSF) Triggered", "desc": "Torque × Tool Wear product exceeded 11,000 N·m·min."})

        elif scenario == "power_spike":
            if t < 25:
                ambient = base["ambient_temp_c"] + np.random.normal(0, 0.2)
                coolant = base["coolant_temp_c"] + np.random.normal(0, 0.2)
                rpm = base["rpm"] + np.random.normal(0, 20)
                torque = base["torque"] + np.random.normal(0, 1.0)
                wear = base["wear"] + t * 0.3
            elif t < 42:
                ambient = base["ambient_temp_c"] + np.random.normal(0, 0.3)
                coolant = base["coolant_temp_c"] + 2.0 * (t - 25) / 17 + np.random.normal(0, 0.3)
                rpm = base["rpm"] + 700 * (t - 25) / 17 + np.random.normal(0, 40)
                torque = base["torque"] + 20.0 * (t - 25) / 17 + np.random.normal(0, 2.0)
                wear = base["wear"] + (25 * 0.3) + (t - 25) * 1.2
                if t == 30:
                    anomaly_events.append({"time": t, "type": "WARNING", "title": "RPM & Torque Surge", "desc": "Engine output approaching power envelope ceiling (>8 kW)."})
            else:
                ambient = 27.5 + np.random.normal(0, 0.3)
                coolant = 38.8 + np.random.normal(0, 0.4)
                rpm = 2820 + np.random.normal(0, 35)
                torque = 73.0 + np.random.normal(0, 2.0)
                wear = 110 + (t - 42) * 1.5
                if t == 44:
                    anomaly_events.append({"time": t, "type": "CRITICAL", "title": "Power Failure (PWF) Triggered", "desc": "Power output exceeded 9.0 kW limit (spindle overload)."})

        else:  # normal_cruise
            ambient = base["ambient_temp_c"] + 0.5 * math.sin(t / 8.0) + np.random.normal(0, 0.15)
            coolant = base["coolant_temp_c"] + 0.6 * math.sin(t / 6.0) + np.random.normal(0, 0.2)
            rpm = base["rpm"] + 30 * math.cos(t / 5.0) + np.random.normal(0, 15)
            torque = base["torque"] + 2.0 * math.sin(t / 7.0) + np.random.normal(0, 0.8)
            wear = base["wear"] + t * 0.35

        # Telemetry sample dict
        telemetry = {
            "ambient_temp_c": round(float(ambient), 2),
            "coolant_temp_c": round(float(coolant), 2),
            "engine_rpm": round(float(rpm), 1),
            "engine_torque_nm": round(float(torque), 2),
            "operating_wear_min": round(float(wear), 1),
            "vehicle_duty_type": base["duty"],
        }

        # Run ML prediction
        prediction_result = predictor.predict(telemetry, is_vehicle_telemetry=True)

        # Derived physics
        amb_k = telemetry["ambient_temp_c"] + 273.15
        proc_k = telemetry["coolant_temp_c"] + 273.15
        temp_diff_k = proc_k - amb_k
        power_kw = (telemetry["engine_rpm"] * telemetry["engine_torque_nm"] * (2 * math.pi / 60.0)) / 1000.0
        overstrain = telemetry["engine_torque_nm"] * telemetry["operating_wear_min"]

        time_steps.append(
            {
                "minute": t,
                "timestamp_label": f"{t:02d}:00",
                "telemetry": telemetry,
                "physics": {
                    "temp_diff_k": round(temp_diff_k, 2),
                    "power_kw": round(power_kw, 2),
                    "overstrain_nm_min": round(overstrain, 1),
                },
                "failure_probability": prediction_result["failure_probability"],
                "failure_predicted": prediction_result["failure_predicted"],
                "risk_level": prediction_result["risk_level"],
                "model_in_range": prediction_result["model_in_range"],
                "out_of_range_warnings": prediction_result.get("out_of_range_warnings", []),
            }
        )

    return {
        "vehicle_id": vehicle_id,
        "scenario": scenario,
        "scenario_title": cfg["title"],
        "scenario_description": cfg["description"],
        "duration_minutes": duration,
        "time_steps": time_steps,
        "anomaly_events": anomaly_events,
        "available_scenarios": [
            {"id": k, "title": v["title"]} for k, v in SCENARIO_CONFIGS.items()
        ],
    }
