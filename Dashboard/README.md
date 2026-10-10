# FleetGuard AI React dashboard

This Vite, React 18, and TypeScript dashboard uses the Flask application in the parent `fleet_ai/` directory as its backend. Its interface preserves the separately developed dashboard design. The Python Flask app, existing HTML interface, ML artifacts, dataset, and evaluation files remain in place.

## Requirements

- Python 3.10–3.12 recommended. The checked-in model artifact was serialized with scikit-learn 1.4.2; matching that version avoids compatibility warnings. Python 3.13+ can install a newer compatible scikit-learn, but loading the artifact may emit version warnings.
- Node.js 20.19+ or 22.12+ and npm.
- Backend Python packages: Flask, joblib, NumPy, pandas, scikit-learn. The repository does not currently contain a Python dependency manifest.

## Start the application for development

Install backend dependencies from `fleet_ai/`:

```bash
python -m pip install -r requirements.txt
```

In terminal one, from `fleet_ai/`:

```bash
python app.py
```

Flask listens at `http://127.0.0.1:5000`. In terminal two:

```bash
cd Dashboard
npm ci
npm run dev
```

Open the Vite URL (normally `http://localhost:5173`). Vite proxies `/api` to Flask at `http://127.0.0.1:5000`. If Flask runs elsewhere, change the proxy target in `Dashboard/vite.config.ts`. To point the browser directly at an API origin instead, set `VITE_API_BASE_URL` (for example `http://127.0.0.1:5000/api`). The Flask app currently binds to loopback and does not configure CORS.

## API and data contract

The frontend defaults to `VITE_FLEET_API_MODE=backend` and calls:

- `GET /api/health` for backend and model readiness.
- `GET /api/fleet` for the seeded fleet and existing per-vehicle ML predictions.

The adapter maps model probabilities, risk tiers, and range flags into the dashboard. The Flask API seeds simulated demo units `001`–`008`. The separate local simulator also presents eight simulated units using those IDs. The API can additionally retain real hardware sessions submitted by an external transport adapter; incomplete hardware telemetry does not receive a model prediction. The current Flask API does not provide historical hardware readings, GPS history, fuel measurements, alerts, or work orders, so those dashboard sections remain unavailable or empty. The model is trained on the industrial AI4I dataset; its probabilities are not validated truck-failure rates.

The sidebar and Overview/Fleet pages report backend connectivity separately from connected physical units and simulated demo data. Hardware records are counted as connected only when their source is `Hardware` and their connection state is `Online`. Mock mode always reports zero physical connections. The dashboard receives backend hardware records through `/api/fleet`, refreshed every 30 seconds.

For a future hardware integration, a trusted ESP32/RC transport adapter should call `POST /api/hardware/telemetry` with a stable `device_id` and actual telemetry only after a successful identification/session handshake. The first accepted message assigns an ID starting at `101`; messages for the same device update its existing record. A unit becomes stale after 60 seconds without telemetry; on disconnect, the adapter can call `POST /api/hardware/disconnect` for immediate offline status. These registrations are in-memory only and disappear on backend restart. This project does not implement Bluetooth, ESP32 communication, or a persistent device registry; these routes define the backend integration boundary and do not themselves establish a physical connection.

Other existing Flask endpoints remain available for callers: `POST /api/predict`, `GET /api/metrics`, and `GET /api/timeseries`. The current dashboard does not consume these because its current pages have no matching prediction form, model-metrics view contract, or compatible telemetry-history view.

For isolated simulator work and tests, explicitly set `VITE_FLEET_API_MODE=mock` before starting/building Vite. The simulator is not selected as a production fallback: backend errors are shown with a retry option.

## Build and test

From `fleet_ai/Dashboard/`:

```bash
npm ci
npm test
npm run build
npm run preview
```

The production build is in `Dashboard/dist/`. Serve it from a static host or reverse proxy and set `VITE_API_BASE_URL` at build time to the Flask API base URL (same-origin `/api` is the default). Flask continues to serve the existing interface at `/`; it does not serve the React build. Keep the static host and API same-origin or configure a restricted production CORS policy at the deployment layer.

Run backend tests from `fleet_ai/`:

```bash
pytest -v
```

The Flask routes can be exercised through its test client without starting a network server.
