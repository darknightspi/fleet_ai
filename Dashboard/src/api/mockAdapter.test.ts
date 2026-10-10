import { describe, expect, it } from "vitest";
import { acknowledgeAlert, applyScenario, createWorkOrder, resetDemo, updateCostAssumptions } from "./mockAdapter";

describe("deterministic demo adapter", () => {
  it("starts with six simulated vehicles and no fabricated locations", () => {
    const snapshot = resetDemo();
    expect(snapshot.vehicles).toHaveLength(8);
    expect(snapshot.vehicles.map((vehicle) => vehicle.vehicle_id)).toEqual(["001", "002", "003", "004", "005", "006", "007", "008"]);
    expect(snapshot.vehicles.every((vehicle) => vehicle.source === "Simulated")).toBe(true);
    expect(snapshot.vehicles.every((vehicle) => vehicle.location === null)).toBe(true);
    expect(snapshot.vehicles[5].connectivity).toBe("Stale");
    expect(snapshot.summary.fuel_consumed_l_period).toBeNull();
    expect(snapshot.summary.fuel_cost_period).toBeNull();
  });

  it("confirms persistent cooling while retaining single-spike rejection", () => {
    const snapshot = resetDemo();
    expect(snapshot.vehicles.find((vehicle) => vehicle.vehicle_id === "002")?.demo_evidence?.cooling_confirmed).toBe(true);
    const spikeVehicle = snapshot.vehicles.find((vehicle) => vehicle.vehicle_id === "004");
    expect(spikeVehicle?.demo_evidence?.single_spike_ignored).toBe(true);
    expect(spikeVehicle?.demo_evidence?.cooling_confirmed).toBe(false);
    expect(snapshot.vehicles[0].status?.failure_prob).toBeNull();
  });

  it("acknowledges an alert without deleting its evidence", () => {
    const snapshot = resetDemo();
    const original = snapshot.alerts[0];
    const updated = acknowledgeAlert(snapshot, original.alert_id);
    const alert = updated.alerts.find((item) => item.alert_id === original.alert_id);
    expect(alert?.status).toBe("Acknowledged");
    expect(alert?.latest_evidence).toBe(original.latest_evidence);
  });

  it("creates one local work order linked to the selected alert", () => {
    const snapshot = resetDemo();
    const alertId = snapshot.alerts.find((alert) => alert.status === "Open")?.alert_id;
    expect(alertId).toBeDefined();
    const first = createWorkOrder(snapshot, alertId!);
    const second = createWorkOrder(first, alertId!);
    expect(second.work_orders.filter((workOrder) => workOrder.linked_alert_id === alertId)).toHaveLength(1);
    expect(second.work_orders.at(-1)?.simulated).toBe(true);
  });

  it("resets an injected scenario to the same deterministic baseline", () => {
    const initial = resetDemo();
    const changed = applyScenario(initial, "001", "Persistent cooling degradation");
    expect(changed.vehicles.find((vehicle) => vehicle.vehicle_id === "001")?.demo_evidence?.cooling_confirmed).toBe(true);
    const reset = resetDemo();
    expect(reset.vehicles[0].current_scenario).toBe(initial.vehicles[0].current_scenario);
    expect(reset.vehicles[0].status?.risk_score).toBe(initial.vehicles[0].status?.risk_score);
  });

  it("detects a simulated rapid fuel drop only as a suspicion and applies its configured threshold", () => {
    const initial = resetDemo();
    const changed = applyScenario(initial, "001", "Fuel drop while stationary");
    expect(changed.vehicles[0].fuel_status?.fuel_drop_event).toBe(true);
    const stricter = updateCostAssumptions(changed, { fuel_drop_threshold_pct: 25 });
    expect(stricter.vehicles[0].fuel_status?.fuel_drop_event).toBe(false);
    expect(stricter.alerts.every((alert) => !alert.summary.toLowerCase().includes("theft"))).toBe(true);
  });
});
