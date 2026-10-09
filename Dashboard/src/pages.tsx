import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  ArrowRight,
  ClipboardList,
  Clock3,
  CloudOff,
  Cpu,
  Fuel,
  Gauge,
  RotateCcw,
  Search,
  ShieldAlert,
  Signal,
  SlidersHorizontal,
  Thermometer,
  TrendingUp,
  Truck,
  Wrench,
  Zap,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ageMinutes, filterVehicles, formatTime } from "./analytics";
import { FleetMap } from "./map";
import {
  applyScenario,
  resetDemo,
  updateCostAssumptions,
  updateWorkOrder,
} from "./api/mockAdapter";
import {
  Badge,
  Card,
  EmptyState,
  KpiCard,
  NeedsAttention,
  PageHeader,
  RiskBadge,
  SourceBadge,
  StateBadge,
  StatusBar,
  TemperatureTrend,
  VehicleTable,
  VibrationTrend,
} from "./components";
import type { AlertSeverity, Connectivity, DemoScenario, FleetSnapshot, WorkOrder } from "./types";

const chartTooltipStyle = {
  background: "var(--surface-raised)",
  border: "1px solid var(--line)",
  borderRadius: 8,
  color: "var(--text)",
};
const bandColors: Record<string, string> = {
  Normal: "#34d399",
  Watch: "#fbbf24",
  High: "#fb923c",
  Critical: "#f87171",
  Unknown: "#94a3b8",
};
const scenarioOptions: DemoScenario[] = [
  "Normal operation",
  "Single noisy temperature spike",
  "Persistent cooling degradation",
  "Increasing vibration",
  "Fuel drop while stationary",
  "Excessive idling",
  "Stale telemetry / disconnection",
  "Recovery after fault ends",
];

export function OverviewPage({
  snapshot,
  onSelectVehicle,
  onAcknowledge,
  onCreateWorkOrder,
}: {
  snapshot: FleetSnapshot;
  onSelectVehicle: (vehicleId: string) => void;
  onAcknowledge: (alertId: string) => void;
  onCreateWorkOrder: (alertId: string) => void;
}) {
  const summary = snapshot.summary;
  const attention = snapshot.vehicles.filter((vehicle) => ["High", "Critical"].includes(vehicle.status?.risk_band ?? "")).length;
  const focusVehicle = snapshot.vehicles.find((vehicle) => vehicle.demo_evidence?.cooling_confirmed) ?? snapshot.vehicles[0];
  const riskBands = ["Normal", "Watch", "High", "Critical", "Unknown"].map((band) => ({
    band,
    count: snapshot.vehicles.filter((vehicle) => (vehicle.status?.risk_band ?? "Unknown") === band).length,
  }));

  return (
    <>
      <PageHeader title="Fleet Overview" description="Fleet health, maintenance risk, and operational efficiency at a glance."
        actions={<><SourceBadge source="Simulated" /><span className="updated-label"><Clock3 size={14} /> {snapshot.mode === "backend" ? "Backend snapshot" : "Last demo update"} {formatTime(snapshot.generated_at)}</span></>} />
      <div className="notice notice-info"><Signal size={16} /><span>{snapshot.mode === "backend"
        ? <><b>Flask backend connected:</b> showing its seeded simulated fleet and model predictions. This API has no GPS, history, fuel, alert, or work-order feed.</>
        : <><b>Demo mode:</b> values are locally simulated. Backend, hardware, classifier probabilities, and verified GPS are not connected.</>}</span></div>

      <div className="kpi-grid">
        <KpiCard label="Total vehicles" value={String(summary.total_vehicles)} detail={snapshot.mode === "backend" ? "In the backend seeded fleet" : "In the demo fleet"} icon={Truck} tone="blue" to="/fleet" />
        <KpiCard label="Online" value={summary.online_vehicles === null ? "N/A" : String(summary.online_vehicles)} detail={snapshot.mode === "backend" ? "Backend supplies no freshness timestamps" : "Telemetry fresher than 60 min"} icon={Signal} tone="green" to="/fleet" />
        <KpiCard label="Needs attention" value={String(attention)} detail={snapshot.mode === "backend" ? "High or critical backend prediction tier" : "Elevated demo display risk"} icon={ShieldAlert} tone="red" to="/maintenance-risk" />
        <KpiCard label="Open work orders" value={String(summary.open_work_orders)} detail="Local demo records" icon={ClipboardList} tone="amber" to="/work-orders" />
        <KpiCard label="Fuel consumed" value={summary.fuel_consumed_l_period === null ? "N/A" : summary.fuel_consumed_l_period.toFixed(1)} unit={summary.fuel_consumed_l_period === null ? "" : "L"} detail={summary.fuel_consumed_l_period === null ? "Fuel volume not supplied" : "Recorded liters in the selected period"} icon={Gauge} tone="blue" to="/fuel" />
        <KpiCard label="Fuel cost estimate" value={summary.fuel_cost_period === null ? "N/A" : `₹${summary.fuel_cost_period.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`} detail={summary.fuel_cost_period === null ? "Unavailable without fuel volume" : "Configured assumption-based estimate"} icon={TrendingUp} tone="purple" to="/fuel" />
      </div>

      <div className="overview-grid">
        <Card className="map-card" title="Fleet locations" action={<Badge variant="unknown">No verified GPS</Badge>}>
          <FleetMap vehicles={snapshot.vehicles} onSelect={onSelectVehicle} />
        </Card>
        <Card className="attention-card" title="Needs attention" action={<Link to="/alerts" className="small-link">All alerts <ArrowRight size={14} /></Link>}>
          <NeedsAttention alerts={snapshot.alerts} onSelectVehicle={onSelectVehicle} onAcknowledge={onAcknowledge} onCreateWorkOrder={onCreateWorkOrder} />
        </Card>
      </div>

      <div className="two-column-grid">
        <Card title="Fleet health bands" className="health-card" action={<Link className="small-link" to="/maintenance-risk">Explore risk <ArrowRight size={14} /></Link>}>
          <p className="card-subtitle">Demo rule-based indicator; stale vehicles remain in Unknown.</p>
          <div className="health-band-list">
            {riskBands.map(({ band, count }) => (
              <Link key={band} to={`/fleet?risk=${encodeURIComponent(band)}`} className="health-band-row">
                <span className={`band-color band-${band.toLowerCase()}`} />
                <span>{band}</span><b>{count}</b>
                <div className="band-track"><i style={{ width: `${snapshot.vehicles.length ? (count / snapshot.vehicles.length) * 100 : 0}%`, background: bandColors[band] }} /></div>
              </Link>
            ))}
          </div>
          <div className="summary-footnote"><span className="status-dot status-dot-grey" />Telemetry quality is reported separately from maintenance risk.</div>
        </Card>
        <Card title={`Temperature residual · ${focusVehicle.vehicle_id}`} action={<button className="button button-link" onClick={() => onSelectVehicle(focusVehicle.vehicle_id)}>Vehicle details <ArrowRight size={14} /></button>}>
          <p className="card-subtitle">Actual coolant compared with a simulator-configured baseline adjusted for ambient temperature and engine load.</p>
          <TemperatureTrend vehicle={focusVehicle} height={244} />
          <div className="summary-footnote"><Thermometer size={14} />Simulator baseline only; it is not a trained vehicle model.</div>
        </Card>
      </div>

      <Card title="Fleet vehicles" action={<Link className="small-link" to="/fleet">Open fleet monitoring <ArrowRight size={14} /></Link>}>
        <VehicleTable vehicles={snapshot.vehicles} alerts={snapshot.alerts} onSelect={onSelectVehicle} compact />
      </Card>
      <div className="overview-bottom-grid">
        <Card title="Upcoming work" action={<Link className="small-link" to="/work-orders">Work orders <ArrowRight size={14} /></Link>}>
          {snapshot.work_orders.length ? snapshot.work_orders.slice(0, 3).map((order) => <WorkOrderRow key={order.work_order_id} order={order} onVehicle={onSelectVehicle} />)
            : <EmptyState title="No work orders" detail="No work orders have been created in this demo." icon={Wrench} />}
        </Card>
        <Card title="Data freshness">
          {snapshot.vehicles.map((vehicle) => {
            const age = ageMinutes(vehicle.last_seen);
            return <div key={vehicle.vehicle_id} className="freshness-row"><span>{vehicle.vehicle_id}</span><StateBadge state={vehicle.connectivity} /><small>{age === null ? "No timestamp" : age > 60 ? `${Math.floor(age / 60)}h stale` : `${Math.max(0, Math.floor(age))}m ago`}</small></div>;
          })}
        </Card>
      </div>
    </>
  );
}

export function FleetPage({ snapshot, onSelectVehicle }: { snapshot: FleetSnapshot; onSelectVehicle: (id: string) => void }) {
  const params = new URLSearchParams(window.location.search);
  const initialRisk = params.get("risk") ?? "All";
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Connectivity | "All">("All");
  const [source, setSource] = useState("All");
  const [risk, setRisk] = useState(initialRisk);
  const [type, setType] = useState("All");
  const [sort, setSort] = useState("risk");
  const [timeRange, setTimeRange] = useState("24h");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const filtered = useMemo(() => {
    const result = filterVehicles(snapshot.vehicles, { query, status, source, risk, type });
    return result.sort((a, b) => {
      if (sort === "risk") return (b.status?.risk_score ?? -1) - (a.status?.risk_score ?? -1);
      if (sort === "freshness") return (ageMinutes(a.last_seen) ?? Infinity) - (ageMinutes(b.last_seen) ?? Infinity);
      return a.vehicle_id.localeCompare(b.vehicle_id);
    });
  }, [snapshot.vehicles, query, status, source, risk, type, sort]);
  const hasFilters = Boolean(query) || status !== "All" || source !== "All" || risk !== "All" || type !== "All";
  const selectedVehicle = filtered.find((vehicle) => vehicle.vehicle_id === selectedId) ?? filtered[0] ?? null;
  const cutoff = Date.now() - Number.parseInt(timeRange, 10) * 60 * 60_000;
  const historyVehicle = selectedVehicle
    ? { ...selectedVehicle, readings: selectedVehicle.readings.filter((reading) => Date.parse(reading.ts) >= cutoff) }
    : null;
  function clearFilters() { setQuery(""); setStatus("All"); setSource("All"); setRisk("All"); setType("All"); }

  return (
    <>
      <PageHeader title="Fleet Monitoring" description="Search and inspect vehicles, telemetry freshness, and location availability." actions={<SourceBadge source="Simulated" />} />
      <Card title="Fleet map" action={<Badge variant="unknown">GPS unavailable</Badge>}><FleetMap vehicles={filtered} onSelect={onSelectVehicle} /></Card>
      <Card title="Vehicle list" action={<span className="result-count">{filtered.length} of {snapshot.vehicles.length} vehicles</span>}>
        <div className="filter-bar">
          <label className="search-field"><Search size={15} /><input placeholder="Search ID, type, or driver" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <SelectFilter label="Connection" value={status} options={["All", "Online", "Stale", "Offline", "Unknown"]} onChange={(value) => setStatus(value as Connectivity | "All")} />
          <SelectFilter label="Source" value={source} options={["All", "Hardware", "Simulated", "Replay"]} onChange={setSource} />
          <SelectFilter label="Risk" value={risk} options={["All", "Normal", "Watch", "High", "Critical", "Unknown"]} onChange={setRisk} />
          <SelectFilter label="Type" value={type} options={["All", ...new Set(snapshot.vehicles.map((vehicle) => vehicle.vehicle_type))]} onChange={setType} />
          <SelectFilter label="Window" value={timeRange} options={["1h", "6h", "24h"]} onChange={setTimeRange} />
          <SelectFilter label="Sort" value={sort} options={["risk", "freshness", "vehicle"]} onChange={setSort} />
          {hasFilters && <button className="button button-quiet" onClick={clearFilters}><RotateCcw size={14} /> Clear</button>}
        </div>
        <div className="active-filter-note"><SlidersHorizontal size={13} />Showing {filtered.length} vehicles · selected history window {timeRange} · list/table filters apply together</div>
        <VehicleTable vehicles={filtered} alerts={snapshot.alerts} onSelect={(id) => { setSelectedId(id); onSelectVehicle(id); }} />
      </Card>
      {historyVehicle && <Card title={`Recent temperature trend · ${historyVehicle.vehicle_id}`} action={<span className="result-count">{historyVehicle.readings.length} samples in {timeRange}</span>}>
        <p className="card-subtitle">Selecting the time window filters this vehicle's displayed history; the current status row remains the latest known record.</p>
        {historyVehicle.readings.length
          ? <TemperatureTrend vehicle={historyVehicle} height={235} />
          : <EmptyState title="No readings in this time window" detail="The selected vehicle has no samples in the selected interval." icon={Clock3} />}
      </Card>}
    </>
  );
}

export function PredictiveMaintenancePage({ snapshot, onSelectVehicle, onCreateWorkOrder }: {
  snapshot: FleetSnapshot; onSelectVehicle: (id: string) => void; onCreateWorkOrder: (alertId: string) => void;
}) {
  const [vehicleId, setVehicleId] = useState(snapshot.vehicles[0]?.vehicle_id ?? "");
  const vehicle = snapshot.vehicles.find((item) => item.vehicle_id === vehicleId) ?? snapshot.vehicles[0];
  const bandCounts = ["Normal", "Watch", "High", "Critical", "Unknown"].map((band) => ({
    band,
    count: snapshot.vehicles.filter((item) => (item.status?.risk_band ?? "Unknown") === band).length,
  }));
  if (!vehicle) return <EmptyState title="Fleet unavailable" detail="The data source returned no vehicles." icon={Truck} />;
  const associatedAlert = snapshot.alerts.find((alert) => alert.vehicle_id === vehicle.vehicle_id && alert.status !== "Resolved");
  const evidence = vehicle.demo_evidence;
  const componentEntries = Object.entries(vehicle.status?.health ?? {}) as [string, number | null][];

  return (
    <>
      <PageHeader title="Predictive Maintenance" description={snapshot.mode === "backend" ? "Inspect backend model predictions for the seeded fleet." : "Inspect sustained simulated health trends and their evidence."} actions={<SourceBadge source="Simulated" />} />
      <div className="notice notice-warning"><ShieldAlert size={16} /><span>{snapshot.mode === "backend"
        ? `Predictions come from the Flask backend (${snapshot.backend_model_mode ?? "unknown model state"}) and map an industrial AI4I model to simulated truck inputs. They are not validated vehicle-failure predictions.`
        : "There is no connected classifier or backend. Scores below are local simulator display indicators, not validated vehicle-failure predictions."}</span></div>
      <div className="risk-summary-grid">
        {bandCounts.map(({ band, count }) => <Link key={band} to={`/fleet?risk=${encodeURIComponent(band)}`} className={`risk-summary band-${band.toLowerCase()}`}><span>{band}</span><b>{count}</b><small>vehicles</small></Link>)}
      </div>
      <div className="two-column-grid">
        <Card title="Risk distribution" className="chart-card">
          <div className="chart-block" style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%"><BarChart data={bandCounts} margin={{ top: 14, right: 12, bottom: 0, left: -22 }}>
              <CartesianGrid strokeDasharray="3 4" vertical={false} stroke="var(--line)" />
              <XAxis dataKey="band" tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={chartTooltipStyle} />
              <Bar dataKey="count" name="Vehicles" radius={[5, 5, 0, 0]}>{bandCounts.map((entry) => <Cell key={entry.band} fill={bandColors[entry.band]} />)}</Bar>
            </BarChart></ResponsiveContainer>
          </div>
          <p className="fine-print">{snapshot.mode === "backend" ? "Risk bands reflect the backend's prediction tier; inputs are seeded simulated fleet values." : "Risk-band counts are grouped from demo output. Stale data remains Unknown."}</p>
        </Card>
        <Card title="Select vehicle" action={<span className="result-count">{snapshot.vehicles.length} vehicles</span>}>
          <div className="ranked-vehicles">{snapshot.vehicles.slice().sort((a, b) => (b.status?.risk_score ?? -1) - (a.status?.risk_score ?? -1)).map((item) => (
            <button className={`ranked-vehicle ${item.vehicle_id === vehicle.vehicle_id ? "selected" : ""}`} key={item.vehicle_id} onClick={() => setVehicleId(item.vehicle_id)}>
              <div><b>{item.vehicle_id}</b><small>{item.vehicle_type} · {item.current_scenario}</small></div><RiskBadge band={item.status?.risk_band ?? "Unknown"} /><strong>{item.status?.risk_score ?? "N/A"}</strong>
            </button>
          ))}</div>
        </Card>
      </div>

      <Card title={`Health detail · ${vehicle.vehicle_id}`} action={<><SourceBadge source={vehicle.source} /><StateBadge state={vehicle.connectivity} /></>}>
        <div className="health-detail-header">
          <div><h3>{vehicle.vehicle_type} <span>· {vehicle.driver ?? "No driver assigned"}</span></h3><p>Last seen {formatTime(vehicle.last_seen)} · {vehicle.data_quality} data quality</p></div>
          <div className="health-score"><strong>{vehicle.status?.risk_score ?? "N/A"}</strong><span>{snapshot.mode === "backend" ? "Backend failure probability / 100" : "Demo display score / 100"}</span><RiskBadge band={vehicle.status?.risk_band ?? "Unknown"} /></div>
        </div>
        <div className="model-facts">
          <Fact label="Failure probability" value={vehicle.status?.failure_prob === null || vehicle.status?.failure_prob === undefined ? "Unavailable" : `${(vehicle.status.failure_prob * 100).toFixed(1)}%`} detail="Backend prediction; not field validated" />
          <Fact label="Model range check" value={vehicle.status?.model_in_range === null || vehicle.status?.model_in_range === undefined ? "Unknown" : vehicle.status.model_in_range ? "In range" : "Out of range"} detail="Against AI4I training ranges" />
          <Fact label="Model provenance" value={snapshot.mode === "backend" ? (snapshot.backend_model_mode === "model" ? "Trained model" : "Mock fallback") : "Local simulator"} detail={vehicle.status?.provenance ?? "Rule-based demo indicator only"} />
          <Fact label="Hours to service" value="Unavailable" detail="No forecast supplied" />
        </div>
        <div className="component-health-grid">
          {componentEntries.map(([component, value]) => <div className="component-health" key={component}>
            <div><span>{component}</span><strong>{value === null ? "N/A" : `${Math.round(value * 100)}%`}</strong></div>
            <div className="progress-track"><i style={{ width: value === null ? "0%" : `${Math.min(100, Math.max(0, value * 100))}%` }} /></div>
            <small>{value === null ? "Unavailable" : "Demo index; 0 = healthy, 1 = failing"}</small>
          </div>)}
        </div>
        <div className="explanation-panel"><div className="explanation-icon"><Thermometer size={17} /></div><div><b>Why this indicator changed</b><p>{vehicle.status?.explanation ?? "No explanation supplied."}</p><span>Evidence provenance: {vehicle.status?.provenance ?? "Unavailable"}</span></div></div>
      </Card>

      <div className="two-column-grid">
        <Card title="Load-adjusted coolant temperature" action={<SourceBadge source="Simulated" />}>
          {snapshot.mode === "backend" ? <EmptyState title="History unavailable" detail="The Flask fleet endpoint supplies a current input snapshot, not a temperature history." icon={Thermometer} /> : <>
          <p className="card-subtitle">An engine naturally heats under greater load. The residual compares observed heat with a configured demo baseline for ambient temperature and engine load.</p>
          <TemperatureTrend vehicle={vehicle} height={300} />
          <div className="summary-footnote"><Thermometer size={14} />Residual = actual coolant temperature − configured baseline. Baseline is simulator logic, not a trained model.</div>
          </>}
        </Card>
        <Card title="Vibration evidence">
          {snapshot.mode === "backend" ? <EmptyState title="Vibration unavailable" detail="The Flask fleet endpoint does not include vibration measurements." icon={Activity} /> : <>
          <p className="card-subtitle">Latest 24-hour simulated signal; missing readings are not interpolated.</p>
          <VibrationTrend vehicle={vehicle} height={265} />
          <div className="summary-footnote">Demo threshold: 0.62 g RMS. This is an illustrative simulator threshold, not a validated mechanical limit.</div>
          </>}
        </Card>
      </div>

      <Card title="Noise rejection & persistence">
        <div className={`persistence-callout ${evidence?.single_spike_ignored ? "callout-neutral" : evidence?.cooling_confirmed || evidence?.vibration_confirmed ? "callout-warning" : "callout-good"}`}>
          {evidence?.single_spike_ignored ? <><ShieldAlert size={19} /><div><b>Single spike ignored</b><span>One isolated reading did not meet the demo's persistence condition.</span></div></>
            : evidence?.cooling_confirmed || evidence?.vibration_confirmed ? <><AlertTriangle size={19} /><div><b>Persistent abnormal trend confirmed</b><span>{evidence.abnormal_readings_k_of_n} of {evidence.window_size} recent {evidence.confirmation_signal.toLowerCase()} readings crossed the demo threshold.</span></div></>
              : <><Signal size={19} /><div><b>No persistent abnormal trend confirmed</b><span>Latest demo readings did not satisfy the k-of-n confirmation rule.</span></div></>}
        </div>
        <details className="method-details"><summary>How this demo confirmation works</summary>
          <ul>
            <li>Configured temperature residual is checked against a demo threshold of 8°C; vibration uses 0.62 g RMS.</li>
            <li>Persistence uses at least 3 of the latest 5 sampled readings (k-of-n). It does not use Hampel filtering or EWMA.</li>
            <li>One isolated reading cannot satisfy this confirmation window. The demo does not implement a separate production alert-cooldown service.</li>
            <li>Current behavior is implemented in the local simulator adapter and is not a validated fault-detection model.</li>
          </ul>
        </details>
      </Card>

      <Card title="Recommended action">
        {associatedAlert ? <div className="recommendation-panel">
          <div><Badge variant={associatedAlert.severity}>{associatedAlert.severity} · simulated</Badge><h3>{associatedAlert.type}</h3><p>{associatedAlert.recommendation}</p><small>{associatedAlert.explanation}</small></div>
          <div className="recommendation-actions"><button className="button button-primary" onClick={() => onCreateWorkOrder(associatedAlert.alert_id)}>Create work order</button><button className="button button-secondary" onClick={() => onSelectVehicle(vehicle.vehicle_id)}>Open vehicle detail</button></div>
        </div> : <EmptyState title="No open maintenance-risk alert" detail="No current open alert is associated with this vehicle." icon={ShieldAlert} />}
      </Card>
    </>
  );
}

export function AlertsPage({ snapshot, onAcknowledge, onResolve, onCreateWorkOrder, onSelectVehicle }: {
  snapshot: FleetSnapshot; onAcknowledge: (id: string) => void; onResolve: (id: string, note: string) => void; onCreateWorkOrder: (id: string) => void; onSelectVehicle: (vehicleId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState("All");
  const [type, setType] = useState("All");
  const [vehicleId, setVehicleId] = useState("All");
  const [status, setStatus] = useState("All");
  const [selectedId, setSelectedId] = useState<string | null>(snapshot.alerts[0]?.alert_id ?? null);
  const [resolution, setResolution] = useState("");
  const filtered = snapshot.alerts.filter((alert) =>
    (!query || `${alert.vehicle_id} ${alert.type} ${alert.summary}`.toLowerCase().includes(query.toLowerCase())) &&
    (severity === "All" || alert.severity === severity) &&
    (type === "All" || alert.type === type) &&
    (vehicleId === "All" || alert.vehicle_id === vehicleId) &&
    (status === "All" || alert.status === status),
  ).sort((a, b) => alertSeverityRank(a.severity) - alertSeverityRank(b.severity) || Date.parse(b.latest_evidence) - Date.parse(a.latest_evidence));
  const selected = filtered.find((alert) => alert.alert_id === selectedId) ?? filtered[0] ?? null;

  return (
    <>
      <PageHeader title="Alerts Center" description="Review alert evidence, acknowledge ownership, and create maintenance work without discarding history." actions={<Badge variant="simulated">DEMO ALERTS</Badge>} />
      <div className="alert-summary-row">
        <div><b>{snapshot.alerts.filter((alert) => alert.status === "Open").length}</b><span>Open</span></div><div><b>{snapshot.alerts.filter((alert) => alert.status === "Acknowledged").length}</b><span>Acknowledged</span></div><div><b>{snapshot.alerts.filter((alert) => alert.status === "Resolved").length}</b><span>Resolved / filtered</span></div>
        <p>Repeated records are grouped by the active simulated scenario and vehicle; a new occurrence requires a new demo event or scenario restart.</p>
      </div>
      <Card title="Alert queue" action={<span className="result-count">{filtered.length} results</span>}>
        <div className="filter-bar">
          <label className="search-field"><Search size={15} /><input placeholder="Search alerts or vehicle" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <SelectFilter label="Severity" value={severity} options={["All", "Critical", "High", "Medium", "Info"]} onChange={setSeverity} />
          <SelectFilter label="Type" value={type} options={["All", ...new Set(snapshot.alerts.map((alert) => alert.type))]} onChange={setType} />
          <SelectFilter label="Vehicle" value={vehicleId} options={["All", ...snapshot.vehicles.map((vehicle) => vehicle.vehicle_id)]} onChange={setVehicleId} />
          <SelectFilter label="Status" value={status} options={["All", "Open", "Acknowledged", "Resolved"]} onChange={setStatus} />
        </div>
        {!filtered.length ? <EmptyState title="No alerts match these filters" detail={snapshot.alerts.length ? "Clear or change filters to see matching alerts." : "No alert records are available from the current data source."} icon={ShieldAlert} />
          : <div className="alert-layout">
            <div className="alert-list">{filtered.map((alert) => <button key={alert.alert_id} className={`alert-row ${selected?.alert_id === alert.alert_id ? "selected" : ""}`} onClick={() => { setSelectedId(alert.alert_id); setResolution(alert.resolution_notes ?? ""); }}>
              <Badge variant={alert.severity}>{alert.severity}</Badge><div><b>{alert.vehicle_id} · {alert.type}</b><small>{alert.summary}</small><span>{formatTime(alert.latest_evidence)}</span></div><StateBadge state={alert.status} />
            </button>)}</div>
            {selected && <div className="alert-detail">
              <div className="alert-detail-heading"><div><Badge variant={selected.severity}>{selected.severity}</Badge><h3>{selected.type}</h3></div><SourceBadge source={selected.source} /></div>
              <div className="alert-vehicle-link"><div><h4>{selected.vehicle_id}</h4><p>{selected.summary}</p></div><button className="button button-secondary" onClick={() => onSelectVehicle(selected.vehicle_id)}>View vehicle</button></div>
              <div className="evidence-list"><Evidence label="First detected" value={formatTime(selected.first_detected)} /><Evidence label="Latest evidence" value={formatTime(selected.latest_evidence)} /><Evidence label="Evidence source" value={`${selected.source} · retained after acknowledgement`} /><Evidence label="Alert status" value={selected.status} /></div>
              <div className="explanation-panel"><div className="explanation-icon"><AlertTriangle size={17} /></div><div><b>Evidence and interpretation</b><p>{selected.explanation}</p><small>Suggested next step: {selected.recommendation}</small></div></div>
              {selected.status !== "Resolved" && <div className="alert-resolution"><label htmlFor="resolution-note">Resolution note</label><textarea id="resolution-note" rows={2} value={resolution} onChange={(event) => setResolution(event.target.value)} placeholder="Add a note before resolving (optional)" />
                <div className="button-row">{selected.status === "Open" && <button className="button button-secondary" onClick={() => onAcknowledge(selected.alert_id)}>Acknowledge</button>}<button className="button button-primary" onClick={() => onResolve(selected.alert_id, resolution)}>Resolve alert</button>{!selected.linked_work_order_id && <button className="button button-quiet" onClick={() => onCreateWorkOrder(selected.alert_id)}>Create work order</button>}</div>
              </div>}
            </div>}
          </div>}
      </Card>
    </>
  );
}

export function MaintenanceCenterPage({ snapshot, onSnapshotChange, onSelectVehicle }: {
  snapshot: FleetSnapshot; onSnapshotChange: (snapshot: FleetSnapshot) => void; onSelectVehicle: (id: string) => void;
}) {
  const [selectedId, setSelectedId] = useState(snapshot.work_orders[0]?.work_order_id ?? "");
  const [technician, setTechnician] = useState("");
  const [notes, setNotes] = useState("");
  const selected = snapshot.work_orders.find((order) => order.work_order_id === selectedId) ?? snapshot.work_orders[0] ?? null;
  function save(changes: Partial<Pick<WorkOrder, "assigned_technician" | "status" | "resolution_notes">>) {
    if (!selected) return;
    onSnapshotChange(updateWorkOrder(snapshot, selected.work_order_id, changes));
  }
  return (
    <>
      <PageHeader title="Maintenance Center" description="Manage local demo work orders separately from predictive risk indicators." actions={<Badge variant="simulated">SIMULATED WORKFLOW</Badge>} />
      <div className="notice notice-info"><Wrench size={16} /><span>Predicted maintenance risk is not a confirmed defect. A work order is a demo action and does not approve or complete a service event.</span></div>
      <div className="two-column-grid workorder-grid">
        <Card title="Work-order queue" action={<span className="result-count">{snapshot.work_orders.length} records</span>}>
          {snapshot.work_orders.length ? <div className="workorder-list">{snapshot.work_orders.map((order) => (
            <button key={order.work_order_id} className={`workorder-item ${selected?.work_order_id === order.work_order_id ? "selected" : ""}`} onClick={() => { setSelectedId(order.work_order_id); setTechnician(order.assigned_technician ?? ""); setNotes(order.resolution_notes ?? ""); }}>
              <div><b>{order.work_order_id}</b><Badge variant={order.priority}>{order.priority}</Badge></div>
              <p>{order.issue_summary}</p><small>{order.vehicle_id} · created {formatTime(order.created_at)}</small><StateBadge state={order.status} />
            </button>
          ))}</div> : <EmptyState title="Work-order queue is empty" detail="Create a work order from a relevant alert. No work is automatically approved." icon={ClipboardList} />}
        </Card>
        <Card title={selected ? `Work order · ${selected.work_order_id}` : "Work-order details"}>
          {selected ? <div className="workorder-editor">
            <div className="workorder-vehicle"><div><small>Vehicle</small><b>{selected.vehicle_id}</b></div><button className="button button-link" onClick={() => onSelectVehicle(selected.vehicle_id)}>View vehicle <ArrowRight size={13} /></button></div>
            <Fact label="Issue summary" value={selected.issue_summary} detail="Simulated maintenance request" />
            <Fact label="Recommended inspection" value={selected.recommended_inspection} detail="Recommendation is not a confirmed fault" />
            <div className="field"><label htmlFor="wo-status">Status</label><select id="wo-status" value={selected.status} onChange={(event) => save({ status: event.target.value as WorkOrder["status"] })}><option>Open</option><option>In progress</option><option>Completed</option><option>Cancelled</option></select></div>
            <div className="field"><label htmlFor="wo-tech">Assigned technician</label><input id="wo-tech" value={technician || selected.assigned_technician || ""} placeholder="Not assigned" onChange={(event) => setTechnician(event.target.value)} onBlur={() => save({ assigned_technician: technician.trim() || null })} /></div>
            <div className="field"><label htmlFor="wo-notes">Resolution notes</label><textarea id="wo-notes" rows={3} value={notes || selected.resolution_notes || ""} placeholder="No resolution recorded" onChange={(event) => setNotes(event.target.value)} onBlur={() => save({ resolution_notes: notes.trim() || null })} /></div>
            <div className="drawer-metrics small"><div><small>Estimated cost</small><b>{selected.estimated_cost === null ? "Unavailable" : `₹${selected.estimated_cost}`}</b></div><div><small>Actual cost</small><b>{selected.actual_cost === null ? "Not recorded" : `₹${selected.actual_cost}`}</b></div></div>
            <p className="fine-print">Created in local simulator · work order and changes reset on reload.</p>
          </div> : <EmptyState title="Select a work order" detail="Choose a record from the queue to view or edit its demo fields." icon={ClipboardList} />}
        </Card>
      </div>
      <Card title="Service schedule and maintenance history">
        <EmptyState title="Service schedule unavailable" detail="The current project has no verified service interval, due-date feed, or historical maintenance records. Work orders shown above are local demo actions only." icon={Clock3} />
      </Card>
    </>
  );
}

export function FuelAnalyticsPage({ snapshot, onSnapshotChange }: { snapshot: FleetSnapshot; onSnapshotChange: (snapshot: FleetSnapshot) => void }) {
  const [windowLabel] = useState("Simulated 24-hour window");
  const [selectedVehicleId, setSelectedVehicleId] = useState(snapshot.vehicles[0]?.vehicle_id ?? "");
  const chartData = snapshot.vehicles.map((vehicle) => ({
    vehicle: vehicle.vehicle_id,
    fuel: vehicle.fuel_status?.fuel_consumed_l_period ?? null,
    efficiency: vehicle.fuel_status?.km_per_l_rolling ?? null,
    idle: vehicle.fuel_status?.idle_minutes_today ?? null,
    level: vehicle.readings.at(-1)?.fuel_level_pct ?? null,
  }));
  const total = snapshot.summary.fuel_consumed_l_period;
  const totalIdleMinutes = chartData.reduce((sum, item) => sum + (item.idle ?? 0), 0);
  return (
    <>
      <PageHeader title="Fuel & Cost Analytics" description="Review simulated fuel, idle, and cost signals with their calculation assumptions." actions={<Badge variant="simulated">SIMULATED FUEL DATA</Badge>} />
      <div className="notice notice-info"><Fuel size={16} /><span>The current data contract supplies fuel percentage only. Without measured fuel volume or tank capacity, liters, efficiency, and fuel cost are unavailable. No savings are calculated or claimed.</span></div>
      <div className="kpi-grid fuel-kpi-grid">
        <KpiCard label="Fuel consumed" value={total === null ? "N/A" : total.toFixed(1)} unit={total === null ? "" : "L"} detail={total === null ? "Fuel volume not supplied" : `${windowLabel} · recorded liters`} icon={Fuel} tone="blue" />
        <KpiCard label="Average efficiency" value={averageNullable(chartData.map((item) => item.efficiency))} unit="km/L" detail="Unavailable without fuel-volume readings" icon={Gauge} tone="green" />
        <KpiCard label="Idle duration" value={String(totalIdleMinutes)} unit="min" detail="Valid engine-on, zero-speed 15-minute samples" icon={Clock3} tone="amber" />
        <KpiCard label="Fuel cost estimate" value={snapshot.summary.fuel_cost_period === null ? "N/A" : `₹${snapshot.summary.fuel_cost_period.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`} detail={snapshot.summary.fuel_cost_period === null ? "Fuel volume unavailable; not calculated" : `At ₹${snapshot.cost_assumptions.fuel_price_per_liter}/L`} icon={TrendingUp} tone="purple" />
        <KpiCard label="Fuel-drop events" value={String(snapshot.vehicles.filter((vehicle) => vehicle.fuel_status?.fuel_drop_event === true).length)} detail="Simulated suspicious events; not confirmed theft" icon={AlertTriangle} tone="red" />
        <KpiCard label="Cost per distance" value={averageNullable(snapshot.vehicles.map((vehicle) => vehicle.fuel_status?.cost_per_km_inr ?? null))} unit="₹/km" detail="Unavailable without recorded fuel volume" icon={TrendingUp} tone="blue" />
      </div>
      <div className="two-column-grid">
        <Card title="Fuel consumption by vehicle" action={<Badge variant="simulated">{windowLabel}</Badge>}>
          <EmptyState title="Fuel volume unavailable" detail="The current telemetry contract supplies fuel percentage only. Without measured liters or a documented tank-capacity model, consumption in liters is not inferred." icon={Fuel} />
        </Card>
        <Card title="Fuel efficiency and idle time">
          <div className="chart-block" style={{ height: 280 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: -14 }}>
            <CartesianGrid strokeDasharray="3 4" vertical={false} stroke="var(--line)" /><XAxis dataKey="vehicle" tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis unit=" min" tick={{ fill: "var(--muted)", fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={chartTooltipStyle} /><Bar dataKey="idle" name="Engine-on idle (min)" fill="#fbbf24" radius={[4, 4, 0, 0]} />
          </BarChart></ResponsiveContainer></div>
          <p className="fine-print">Efficiency in km/L is unavailable because measured fuel volume is not supplied.</p>
        </Card>
      </div>
      <Card title="Fuel-level history" action={<label className="filter-select"><span>Vehicle</span><select value={selectedVehicleId} onChange={(event) => setSelectedVehicleId(event.target.value)}>{snapshot.vehicles.map((vehicle) => <option key={vehicle.vehicle_id}>{vehicle.vehicle_id}</option>)}</select></label>}>
        <FuelLevelChart snapshot={snapshot} vehicleId={selectedVehicleId} />
        <p className="fine-print">Fuel percentage is not converted to liters. The mock does not define tank capacity.</p>
      </Card>
      <div className="two-column-grid">
        <Card title="Cost assumptions">
          <p className="card-subtitle">Fuel price is retained as a demo assumption, but no fuel expenditure is calculated until fuel volume is available.</p>
          <div className="field"><label htmlFor="fuel-price">Fuel price per liter (₹)</label><input id="fuel-price" type="number" min="0" step="0.5" value={snapshot.cost_assumptions.fuel_price_per_liter} onChange={(event) => {
            const value = Number(event.target.value);
            if (Number.isFinite(value) && value >= 0) onSnapshotChange(updateCostAssumptions(snapshot, { fuel_price_per_liter: value }));
          }} /></div>
          <Fact label="Downtime cost" value="Not configured" detail="No downtime estimate shown" />
          <Fact label="Service cost" value="Not configured" detail="No maintenance expenditure data supplied" />
          <p className="fine-print">Changing cost or detection thresholds applies to subsequent simulator scenario runs. Existing alert evidence is retained.</p>
        </Card>
        <Card title="Idle and suspicious fuel-drop events">
          {snapshot.vehicles.filter((vehicle) =>
            (vehicle.fuel_status?.idle_minutes_today ?? -1) >= snapshot.cost_assumptions.excessive_idle_minutes ||
            vehicle.fuel_status?.fuel_drop_event === true,
          ).map((vehicle) => <div className="fuel-event" key={vehicle.vehicle_id}>
            <div><b>{vehicle.vehicle_id}</b><small>{vehicle.current_scenario}</small></div><span>{vehicle.fuel_status?.idle_minutes_today ? `${vehicle.fuel_status.idle_minutes_today} min idle` : "Fuel drop signal"}</span><SourceBadge source="Simulated" />
            {vehicle.fuel_status?.fuel_drop_event && <p>Suspicious decrease detected while stationary. Validate the signal and vehicle state; this does not confirm theft or leakage.</p>}
          </div>)}
          {!snapshot.vehicles.some((vehicle) => (vehicle.fuel_status?.idle_minutes_today ?? -1) >= snapshot.cost_assumptions.excessive_idle_minutes || vehicle.fuel_status?.fuel_drop_event === true) && <EmptyState title="No events match current assumptions" detail="No valid idle or fuel-drop event meets the configured demo thresholds." icon={Fuel} />}
          <p className="fine-print">Excessive idle threshold: {snapshot.cost_assumptions.excessive_idle_minutes} min. Idle fuel volume is unavailable.</p>
        </Card>
      </div>
    </>
  );
}

export function ReportsPage({ snapshot }: { snapshot: FleetSnapshot }) {
  const [report, setReport] = useState("Fleet status");
  const records = report === "Alerts" ? snapshot.alerts : report === "Work orders" ? snapshot.work_orders : snapshot.vehicles;
  function exportCsv() {
    const csv = records.length ? Object.keys(records[0] as object).join(",") + "\r\n" + records.map((record) =>
      Object.values(record as object).map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(","),
    ).join("\r\n") : "No records\r\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `fleetguard-${report.toLowerCase().replaceAll(" ", "-")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <PageHeader title="Reports & Evaluation" description="Export operational demo records and inspect evaluation availability without mixing benchmark and simulated metrics." />
      <div className="two-column-grid">
        <Card title="Operational reports" action={<button className="button button-primary" onClick={exportCsv}><ArrowDownToLine size={15} /> Export CSV</button>}>
          <p className="card-subtitle">CSV export contains current local demo state. Values retain their simulated or unavailable source labels.</p>
          <div className="field"><label htmlFor="report-select">Report type</label><select id="report-select" value={report} onChange={(event) => setReport(event.target.value)}><option>Fleet status</option><option>Alerts</option><option>Work orders</option></select></div>
          <div className="report-checklist">{["Fleet status", "Vehicle health", "Maintenance alerts", "Work orders", "Fuel and cost", "Connectivity"].map((item) => <div key={item}><span><ClipboardList size={15} />{item}</span><Badge variant="simulated">Demo data</Badge></div>)}</div>
        </Card>
        <Card title="Model evaluation" action={<Badge variant="unknown">Evaluation pending</Badge>}>
          <div className="evaluation-pending"><BarChart3Icon /><h3>Evaluation results unavailable</h3><p>No evaluation script, dataset results, model version, or validation report exists in this repository. Metrics are intentionally not fabricated.</p><div className="evaluation-meta"><Fact label="Dataset" value="Not provided" detail="No local evaluation artifact" /><Fact label="Method" value="Not provided" detail="Awaiting evaluation pipeline" /><Fact label="Vehicle validation" value="Not established" detail="Synthetic benchmark cannot validate vehicle performance" /></div></div>
        </Card>
      </div>
      <Card title="Model and data limitations">
        <ul className="limitations-list"><li>Classifier failure probability: unavailable; the local simulator does not load a model.</li><li>AI4I synthetic industrial benchmark metrics are not present and would not establish real vehicle-failure accuracy.</li><li>False alarms per vehicle-day and detection lead time require a separately validated evaluation dataset.</li><li>No realized savings, confirmed breakdown prevention, or maintenance outcomes are recorded.</li></ul>
      </Card>
    </>
  );
}

export function DevicesPage({ snapshot }: { snapshot: FleetSnapshot }) {
  return (
    <>
      <PageHeader title="IoT Devices" description="Inspect telemetry provenance and connection readiness without implying that simulated sensors are hardware." actions={<Badge variant="simulated">SIMULATOR ONLY</Badge>} />
      <div className="notice notice-warning"><CloudOff size={16} /><span>No ESP32, Raspberry Pi gateway, MQTT broker, or hardware heartbeat is connected in this repository. Telemetry shown below is generated locally.</span></div>
      <Card title="Telemetry sources" action={<span className="result-count">{snapshot.vehicles.length} simulated sources</span>}>
        <div className="table-wrap"><table><thead><tr><th>Source ID</th><th>Vehicle</th><th>Source type</th><th>Connection</th><th>Last heartbeat</th><th>Last telemetry</th><th>Sensors</th><th>Firmware / signal</th></tr></thead><tbody>
          {snapshot.vehicles.map((vehicle) => <tr key={vehicle.vehicle_id}><td><strong>SIM-{vehicle.vehicle_id}</strong><small>Local deterministic generator</small></td><td>{vehicle.vehicle_id}</td><td><SourceBadge source={vehicle.source} /></td><td><StateBadge state={vehicle.connectivity} /></td><td>Unavailable</td><td>{formatTime(vehicle.last_seen)}</td><td>{vehicle.data_quality === "Good" ? "Simulated values" : "Unavailable"}</td><td><span className="muted">Not supplied</span></td></tr>)}
        </tbody></table></div>
      </Card>
      <div className="two-column-grid">
        <Card title="Device and gateway topology"><div className="topology"><div className="topology-node"><Cpu size={20} /><b>Vehicle telematics node</b><small>ESP32 · not connected</small></div><span className="topology-line" /><div className="topology-node"><Signal size={20} /><b>Edge gateway</b><small>Raspberry Pi 4 / MQTT · unknown</small></div><span className="topology-line" /><div className="topology-node"><Activity size={20} /><b>FleetGuard API</b><small>Not present in repository</small></div></div></Card>
        <Card title="Telemetry contract"><p className="card-subtitle">Mock readings use the documented field names listed in the provided prompt, including nullable values. No hidden evaluation labels are used.</p><code className="contract-code">schema_version · vehicle_id · ts · seq · source · engine_on · speed_kmph · engine_rpm · engine_load_nm · ambient_temp_c · coolant_temp_c · vibration_rms_g · accel_long_g · battery_v · fuel_level_pct · odometer_km · engine_hours_since_service · lat · lon</code></Card>
      </div>
    </>
  );
}

export function SettingsPage({ snapshot, onSnapshotChange, onDemoReset }: {
  snapshot: FleetSnapshot; onSnapshotChange: (snapshot: FleetSnapshot) => void; onDemoReset: (snapshot: FleetSnapshot) => void;
}) {
  const [vehicleId, setVehicleId] = useState(snapshot.vehicles[1]?.vehicle_id ?? snapshot.vehicles[0]?.vehicle_id ?? "");
  const [scenario, setScenario] = useState<DemoScenario>("Persistent cooling degradation");
  const [notice, setNotice] = useState("");
  function startScenario() {
    try {
      onSnapshotChange(applyScenario(snapshot, vehicleId, scenario));
      setNotice(`${scenario} applied to ${vehicleId}. All affected readings remain labeled simulated.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not apply demo scenario.");
    }
  }
  function stopScenario() {
    try {
      onSnapshotChange(applyScenario(snapshot, vehicleId, "Normal operation"));
      setNotice(`Scenario stopped; ${vehicleId} returned to normal simulator readings.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not stop demo scenario.");
    }
  }
  function reset() {
    onDemoReset(resetDemo());
    setNotice("Demo fleet reset to deterministic baseline scenarios.");
  }
  return (
    <>
      <PageHeader title="Settings & System Health" description="See the state of each integration separately and control the repeatable local demo." actions={<Badge variant={snapshot.mode === "backend" ? "success" : "unknown"}>{snapshot.mode === "backend" ? "BACKEND CONNECTED" : "BACKEND NOT CONFIGURED"}</Badge>} />
      <div className="notice notice-warning"><CloudOff size={16} /><span>Frontend render availability does not establish API, database, model, or telemetry connectivity. Each dependency below reports its own state.</span></div>
      <div className="two-column-grid">
        <Card title="System dependencies">
          <StatusBar label="API" state={snapshot.mode === "backend" ? "Connected" : "Disconnected"} detail={snapshot.mode === "backend" ? "Flask REST API; snapshot refreshes every 30 seconds" : "Select backend mode and configure its URL"} />
          <StatusBar label="WebSocket" state="Unavailable" detail="No WebSocket endpoint; backend snapshot polling is used" />
          <StatusBar label="Database" state="Unknown" detail="No database integration in this project" />
          <StatusBar label="MQTT broker" state="Unknown" detail="No broker endpoint or heartbeat available" />
          <StatusBar label="Prediction model" state={snapshot.mode === "backend" ? snapshot.backend_model_mode === "model" ? "Connected" : snapshot.backend_model_mode === "mock" ? "Simulated" : "Unavailable" : "Unavailable"} detail={snapshot.mode === "backend" ? `Flask model state: ${snapshot.backend_model_mode ?? "unknown"}` : "No model connected in local simulator mode"} />
          <StatusBar label="Telemetry watchdog" state="Unavailable" detail="Backend fleet data has no sample timestamp or freshness feed" />
          <div className="system-version"><span>Application version</span><b>0.2.0 · React dashboard</b></div>
        </Card>
        <Card title="Data freshness">
          {snapshot.vehicles.map((vehicle) => <div className="dependency-row" key={vehicle.vehicle_id}><div><strong>{vehicle.vehicle_id}</strong><small>Last valid time {formatTime(vehicle.last_seen)}</small></div><StateBadge state={vehicle.connectivity} /></div>)}
        </Card>
      </div>
      <div className="two-column-grid">
        <Card title="Cost assumptions">
          <div className="field"><label htmlFor="settings-fuel">Fuel price per liter (₹)</label><input id="settings-fuel" type="number" min="0" step="0.5" value={snapshot.cost_assumptions.fuel_price_per_liter} onChange={(event) => {
            const price = Number(event.target.value);
            if (Number.isFinite(price) && price >= 0) onSnapshotChange(updateCostAssumptions(snapshot, { fuel_price_per_liter: price }));
          }} /></div>
          <div className="field"><label htmlFor="idle-limit">Excessive-idle rule (minutes)</label><input id="idle-limit" type="number" min="1" value={snapshot.cost_assumptions.excessive_idle_minutes} onChange={(event) => {
            const minutes = Number(event.target.value);
            if (Number.isInteger(minutes) && minutes > 0) onSnapshotChange(updateCostAssumptions(snapshot, { excessive_idle_minutes: minutes }));
          }} /></div>
          <div className="field"><label htmlFor="fuel-drop">Fuel-drop rule (percentage points)</label><input id="fuel-drop" type="number" min="1" max="100" value={snapshot.cost_assumptions.fuel_drop_threshold_pct} onChange={(event) => {
            const threshold = Number(event.target.value);
            if (Number.isFinite(threshold) && threshold > 0 && threshold <= 100) onSnapshotChange(updateCostAssumptions(snapshot, { fuel_drop_threshold_pct: threshold }));
          }} /></div>
          <p className="fine-print">Downtime and service cost are not configured. These inputs are local demo assumptions; backend settings are not written.</p>
        </Card>
        {snapshot.mode === "mock" ? <Card title="Demo controls" className="demo-controls-card">
          <div className="notice notice-info"><Zap size={16} /><span>Scenario injection updates only this frontend's in-memory mock adapter. It does not call a backend or alter evaluation labels.</span></div>
          <div className="field"><label htmlFor="demo-vehicle">Vehicle</label><select id="demo-vehicle" value={vehicleId} onChange={(event) => setVehicleId(event.target.value)}>{snapshot.vehicles.map((vehicle) => <option key={vehicle.vehicle_id} value={vehicle.vehicle_id}>{vehicle.vehicle_id} · {vehicle.vehicle_type}</option>)}</select></div>
          <div className="field"><label htmlFor="demo-scenario">Scenario</label><select id="demo-scenario" value={scenario} onChange={(event) => setScenario(event.target.value as DemoScenario)}>{scenarioOptions.map((option) => <option key={option}>{option}</option>)}</select></div>
          <div className="active-scenario"><span className="status-dot status-dot-blue" /><div><b>Current scenario: {snapshot.vehicles.find((vehicle) => vehicle.vehicle_id === vehicleId)?.current_scenario}</b><small>Simulated · repeatable · not real telematics</small></div></div>
          {notice && <div className="inline-confirmation" role="status">{notice}</div>}
          <div className="button-row"><button className="button button-primary" onClick={startScenario}>Start scenario</button><button className="button button-secondary" onClick={stopScenario}>Stop / recover</button><button className="button button-quiet" onClick={reset}><RotateCcw size={14} /> Reset demo</button></div>
        </Card> : <Card title="Demo controls" className="demo-controls-card"><EmptyState title="Simulator controls are disabled" detail="Set VITE_FLEET_API_MODE=mock and restart Vite to use local scenario injection. The current snapshot comes from Flask." icon={Zap} /></Card>}
      </div>
    </>
  );
}

export function WorkOrderRow({ order, onVehicle }: { order: WorkOrder; onVehicle: (id: string) => void }) {
  return <button className="work-summary-row" onClick={() => onVehicle(order.vehicle_id)}><span className="work-icon"><Wrench size={15} /></span><span><b>{order.vehicle_id} · {order.issue_summary}</b><small>{order.work_order_id} · {order.status}</small></span><Badge variant={order.priority}>{order.priority}</Badge><ArrowRight size={15} /></button>;
}

function SelectFilter({ label, value, options, onChange }: { label: string; value: string; options: Iterable<string>; onChange: (value: string) => void }) {
  return <label className="filter-select"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{Array.from(options).map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
}

function Fact({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="model-fact"><small>{label}</small><b>{value}</b><span>{detail}</span></div>;
}

function Evidence({ label, value }: { label: string; value: string }) {
  return <div className="evidence-item"><small>{label}</small><b>{value}</b></div>;
}

function FuelLevelChart({ snapshot, vehicleId }: { snapshot: FleetSnapshot; vehicleId: string }) {
  const selected = snapshot.vehicles.find((vehicle) => vehicle.vehicle_id === vehicleId);
  if (!selected) return <EmptyState title="Vehicle unavailable" detail="Choose a vehicle with an available record." icon={Fuel} />;
  const data = selected?.readings.map((reading) => ({
    time: new Date(reading.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    fuel: reading.fuel_level_pct,
  })) ?? [];
  return data.length ? <div className="chart-block" style={{ height: 235 }}><ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 12, right: 10, bottom: 0, left: -18 }}>
    <CartesianGrid strokeDasharray="3 4" vertical={false} stroke="var(--line)" /><XAxis dataKey="time" minTickGap={38} tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis domain={[0, 100]} unit="%" tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={chartTooltipStyle} /><Line type="monotone" dataKey="fuel" name={`${selected.vehicle_id} fuel level (%)`} stroke="#60a5fa" dot={false} connectNulls={false} />
  </LineChart></ResponsiveContainer></div> : <EmptyState title="Fuel history unavailable" detail="No valid fuel-level samples are available." icon={Fuel} />;
}

function averageNullable(values: Array<number | null>): string {
  const available = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (!available.length) return "N/A";
  return (available.reduce((sum, value) => sum + value, 0) / available.length).toFixed(2);
}

function alertSeverityRank(severity: AlertSeverity): number {
  return ({ Critical: 0, High: 1, Medium: 2, Info: 3 })[severity];
}

function BarChart3Icon() {
  return <div className="evaluation-icon"><BarChartGraphic /></div>;
}

function BarChartGraphic() {
  return <span aria-hidden="true" className="bar-graphic"><i /><i /><i /><i /></span>;
}
