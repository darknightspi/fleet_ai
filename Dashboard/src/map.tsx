import { divIcon, latLngBounds } from "leaflet";
import { LocateFixed, MapPin } from "lucide-react";
import { useEffect } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import type { Vehicle } from "./types";

function FitFleet({ vehicles }: { vehicles: Vehicle[] }) {
  const map = useMap();
  const points = vehicles
    .filter((vehicle) => vehicle.location)
    .map((vehicle) => [vehicle.location!.lat, vehicle.location!.lon] as [number, number]);
  useEffect(() => {
    if (!points.length) return;
    const bounds = latLngBounds(points);
    map.fitBounds(bounds, { padding: [28, 28], maxZoom: 12 });
    const container = map.getContainer().closest(".map-frame");
    const fit = () => map.fitBounds(bounds, { padding: [28, 28], maxZoom: 12 });
    container?.addEventListener("fleet-map-fit", fit);
    return () => container?.removeEventListener("fleet-map-fit", fit);
  }, [map, vehicles]);
  return null;
}

function markerIcon(band: string) {
  const color = band === "Critical" ? "#fb7185" : band === "High" ? "#fbbf24" : band === "Normal" ? "#34d399" : "#94a3b8";
  return divIcon({
    className: "vehicle-map-icon",
    html: `<span style="--marker-color:${color}"></span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

export function FleetMap({ vehicles, onSelect, compact = false }: { vehicles: Vehicle[]; onSelect?: (vehicleId: string) => void; compact?: boolean }) {
  const located = vehicles.filter((vehicle) => vehicle.location !== null);
  const height = compact ? "245px" : "400px";
  if (!located.length) {
    return (
      <div className="map-empty" style={{ minHeight: height }}>
        <div className="map-empty-message"><span className="empty-icon"><MapPin size={21} /></span><h3>Vehicle locations unavailable</h3><p>This simulated data source does not provide verified coordinates. No map pins or routes are fabricated.</p></div>
        <div className="map-source-note"><span className="status-dot status-dot-grey" /> Location source: unavailable · freshness: unknown</div>
      </div>
    );
  }

  const first = located[0].location!;
  return (
    <div className={`map-frame ${compact ? "map-compact" : ""}`} style={{ height }}>
      <button className="map-fit" onClick={(event) => {
        const root = event.currentTarget.closest(".map-frame");
        root?.dispatchEvent(new CustomEvent("fleet-map-fit"));
      }}><LocateFixed size={14} /> Fit to fleet</button>
      <MapContainer center={[first.lat, first.lon]} zoom={11} scrollWheelZoom className="fleet-map">
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <FitFleet vehicles={located} />
        {located.map((vehicle) => {
          const location = vehicle.location!;
          const route = vehicle.readings.flatMap((reading) =>
            reading.lat !== null && reading.lon !== null ? [[reading.lat, reading.lon] as [number, number]] : [],
          );
          return (
            <span key={vehicle.vehicle_id}>
              {route.length > 1 && <Polyline positions={route} pathOptions={{ color: "#60a5fa", weight: 3, opacity: 0.7 }} />}
              <Marker position={[location.lat, location.lon]} icon={markerIcon(vehicle.status?.risk_band ?? "Unknown")} eventHandlers={{ click: () => onSelect?.(vehicle.vehicle_id) }}>
                <Popup><strong>{vehicle.vehicle_id}</strong><br />{vehicle.connectivity} · {vehicle.status?.risk_band ?? "Risk unknown"}<br />{vehicle.source} · {new Date(location.timestamp).toLocaleString()}<br /><button className="map-popup-link" onClick={() => onSelect?.(vehicle.vehicle_id)}>View vehicle details</button></Popup>
              </Marker>
            </span>
          );
        })}
      </MapContainer>
      <div className="map-legend"><span><i className="legend-dot healthy" /> Normal</span><span><i className="legend-dot warning" /> Watch / High</span><span><i className="legend-dot critical" /> Critical</span></div>
      <div className="map-source-note"><span className="status-dot status-dot-blue" /> Location and trails use API-provided coordinates only · no simulated GPS</div>
    </div>
  );
}
