import { useEffect, useState } from "react";
import { BrowserRouter, Route, Routes, useNavigate } from "react-router-dom";
import { acknowledgeAlert, createWorkOrder, resolveAlert } from "./api/mockAdapter";
import { fleetApi } from "./api/client";
import { AppShell, EmptyState, VehicleDrawer } from "./components";
import {
  AlertsPage,
  DevicesPage,
  FleetPage,
  FuelAnalyticsPage,
  MaintenanceCenterPage,
  OverviewPage,
  PredictiveMaintenancePage,
  ReportsPage,
  SettingsPage,
} from "./pages";
import type { FleetSnapshot } from "./types";
import { Activity, RefreshCw } from "lucide-react";

function DashboardRoutes() {
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState<FleetSnapshot | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [liveState, setLiveState] = useState<"connected" | "reconnecting" | "unavailable">("unavailable");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fleetApi.getSnapshot().then((data) => {
      if (active) {
        setSnapshot(data);
        setError(null);
      }
    }).catch((requestError: unknown) => {
      if (active) setError(requestError instanceof Error ? requestError.message : "Could not load fleet data.");
    });
    const unsubscribe = fleetApi.subscribeLive((data) => setSnapshot(data), setLiveState);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  function updateSnapshot(update: (current: FleetSnapshot) => FleetSnapshot, successMessage?: string) {
    setSnapshot((current) => {
      if (!current) return current;
      try {
        return update(current);
      } catch (actionError) {
        setToast(actionError instanceof Error ? actionError.message : "Action failed.");
        return current;
      }
    });
    if (successMessage) setToast(successMessage);
  }

  function selectVehicle(vehicleId: string) {
    setSelectedVehicleId(vehicleId);
  }

  function acknowledge(alertId: string) {
    updateSnapshot((current) => acknowledgeAlert(current, alertId), "Alert acknowledged. Evidence is retained.");
  }

  function resolve(alertId: string, note: string) {
    updateSnapshot((current) => resolveAlert(current, alertId, note), "Alert resolved. The alert record and evidence remain available.");
  }

  function workOrder(alertId: string) {
    updateSnapshot((current) => createWorkOrder(current, alertId), "Demo work order created or already exists.");
  }

  function globalSearch(query: string) {
    if (!snapshot) return;
    const match = snapshot.vehicles.find((vehicle) =>
      vehicle.vehicle_id.toLowerCase().includes(query.toLowerCase()) ||
      vehicle.vehicle_type.toLowerCase().includes(query.toLowerCase()) ||
      (vehicle.driver ?? "").toLowerCase().includes(query.toLowerCase()),
    );
    if (!match) {
      setToast(`No vehicle matched “${query}”.`);
      return;
    }
    setSelectedVehicleId(match.vehicle_id);
    navigate("/fleet");
  }

  if (error) {
    return <div className="loading-screen"><div className="error-state"><Activity size={25} /><h1>Fleet data failed to load</h1><p>{error}</p><button className="button button-primary" onClick={() => {
      setError(null);
      fleetApi.getSnapshot().then(setSnapshot).catch((requestError: unknown) => setError(requestError instanceof Error ? requestError.message : "Could not reload fleet data."));
    }}><RefreshCw size={15} /> Retry</button></div></div>;
  }
  if (!snapshot) {
    return <div className="loading-screen"><div className="loading-indicator"><span /><span /><span /></div><p>Loading fleet demo data…</p></div>;
  }

  const selectedVehicle = snapshot.vehicles.find((vehicle) => vehicle.vehicle_id === selectedVehicleId) ?? null;
  return (
    <AppShell snapshot={snapshot} onGlobalSearch={globalSearch}>
      <Routes>
        <Route path="/" element={<OverviewPage snapshot={snapshot} onSelectVehicle={selectVehicle} onAcknowledge={acknowledge} onCreateWorkOrder={workOrder} />} />
        <Route path="/fleet" element={<FleetPage snapshot={snapshot} onSelectVehicle={selectVehicle} />} />
        <Route path="/maintenance-risk" element={<PredictiveMaintenancePage snapshot={snapshot} onSelectVehicle={selectVehicle} onCreateWorkOrder={workOrder} />} />
        <Route path="/alerts" element={<AlertsPage snapshot={snapshot} onAcknowledge={acknowledge} onResolve={resolve} onCreateWorkOrder={workOrder} onSelectVehicle={selectVehicle} />} />
        <Route path="/work-orders" element={<MaintenanceCenterPage snapshot={snapshot} onSnapshotChange={setSnapshot} onSelectVehicle={selectVehicle} />} />
        <Route path="/fuel" element={<FuelAnalyticsPage snapshot={snapshot} onSnapshotChange={setSnapshot} />} />
        <Route path="/reports" element={<ReportsPage snapshot={snapshot} />} />
        <Route path="/devices" element={<DevicesPage snapshot={snapshot} />} />
        <Route path="/settings" element={<SettingsPage snapshot={snapshot} onSnapshotChange={setSnapshot} onDemoReset={setSnapshot} />} />
        <Route path="*" element={<EmptyState title="Page not found" detail="Choose a section from the navigation to continue." />} />
      </Routes>
      <VehicleDrawer vehicle={selectedVehicle} snapshot={snapshot} onClose={() => setSelectedVehicleId(null)} onCreateWorkOrder={workOrder} />
      {liveState === "reconnecting" && <div className="connection-toast"><span className="status-dot status-dot-amber" />Live connection reconnecting; existing data may be stale.</div>}
      {toast && <div className="toast" role="status">{toast}</div>}
    </AppShell>
  );
}

export default function App() {
  return <BrowserRouter><DashboardRoutes /></BrowserRouter>;
}
