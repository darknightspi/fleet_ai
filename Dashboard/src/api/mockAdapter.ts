import { configuredDemoBaseline, riskBand } from "../analytics";
import type {
  Alert,
  AlertSeverity,
  DemoScenario,
  FleetSnapshot,
  Reading,
  Source,
  Vehicle,
  WorkOrder,
} from "../types";

const BASE_NOW = Date.now();
const INTERVAL_MS = 15 * 60_000;

const vehicleSeeds = [
  { id: "001", type: "Long-haul truck", driver: "Avery Brooks", scenario: "Normal operation" as const },
  { id: "002", type: "Delivery van", driver: "Morgan Lee", scenario: "Persistent cooling degradation" as const },
  { id: "003", type: "Utility truck", driver: "Jordan Patel", scenario: "Increasing vibration" as const },
  { id: "004", type: "Cab-over truck", driver: "Taylor Kim", scenario: "Single noisy temperature spike" as const },
  { id: "005", type: "Box truck", driver: "Casey Nguyen", scenario: "Excessive idling" as const },
  { id: "006", type: "Electric truck", driver: null, scenario: "Stale telemetry / disconnection" as const },
  { id: "007", type: "Flatbed truck", driver: null, scenario: "Normal operation" as const },
  { id: "008", type: "Service truck", driver: null, scenario: "Normal operation" as const },
];

const scenarioNames: DemoScenario[] = [
  "Normal operation",
  "Single noisy temperature spike",
  "Persistent cooling degradation",
  "Increasing vibration",
  "Fuel drop while stationary",
  "Excessive idling",
  "Stale telemetry / disconnection",
  "Recovery after fault ends",
];

function baselineTemperature(ambient: number, load: number): number {
  return ambient + 39 + load * 0.09;
}

function makeReadings(vehicleId: string, scenario: DemoScenario, now: number, offsetHours = 0): Reading[] {
  const readings: Reading[] = [];
  const staleShift = scenario === "Stale telemetry / disconnection" ? 18 : offsetHours;
  const seedIndex = vehicleSeeds.findIndex((vehicle) => vehicle.id === vehicleId);

  for (let index = 0; index < 96; index += 1) {
    const progress = index / 95;
    const time = new Date(now - staleShift * 3_600_000 - (95 - index) * INTERVAL_MS).toISOString();
    const ambient = 22 + Math.sin(index / 14 + seedIndex) * 2.8;
    const moving = vehicleId !== "005" && vehicleId !== "006";
    let speed = moving ? Math.max(0, 38 + Math.sin(index / 8 + seedIndex) * 20) : 0;
    let engineOn = vehicleId !== "006";
    let load = engineOn ? 90 + 90 * Math.abs(Math.sin(index / 9 + seedIndex)) : 0;
    let vibration = 0.18 + Math.abs(Math.sin(index / 7 + seedIndex)) * 0.13;
    const expected = baselineTemperature(ambient, load);
    let coolant = expected + 1.5 + Math.sin(index / 6 + seedIndex) * 1.2;
    let fuel = Math.max(20, 86 - progress * (8 + seedIndex * 0.4));

    if (vehicleId === "002" || scenario === "Persistent cooling degradation") {
      coolant += scenario === "Persistent cooling degradation" ? 7 + progress * 14 : progress * 15;
    }
    if (vehicleId === "003" || scenario === "Increasing vibration") {
      vibration += scenario === "Increasing vibration" ? 0.16 + progress * 0.68 : progress * 0.58;
    }
    if ((vehicleId === "004" && index === 61) || (scenario === "Single noisy temperature spike" && index === 61)) {
      coolant += 28;
    }
    if (vehicleId === "005" || scenario === "Excessive idling") {
      engineOn = true;
      speed = 0;
      load = 45;
      coolant = baselineTemperature(ambient, load) + 1.2;
      fuel -= progress * 12;
    }
    if (scenario === "Fuel drop while stationary" && index === 80) {
      speed = 0;
      fuel -= 22;
    } else if (scenario === "Fuel drop while stationary" && index > 80) {
      speed = 0;
    }
    if (scenario === "Recovery after fault ends" && index >= 82) {
      coolant = expected + 1;
      vibration = Math.min(vibration, 0.24);
      speed = 25 + Math.sin(index / 5) * 8;
    }
    if (scenario === "Normal operation") {
      coolant = expected + 1 + Math.sin(index / 5) * 0.8;
      vibration = 0.2 + Math.abs(Math.sin(index / 6)) * 0.08;
      speed = 35 + Math.abs(Math.sin(index / 8)) * 18;
      engineOn = true;
    }
    if (scenario === "Stale telemetry / disconnection") {
      engineOn = false;
      speed = 0;
      load = 0;
      coolant = expected;
      vibration = 0;
    }

    readings.push({
      schema_version: "1.0",
      vehicle_id: vehicleId,
      ts: time,
      seq: index + 1,
      source: "Simulated",
      engine_on: engineOn,
      speed_kmph: speed,
      engine_rpm: engineOn ? 850 + speed * 21 : 0,
      engine_load_nm: load,
      ambient_temp_c: ambient,
      coolant_temp_c: coolant,
      vibration_rms_g: vibration,
      accel_long_g: 0.04 * Math.sin(index / 4),
      battery_v: vehicleId === "006" ? null : 13.8 + 0.3 * Math.sin(index / 12),
      fuel_level_pct: vehicleId === "006" ? null : Math.max(0, fuel),
      odometer_km: 90_000 + seedIndex * 15_000 + index * Math.max(0, speed) * 0.25 / 96,
      engine_hours_since_service: 220 + seedIndex * 110 + index * (engineOn ? 0.004 : 0),
      lat: null,
      lon: null,
    });
  }
  return readings;
}

function findPersistent(values: number[], threshold: number, required = 3, window = 5): boolean {
  return values.slice(-window).filter((value) => value > threshold).length >= required;
}

function withDerivedState(
  vehicleId: string,
  vehicleType: string,
  driver: string | null,
  scenario: DemoScenario,
  now: number,
  fuelDropThreshold = 8,
): Vehicle {
  const readings = makeReadings(vehicleId, scenario, now);
  const latest = readings.at(-1);
  const residuals = readings.map((reading) =>
    reading.coolant_temp_c !== null && configuredDemoBaseline(reading) !== null
      ? reading.coolant_temp_c - configuredDemoBaseline(reading)!
      : null,
  );
  const recentResiduals = residuals.slice(-5).filter((value): value is number => value !== null);
  const recentVibration = readings.slice(-5).map((reading) => reading.vibration_rms_g ?? 0);
  const coolingConfirmed = findPersistent(recentResiduals, 8);
  const vibrationConfirmed = findPersistent(recentVibration, 0.62);
  const normalizedCoolant = readings.map((reading) =>
    reading.coolant_temp_c !== null && configuredDemoBaseline(reading) !== null
      ? reading.coolant_temp_c - configuredDemoBaseline(reading)!
      : 0,
  );
  const lastWindowAbnormal = normalizedCoolant.slice(-5).filter((value) => value > 8).length;
  const lastWindowVibration = recentVibration.filter((value) => value > 0.62).length;
  const meanResidual = recentResiduals.reduce((sum, value) => sum + value, 0) / Math.max(1, recentResiduals.length);
  const meanVibration = recentVibration.reduce((sum, value) => sum + value, 0) / Math.max(1, recentVibration.length);
  const score = Math.max(
    coolingConfirmed ? Math.min(96, 65 + Math.max(0, meanResidual - 8) * 1.7) : 16 + Math.max(0, meanResidual - 4) * 3,
    vibrationConfirmed ? Math.min(88, 58 + Math.max(0, meanVibration - 0.62) * 38) : 16 + Math.max(0, meanVibration - 0.35) * 35,
  );
  const stale = scenario === "Stale telemetry / disconnection";
  const idleCount = readings.filter((reading) => reading.engine_on && reading.speed_kmph === 0).length;
  const componentHealth = {
    cooling: coolingConfirmed ? Math.min(1, 0.55 + Math.max(0, meanResidual - 8) / 35) : 0.12,
    drivetrain: vibrationConfirmed ? Math.min(1, 0.5 + Math.max(0, meanVibration - 0.62) / 1.5) : 0.1,
    fuel: scenario === "Fuel drop while stationary" || scenario === "Excessive idling" ? 0.55 : 0.12,
  };
  const scoreValue = Number.isFinite(score) ? Math.round(score) : null;
  const band = stale ? "Unknown" : riskBand(scoreValue);
  const explanation = stale
    ? "Risk is unavailable because telemetry is stale; missing data is not treated as a healthy reading."
    : coolingConfirmed
      ? `Simulated coolant temperature is ${meanResidual.toFixed(1)}°C above the configured load-adjusted baseline across the confirmation window. This is a trend signal, not a confirmed defect.`
      : vibrationConfirmed
        ? `Simulated vibration remained above the demo threshold in the persistence window (recent mean ${meanVibration.toFixed(2)} g). Inspect if the trend continues.`
        : "No persistent simulated thermal or vibration deviation is confirmed in the latest readings.";

  const lastSeen = latest?.ts ?? null;
  return {
    vehicle_id: vehicleId,
    vehicle_type: vehicleType,
    registration: `DEMO-${vehicleId.slice(-3)}`,
    driver,
    source: "Simulated",
    operational_state: stale ? "Unknown" : latest?.engine_on ? (latest.speed_kmph && latest.speed_kmph > 1 ? "Moving" : "Idle") : "Parked",
    connectivity: stale ? "Stale" : "Online",
    last_seen: lastSeen,
    data_quality: stale ? "Unavailable" : "Good",
    location: null,
    readings,
    current_scenario: scenario,
    demo_evidence: {
      cooling_confirmed: coolingConfirmed,
      vibration_confirmed: vibrationConfirmed,
      single_spike_ignored: scenario === "Single noisy temperature spike",
      confirmation_signal: coolingConfirmed ? "Coolant residual" : vibrationConfirmed ? "Vibration" : "None",
      abnormal_readings_k_of_n: coolingConfirmed ? lastWindowAbnormal : vibrationConfirmed ? lastWindowVibration : 0,
      window_size: 5,
    },
    status: {
      data_quality: stale ? "Unavailable" : "Good",
      model_in_range: null,
      failure_prob: null,
      risk_score: stale ? null : scoreValue,
      risk_band: band,
      health: stale ? { cooling: null, drivetrain: null, fuel: null } : componentHealth,
      hours_to_service: null,
      forecast_bounds: null,
      explanation,
      provenance: "Local deterministic simulator; rule-based display indicator only",
    },
    fuel_status: {
      km_per_l_rolling: null,
      idle_minutes_today: stale ? null : idleCount * 15,
      idle_fuel_l_today: null,
      fuel_drop_event: detectFuelDrop(readings, fuelDropThreshold),
      harsh_events_today: null,
      cost_per_km_inr: null,
      fuel_consumed_l_period: null,
    },
  };
}

function detectFuelDrop(readings: Reading[], thresholdPct: number): boolean | null {
  let hasComparableReadings = false;
  for (let index = 1; index < readings.length; index += 1) {
    const previous = readings[index - 1];
    const current = readings[index];
    if (
      previous.fuel_level_pct !== null &&
      current.fuel_level_pct !== null &&
      Number.isFinite(previous.fuel_level_pct) &&
      Number.isFinite(current.fuel_level_pct)
    ) hasComparableReadings = true;
    if (
      previous.fuel_level_pct !== null &&
      current.fuel_level_pct !== null &&
      previous.fuel_level_pct - current.fuel_level_pct >= thresholdPct &&
      current.engine_on === true &&
      current.speed_kmph === 0
    ) return true;
  }
  return hasComparableReadings ? false : null;
}

function makeAlert(
  alertId: string,
  vehicleId: string,
  severity: AlertSeverity,
  type: string,
  summary: string,
  explanation: string,
  recommendation: string,
  now: number,
  status: Alert["status"] = "Open",
): Alert {
  return {
    alert_id: alertId,
    vehicle_id: vehicleId,
    severity,
    type,
    summary,
    first_detected: new Date(now - 45 * 60_000).toISOString(),
    latest_evidence: new Date(now).toISOString(),
    source: "Simulated",
    status,
    explanation,
    recommendation,
    acknowledged_at: null,
    resolution_notes: null,
    linked_work_order_id: null,
  };
}

function scenarioAlert(vehicle: Vehicle, alertId: string, now: number, idleThreshold = 30): Alert | null {
  switch (vehicle.current_scenario) {
    case "Persistent cooling degradation":
      return makeAlert(alertId, vehicle.vehicle_id, "High", "Cooling trend", "Coolant temperature remains above its load-adjusted baseline.", vehicle.status?.explanation ?? "", "Inspect the cooling system if the abnormal trend persists.", now);
    case "Increasing vibration":
      return makeAlert(alertId, vehicle.vehicle_id, "High", "Vibration anomaly", "Vibration has remained elevated through the demo confirmation window.", vehicle.status?.explanation ?? "", "Inspect drivetrain mounts and rotating components; do not treat this indicator as a confirmed fault.", now);
    case "Single noisy temperature spike":
      return makeAlert(alertId, vehicle.vehicle_id, "Info", "Filtered sensor spike", "A single simulated spike was ignored by persistence confirmation.", "One short-lived reading exceeded the demo threshold; fewer than three of the last five readings confirmed it.", "Continue monitoring; no work order is recommended from one isolated spike.", now, "Resolved");
    case "Fuel drop while stationary":
      return vehicle.fuel_status?.fuel_drop_event
        ? makeAlert(alertId, vehicle.vehicle_id, "Medium", "Suspicious fuel drop", "A simulated rapid fuel-level decrease occurred while stationary.", "This is a sensor-derived suspicion only; it does not confirm theft or leakage.", "Validate sensor quality and vehicle state before investigation.", now)
        : null;
    case "Excessive idling":
      return (vehicle.fuel_status?.idle_minutes_today ?? 0) >= idleThreshold
        ? makeAlert(alertId, vehicle.vehicle_id, "Medium", "Excessive idling", "Engine-on, zero-speed intervals exceeded the configured demo duration.", "The simulator observed stationary engine-on intervals; idle fuel volume is unavailable.", "Review the duty cycle and avoid unnecessary engine-on idle time.", now)
        : null;
    case "Stale telemetry / disconnection":
      return makeAlert(alertId, vehicle.vehicle_id, "Critical", "Stale telemetry", "No current telemetry is available for this simulated vehicle.", "The latest valid simulated message is older than the freshness window.", "Check the telemetry link; vehicle health is unknown until data resumes.", now);
    case "Recovery after fault ends":
      return makeAlert(alertId, vehicle.vehicle_id, "Info", "Trend recovery", "Recent simulated readings have returned toward the configured baseline.", "Recovery is based on recent measurements; the prior evidence remains in alert history.", "Continue monitoring before closing any related work order.", now, "Resolved");
    default:
      return null;
  }
}

function makeInitialSnapshot(): FleetSnapshot {
  const vehicles = vehicleSeeds.map((seed) => withDerivedState(seed.id, seed.type, seed.driver, seed.scenario, BASE_NOW));
  const alerts = vehicles.flatMap((vehicle, index) => {
    const alert = scenarioAlert(vehicle, `DEMO-${String(index + 1).padStart(3, "0")}`, BASE_NOW);
    return alert ? [alert] : [];
  });
  const workOrders: WorkOrder[] = [
    {
      work_order_id: "DEMO-WO-001",
      vehicle_id: "002",
      linked_alert_id: alerts.find((alert) => alert.vehicle_id === "002")?.alert_id ?? null,
      issue_summary: "Inspect persistent simulated cooling trend",
      recommended_inspection: "Check coolant circuit and validate temperature sensor after confirming telemetry.",
      priority: "High",
      assigned_technician: null,
      created_at: new Date(BASE_NOW - 2 * 3_600_000).toISOString(),
      due_at: null,
      status: "Open",
      estimated_cost: null,
      actual_cost: null,
      resolution_notes: null,
      simulated: true,
    },
  ];
  return {
    vehicles,
    alerts,
    work_orders: workOrders,
    summary: {
      total_vehicles: vehicles.length,
      online_vehicles: vehicles.filter((vehicle) => vehicle.connectivity === "Online").length,
      attention_vehicles: vehicles.filter((vehicle) => ["High", "Critical"].includes(vehicle.status?.risk_band ?? "")).length,
      open_work_orders: workOrders.length,
      fuel_consumed_l_period: null,
      fuel_cost_period: null,
      time_window_label: "Simulated 24-hour window",
      calculation_basis: "Unavailable: the supplied telemetry contract has fuel percentage but no tank capacity or fuel-volume measurement.",
    },
    cost_assumptions: {
      fuel_price_per_liter: 102,
      downtime_cost_per_hour: 0,
      typical_service_cost: 0,
      excessive_idle_minutes: 30,
      fuel_drop_threshold_pct: 8,
    },
    generated_at: new Date(BASE_NOW).toISOString(),
    mode: "mock",
  };
}

export function resetDemo(): FleetSnapshot {
  return makeInitialSnapshot();
}

export function applyScenario(snapshot: FleetSnapshot, vehicleId: string, scenario: DemoScenario): FleetSnapshot {
  if (!scenarioNames.includes(scenario)) throw new Error(`Unsupported demo scenario: ${scenario}`);
  const vehicleSeed = vehicleSeeds.find((entry) => entry.id === vehicleId);
  if (!vehicleSeed) throw new Error(`Unknown demo vehicle: ${vehicleId}`);
  const updatedVehicle = withDerivedState(
    vehicleId,
    vehicleSeed.type,
    vehicleSeed.driver,
    scenario,
    BASE_NOW,
    snapshot.cost_assumptions.fuel_drop_threshold_pct,
  );
  const vehicles = snapshot.vehicles.map((vehicle) => vehicle.vehicle_id === vehicleId ? updatedVehicle : vehicle);
  const alertId = `DEMO-${vehicleId}-${scenario.replaceAll(/[^a-zA-Z0-9]/g, "-").toUpperCase()}`;
  const newAlert = scenarioAlert(updatedVehicle, alertId, BASE_NOW, snapshot.cost_assumptions.excessive_idle_minutes);
  const alerts = newAlert
    ? [...snapshot.alerts.filter((alert) => alert.alert_id !== alertId), newAlert]
    : snapshot.alerts.filter((alert) => alert.vehicle_id !== vehicleId || alert.status === "Resolved");
  return {
    ...snapshot,
    vehicles,
    alerts,
    summary: {
      ...snapshot.summary,
      online_vehicles: vehicles.filter((vehicle) => vehicle.connectivity === "Online").length,
      attention_vehicles: vehicles.filter((vehicle) => ["High", "Critical"].includes(vehicle.status?.risk_band ?? "")).length,
      fuel_consumed_l_period: null,
      fuel_cost_period: null,
    },
    generated_at: new Date(BASE_NOW).toISOString(),
  };
}

export function acknowledgeAlert(snapshot: FleetSnapshot, alertId: string): FleetSnapshot {
  const alert = snapshot.alerts.find((item) => item.alert_id === alertId);
  if (!alert) throw new Error(`Alert not found: ${alertId}`);
  if (alert.status === "Resolved") return snapshot;
  return {
    ...snapshot,
    alerts: snapshot.alerts.map((item) => item.alert_id === alertId
      ? { ...item, status: "Acknowledged", acknowledged_at: new Date().toISOString() }
      : item),
  };
}

export function resolveAlert(snapshot: FleetSnapshot, alertId: string, resolutionNotes: string): FleetSnapshot {
  if (!snapshot.alerts.some((alert) => alert.alert_id === alertId)) throw new Error(`Alert not found: ${alertId}`);
  return {
    ...snapshot,
    alerts: snapshot.alerts.map((alert) => alert.alert_id === alertId
      ? { ...alert, status: "Resolved", resolution_notes: resolutionNotes.trim() || "Resolved in local demo." }
      : alert),
  };
}

export function createWorkOrder(snapshot: FleetSnapshot, alertId: string): FleetSnapshot {
  const alert = snapshot.alerts.find((item) => item.alert_id === alertId);
  if (!alert) throw new Error(`Cannot create a work order: alert ${alertId} does not exist`);
  const existing = snapshot.work_orders.find((item) => item.linked_alert_id === alertId && item.status !== "Completed");
  if (existing) return snapshot;
  const workOrder: WorkOrder = {
    work_order_id: `DEMO-WO-${String(snapshot.work_orders.length + 1).padStart(3, "0")}`,
    vehicle_id: alert.vehicle_id,
    linked_alert_id: alertId,
    issue_summary: alert.summary,
    recommended_inspection: alert.recommendation,
    priority: alert.severity,
    assigned_technician: null,
    created_at: new Date().toISOString(),
    due_at: null,
    status: "Open",
    estimated_cost: null,
    actual_cost: null,
    resolution_notes: null,
    simulated: true,
  };
  return {
    ...snapshot,
    work_orders: [...snapshot.work_orders, workOrder],
    alerts: snapshot.alerts.map((item) =>
      item.alert_id === alertId ? { ...item, linked_work_order_id: workOrder.work_order_id } : item,
    ),
    summary: { ...snapshot.summary, open_work_orders: snapshot.summary.open_work_orders + 1 },
  };
}

export function updateWorkOrder(
  snapshot: FleetSnapshot,
  workOrderId: string,
  changes: Partial<Pick<WorkOrder, "assigned_technician" | "status" | "resolution_notes">>,
): FleetSnapshot {
  if (!snapshot.work_orders.some((item) => item.work_order_id === workOrderId)) {
    throw new Error(`Work order not found: ${workOrderId}`);
  }
  const work_orders = snapshot.work_orders.map((item) => item.work_order_id === workOrderId ? { ...item, ...changes } : item);
  return {
    ...snapshot,
    work_orders,
    summary: {
      ...snapshot.summary,
      open_work_orders: work_orders.filter((item) => ["Open", "In progress"].includes(item.status)).length,
    },
  };
}

export function updateCostAssumptions(
  snapshot: FleetSnapshot,
  changes: Partial<FleetSnapshot["cost_assumptions"]>,
): FleetSnapshot {
  const cost_assumptions = { ...snapshot.cost_assumptions, ...changes };
  const vehicles = snapshot.vehicles.map((vehicle) => ({
    ...vehicle,
    fuel_status: vehicle.fuel_status
      ? { ...vehicle.fuel_status, fuel_drop_event: detectFuelDrop(vehicle.readings, cost_assumptions.fuel_drop_threshold_pct) }
      : null,
  }));
  return {
    ...snapshot,
    cost_assumptions,
    vehicles,
    summary: {
      ...snapshot.summary,
      fuel_consumed_l_period: null,
      fuel_cost_period: null,
    },
  };
}

export const demoVehicleIds = vehicleSeeds.map((vehicle) => vehicle.id);

export function sourceLabel(source: Source): string {
  return source === "Simulated" ? "Simulated demo" : source;
}
