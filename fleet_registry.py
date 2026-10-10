"""Session-scoped registry for real hardware telemetry sessions."""

from __future__ import annotations

from datetime import datetime, timezone
import math
import threading
from typing import Any


NUMERIC_TELEMETRY_FIELDS = {
    "speed_kmph",
    "engine_rpm",
    "engine_load_nm",
    "ambient_temp_c",
    "coolant_temp_c",
    "engine_torque_nm",
    "operating_wear_min",
    "vibration_rms_g",
    "accel_long_g",
    "battery_v",
    "fuel_level_pct",
    "odometer_km",
    "engine_hours_since_service",
    "lat",
    "lon",
}
BOOLEAN_TELEMETRY_FIELDS = {"engine_on"}
STRING_TELEMETRY_FIELDS = {"vehicle_duty_type"}
SUPPORTED_TELEMETRY_FIELDS = (
    NUMERIC_TELEMETRY_FIELDS | BOOLEAN_TELEMETRY_FIELDS | STRING_TELEMETRY_FIELDS
)
TELEMETRY_STALE_AFTER_SECONDS = 60


class HardwareFleetRegistry:
    """Tracks device identities and their latest telemetry for this process lifetime."""

    def __init__(self) -> None:
        self._units: dict[str, dict[str, Any]] = {}
        self._lock = threading.RLock()

    def ingest(
        self,
        device_id: Any,
        telemetry: Any,
        model: Any = "RC car",
    ) -> tuple[dict[str, Any], bool]:
        if not isinstance(device_id, str) or not device_id.strip():
            raise ValueError("device_id must be a non-empty stable device identifier.")
        device_id = device_id.strip()
        if len(device_id) > 128:
            raise ValueError("device_id must be 128 characters or fewer.")
        if not isinstance(telemetry, dict):
            raise ValueError("telemetry must be a JSON object.")
        if not isinstance(model, str) or not model.strip():
            raise ValueError("model must be a non-empty string.")

        unsupported = set(telemetry) - SUPPORTED_TELEMETRY_FIELDS - {"ts"}
        if unsupported:
            raise ValueError(f"Unsupported telemetry fields: {', '.join(sorted(unsupported))}.")

        normalized: dict[str, Any] = {}
        for field in NUMERIC_TELEMETRY_FIELDS.intersection(telemetry):
            value = telemetry[field]
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise ValueError(f"telemetry.{field} must be a finite number.")
            try:
                numeric_value = float(value)
            except OverflowError as error:
                raise ValueError(f"telemetry.{field} must be a finite number.") from error
            if not math.isfinite(numeric_value):
                raise ValueError(f"telemetry.{field} must be a finite number.")
            normalized[field] = numeric_value
        for field in BOOLEAN_TELEMETRY_FIELDS.intersection(telemetry):
            if not isinstance(telemetry[field], bool):
                raise ValueError(f"telemetry.{field} must be a boolean.")
            normalized[field] = telemetry[field]
        for field in STRING_TELEMETRY_FIELDS.intersection(telemetry):
            value = telemetry[field]
            if not isinstance(value, str) or not value.strip():
                raise ValueError(f"telemetry.{field} must be a non-empty string.")
            normalized[field] = value.strip()

        if not normalized:
            raise ValueError("At least one supported telemetry value is required to register a unit.")

        supplied_timestamp = telemetry.get("ts")
        if supplied_timestamp is not None:
            if not isinstance(supplied_timestamp, str):
                raise ValueError("telemetry.ts must be an ISO 8601 timestamp string.")
            try:
                parsed_timestamp = datetime.fromisoformat(supplied_timestamp.replace("Z", "+00:00"))
            except ValueError as error:
                raise ValueError("telemetry.ts must be a valid ISO 8601 timestamp.") from error
            if parsed_timestamp.tzinfo is None:
                raise ValueError("telemetry.ts must include a timezone.")
            normalized["ts"] = parsed_timestamp.astimezone(timezone.utc).isoformat()

        with self._lock:
            received_at = datetime.now(timezone.utc)
            existing = self._units.get(device_id)
            is_new = existing is None
            if existing is None:
                used_ids = {
                    int(unit["id"])
                    for unit in self._units.values()
                    if str(unit["id"]).isdigit()
                }
                next_id = max({100, *used_ids}) + 1
                existing = {
                    "id": f"{next_id:03d}",
                    "device_id": device_id,
                    "model": model.strip(),
                    "source": "Hardware",
                    "telemetry_seq": 0,
                }
                self._units[device_id] = existing

            existing.update(
                model=model.strip(),
                connectivity="Online",
                last_seen=received_at.isoformat(),
                telemetry=normalized,
                telemetry_seq=existing["telemetry_seq"] + 1,
            )
            return existing.copy(), is_new

    def disconnect(self, device_id: Any) -> dict[str, Any]:
        if not isinstance(device_id, str) or not device_id.strip():
            raise ValueError("device_id must be a non-empty stable device identifier.")
        with self._lock:
            unit = self._units.get(device_id.strip())
            if unit is None:
                raise KeyError("No registered hardware unit matches that device_id.")
            unit["connectivity"] = "Offline"
            return unit.copy()

    def list_units(self, now: datetime | None = None) -> list[dict[str, Any]]:
        with self._lock:
            current_time = now or datetime.now(timezone.utc)
            units = []
            for unit in self._units.values():
                current = unit.copy()
                if current["connectivity"] == "Online":
                    last_seen = datetime.fromisoformat(current["last_seen"])
                    if (current_time - last_seen).total_seconds() > TELEMETRY_STALE_AFTER_SECONDS:
                        current["connectivity"] = "Stale"
                units.append(current)
            return units

    def clear(self) -> None:
        """Clear session state; intended for isolated tests."""
        with self._lock:
            self._units.clear()


hardware_registry = HardwareFleetRegistry()
