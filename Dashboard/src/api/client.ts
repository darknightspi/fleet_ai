import type { FleetSnapshot, Reading, Vehicle } from "../types";
import { resetDemo } from "./mockAdapter";

export interface FleetApi {
  getSnapshot(): Promise<FleetSnapshot>;
  acknowledgeAlert(alertId: string): Promise<void>;
  resetDemo(): Promise<void>;
  subscribeLive(onMessage: (snapshot: FleetSnapshot) => void, onState: (state: "connected" | "reconnecting" | "unavailable") => void): () => void;
}

type BackendHealth = { status: string; model_loaded: boolean; mock_mode: boolean };
type BackendTelemetry = Partial<Omit<Reading, "schema_version" | "vehicle_id" | "seq" | "source">> & {
  engine_torque_nm?: number;
  operating_wear_min?: number;
  vehicle_duty_type?: string;
};
type BackendTruck = {
  id: string;
  device_id?: string;
  model: string;
  duty: string;
  source?: "Hardware" | "Simulated" | "Replay";
  connectivity?: "Online" | "Stale" | "Offline" | "Unknown";
  last_seen?: string | null;
  telemetry?: BackendTelemetry;
  telemetry_seq?: number;
  ambient_temp_c: number | null;
  coolant_temp_c: number | null;
  engine_rpm: number | null;
  engine_torque_nm: number | null;
  operating_wear_min: number | null;
  failure_predicted: boolean | null;
  failure_probability: number | null;
  risk_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | "UNKNOWN";
  model_in_range: boolean | null;
};
type BackendTruckWithModelInputs = BackendTruck & {
  ambient_temp_c: number;
  coolant_temp_c: number;
  engine_rpm: number;
  engine_torque_nm: number;
  operating_wear_min: number;
};

function hasCompleteModelInputs(truck: BackendTruck): truck is BackendTruckWithModelInputs {
  return typeof truck.ambient_temp_c === "number" && Number.isFinite(truck.ambient_temp_c) &&
    typeof truck.coolant_temp_c === "number" && Number.isFinite(truck.coolant_temp_c) &&
    typeof truck.engine_rpm === "number" && Number.isFinite(truck.engine_rpm) &&
    typeof truck.engine_torque_nm === "number" && Number.isFinite(truck.engine_torque_nm) &&
    typeof truck.operating_wear_min === "number" && Number.isFinite(truck.operating_wear_min);
}

const apiBase = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(/\/$/, "");

async function requestJson<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json() as { error?: string; message?: string };
      detail = body.error ?? body.message ?? detail;
    } catch {
      // Flask may return an HTML error page; retain the readable HTTP status.
    }
    throw new Error(`FleetGuard API request failed: ${detail}`);
  }
  return response.json() as Promise<T>;
}

function vehicleFromBackend(truck: BackendTruck): Vehicle {
  const probability = Number.isFinite(truck.failure_probability) ? truck.failure_probability : null;
  const percent = probability === null ? null : Math.round(probability * 100);
  const riskBand = truck.risk_level === "LOW" ? "Normal"
    : truck.risk_level === "MEDIUM" ? "Watch"
      : truck.risk_level === "HIGH" ? "High"
        : truck.risk_level === "CRITICAL" ? "Critical" : "Unknown";
  const source = truck.source ?? "Simulated";
  const telemetry = truck.telemetry;
  const latestReading: Reading | null = source === "Hardware" && telemetry
    ? {
      schema_version: "1.0",
      vehicle_id: truck.id,
      ts: telemetry.ts ?? truck.last_seen ?? "",
      seq: truck.telemetry_seq ?? 1,
      source: "Hardware",
      engine_on: telemetry.engine_on ?? null,
      speed_kmph: telemetry.speed_kmph ?? null,
      engine_rpm: telemetry.engine_rpm ?? truck.engine_rpm,
      engine_load_nm: telemetry.engine_load_nm ?? null,
      ambient_temp_c: telemetry.ambient_temp_c ?? truck.ambient_temp_c,
      coolant_temp_c: telemetry.coolant_temp_c ?? truck.coolant_temp_c,
      vibration_rms_g: telemetry.vibration_rms_g ?? null,
      accel_long_g: telemetry.accel_long_g ?? null,
      battery_v: telemetry.battery_v ?? null,
      fuel_level_pct: telemetry.fuel_level_pct ?? null,
      odometer_km: telemetry.odometer_km ?? null,
      engine_hours_since_service: telemetry.engine_hours_since_service ?? null,
      lat: telemetry.lat ?? null,
      lon: telemetry.lon ?? null,
    }
    : null;
  const speed = telemetry?.speed_kmph;
  const engineOn = telemetry?.engine_on;
  const operationalState = typeof speed === "number" && speed > 1
    ? "Moving"
    : engineOn === true && speed === 0 ? "Idle"
      : engineOn === false ? "Parked" : "Unknown";
  return {
    vehicle_id: truck.id,
    device_id: truck.device_id ?? null,
    vehicle_type: truck.model,
    registration: truck.id,
    driver: null,
    source,
    operational_state: source === "Hardware" ? operationalState : "Unknown",
    connectivity: truck.connectivity ?? "Unknown",
    last_seen: truck.last_seen ?? null,
    data_quality: "Unknown",
    location: telemetry && typeof telemetry.lat === "number" && typeof telemetry.lon === "number"
      ? { lat: telemetry.lat, lon: telemetry.lon, source: "Hardware", timestamp: telemetry.ts ?? truck.last_seen ?? "" }
      : null,
    // /api/fleet is a current seeded snapshot, not a history feed.
    readings: latestReading ? [latestReading] : [],
    current_scenario: source === "Hardware" ? null : "Normal operation",
    ...(hasCompleteModelInputs(truck) ? { model_inputs: {
      ambient_temp_c: truck.ambient_temp_c,
      coolant_temp_c: truck.coolant_temp_c,
      engine_rpm: truck.engine_rpm,
      engine_torque_nm: truck.engine_torque_nm,
      operating_wear_min: truck.operating_wear_min,
      duty: truck.duty,
    } } : {}),
    status: {
      data_quality: "Unknown",
      model_in_range: truck.model_in_range,
      failure_prob: probability,
      risk_score: percent,
      risk_band: probability === null ? "Unknown" : riskBand,
      health: { cooling: null, drivetrain: null, fuel: null },
      hours_to_service: null,
      forecast_bounds: null,
      explanation: probability === null
        ? "No prediction was produced because this unit's latest telemetry does not include all required model inputs."
        : `Backend ${truck.risk_level.toLowerCase()} tier${truck.failure_predicted ? "; failure threshold crossed" : ""}. The model is mapped from the AI4I industrial dataset and is not validated for truck failures.`,
      provenance: `Flask /api/fleet; ${source.toLowerCase()} telemetry`,
    },
    fuel_status: null,
  };
}

export class FlaskFleetApi implements FleetApi {
  async getSnapshot(): Promise<FleetSnapshot> {
    const [health, trucks] = await Promise.all([
      requestJson<BackendHealth>("/health"),
      requestJson<BackendTruck[]>("/fleet"),
    ]);
    if (health.status !== "healthy") throw new Error("FleetGuard backend reported an unhealthy status.");
    const vehicles = trucks.map(vehicleFromBackend);
    const generatedAt = new Date().toISOString();
    return {
      vehicles,
      alerts: [],
      work_orders: [],
      summary: {
        total_vehicles: vehicles.length,
        online_vehicles: vehicles.filter((vehicle) => vehicle.connectivity === "Online").length,
        attention_vehicles: vehicles.filter((vehicle) => ["High", "Critical"].includes(vehicle.status?.risk_band ?? "")).length,
        open_work_orders: 0,
        fuel_consumed_l_period: null,
        fuel_cost_period: null,
        time_window_label: "Current backend snapshot",
        calculation_basis: "Online counts reflect registered hardware sessions; seeded demo units have no live connection state. No history, GPS, fuel volume, alerts, or work orders are supplied.",
      },
      cost_assumptions: {
        fuel_price_per_liter: 0,
        downtime_cost_per_hour: 0,
        typical_service_cost: 0,
        excessive_idle_minutes: 30,
        fuel_drop_threshold_pct: 8,
      },
      generated_at: generatedAt,
      mode: "backend",
      backend_model_mode: health.mock_mode ? "mock" : health.model_loaded ? "model" : "unavailable",
    };
  }

  async acknowledgeAlert(_alertId: string): Promise<void> {
    throw new Error("The Flask backend does not provide alert write operations.");
  }

  async resetDemo(): Promise<void> {
    throw new Error("The Flask backend does not provide a demo reset operation.");
  }

  subscribeLive(onMessage: (snapshot: FleetSnapshot) => void, onState: (state: "connected" | "reconnecting" | "unavailable") => void): () => void {
    let stopped = false;
    let busy = false;
    const refresh = async () => {
      if (busy || stopped) return;
      busy = true;
      try {
        onMessage(await this.getSnapshot());
        if (!stopped) onState("connected");
      } catch {
        if (!stopped) onState("reconnecting");
      } finally {
        busy = false;
      }
    };
    const timer = window.setInterval(refresh, 30_000);
    return () => { stopped = true; window.clearInterval(timer); };
  }
}

export class MockFleetApi implements FleetApi {
  async getSnapshot(): Promise<FleetSnapshot> { return resetDemo(); }
  async acknowledgeAlert(_alertId: string): Promise<void> { return; }
  async resetDemo(): Promise<void> { return; }
  subscribeLive(_onMessage: (snapshot: FleetSnapshot) => void, onState: (state: "connected" | "reconnecting" | "unavailable") => void): () => void {
    onState("unavailable");
    return () => undefined;
  }
}

// Production defaults to Flask. Simulator mode must be selected explicitly.
export const fleetApi: FleetApi = import.meta.env.VITE_FLEET_API_MODE === "mock"
  ? new MockFleetApi()
  : new FlaskFleetApi();
