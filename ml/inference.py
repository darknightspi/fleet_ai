"""
FleetGuard AI - Inference & Prediction Engine.

Integrates the trained AI4I predictive maintenance model with the FleetGuard system:
- Implements vehicle telemetry to AI4I domain feature mapping
- Enforces strict training-range bounds checking (setting model_in_range=False when violated)
- Provides deterministic mock fallback mode when model is not available
- Exposes clear domain disclaimers regarding industrial vs vehicle telemetry
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

import joblib
import numpy as np
import pandas as pd

from ml.config import (
    AI4I_TRAINING_RANGES_DEFAULT,
    MODEL_PATH,
    RAW_FEATURE_COLUMNS,
    VEHICLE_TO_AI4I_MAPPING,
)


class FleetGuardPredictor:
    """
    Inference engine for FleetGuard AI failure risk prediction.
    Supports trained ML model and heuristic mock mode fallback.
    """

    DISCLAIMER: str = (
        "AI4I model trained on industrial milling machine data; "
        "cross-validation performance does not prove real-world truck failure prediction accuracy. "
        "Field deployment requires empirical commercial vehicle CAN telemetry."
    )

    def __init__(
        self,
        model_path: Optional[Union[str, Path]] = None,
        force_mock_mode: bool = False,
    ):
        self.force_mock_mode = force_mock_mode
        self.model_path = Path(model_path) if model_path else MODEL_PATH
        self.is_mock_mode = False
        self.model = None
        self.transformer = None
        self.training_ranges: Dict[str, Dict[str, float]] = AI4I_TRAINING_RANGES_DEFAULT.copy()
        self.feature_names_in: List[str] = RAW_FEATURE_COLUMNS.copy()

        self._initialize_model()

    def _initialize_model(self) -> None:
        """Load trained model bundle or fallback to mock mode."""
        if self.force_mock_mode:
            self.is_mock_mode = True
            return

        if self.model_path.exists():
            try:
                bundle = joblib.load(self.model_path)
                self.model = bundle["model"]
                self.transformer = bundle["transformer"]
                self.training_ranges = bundle.get("training_ranges", self.training_ranges)
                self.feature_names_in = bundle.get("feature_names_in", self.feature_names_in)
                self.is_mock_mode = False
            except Exception as e:
                print(f"[FleetGuardPredictor] Warning: Failed to load model from {self.model_path} ({e}). Falling back to mock mode.")
                self.is_mock_mode = True
        else:
            self.is_mock_mode = True

    @staticmethod
    def map_vehicle_telemetry_to_ai4i(telemetry: Dict[str, Any]) -> Dict[str, Any]:
        """
        Map vehicle telemetry measurements to AI4I dataset features.

        Mapping Logic:
        - ambient_temp_c -> Air temperature [K] (celsius + 273.15)
        - coolant_temp_c -> Process temperature [K] (celsius + 273.15)
        - engine_rpm -> Rotational speed [rpm]
        - engine_torque_nm -> Torque [Nm]
        - operating_wear_min (or operating_hours * 60) -> Tool wear [min]
        - vehicle_duty_type ('light'->'L', 'medium'->'M', 'heavy'->'H') -> Type
        """
        raw_sample = {}

        # 1. Product Type / Duty Type
        duty = str(telemetry.get("vehicle_duty_type", telemetry.get("Type", "M"))).upper()
        if duty in ("LIGHT", "L"):
            raw_sample["Type"] = "L"
        elif duty in ("HEAVY", "H"):
            raw_sample["Type"] = "H"
        else:
            raw_sample["Type"] = "M"

        # 2. Air Temperature [K]
        if "Air temperature [K]" in telemetry:
            raw_sample["Air temperature [K]"] = float(telemetry["Air temperature [K]"])
        elif "ambient_temp_c" in telemetry:
            raw_sample["Air temperature [K]"] = float(telemetry["ambient_temp_c"]) + 273.15
        else:
            raw_sample["Air temperature [K]"] = 300.0  # Default ~27°C

        # 3. Process Temperature [K]
        if "Process temperature [K]" in telemetry:
            raw_sample["Process temperature [K]"] = float(telemetry["Process temperature [K]"])
        elif "coolant_temp_c" in telemetry:
            raw_sample["Process temperature [K]"] = float(telemetry["coolant_temp_c"]) + 273.15
        elif "engine_temp_c" in telemetry:
            raw_sample["Process temperature [K]"] = float(telemetry["engine_temp_c"]) + 273.15
        else:
            raw_sample["Process temperature [K]"] = 310.0  # Default ~37°C

        # 4. Rotational speed [rpm]
        if "Rotational speed [rpm]" in telemetry:
            raw_sample["Rotational speed [rpm]"] = float(telemetry["Rotational speed [rpm]"])
        elif "engine_rpm" in telemetry:
            raw_sample["Rotational speed [rpm]"] = float(telemetry["engine_rpm"])
        else:
            raw_sample["Rotational speed [rpm]"] = 1500.0

        # 5. Torque [Nm]
        if "Torque [Nm]" in telemetry:
            raw_sample["Torque [Nm]"] = float(telemetry["Torque [Nm]"])
        elif "engine_torque_nm" in telemetry:
            raw_sample["Torque [Nm]"] = float(telemetry["engine_torque_nm"])
        else:
            raw_sample["Torque [Nm]"] = 40.0

        # 6. Tool wear [min] / Operating wear
        if "Tool wear [min]" in telemetry:
            raw_sample["Tool wear [min]"] = float(telemetry["Tool wear [min]"])
        elif "operating_wear_min" in telemetry:
            raw_sample["Tool wear [min]"] = float(telemetry["operating_wear_min"])
        elif "operating_hours" in telemetry:
            raw_sample["Tool wear [min]"] = float(telemetry["operating_hours"]) * 60.0
        else:
            raw_sample["Tool wear [min]"] = 0.0

        return raw_sample

    def check_input_ranges(self, sample: Dict[str, Any]) -> Tuple[bool, List[str]]:
        """
        Validate if the input telemetry sample is within supported training ranges.

        Returns:
            Tuple of (model_in_range: bool, warning_messages: List[str])
        """
        warnings = []
        is_in_range = True

        for col, stats in self.training_ranges.items():
            if col in sample:
                val = float(sample[col])
                # Check against min and max with 5% safety margin
                span = stats["max"] - stats["min"]
                margin = span * 0.05
                min_bound = stats["min"] - margin
                max_bound = stats["max"] + margin

                if val < min_bound or val > max_bound:
                    is_in_range = False
                    warnings.append(
                        f"Feature '{col}' value {val:.2f} is outside valid training range "
                        f"[{stats['min']:.2f}, {stats['max']:.2f}]"
                    )

        # Also check temperature difference physical plausibility
        if "Process temperature [K]" in sample and "Air temperature [K]" in sample:
            temp_diff = sample["Process temperature [K]"] - sample["Air temperature [K]"]
            if temp_diff < 0:
                is_in_range = False
                warnings.append(f"Process temperature ({sample['Process temperature [K]']:.2f}K) is lower than Air temperature ({sample['Air temperature [K]']:.2f}K).")

        return is_in_range, warnings

    def _mock_predict(self, sample: Dict[str, Any]) -> Dict[str, Any]:
        """Heuristic risk prediction when ML model is unavailable."""
        temp_diff = sample["Process temperature [K]"] - sample["Air temperature [K]"]
        rpm = sample["Rotational speed [rpm]"]
        torque = sample["Torque [Nm]"]
        wear = sample["Tool wear [min]"]
        power = rpm * torque * (2 * np.pi / 60.0)

        # Physics-based heuristics derived from AI4I failure modes
        risk_score = 0.02  # baseline risk

        # Heat Dissipation Failure rule
        if temp_diff < 8.6 and rpm < 1380:
            risk_score += 0.45

        # Power Failure rule (outside 3500W to 9000W)
        if power < 3500 or power > 9000:
            risk_score += 0.35

        # Overstrain Failure rule (Torque * Wear > 11000)
        if torque * wear > 11000:
            risk_score += 0.40

        # Tool wear failure (wear > 200 min)
        if wear > 200:
            risk_score += 0.25

        prob = min(max(risk_score, 0.01), 0.99)
        pred = int(prob >= 0.5)

        return {
            "prediction": pred,
            "failure_predicted": bool(pred == 1),
            "failure_probability": round(prob, 4),
            "mode": "MOCK_MODE",
        }

    def predict(
        self,
        input_data: Union[Dict[str, Any], pd.DataFrame],
        is_vehicle_telemetry: bool = False,
    ) -> Union[Dict[str, Any], List[Dict[str, Any]]]:
        """
        Predict machine / component failure risk.

        Args:
            input_data: Dict or DataFrame containing feature measurements or vehicle telemetry.
            is_vehicle_telemetry: If True, maps vehicle fields (RPM, coolant temp, etc.) to AI4I format.

        Returns:
            Dictionary (for single input) or list of dictionaries (for batch input) with predictions.
        """
        if isinstance(input_data, pd.DataFrame):
            return [
                self._predict_single(row.to_dict(), is_vehicle_telemetry)
                for _, row in input_data.iterrows()
            ]
        elif isinstance(input_data, list):
            return [self._predict_single(item, is_vehicle_telemetry) for item in input_data]
        else:
            return self._predict_single(input_data, is_vehicle_telemetry)

    def _predict_single(
        self,
        raw_input: Dict[str, Any],
        is_vehicle_telemetry: bool = False,
    ) -> Dict[str, Any]:
        """Internal single sample prediction handler."""
        # Step 1: Mapping if telemetry input
        if is_vehicle_telemetry or any(
            k in raw_input for k in ("ambient_temp_c", "coolant_temp_c", "engine_rpm", "engine_torque_nm")
        ):
            sample = self.map_vehicle_telemetry_to_ai4i(raw_input)
            mapped_from_telemetry = True
        else:
            sample = raw_input.copy()
            mapped_from_telemetry = False

        # Step 2: Range Verification
        model_in_range, range_warnings = self.check_input_ranges(sample)

        # Step 3: Inference Execution
        if self.is_mock_mode or self.model is None or self.transformer is None:
            pred_res = self._mock_predict(sample)
        else:
            try:
                sample_df = pd.DataFrame([sample])
                trans_df = self.transformer.transform(sample_df)
                prob = float(self.model.predict_proba(trans_df)[0, 1])
                pred = int(prob >= 0.5)
                pred_res = {
                    "prediction": pred,
                    "failure_predicted": bool(pred == 1),
                    "failure_probability": round(prob, 4),
                    "mode": "ML_MODEL",
                }
            except Exception as e:
                # Fallback to mock prediction on transformation error
                pred_res = self._mock_predict(sample)
                pred_res["fallback_reason"] = str(e)

        # Step 4: Risk Tiering
        prob = pred_res["failure_probability"]
        if prob < 0.15:
            risk_level = "LOW"
        elif prob < 0.50:
            risk_level = "MEDIUM"
        elif prob < 0.80:
            risk_level = "HIGH"
        else:
            risk_level = "CRITICAL"

        return {
            "failure_predicted": pred_res["failure_predicted"],
            "failure_probability": pred_res["failure_probability"],
            "risk_level": risk_level,
            "model_in_range": model_in_range,
            "out_of_range_warnings": range_warnings,
            "mapped_from_vehicle_telemetry": mapped_from_telemetry,
            "processed_features": sample,
            "mode": pred_res["mode"],
            "disclaimer": self.DISCLAIMER,
        }
