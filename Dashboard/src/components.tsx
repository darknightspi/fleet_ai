import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  BarChart3,
  Bell,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  Cpu,
  Fuel,
  LayoutDashboard,
  MapPin,
  Menu,
  Moon,
  Search,
  Settings,
  ShieldCheck,
  Truck,
  Wrench,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Link,
  NavLink,
  useLocation,
} from "react-router-dom";
import { useEffect, useState, type ReactNode } from "react";
import { configuredDemoBaseline, formatTime, openAlertCount } from "./analytics";
import type { Alert, AlertSeverity, FleetSnapshot, RiskBand, Vehicle } from "./types";
import { FleetMap } from "./map";

const navigation = [
  { label: "Overview", path: "/", icon: LayoutDashboard },
  { label: "Fleet Monitoring", path: "/fleet", icon: Truck },
  { label: "Predictive Maintenance", path: "/maintenance-risk", icon: Activity },
  { label: "Alerts Center", path: "/alerts", icon: Bell },
  { label: "Maintenance Center", path: "/work-orders", icon: Wrench },
  { label: "Fuel & Cost Analytics", path: "/fuel", icon: Fuel },
  { label: "Reports & Evaluation", path: "/reports", icon: BarChart3 },
  { label: "IoT Devices", path: "/devices", icon: Cpu },
  { label: "Settings & System Health", path: "/settings", icon: Settings },
];

const routeTitles: Record<string, string> = Object.fromEntries(navigation.map((item) => [item.path, item.label]));

export function AppShell({
  snapshot,
  children,
  onGlobalSearch,
}: {
  snapshot: FleetSnapshot;
  children: ReactNode;
  onGlobalSearch: (value: string) => void;
}) {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [dark, setDark] = useState(() => localStorage.getItem("fleetguard-theme") !== "light");
  const title = routeTitles[location.pathname] ?? "FleetGuard AI";

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
    localStorage.setItem("fleetguard-theme", next ? "dark" : "light");
  }

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);

  return (
    <div className={`application ${collapsed ? "sidebar-collapsed" : ""}`}>
      {mobileOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
      <aside className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}>
        <div className="brand">
          <span className="brand-mark"><Activity size={20} /></span>
          {!collapsed && <span className="brand-name">FleetGuard <b>AI</b></span>}
          <button className="icon-button sidebar-collapse" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
          </button>
        </div>
        <div className="nav-section-label">{!collapsed && "COMMAND"}</div>
        <nav className="primary-nav" aria-label="Main navigation">
          {navigation.map(({ label, path, icon: Icon }) => {
            const count = label === "Alerts Center" ? snapshot.alerts.filter((alert) => alert.status === "Open").length : 0;
            return (
              <NavLink
                end={path === "/"}
                key={path}
                to={path}
                title={collapsed ? label : undefined}
                className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
                onClick={() => setMobileOpen(false)}
              >
                <Icon size={18} strokeWidth={1.8} />
                {!collapsed && <span>{label}</span>}
                {!collapsed && count > 0 && <span className="nav-count">{count}</span>}
              </NavLink>
            );
          })}
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-status">
          <span className="status-dot status-dot-blue" />
          {!collapsed && <span><b>SIMULATED DEMO</b><small>Backend not connected</small></span>}
        </div>
        {!collapsed && <div className="sidebar-foot">TH2-PS-SA-027 · Demo build</div>}
      </aside>

      <main className="main-shell">
        <header className="topbar">
          <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu size={20} /></button>
          <div className="breadcrumb"><span>FleetGuard AI</span><ChevronRight size={14} /><b>{title}</b></div>
          <div className="topbar-actions">
            <label className="global-search">
              <Search size={15} />
              <input aria-label="Find vehicle" value={search} placeholder="Find a vehicle" onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => {
                if (event.key === "Enter" && search.trim()) {
                  onGlobalSearch(search.trim());
                  setSearch("");
                }
              }} />
              <kbd>↵</kbd>
            </label>
            <div className="top-freshness"><span className="status-dot status-dot-grey" /><span>Demo data</span></div>
            <button className="icon-button" aria-label="Toggle theme" onClick={toggleTheme}><Moon size={17} /></button>
            <Link className="top-alert-button" to="/alerts" aria-label="Open alerts"><Bell size={17} /><span>{snapshot.alerts.filter((alert) => alert.status === "Open").length}</span></Link>
          </div>
        </header>
        <div className="page-content">{children}</div>
      </main>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return (
    <div className="page-header">
      <div><div className="eyebrow">FLEETGUARD AI / OPERATIONS</div><h1>{title}</h1><p>{description}</p></div>
      <div className="page-header-actions">{actions}</div>
    </div>
  );
}

export function Card({ children, className = "", title, action }: { children: ReactNode; className?: string; title?: string; action?: ReactNode }) {
  return <section className={`card ${className}`}>{(title || action) && <div className="card-heading">{title && <h2>{title}</h2>}{action}</div>}{children}</section>;
}

export function SectionHeading({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) {
  return <div className="section-heading"><div><h2>{title}</h2>{detail && <p>{detail}</p>}</div>{action}</div>;
}

export function KpiCard({ label, value, unit, detail, icon: Icon, tone = "blue", to }: {
  label: string; value: string; unit?: string; detail: string; icon: typeof Truck; tone?: string; to?: string;
}) {
  const body = <>
    <div className={`kpi-icon tone-${tone}`}><Icon size={18} /></div>
    <div className="kpi-label">{label}</div>
    <div className="kpi-value">{value}<span>{unit}</span></div>
    <p className="kpi-detail">{detail}</p>
    {to && <span className="kpi-link">View details <ChevronRight size={13} /></span>}
  </>;
  return to ? <Link to={to} className="kpi-card">{body}</Link> : <div className="kpi-card">{body}</div>;
}

export function Badge({ children, variant = "neutral" }: { children: ReactNode; variant?: string }) {
  return <span className={`badge badge-${variant.toLowerCase().replaceAll(" ", "-")}`}>{children}</span>;
}

export function RiskBadge({ band }: { band: RiskBand }) {
  return <Badge variant={band}>{band === "Unknown" ? <><CircleHelp size={12} /> Unknown</> : band}</Badge>;
}

export function SourceBadge({ source }: { source: string }) {
  return <Badge variant={source.toLowerCase()}>{source === "Simulated" ? "SIMULATED" : source.toUpperCase()}</Badge>;
}

export function StateBadge({ state }: { state: string }) {
  const variant = state === "Online" || state === "Resolved" || state === "Normal" ? "healthy"
    : state === "Stale" || state === "Acknowledged" || state === "Watch" ? "warning"
      : state === "Offline" || state === "Unknown" || state === "Unavailable" ? "unknown"
        : state === "Critical" || state === "High" ? "critical" : "neutral";
  return <Badge variant={variant}><span className="badge-dot" />{state}</Badge>;
}

export function EmptyState({ title, detail, icon: Icon = CircleHelp, action }: { title: string; detail: string; icon?: typeof CircleHelp; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon"><Icon size={21} /></span><h3>{title}</h3><p>{detail}</p>{action}</div>;
}

export function StatusBar({ label, state, detail }: { label: string; state: string; detail: string }) {
  return <div className="dependency-row"><div><strong>{label}</strong><small>{detail}</small></div><StateBadge state={state} /></div>;
}

export function TemperatureTrend({ vehicle, height = 250 }: { vehicle: Vehicle; height?: number }) {
  const rows = vehicle.readings.map((reading) => ({
    time: new Date(reading.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    actual: reading.coolant_temp_c,
    baseline: configuredDemoBaseline(reading),
    residual: reading.coolant_temp_c !== null && configuredDemoBaseline(reading) !== null
      ? Number((reading.coolant_temp_c - configuredDemoBaseline(reading)!).toFixed(1)) : null,
  }));
  const hasBaseline = rows.some((row) => row.baseline !== null);
  return hasBaseline ? (
    <div className="chart-block" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 10, bottom: 0, left: -18 }}>
          <CartesianGrid strokeDasharray="3 4" vertical={false} stroke="var(--line)" />
          <XAxis dataKey="time" minTickGap={36} tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis yAxisId="temp" tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} unit="°" />
          <YAxis yAxisId="residual" orientation="right" tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} unit="°" />
          <Tooltip contentStyle={{ background: "var(--surface-raised)", border: "1px solid var(--line)", borderRadius: 8, color: "var(--text)" }} />
          <Legend />
          <ReferenceLine yAxisId="residual" y={8} stroke="var(--warning)" strokeDasharray="4 4" label={{ value: "Persistence threshold", fill: "var(--warning)", fontSize: 10 }} />
          <Line yAxisId="temp" type="monotone" dataKey="actual" name="Actual coolant (°C)" stroke="var(--blue)" strokeWidth={2} dot={false} connectNulls={false} />
          <Line yAxisId="temp" type="monotone" dataKey="baseline" name="Configured baseline (°C)" stroke="var(--muted)" strokeWidth={1.5} strokeDasharray="5 4" dot={false} connectNulls={false} />
          <Line yAxisId="residual" type="monotone" dataKey="residual" name="Residual (°C)" stroke="var(--amber)" strokeWidth={1.6} dot={false} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  ) : <EmptyState title="Baseline unavailable" detail="No expected-temperature baseline is available for the selected readings." />;
}

export function VibrationTrend({ vehicle, height = 220 }: { vehicle: Vehicle; height?: number }) {
  const rows = vehicle.readings.map((reading) => ({
    time: new Date(reading.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    vibration: reading.vibration_rms_g,
  }));
  return (
    <div className="chart-block" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 8, right: 10, bottom: 0, left: -18 }}>
          <CartesianGrid strokeDasharray="3 4" vertical={false} stroke="var(--line)" />
          <XAxis dataKey="time" minTickGap={36} tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} unit=" g" />
          <Tooltip contentStyle={{ background: "var(--surface-raised)", border: "1px solid var(--line)", borderRadius: 8, color: "var(--text)" }} />
          <ReferenceLine y={0.62} stroke="var(--warning)" strokeDasharray="4 4" label={{ value: "Demo threshold", fill: "var(--warning)", fontSize: 10 }} />
          <Area type="monotone" dataKey="vibration" name="Vibration (g RMS)" stroke="var(--purple)" fill="var(--purple-soft)" connectNulls={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function VehicleTable({
  vehicles,
  alerts,
  onSelect,
  compact = false,
}: {
  vehicles: Vehicle[];
  alerts: Alert[];
  onSelect: (vehicleId: string) => void;
  compact?: boolean;
}) {
  if (!vehicles.length) return <EmptyState title="No vehicles match" detail="Adjust or clear the active search and filters." icon={Truck} />;
  return (
    <div className="table-wrap">
      <table className={compact ? "compact-table" : ""}>
        <thead><tr><th>Vehicle</th><th>Type</th><th>State</th><th>Last speed</th><th>Risk</th><th>Freshness</th><th>Location</th><th>Open alerts</th></tr></thead>
        <tbody>
          {vehicles.map((vehicle) => {
            const latest = vehicle.readings.at(-1);
            const openCount = openAlertCount(alerts, vehicle.vehicle_id);
            return (
              <tr key={vehicle.vehicle_id} onClick={() => onSelect(vehicle.vehicle_id)} tabIndex={0} onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") onSelect(vehicle.vehicle_id);
              }}>
                <td><strong>{vehicle.vehicle_id}</strong><small>{vehicle.driver ?? "No driver assigned"}</small></td>
                <td>{vehicle.vehicle_type}</td>
                <td><StateBadge state={vehicle.connectivity} /><small>{vehicle.operational_state}</small></td>
                <td>{latest?.speed_kmph === null || latest?.speed_kmph === undefined ? "N/A" : `${latest.speed_kmph.toFixed(0)} km/h`}</td>
                <td><RiskBadge band={vehicle.status?.risk_band ?? "Unknown"} /></td>
                <td>{formatTime(vehicle.last_seen, { dateStyle: undefined, timeStyle: "short" })}<small><SourceBadge source={vehicle.source} /></small></td>
                <td>{vehicle.location ? <span className="location-cell"><MapPin size={13} /> Available</span> : <span className="muted">Unavailable</span>}</td>
                <td><span className={openCount ? "count-attention" : ""}>{openCount}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function NeedsAttention({ alerts, onSelectVehicle, onAcknowledge, onCreateWorkOrder }: {
  alerts: Alert[];
  onSelectVehicle: (vehicleId: string) => void;
  onAcknowledge: (alertId: string) => void;
  onCreateWorkOrder: (alertId: string) => void;
}) {
  const active = alerts.filter((alert) => alert.status !== "Resolved").sort((a, b) => severityOrder(a.severity) - severityOrder(b.severity));
  if (!active.length) return <EmptyState title="No open alerts" detail="The simulator has no current open alert records." icon={ShieldCheck} />;
  return <div className="attention-list">{active.slice(0, 4).map((alert) => (
    <article key={alert.alert_id} className="attention-item">
      <span className={`attention-marker marker-${alert.severity.toLowerCase()}`}>{alert.severity === "Critical" ? <AlertOctagon size={17} /> : <AlertTriangle size={17} />}</span>
      <div className="attention-main">
        <div className="attention-title"><button className="text-button" onClick={() => onSelectVehicle(alert.vehicle_id)}>{alert.vehicle_id}</button><Badge variant={alert.severity}>{alert.severity}</Badge><SourceBadge source={alert.source} /></div>
        <strong>{alert.summary}</strong>
        <p>{alert.explanation}</p>
        <small>First detected {formatTime(alert.first_detected)} · Last evidence {formatTime(alert.latest_evidence)}</small>
        <div className="attention-actions">
          <button className="button button-link" onClick={() => onSelectVehicle(alert.vehicle_id)}>View vehicle</button>
          {alert.status === "Open" && <button className="button button-quiet" onClick={() => onAcknowledge(alert.alert_id)}>Acknowledge</button>}
          {!alert.linked_work_order_id && <button className="button button-quiet" onClick={() => onCreateWorkOrder(alert.alert_id)}>Create work order</button>}
        </div>
      </div>
      <div className="attention-recommendation"><small>RECOMMENDED NEXT STEP</small><span>{alert.recommendation}</span></div>
    </article>
  ))}</div>;
}

export function VehicleDrawer({ vehicle, snapshot, onClose, onCreateWorkOrder }: {
  vehicle: Vehicle | null;
  snapshot: FleetSnapshot;
  onClose: () => void;
  onCreateWorkOrder: (alertId: string) => void;
}) {
  if (!vehicle) return null;
  const alerts = snapshot.alerts.filter((alert) => alert.vehicle_id === vehicle.vehicle_id);
  const latest = vehicle.readings.at(-1);
  return (
    <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="vehicle-drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <div className="drawer-header">
          <div><div className="eyebrow">VEHICLE DETAIL / {vehicle.source.toUpperCase()}</div><h2 id="drawer-title">{vehicle.vehicle_id}</h2><p>{vehicle.vehicle_type} · {vehicle.driver ?? "No driver assigned"}</p></div>
          <button className="icon-button" aria-label="Close vehicle details" onClick={onClose}><X size={19} /></button>
        </div>
        <div className="drawer-badges"><SourceBadge source={vehicle.source} /><StateBadge state={vehicle.connectivity} /><RiskBadge band={vehicle.status?.risk_band ?? "Unknown"} /></div>
        <div className="drawer-scroll">
          <div className="drawer-metrics">
            <div><small>Last reported speed</small><b>{latest?.speed_kmph === null || latest?.speed_kmph === undefined ? "N/A" : `${latest.speed_kmph.toFixed(0)} km/h`}</b></div>
            <div><small>Coolant temperature</small><b>{latest?.coolant_temp_c === null || latest?.coolant_temp_c === undefined ? "N/A" : `${latest.coolant_temp_c.toFixed(1)} °C`}</b></div>
            <div><small>Vibration</small><b>{latest?.vibration_rms_g === null || latest?.vibration_rms_g === undefined ? "N/A" : `${latest.vibration_rms_g.toFixed(2)} g`}</b></div>
            <div><small>Fuel level</small><b>{latest?.fuel_level_pct === null || latest?.fuel_level_pct === undefined ? "N/A" : `${latest.fuel_level_pct.toFixed(0)}%`}</b></div>
          </div>
          <div className="drawer-section">
            <h3>Health indicator</h3>
            <div className="drawer-risk-line"><span className="risk-number">{vehicle.status?.risk_score ?? "N/A"}</span><span>/ 100 · {vehicle.model_inputs ? "backend failure probability" : "demo display score"}</span><RiskBadge band={vehicle.status?.risk_band ?? "Unknown"} /></div>
            <p className="explanation">{vehicle.status?.explanation ?? "No risk explanation is available."}</p>
            <p className="fine-print">{vehicle.model_inputs ? `Backend classifier probability: ${vehicle.status?.failure_prob == null ? "unavailable" : `${(vehicle.status.failure_prob * 100).toFixed(2)}%`}. The AI4I industrial model is not validated for truck failure prediction.` : "Classifier failure probability: unavailable. This demo indicator is not a validated failure prediction."}</p>
          </div>
          {vehicle.model_inputs && <div className="drawer-section">
            <h3>Backend model inputs <span className="section-count">seeded snapshot</span></h3>
            <div className="drawer-metrics">
              <div><small>Ambient temperature</small><b>{vehicle.model_inputs.ambient_temp_c.toFixed(1)} °C</b></div>
              <div><small>Coolant temperature</small><b>{vehicle.model_inputs.coolant_temp_c.toFixed(1)} °C</b></div>
              <div><small>Engine speed</small><b>{vehicle.model_inputs.engine_rpm.toFixed(0)} rpm</b></div>
              <div><small>Engine torque</small><b>{vehicle.model_inputs.engine_torque_nm.toFixed(1)} Nm</b></div>
              <div><small>Operating wear</small><b>{vehicle.model_inputs.operating_wear_min.toFixed(0)} min</b></div>
              <div><small>Duty category</small><b>{vehicle.model_inputs.duty}</b></div>
            </div>
            <p className="fine-print">The Flask fleet endpoint does not supply a measurement timestamp or historical series.</p>
          </div>}
          <div className="drawer-section">
            <h3>Temperature and configured baseline</h3>
            <TemperatureTrend vehicle={vehicle} height={205} />
            <p className="fine-print">Configured simulator baseline uses ambient temperature and engine load; it is not a trained vehicle model.</p>
          </div>
          <div className="drawer-section">
            <h3>Recent alerts <span className="section-count">{alerts.length}</span></h3>
            {alerts.length ? alerts.slice().reverse().slice(0, 4).map((alert) => (
              <div className="drawer-alert" key={alert.alert_id}><Badge variant={alert.severity}>{alert.severity}</Badge><div><b>{alert.type}</b><small>{alert.summary}</small><span>{formatTime(alert.latest_evidence)} · evidence retained</span></div>{!alert.linked_work_order_id && alert.status !== "Resolved" && <button className="button button-link" onClick={() => onCreateWorkOrder(alert.alert_id)}>Work order</button>}</div>
            )) : <p className="muted">No alert records for this vehicle.</p>}
          </div>
          <div className="drawer-section">
            <h3>Location</h3>
            {vehicle.location ? <FleetMap vehicles={[vehicle]} compact /> : <div className="location-unavailable"><MapPin size={15} /><span>Location unavailable</span><small>No verified coordinates were supplied by this demo source.</small></div>}
          </div>
          <div className="drawer-section source-detail"><Clock3 size={14} /> Last seen {formatTime(vehicle.last_seen)} <span>·</span> {vehicle.source} telemetry</div>
        </div>
      </aside>
    </div>
  );
}

export function ChartTooltipLabel({ label }: { label?: ReactNode }) {
  return <span className="chart-tooltip-label">{label}</span>;
}

function severityOrder(severity: AlertSeverity): number {
  return ({ Critical: 0, High: 1, Medium: 2, Info: 3 })[severity];
}
