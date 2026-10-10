# Hardware RC Pipeline to Dashboard Integration Guide

This document is the implementation handoff for the person responsible for connecting the physical RC hardware pipeline to the FleetGuard dashboard.

## 1) Objective

The purpose of this stage is to build the bridge between the real RC/vehicle hardware and the existing backend API so that the dashboard can display real device telemetry instead of simulated demo data.

This is not the same as designing the vehicle itself. This task is specifically about:

- establishing a stable device identity
- receiving real telemetry from the RC hardware
- validating the telemetry payload
- sending it to the backend in the expected API contract
- preserving the dashboard’s separation between demo and hardware data
- surfacing the correct device states: Online, Offline, and Stale

## 2) What this stage is responsible for

The hardware integration stage must do the following:

1. Connect the physical RC stream to the backend ingestion API.
2. Assign a permanent device identifier for each real unit.
3. Validate incoming telemetry before storing or displaying it.
4. Normalize telemetry to the expected field names and units.
5. Control whether the system is in simulated mode or real hardware mode.
6. Ensure the dashboard reflects the real source and connection state correctly.
7. Handle disconnect and stale conditions gracefully.
8. Keep the demo fleet untouched while real hardware is added separately.

## 3) What this stage is not responsible for

This stage does not replace or modify the ML/prediction logic itself.

It does not create a new dashboard from scratch.

It does not require changing the stored demo data set unless the demo behavior is intentionally being modified.

It does not require building a full Bluetooth/ESP32/serial stack in this repo unless that is a separate hardware task.

The current repository is already designed as an API contract layer. The real hardware transport sits outside the repo and simply calls the backend API with the correct JSON.

## 4) Current architecture

The project already contains these major parts:

- Python Flask backend: `app.py`
- Device registry: `fleet_registry.py`
- React dashboard: `Dashboard/`
- ML prediction pipeline: `ml/`

High-level flow:

1. Real hardware sends telemetry to the backend.
2. The backend validates and registers the unit in memory.
3. The backend exposes a fleet snapshot at `/api/fleet`.
4. The dashboard polls that endpoint and displays connected hardware data.
5. Simulated units remain as demo entries and never get conflated with real hardware.

Important architectural rule:

- Simulated units use IDs `001` to `008`
- Real hardware IDs start at `101`
- Demo and hardware entries are kept separate in logic and display

## 5) Current backend contract

The backend is already built to support this flow.

### 5.1 Health and fleet endpoints

- `GET /api/health`
  - checks whether the backend and model are available
- `GET /api/fleet`
  - returns all demo units + all registered hardware units

### 5.2 Hardware ingestion

- `POST /api/hardware/telemetry`
  - accepts telemetry from a real device adapter
- `POST /api/hardware/disconnect`
  - marks a device as offline without deleting it

### 5.3 Expected telemetry requirements

The backend accepts a JSON object like this:

```json
{
  "device_id": "rc-01",
  "model": "RC Truck V1",
  "telemetry": {
    "ts": "2026-10-10T12:00:00+00:00",
    "speed_kmph": 42.5,
    "engine_rpm": 1800,
    "ambient_temp_c": 26.0,
    "coolant_temp_c": 38.5,
    "engine_torque_nm": 52.5,
    "operating_wear_min": 70,
    "vehicle_duty_type": "heavy",
    "fuel_level_pct": 88,
    "battery_v": 12.8,
    "engine_on": true
  }
}
```

Notes:

- `device_id` must be a stable identifier for the same physical RC device.
- `telemetry.ts` must be a timezone-aware ISO 8601 timestamp.
- At least one valid telemetry value is required.
- Only supported fields are accepted.
- Unsupported fields are rejected.

## 6) Supported telemetry fields

The registry accepts these field names:

Numeric:

- `speed_kmph`
- `engine_rpm`
- `engine_load_nm`
- `ambient_temp_c`
- `coolant_temp_c`
- `engine_torque_nm`
- `operating_wear_min`
- `vibration_rms_g`
- `accel_long_g`
- `battery_v`
- `fuel_level_pct`
- `odometer_km`
- `engine_hours_since_service`
- `lat`
- `lon`

Boolean:

- `engine_on`

String:

- `vehicle_duty_type`

The system rejects invalid or unsupported values before registration.

## 7) Device lifecycle rules

The hardware lifecycle is intentionally simple and explicit.

### 7.1 First telemetry message

On the first valid telemetry message for a `device_id`, the system:

- creates a new hardware unit
- assigns the next available hardware ID starting at `101`
- sets `source` to `Hardware`
- marks `connectivity` as `Online`
- stores the latest telemetry

### 7.2 Repeated telemetry messages

For the same `device_id`:

- the existing unit is updated
- the telemetry is replaced with the latest accepted reading
- `telemetry_seq` increases
- `last_seen` is updated

### 7.3 Stale condition

If no new telemetry arrives for 60 seconds:

- the hardware unit is treated as `Stale`
- it remains in the registry
- it is still visible in the system
- it is not deleted automatically

### 7.4 Disconnect condition

When the adapter calls:

```http
POST /api/hardware/disconnect
```

with a valid `device_id`, the system immediately sets the unit to `Offline`.

## 8) Source and state distinction

This is one of the most important design rules in the project.

### Demo data

These are example fleet units used for presentation and testing.

- IDs: `001` through `008`
- `source`: `Simulated`
- `connectivity`: not a real hardware connection
- they remain in the app even when hardware is absent

### Hardware data

These are real RC or external devices.

- IDs: `101` and above
- `source`: `Hardware`
- `connectivity`: `Online`, `Offline`, or `Stale`

The dashboard keyword `SIMULATED DEMO` is intentionally misleading and should not be used anymore. The display should say what is actually true:

- demo mode active
- real hardware connected
- hardware stale
- hardware offline
- backend disconnected

## 9) Exact implementation responsibilities for the hardware teammate

Your job is to implement the interface between the RC hardware pipeline and the backend API contract.

### Step 1: Define the transport layer

Decide how the RC hardware sends data to the backend:

- HTTP POST to `/api/hardware/telemetry`
- MQTT bridge
- WebSocket relay
- direct adapter service
- serial/USB bridge that converts raw RC telemetry into HTTP JSON

The repo does not require a specific transport technology, but the adapter must ultimately produce a valid JSON payload exactly matching the API contract.

### Step 2: Create a stable per-device identity

Each physical RC unit must have a consistent `device_id`.

Examples:

- `rc-001`
- `front-quad-01`
- `fleet-vehicle-102`

Use the same ID for the same physical machine across reconnects.

Do not reuse an ID for a different physical unit.

### Step 3: Build the telemetry adapter

The adapter should:

- read raw telemetry from the hardware or bridge
- map it to supported fields
- convert units if needed
- insert a valid `ts` ISO timestamp
- POST to `/api/hardware/telemetry`

The adapter must validate that all data is in accepted types and names before sending.

### Step 4: Handle device session lifecycle

When a device connects:

- send telemetry to register the unit

When a device disconnects:

- call `/api/hardware/disconnect` with the same `device_id`

When a device is silent for too long:

- do not delete it
- let the backend mark it as `Stale`

### Step 5: Keep demo data isolated

Make sure the real hardware stream does not overwrite or rename the seeded simulated fleet.

The simulated IDs remain `001`–`008`.

Do not use those IDs for real hardware.

### Step 6: Connect the dashboard to the real state

The React frontend already polls `/api/fleet` and reads the fields from the backend.

The hardware integration must ensure the backend payload includes the correct values for:

- `source`
- `connectivity`
- `last_seen`
- `telemetry`
- `device_id`

If the dashboard is showing a misleading badge, the bug is usually in the source/connection state computation, not in the underlying device transport.

## 10) Implementation checklist

Use this checklist for the integration task.

### Required tasks

- [ ] Confirm the hardware pipeline can produce telemetry JSON
- [ ] Map raw hardware values to backend-supported field names
- [ ] Generate a stable `device_id`
- [ ] Add a real adapter/bridge service that posts to `/api/hardware/telemetry`
- [ ] Add disconnect handling for device loss
- [ ] Verify the backend accepts the payload
- [ ] Verify `/api/fleet` includes the hardware unit
- [ ] Verify the dashboard shows the unit under its correct source/state
- [ ] Verify stale/offline logic works
- [ ] Confirm demo units remain separate from hardware units

### Definition of done

The hardware integration is complete when:

- a physical device can send telemetry to the backend
- the backend accepts and stores it
- `/api/fleet` returns the unit with a valid hardware ID and source
- the dashboard shows the device as real hardware, not demo
- stale and disconnect conditions are visible and correct
- the project continues to function with seeded demo data when no hardware is connected

## 11) Example real integration flow

```text
Physical RC device
        |
        v
Transport adapter (HTTP/MQTT/etc.)
        |
        v
POST /api/hardware/telemetry
        |
        v
Flask backend validates data
        |
        v
HardwareFleetRegistry.ingest(...)
        |
        v
fleet snapshot returns device info
        |
        v
Dashboard reads /api/fleet and displays status
```

## 12) Example backend response after registration

```json
{
  "unit": {
    "id": "101",
    "device_id": "rc-01",
    "model": "RC Truck V1",
    "source": "Hardware",
    "connectivity": "Online",
    "last_seen": "2026-10-10T12:00:00+00:00",
    "telemetry": {
      "ts": "2026-10-10T12:00:00+00:00",
      "speed_kmph": 42.5,
      "engine_rpm": 1800,
      "ambient_temp_c": 26.0,
      "coolant_temp_c": 38.5,
      "engine_torque_nm": 52.5,
      "operating_wear_min": 70,
      "vehicle_duty_type": "heavy",
      "battery_v": 12.8,
      "engine_on": true
    },
    "telemetry_seq": 1
  },
  "registered": true
}
```

## 13) Example disconnect call

```json
{
  "device_id": "rc-01"
}
```

Expected result:

```json
{
  "unit": {
    "id": "101",
    "device_id": "rc-01",
    "source": "Hardware",
    "connectivity": "Offline"
  }
}
```

## 14) Important rules to prevent bugs

- Never send real hardware telemetry under demo IDs.
- Never reuse `device_id` values across different physical units.
- Never delete hardware units on stale or disconnect events.
- Keep the `source` field explicit: `Hardware` vs `Simulated`.
- Do not conflate demo mode with real backend connectivity.
- Do not assume that a backend running means real hardware is connected.
- Do not register a device before a valid session is established.

## 15) Current implementation location

Relevant files for this integration stage:

- `app.py` — backend API and fleet snapshot
- `fleet_registry.py` — device registry and lifecycle logic
- `Dashboard/src/api/client.ts` — frontend API adapter
- `Dashboard/src/pages.tsx` — status and notices in the UI
- `README.md` — project overview and API contract

## 16) Troubleshooting guide

### Backend is healthy but dashboard still says demo-only

This usually means:

- the device never called `/api/hardware/telemetry`
- the `device_id` is invalid or missing
- the request is missing the `telemetry` object
- the telemetry payload is rejected before registration
- the UI is still reading demo-only state from the wrong source flag

### Unit appears in `/api/fleet` but as `Offline` immediately

This usually means:

- the device sent telemetry earlier but the disconnect endpoint was called
- the connection is not stable
- the adapter is repeatedly sending a disconnect signal

### Unit never appears in the dashboard

Check:

- whether `POST /api/hardware/telemetry` returned a 201 or 200 status
- whether the JSON was valid
- whether the response included the correct `device_id`
- whether the frontend is polling correctly

### Device is stale but not offline

This is expected behavior: stale is separate from offline.

- `Offline`: explicit disconnect event
- `Stale`: no fresh telemetry for 60 seconds
- `Online`: telemetry received recently and device is active

## 17) Recommended next implementation path

1. Create a small adapter service for the RC transport.
2. Use a stable `device_id` naming convention.
3. Send telemetry to `/api/hardware/telemetry` with valid JSON.
4. Confirm the backend responds successfully.
5. Check `/api/fleet` for the new hardware unit.
6. Verify the dashboard visual status updates.
7. Add disconnect handling for actual device dropouts.
8. Validate stale behavior by stopping telemetry and waiting 60+ seconds.

## 18) Final summary

The real integration work is not to “change the dashboard” alone. The core work is to establish a working hardware-to-backend pipeline that submits valid telemetry into the system’s existing contract.

Once that is done, the backend and dashboard can correctly represent:

- simulated demo data
- live hardware telemetry
- hardware disconnects
- stale devices
- backend health

The key rule is simple:

The project is already built around a real hardware contract. Your job is to plug the physical RC pipeline into that contract without breaking the demo mode.
