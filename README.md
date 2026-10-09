# FleetGuard AI

FleetGuard AI combines a Flask API and predictive maintenance pipeline with a React, TypeScript, and Vite dashboard. The Python application remains the backend and model source of truth. The previous Flask-rendered dashboard at `/` is retained.

## Project structure

```text
fleet_ai/
├── Dashboard/                 # React + TypeScript frontend (Vite)
│   ├── src/                   # Pages, components, charts, map, API adapters
│   ├── package.json
│   └── README.md
├── dataset/ai4i2020.csv       # UCI AI4I 2020 dataset
├── evaluation/                # Evaluation code and existing result files
├── ml/                        # Data loading, features, training, inference
│   └── models/                # Existing trained model and model card
├── static/                    # Retained Flask interface assets
├── templates/                 # Retained Flask interface template
├── tests/                     # Backend tests, including API contract checks
├── app.py                     # Flask application and REST API
├── requirements.txt           # Python dependencies
└── README.md
```

## Requirements

- Python 3.10–3.12 recommended. The existing model artifact was serialized with scikit-learn 1.4.2; using that version avoids model compatibility warnings. Python 3.13+ may install a newer scikit-learn and emit warnings when loading the artifact.
- Node.js 20.19+ or 22.12+ and npm for the React dashboard.

## Run locally

Use two terminals from the `fleet_ai/` directory.

### 1. Install Python dependencies

```bash
python -m pip install -r requirements.txt
```

If you use a virtual environment, activate it before installing and running the backend.

### 2. Start the Flask backend

```bash
python app.py
```

Flask starts at `http://127.0.0.1:5000`. The backend serves the retained HTML dashboard at `/` and its API under `/api/`.

### 3. Install and start the React dashboard

In the second terminal:

```bash
cd Dashboard
npm ci
npm run dev
```

Open the URL Vite prints, normally `http://localhost:5173`. Vite proxies `/api` requests to `http://127.0.0.1:5000`. If the backend runs at a different address, update the proxy target in `Dashboard/vite.config.ts`. To use a direct API origin instead of the proxy, set `VITE_API_BASE_URL` to the API base, for example `http://127.0.0.1:5000/api`.

The React frontend uses Flask mode by default. To explicitly run the isolated local simulator instead:

```bash
VITE_FLEET_API_MODE=mock npm run dev
```

In PowerShell:

```powershell
$env:VITE_FLEET_API_MODE = "mock"
npm run dev
```

## Available backend API

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/health` | Backend and model readiness |
| `GET` | `/api/fleet` | Seeded fleet and per-vehicle predictions |
| `POST` | `/api/predict` | Predict from a supplied telemetry or AI4I feature payload |
| `GET` | `/api/metrics` | Existing evaluation metrics and feature importances |
| `GET` | `/api/timeseries` | Generated 60-minute scenario data with per-step predictions |

The React adapter currently calls `/api/health` and `/api/fleet`. It shows backend predictions and model input values. The current backend does not supply historical readings, GPS, fuel volume, alert records, or work orders; those dashboard areas therefore show unavailable or empty states. The frontend does not fabricate those values. The seeded fleet records are simulated inputs, and the AI4I industrial model is not validated for predicting truck failures.

## Tests and production build

Run backend tests from `fleet_ai/`:

```bash
python -m pytest -v
```

Run frontend tests and build from `fleet_ai/Dashboard/`:

```bash
npm test
npm run build
```

The production frontend files are written to `Dashboard/dist/`. Preview that build locally with:

```bash
npm run preview
```

For production, serve `Dashboard/dist/` from a static host or reverse proxy. Flask does not currently serve the React build. Configure `VITE_API_BASE_URL` at build time if the API is not available at the same-origin `/api` path. Keep the API same-origin where possible; otherwise configure a restricted CORS policy at the deployment layer.

## Dataset and model

- Dataset: `dataset/ai4i2020.csv` (10,000 records).
- Target: `Machine failure` (`0` = normal, `1` = failure).
- Training excludes identifiers (`UDI`, `Product ID`) and failure mode columns (`TWF`, `HDF`, `PWF`, `OSF`, `RNF`) to prevent target leakage.
- Model training and evaluation commands:

  ```bash
  python -m ml.data_loader
  python -m ml.train
  python -m evaluation.evaluate
  ```

Training rewrites model and evaluation artifacts, so use `python -m ml.train` only when intentionally retraining. Running the app and tests does not require retraining.

Vehicle telemetry mapping converts ambient and coolant temperatures from Celsius to Kelvin, maps RPM and torque directly, maps operating wear to tool wear, and maps duty type to AI4I product type. The predictor reports when inputs fall outside its training ranges.

## Model limitations

The AI4I 2020 dataset represents synthetic CNC milling machine degradation, not commercial truck operation. Cross-validation results on that dataset do not establish real-world vehicle failure accuracy. Fleet deployment requires appropriate CAN/J1939 telemetry and validation against actual vehicle outcomes and diagnostic trouble codes.
