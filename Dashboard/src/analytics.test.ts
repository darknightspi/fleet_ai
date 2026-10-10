import { describe, expect, it } from "vitest";
import { ageMinutes, configuredDemoBaseline, filterVehicles, freshnessState, hardwareConnectionCounts, hardwareConnectionNotice, riskBand } from "./analytics";
import type { Vehicle } from "./types";

const vehicle: Vehicle = {
  vehicle_id: "001",
  vehicle_type: "Delivery truck",
  registration: "DEMO-001",
  driver: "Demo Driver",
  source: "Simulated",
  operational_state: "Moving",
  connectivity: "Online",
  last_seen: "2026-10-09T10:00:00.000Z",
  data_quality: "Good",
  location: null,
  readings: [],
  status: {
    data_quality: "Good",
    model_in_range: null,
    failure_prob: null,
    risk_score: 72,
    risk_band: "High",
    health: { cooling: null, drivetrain: null, fuel: null },
    hours_to_service: null,
    forecast_bounds: null,
    explanation: null,
    provenance: "Test",
  },
  fuel_status: null,
  current_scenario: "Normal operation",
};

describe("fleet analytics", () => {
  it("keeps unknown scores out of healthy bands", () => {
    expect(riskBand(null)).toBe("Unknown");
    expect(riskBand(80)).toBe("Critical");
    expect(riskBand(59)).toBe("Watch");
  });

  it("marks stale telemetry separately from offline operation", () => {
    expect(freshnessState(vehicle.last_seen, Date.parse("2026-10-09T10:30:00.000Z"))).toBe("Online");
    expect(freshnessState(vehicle.last_seen, Date.parse("2026-10-09T12:00:00.000Z"))).toBe("Stale");
  });

  it("filters by source, risk and query", () => {
    expect(filterVehicles([vehicle], { query: "001", source: "Simulated", risk: "High" })).toHaveLength(1);
    expect(filterVehicles([vehicle], { source: "Hardware" })).toHaveLength(0);
  });

  it("returns no age when last-seen time is absent", () => {
    expect(ageMinutes(null)).toBeNull();
  });

  it("counts only online backend hardware and never treats mock mode as connected", () => {
    const hardware = { ...vehicle, vehicle_id: "101", source: "Hardware" as const, connectivity: "Online" as const };
    const offlineHardware = { ...vehicle, vehicle_id: "102", source: "Hardware" as const, connectivity: "Offline" as const };
    const backendSnapshot = {
      vehicles: [vehicle, hardware, offlineHardware],
      mode: "backend" as const,
    };
    expect(hardwareConnectionCounts(backendSnapshot)).toEqual({
      connected: 1, registered: 2, simulated: 1, stale: 0, disconnected: 1,
    });
    expect(hardwareConnectionNotice(backendSnapshot)).toContain("Hardware Connected: 1 real RC unit connected");
    expect(hardwareConnectionCounts({ ...backendSnapshot, mode: "mock" })).toEqual({
      connected: 0, registered: 0, simulated: 1, stale: 0, disconnected: 0,
    });
    expect(hardwareConnectionNotice({ ...backendSnapshot, mode: "mock" })).toContain("Demo Mode: No physical RC units connected");
    expect(hardwareConnectionNotice({
      ...backendSnapshot,
      vehicles: [vehicle, offlineHardware],
    })).toContain("1 registered unit is disconnected");
    expect(hardwareConnectionCounts({
      ...backendSnapshot,
      vehicles: [vehicle, { ...offlineHardware, connectivity: "Online" }],
    }).connected).toBe(1);
    expect(hardwareConnectionNotice({
      ...backendSnapshot,
      vehicles: [vehicle, { ...offlineHardware, connectivity: "Stale" }],
    })).toContain("1 registered unit has stale telemetry");
  });

  it("computes the configured baseline only for simulated readings with required inputs", () => {
    const reading = {
      schema_version: "1.0",
      vehicle_id: "001",
      ts: "2026-10-09T10:00:00Z",
      seq: 1,
      source: "Simulated" as const,
      engine_on: true,
      speed_kmph: 20,
      engine_rpm: 1200,
      engine_load_nm: 100,
      ambient_temp_c: 20,
      coolant_temp_c: 70,
      vibration_rms_g: 0.2,
      accel_long_g: 0,
      battery_v: null,
      fuel_level_pct: 80,
      odometer_km: 1000,
      engine_hours_since_service: 10,
      lat: null,
      lon: null,
    };
    expect(configuredDemoBaseline(reading)).toBe(68);
    expect(configuredDemoBaseline({ ...reading, source: "Hardware" })).toBeNull();
    expect(configuredDemoBaseline({ ...reading, ambient_temp_c: null })).toBeNull();
  });
});
