import type { FleetSnapshot, Vehicle } from "../types";
import { resetDemo } from "./mockAdapter";

export interface FleetApi {
  getSnapshot(): Promise<FleetSnapshot>;
  acknowledgeAlert(alertId: string): Promise<void>;
  resetDemo(): Promise<void>;
  subscribeLive(onMessage: (snapshot: FleetSnapshot) => void, onState: (state: "connected" | "reconnecting" | "unavailable") => void): () => void;
}

type BackendHealth = { status: string; model_loaded: boolean; mock_mode: boolean };
type BackendTruck = {
  id: string;
  model: string;
  duty: string;
  ambient_temp_c: number;
  coolant_temp_c: number;
  engine_rpm: number;
  engine_torque_nm: number;
  operating_wear_min: number;
  failure_predicted: boolean;
  failure_probability: number;
  risk_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  model_in_range: boolean;
};

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
      : truck.risk_level === "HIGH" ? "High" : "Critical";
  return {
    vehicle_id: truck.id,
    vehicle_type: truck.model,
    registration: truck.id,
    driver: null,
    source: "Simulated",
    operational_state: "Unknown",
    connectivity: "Unknown",
    last_seen: null,
    data_quality: "Unknown",
    location: null,
    // /api/fleet is a current seeded snapshot, not a history feed.
    readings: [],
    current_scenario: "Normal operation",
    model_inputs: {
      ambient_temp_c: truck.ambient_temp_c,
      coolant_temp_c: truck.coolant_temp_c,
      engine_rpm: truck.engine_rpm,
      engine_torque_nm: truck.engine_torque_nm,
      operating_wear_min: truck.operating_wear_min,
      duty: truck.duty,
    },
    status: {
      data_quality: "Unknown",
      model_in_range: truck.model_in_range,
      failure_prob: probability,
      risk_score: percent,
      risk_band: probability === null ? "Unknown" : riskBand,
      health: { cooling: null, drivetrain: null, fuel: null },
      hours_to_service: null,
      forecast_bounds: null,
      explanation: `Backend ${truck.risk_level.toLowerCase()} tier${truck.failure_predicted ? "; failure threshold crossed" : ""}. The model is mapped from the AI4I industrial dataset and is not validated for truck failures.`,
      provenance: "Flask /api/fleet prediction; simulated vehicle inputs",
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
        online_vehicles: null,
        attention_vehicles: vehicles.filter((vehicle) => ["High", "Critical"].includes(vehicle.status?.risk_band ?? "")).length,
        open_work_orders: 0,
        fuel_consumed_l_period: null,
        fuel_cost_period: null,
        time_window_label: "Current backend snapshot",
        calculation_basis: "The Flask API does not supply telemetry history, GPS, fuel volume, alerts, or work orders.",
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
    onState("connected");
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
