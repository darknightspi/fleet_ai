# FleetGuard AI - Predictive Maintenance Model Card

## Model Details
- **Model Name:** AI4I Failure Classifier (`failure_clf.joblib`)
- **Model Type:** Balanced Random Forest Classifier with Calibrated Probability Post-processing
- **Version:** 1.0.0
- **Training Timestamp:** 2026-10-09T15:12:59.618761
- **Framework:** scikit-learn
- **Random Seed:** 42
- **Artifact Path:** `ml/models/failure_clf.joblib`

## Intended Use
- **Primary Use Case:** Detection and predictive alert generation for industrial machinery / equipment degradation and machine failure modes (Heat Dissipation, Power Failure, Overstrain, Tool Wear, Random).
- **Secondary Use Case (FleetGuard Integration):** Surrogate predictive degradation engine mapping commercial vehicle telemetry (RPM, torque, coolant/ambient temperature, duty cycle) to degradation risk indicators.

## Training Data & Integrity
- **Dataset:** UCI AI4I 2020 Predictive Maintenance Dataset (`dataset/ai4i2020.csv`)
- **Total Records:** 10000
- **Total Features (Engineered):** 12 (derived from 6 raw non-leakage features)
- **Target Variable:** `Machine failure` (Binary: 0 = Normal, 1 = Failure)
- **Class Distribution:** 
  - Normal (0): 9661 (96.61%)
  - Failure (1): 339 (3.39%)
- **Target Leakage Prevention:** 
  - Excluded identifier columns (`UDI`, `Product ID`).
  - Excluded component failure mode columns (`TWF`, `HDF`, `PWF`, `OSF`, `RNF`) from feature inputs.

## Feature Engineering
The pipeline computes physics-grounded operational interaction features:
1. **`Temp_Diff_K`**: Process Temperature - Air Temperature (Key indicator for Heat Dissipation Failure).
2. **`Power_W`**: Rotational Speed [rpm] * Torque [Nm] * (2π / 60) (Detects Power Failure outside 3.5kW-9.0kW).
3. **`Tool_Wear_Torque`**: Torque [Nm] * Tool Wear [min] (Detects Overstrain Failure).
4. **`Torque_Speed_Ratio`**: Torque [Nm] / Rotational Speed [rpm].
5. **`Type_H`, `Type_L`, `Type_M`**: One-hot encoded product quality variants.

## Evaluation & Cross-Validation Results (Stratified 5-Fold)
All metrics computed out-of-fold across 5 stratified folds:

| Metric | Mean (5-Fold CV) | Std Dev |
|---|---|---|
| **Accuracy** | 0.9919 | ±0.0014 |
| **Precision** | 0.9374 | ±0.0487 |
| **Recall** | 0.8201 | ±0.0427 |
| **F1-Score** | 0.8729 | ±0.0208 |
| **ROC-AUC** | 0.9822 | ±0.0041 |
| **PR-AUC (Avg Precision)** | 0.8885 | ±0.0157 |
| **Brier Score (Calibration)** | 0.0096 | ±0.0008 |

### Aggregate Confusion Matrix (10,000 Out-of-Fold Samples)
- **True Negatives (TN):** 9641
- **False Positives (FP):** 20
- **False Negatives (FN):** 61
- **True Positives (TP):** 278

## Feature Importances
Ranked relative contribution to failure classification:
- **`Rotational speed [rpm]`**: 17.74%
- **`Torque_Speed_Ratio`**: 15.11%
- **`Power_W`**: 14.29%
- **`Torque [Nm]`**: 13.84%
- **`Tool wear [min]`**: 13.12%
- **`Tool_Wear_Torque`**: 10.62%
- **`Temp_Diff_K`**: 8.03%
- **`Air temperature [K]`**: 4.12%
- **`Process temperature [K]`**: 2.47%
- **`Type_L`**: 0.27%
- **`Type_M`**: 0.26%
- **`Type_H`**: 0.14%

## Supported Operational Ranges (Training Envelope)
When inference inputs exceed these boundaries, `model_in_range` is flagged as `False`:
- **`Type_H`**: Min = `0.00`, Max = `1.00`, Mean = `0.10`
- **`Type_L`**: Min = `0.00`, Max = `1.00`, Mean = `0.60`
- **`Type_M`**: Min = `0.00`, Max = `1.00`, Mean = `0.30`
- **`Air temperature [K]`**: Min = `295.30`, Max = `304.50`, Mean = `300.00`
- **`Process temperature [K]`**: Min = `305.70`, Max = `313.80`, Mean = `310.01`
- **`Rotational speed [rpm]`**: Min = `1168.00`, Max = `2886.00`, Mean = `1538.78`
- **`Torque [Nm]`**: Min = `3.80`, Max = `76.60`, Mean = `39.99`
- **`Tool wear [min]`**: Min = `0.00`, Max = `253.00`, Mean = `107.95`
- **`Temp_Diff_K`**: Min = `7.60`, Max = `12.10`, Mean = `10.00`
- **`Power_W`**: Min = `1148.44`, Max = `10469.92`, Mean = `6279.74`
- **`Tool_Wear_Torque`**: Min = `0.00`, Max = `16497.00`, Mean = `4314.66`
- **`Torque_Speed_Ratio`**: Min = `0.00`, Max = `0.06`, Mean = `0.03`

## Vehicle Telemetry Mapping & Crucial Limitations
> [!WARNING]
> **Domain Discrepancy & Validation Boundary:**
> 1. **Synthetic/Industrial Machine Basis:** The AI4I 2020 dataset models a CNC milling tool. Measurements represent spindle speeds, milling tool torque, and cutting tool wear.
> 2. **Surrogate Mapping:** FleetGuard maps vehicle RPM, engine torque, coolant temperature, and operating hours to these features for architectural and predictive demonstration.
> 3. **Validation Disclaimer:** High cross-validation performance on AI4I **does NOT** certify or prove real-world commercial vehicle / heavy-duty truck failure prediction accuracy. Field deployment on vehicles requires actual CAN bus and J1939 fault telemetry.
