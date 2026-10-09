# FleetGuard AI

An AI-powered predictive maintenance and fleet telemetry analytics platform.

---

## 📁 Repository Structure

```text
fleet_ai/
├── dataset/
│   └── ai4i2020.csv              # UCI AI4I 2020 Predictive Maintenance dataset (10,000 records)
├── ml/
│   ├── __init__.py
│   ├── config.py                 # Central config, paths, feature lists, hyperparameters
│   ├── data_loader.py            # Dataset loader, validation, target leakage prevention
│   ├── feature_engineering.py    # Domain & physics feature transformers, range metadata
│   ├── train.py                  # Stratified 5-fold CV, calibration, artifact generation
│   ├── inference.py              # FleetGuard predictor, vehicle telemetry mapping, mock mode
│   ├── timeseries.py             # Temporal telemetry generator & state transition engine
│   └── models/
│       ├── failure_clf.joblib    # Serialized calibrated Random Forest model bundle
│       └── model_card.md         # Detailed Model Card documentation
├── evaluation/
│   ├── __init__.py
│   ├── evaluate.py               # Model evaluation & calibration curves
│   └── results/
│       ├── metrics.json          # 5-fold CV out-of-fold metrics & summary
│       ├── confusion_matrix.json # Aggregate confusion matrix
│       └── feature_importance.json # Ranked feature contributions
├── tests/
│   ├── __init__.py
│   ├── test_data_loader.py       # Path resolution, schema checks, leakage tests
│   ├── test_feature_engineering.py # Transformation and range tests
│   ├── test_training.py          # CV pipeline and artifact tests
│   ├── test_inference.py         # Telemetry mapping, range flags, mock mode
│   └── test_timeseries.py        # Temporal telemetry and state transition tests
├── app.py                        # Web dashboard server & REST API
├── templates/
│   └── index.html                # Telemetry simulator, fleet monitor & time-series UI
├── static/
│   ├── css/style.css             # Glassmorphism design system & chart styling
│   └── js/app.js                 # Interactive controller & dual canvas chart engine
├── first.ipynb                   # Initial exploratory analysis notebook
├── .gitignore
└── README.md
```

---

## 📊 Dataset Configuration

- **Dataset Path:** `dataset/ai4i2020.csv` (strictly resolved relative to repository root).
- **Target Variable:** `Machine failure` (Binary: `0` = Normal, `1` = Failure, 3.39% positive class).
- **Target Leakage Prevention:**
  - Identifiers (`UDI`, `Product ID`) and failure mode indicators (`TWF`, `HDF`, `PWF`, `OSF`, `RNF`) are strictly **excluded** from training features.
  - Features used: `Type`, `Air temperature [K]`, `Process temperature [K]`, `Rotational speed [rpm]`, `Torque [Nm]`, `Tool wear [min]`.

---

## ⚙️ Quick Start

### 1. Verify Dataset
```bash
python -m ml.data_loader
```

### 2. Train Model & Cross-Validation
```bash
python -m ml.train
```

### 3. Evaluate Serialized Model
```bash
python -m evaluation.evaluate
```

### 4. Run Test Suite
```bash
pytest -v
```

---

## 🔬 Model Performance (Stratified 5-Fold CV)

Evaluation across all 10,000 out-of-fold predictions on `dataset/ai4i2020.csv`:

| Metric | Random Forest (Balanced) | Calibrated Classifier |
|---|---|---|
| **Accuracy** | 98.60% (±0.31%) | 99.03% (±0.18%) |
| **Precision** | 77.41% (±7.22%) | 92.02% (±4.12%) |
| **Recall** | 84.66% (±2.72%) | 78.48% (±5.89%) |
| **F1-Score** | 80.58% (±3.04%) | 84.50% (±3.31%) |
| **ROC-AUC** | 0.9820 (±0.0051) | 0.9765 (±0.0052) |
| **PR-AUC** | 0.8841 (±0.0124) | 0.8757 (±0.0133) |
| **Brier Score** | 0.0136 (±0.0016) | 0.0094 (±0.0008) |

### Aggregate Out-of-Fold Confusion Matrix
- **True Negatives (TN):** 9,573
- **False Positives (FP):** 88
- **False Negatives (FN):** 52
- **True Positives (TP):** 287

---

## 🚛 FleetGuard Telemetry Integration & Mapping

The prediction engine provides direct surrogate mapping from vehicle CAN/telemetry signals to AI4I operational features:

| Vehicle Telemetry Signal | AI4I Feature Mapped | Transformation Formula |
|---|---|---|
| `ambient_temp_c` | `Air temperature [K]` | `temp_c + 273.15` |
| `coolant_temp_c` / `engine_temp_c` | `Process temperature [K]` | `temp_c + 273.15` |
| `engine_rpm` | `Rotational speed [rpm]` | Direct pass-through |
| `engine_torque_nm` | `Torque [Nm]` | Direct pass-through |
| `operating_wear_min` / `operating_hours` | `Tool wear [min]` | `operating_hours * 60` or wear minutes |
| `vehicle_duty_type` (`light`, `medium`, `heavy`) | `Type` (`L`, `M`, `H`) | Standard category encoding |

### Range Validation (`model_in_range`)
The engine checks every input against statistical training ranges. If any input exceeds known bounds, the engine flags `model_in_range = False` and returns diagnostic warnings describing the out-of-range parameters.

### Mock Mode Fallback
If the dataset or serialized model artifact (`ml/models/failure_clf.joblib`) is missing, or if `force_mock_mode=True`, the predictor automatically starts in **Mock Mode**, executing physical failure heuristic rules without crashing or blocking dashboard/backend services.

---

## ⚠️ Domain Discrepancy & Caveats
> **Important Note on Validation Limitations:**
> The AI4I 2020 dataset models synthetic CNC milling machine degradation physics (spindle speeds, milling tool torque, cutter wear). High cross-validation performance on this dataset demonstrates algorithmic efficacy on mechanical degradation patterns, but **does not prove real-world commercial heavy-duty truck failure prediction accuracy**. Operational deployment on commercial fleets requires empirical J1939 CAN bus telemetry and validation against real truck diagnostic trouble codes (DTCs).
