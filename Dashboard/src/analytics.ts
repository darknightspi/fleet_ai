import type { Alert, Connectivity, FleetSnapshot, Reading, RiskBand, Vehicle } from "./types";

export function configuredDemoBaseline(reading: Reading): number | null {
  if (reading.source !== "Simulated" || reading.ambient_temp_c === null || reading.engine_load_nm === null) return null;
  return reading.ambient_temp_c + 39 + reading.engine_load_nm * 0.09;
}

export function riskBand(score: number | null): RiskBand {
  if (score === null || !Number.isFinite(score)) return "Unknown";
  if (score >= 80) return "Critical";
  if (score >= 60) return "High";
  if (score >= 30) return "Watch";
  return "Normal";
}

export function ageMinutes(lastSeen: string | null, now = Date.now()): number | null {
  if (!lastSeen) return null;
  const timestamp = Date.parse(lastSeen);
  return Number.isNaN(timestamp) ? null : Math.max(0, (now - timestamp) / 60_000);
}

export function freshnessState(lastSeen: string | null, now = Date.now()): Connectivity {
  const age = ageMinutes(lastSeen, now);
  if (age === null) return "Unknown";
  if (age > 60) return "Stale";
  return "Online";
}

export function filterVehicles(
  vehicles: Vehicle[],
  filters: {
    query?: string;
    status?: Connectivity | "All";
    source?: string | "All";
    risk?: string | "All";
    type?: string | "All";
  },
): Vehicle[] {
  const query = filters.query?.trim().toLowerCase() ?? "";
  return vehicles.filter((vehicle) => {
    const matchesQuery =
      !query ||
      vehicle.vehicle_id.toLowerCase().includes(query) ||
      vehicle.vehicle_type.toLowerCase().includes(query) ||
      (vehicle.driver ?? "").toLowerCase().includes(query);
    const matchesStatus = !filters.status || filters.status === "All" || vehicle.connectivity === filters.status;
    const matchesSource = !filters.source || filters.source === "All" || vehicle.source === filters.source;
    const band = vehicle.status?.risk_band ?? "Unknown";
    const matchesRisk = !filters.risk || filters.risk === "All" || band === filters.risk;
    const matchesType = !filters.type || filters.type === "All" || vehicle.vehicle_type === filters.type;
    return matchesQuery && matchesStatus && matchesSource && matchesRisk && matchesType;
  });
}

export function openAlertCount(alerts: Alert[], vehicleId: string): number {
  return alerts.filter((alert) => alert.vehicle_id === vehicleId && alert.status !== "Resolved").length;
}

export function summaryWithActions(snapshot: FleetSnapshot): FleetSnapshot["summary"] {
  return {
    ...snapshot.summary,
    online_vehicles: snapshot.vehicles.filter((vehicle) => vehicle.connectivity === "Online").length,
    attention_vehicles: snapshot.vehicles.filter((vehicle) =>
      ["High", "Critical"].includes(vehicle.status?.risk_band ?? ""),
    ).length,
    open_work_orders: snapshot.work_orders.filter((workOrder) =>
      ["Open", "In progress"].includes(workOrder.status),
    ).length,
  };
}

export function hardwareConnectionCounts(snapshot: Pick<FleetSnapshot, "mode" | "vehicles">): {
  connected: number;
  registered: number;
  simulated: number;
  stale: number;
  disconnected: number;
} {
  const simulated = snapshot.vehicles.filter((vehicle) => vehicle.source === "Simulated").length;
  if (snapshot.mode === "mock") return { connected: 0, registered: 0, simulated, stale: 0, disconnected: 0 };
  const hardware = snapshot.vehicles.filter((vehicle) => vehicle.source === "Hardware");
  return {
    connected: hardware.filter((vehicle) => vehicle.connectivity === "Online").length,
    registered: hardware.length,
    simulated,
    stale: hardware.filter((vehicle) => vehicle.connectivity === "Stale").length,
    disconnected: hardware.filter((vehicle) => vehicle.connectivity === "Offline").length,
  };
}

export function hardwareConnectionNotice(snapshot: Pick<FleetSnapshot, "mode" | "vehicles">): string {
  const counts = hardwareConnectionCounts(snapshot);
  const stateDetails = [
    counts.disconnected > 0 ? `${counts.disconnected} registered unit${counts.disconnected === 1 ? " is" : "s are"} disconnected` : "",
    counts.stale > 0 ? `${counts.stale} registered unit${counts.stale === 1 ? " has" : "s have"} stale telemetry` : "",
  ].filter(Boolean);
  const suffix = stateDetails.length ? ` ${stateDetails.join("; ")}.` : "";
  if (counts.connected > 0) {
    return `Hardware Connected: ${counts.connected} real RC ${counts.connected === 1 ? "unit" : "units"} connected. Simulated demonstration units remain available.${suffix}`;
  }
  return `Demo Mode: No physical RC units connected. The displayed fleet contains ${counts.simulated > 0 ? "simulated demonstration data" : "no simulated units"}.${suffix}`;
}

export function csvForVehicles(vehicles: Vehicle[]): string {
  const headers = ["Vehicle ID", "Vehicle type", "Source", "Connectivity", "Operational state", "Risk band", "Risk score", "Last seen"];
  const rows = vehicles.map((vehicle) => [
    vehicle.vehicle_id,
    vehicle.vehicle_type,
    vehicle.source,
    vehicle.connectivity,
    vehicle.operational_state,
    vehicle.status?.risk_band ?? "Unknown",
    vehicle.status?.risk_score ?? "N/A",
    vehicle.last_seen ?? "N/A",
  ]);
  return [headers, ...rows]
    .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))
    .join("\r\n");
}

export function formatTime(value: string | null, options?: Intl.DateTimeFormatOptions): string {
  if (!value || Number.isNaN(Date.parse(value))) return "Unavailable";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    ...options,
  }).format(new Date(value));
}
