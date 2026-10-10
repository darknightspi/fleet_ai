export type Source = "Hardware" | "Simulated" | "Replay";
export type RiskBand = "Normal" | "Watch" | "High" | "Critical" | "Unknown";
export type Connectivity = "Online" | "Stale" | "Offline" | "Unknown";
export type OperationalState = "Moving" | "Idle" | "Parked" | "Maintenance" | "Unknown";
export type AlertSeverity = "Critical" | "High" | "Medium" | "Info";
export type AlertState = "Open" | "Acknowledged" | "Resolved";
export type ComponentName = "cooling" | "drivetrain" | "fuel";
export type DemoScenario =
  | "Normal operation"
  | "Single noisy temperature spike"
  | "Persistent cooling degradation"
  | "Increasing vibration"
  | "Fuel drop while stationary"
  | "Excessive idling"
  | "Stale telemetry / disconnection"
  | "Recovery after fault ends";

export interface Reading {
  schema_version: string;
  vehicle_id: string;
  ts: string;
  seq: number;
  source: Source;
  engine_on: boolean | null;
  speed_kmph: number | null;
  engine_rpm: number | null;
  engine_load_nm: number | null;
  ambient_temp_c: number | null;
  coolant_temp_c: number | null;
  vibration_rms_g: number | null;
  accel_long_g: number | null;
  battery_v: number | null;
  fuel_level_pct: number | null;
  odometer_km: number | null;
  engine_hours_since_service: number | null;
  lat: number | null;
  lon: number | null;
}

export interface VehicleStatus {
  data_quality: "Good" | "Degraded" | "Unavailable" | "Unknown";
  model_in_range: boolean | null;
  failure_prob: number | null;
  risk_score: number | null;
  risk_band: RiskBand;
  health: Record<ComponentName, number | null>;
  hours_to_service: number | null;
  forecast_bounds: { lower: number | null; upper: number | null } | null;
  explanation: string | null;
  provenance: string;
}

export interface FuelStatus {
  km_per_l_rolling: number | null;
  idle_minutes_today: number | null;
  idle_fuel_l_today: number | null;
  fuel_drop_event: boolean | null;
  harsh_events_today: number | null;
  cost_per_km_inr: number | null;
  fuel_consumed_l_period: number | null;
}

export interface Vehicle {
  vehicle_id: string;
  device_id?: string | null;
  vehicle_type: string;
  registration: string;
  driver: string | null;
  source: Source;
  operational_state: OperationalState;
  connectivity: Connectivity;
  last_seen: string | null;
  data_quality: "Good" | "Degraded" | "Unavailable" | "Unknown";
  location: { lat: number; lon: number; source: Source; timestamp: string } | null;
  readings: Reading[];
  status: VehicleStatus | null;
  fuel_status: FuelStatus | null;
  current_scenario: DemoScenario | null;
  model_inputs?: {
    ambient_temp_c: number;
    coolant_temp_c: number;
    engine_rpm: number;
    engine_torque_nm: number;
    operating_wear_min: number;
    duty: string;
  };
  demo_evidence?: {
    cooling_confirmed: boolean;
    vibration_confirmed: boolean;
    single_spike_ignored: boolean;
    confirmation_signal: "Coolant residual" | "Vibration" | "None";
    abnormal_readings_k_of_n: number;
    window_size: number;
  };
}

export interface Alert {
  alert_id: string;
  vehicle_id: string;
  severity: AlertSeverity;
  type: string;
  summary: string;
  first_detected: string;
  latest_evidence: string;
  source: Source;
  status: AlertState;
  explanation: string;
  recommendation: string;
  acknowledged_at: string | null;
  resolution_notes: string | null;
  linked_work_order_id: string | null;
}

export interface WorkOrder {
  work_order_id: string;
  vehicle_id: string;
  linked_alert_id: string | null;
  issue_summary: string;
  recommended_inspection: string;
  priority: AlertSeverity;
  assigned_technician: string | null;
  created_at: string;
  due_at: string | null;
  status: "Open" | "In progress" | "Completed" | "Cancelled";
  estimated_cost: number | null;
  actual_cost: number | null;
  resolution_notes: string | null;
  simulated: boolean;
}

export interface CostAssumptions {
  fuel_price_per_liter: number;
  downtime_cost_per_hour: number;
  typical_service_cost: number;
  excessive_idle_minutes: number;
  fuel_drop_threshold_pct: number;
}

export interface FleetSummary {
  total_vehicles: number;
  online_vehicles: number | null;
  attention_vehicles: number;
  open_work_orders: number;
  fuel_consumed_l_period: number | null;
  fuel_cost_period: number | null;
  time_window_label: string;
  calculation_basis: string;
}

export interface FleetSnapshot {
  vehicles: Vehicle[];
  alerts: Alert[];
  work_orders: WorkOrder[];
  summary: FleetSummary;
  cost_assumptions: CostAssumptions;
  generated_at: string;
  mode: "mock" | "backend";
  backend_model_mode?: "model" | "mock" | "unavailable";
}
