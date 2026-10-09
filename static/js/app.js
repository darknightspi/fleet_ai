/**
 * FleetGuard AI - Frontend Interactive Controller
 */

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const form = document.getElementById('telemetryForm');
  const ambientTempInput = document.getElementById('ambientTemp');
  const coolantTempInput = document.getElementById('coolantTemp');
  const engineRpmInput = document.getElementById('engineRpm');
  const engineTorqueInput = document.getElementById('engineTorque');
  const operatingWearInput = document.getElementById('operatingWear');

  // Value Displays
  const valAmbient = document.getElementById('valAmbient');
  const valCoolant = document.getElementById('valCoolant');
  const valRpm = document.getElementById('valRpm');
  const valTorque = document.getElementById('valTorque');
  const valWear = document.getElementById('valWear');

  // Physics Calculations
  const calcTempDiff = document.getElementById('calcTempDiff');
  const calcPower = document.getElementById('calcPower');
  const calcOverstrain = document.getElementById('calcOverstrain');
  const calcRatio = document.getElementById('calcRatio');
  const hdfRiskNote = document.getElementById('hdfRiskNote');
  const pwfRiskNote = document.getElementById('pwfRiskNote');
  const osfRiskNote = document.getElementById('osfRiskNote');

  // Prediction Outputs
  const gaugeProgress = document.getElementById('gaugeProgress');
  const probPercent = document.getElementById('probPercent');
  const riskTierPill = document.getElementById('riskTierPill');
  const riskTierText = document.getElementById('riskTierText');
  const riskSummaryText = document.getElementById('riskSummaryText');
  const decisionActionText = document.getElementById('decisionActionText');
  const rangeStatusBadge = document.getElementById('rangeStatusBadge');
  const rangeBadgeText = document.getElementById('rangeBadgeText');
  const outOfRangeContainer = document.getElementById('outOfRangeContainer');
  const warningList = document.getElementById('warningList');
  const factorBars = document.getElementById('factorBars');

  // App Controls
  const mockModeSwitch = document.getElementById('mockModeSwitch');
  const modelStatusPill = document.getElementById('modelStatusPill');
  const modelStatusText = document.getElementById('modelStatusText');
  const fleetGrid = document.getElementById('fleetGrid');

  // Tabs
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');

  // Presets
  const presetBtns = document.querySelectorAll('.pill-btn');

  // Presets definition
  const PRESETS = {
    normal: {
      ambient_temp_c: 25.0,
      coolant_temp_c: 35.5,
      engine_rpm: 1550,
      engine_torque_nm: 42.0,
      operating_wear_min: 45,
      vehicle_duty_type: 'medium'
    },
    overheat: {
      ambient_temp_c: 31.0,
      coolant_temp_c: 37.0, // Temp diff = 6.0 K (< 8.6 K)
      engine_rpm: 1320,     // Speed < 1380 RPM -> Heat Dissipation Failure trigger!
      engine_torque_nm: 48.0,
      operating_wear_min: 60,
      vehicle_duty_type: 'medium'
    },
    power_spike: {
      ambient_temp_c: 26.0,
      coolant_temp_c: 36.5,
      engine_rpm: 2750,
      engine_torque_nm: 70.0, // Power = 2750 * 70 * 2*pi/60 = 20.15 kW (> 9 kW Power Failure!)
      operating_wear_min: 80,
      vehicle_duty_type: 'heavy'
    },
    overstrain: {
      ambient_temp_c: 27.0,
      coolant_temp_c: 37.5,
      engine_rpm: 1420,
      engine_torque_nm: 65.0,
      operating_wear_min: 210, // Torque * Wear = 65 * 210 = 13,650 (> 11,000 Overstrain Failure!)
      vehicle_duty_type: 'light'
    },
    heavy_wear: {
      ambient_temp_c: 26.0,
      coolant_temp_c: 36.0,
      engine_rpm: 1500,
      engine_torque_nm: 45.0,
      operating_wear_min: 245, // Critical tool wear degradation
      vehicle_duty_type: 'heavy'
    },
    out_of_range: {
      ambient_temp_c: 110.0,   // Outside training envelope
      coolant_temp_c: 135.0,   // Outside training envelope
      engine_rpm: 7200,        // Outside training envelope
      engine_torque_nm: 300.0, // Outside training envelope
      operating_wear_min: 950,
      vehicle_duty_type: 'heavy'
    }
  };

  // Simulated Fleet
  const FLEET_DATA = [
    { id: 'FL-101', model: 'Freightliner Cascadia', duty: 'heavy', ambient_temp_c: 26.0, coolant_temp_c: 36.2, engine_rpm: 1520, engine_torque_nm: 42.5, operating_wear_min: 50 },
    { id: 'FL-102', model: 'Kenworth T680', duty: 'medium', ambient_temp_c: 28.5, coolant_temp_c: 38.0, engine_rpm: 1560, engine_torque_nm: 44.0, operating_wear_min: 90 },
    { id: 'FL-103', model: 'Volvo VNL 860', duty: 'heavy', ambient_temp_c: 31.0, coolant_temp_c: 37.2, engine_rpm: 1310, engine_torque_nm: 50.0, operating_wear_min: 120 }, // High risk (HDF)
    { id: 'FL-104', model: 'Peterbilt 579', duty: 'medium', ambient_temp_c: 25.0, coolant_temp_c: 35.0, engine_rpm: 1480, engine_torque_nm: 40.0, operating_wear_min: 30 },
    { id: 'FL-105', model: 'Mack Anthem', duty: 'heavy', ambient_temp_c: 27.0, coolant_temp_c: 38.5, engine_rpm: 2800, engine_torque_nm: 72.0, operating_wear_min: 160 }, // Critical (PWF)
    { id: 'FL-106', model: 'International LT', duty: 'light', ambient_temp_c: 24.5, coolant_temp_c: 34.8, engine_rpm: 1490, engine_torque_nm: 38.0, operating_wear_min: 75 },
    { id: 'FL-107', model: 'Western Star 49X', duty: 'heavy', ambient_temp_c: 28.0, coolant_temp_c: 38.2, engine_rpm: 1410, engine_torque_nm: 66.0, operating_wear_min: 220 }, // High risk (OSF)
    { id: 'FL-108', model: 'Kenworth W990', duty: 'medium', ambient_temp_c: 25.5, coolant_temp_c: 36.0, engine_rpm: 1530, engine_torque_nm: 43.0, operating_wear_min: 60 }
  ];

  // Tab Switching
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const targetTab = document.getElementById(btn.dataset.tab);
      if (targetTab) targetTab.classList.add('active');

      if (btn.dataset.tab === 'fleetTab') {
        renderFleetCards();
      } else if (btn.dataset.tab === 'metricsTab') {
        loadMetricsData();
      }
    });
  });

  // Sliders and Inputs Listeners
  const syncInputs = () => {
    valAmbient.textContent = parseFloat(ambientTempInput.value).toFixed(1);
    valCoolant.textContent = parseFloat(coolantTempInput.value).toFixed(1);
    valRpm.textContent = engineRpmInput.value;
    valTorque.textContent = parseFloat(engineTorqueInput.value).toFixed(1);
    valWear.textContent = operatingWearInput.value;

    computeLivePhysics();
    debouncedPredict();
  };

  [ambientTempInput, coolantTempInput, engineRpmInput, engineTorqueInput, operatingWearInput].forEach(inp => {
    inp.addEventListener('input', syncInputs);
  });

  document.querySelectorAll('input[name="vehicle_duty_type"]').forEach(r => {
    r.addEventListener('change', debouncedPredict);
  });

  // Presets Handlers
  presetBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      presetBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const pKey = btn.dataset.preset;
      const pData = PRESETS[pKey];
      if (pData) {
        ambientTempInput.value = pData.ambient_temp_c;
        coolantTempInput.value = pData.coolant_temp_c;
        engineRpmInput.value = pData.engine_rpm;
        engineTorqueInput.value = pData.engine_torque_nm;
        operatingWearInput.value = pData.operating_wear_min;

        const dutyRadio = document.querySelector(`input[name="vehicle_duty_type"][value="${pData.vehicle_duty_type}"]`);
        if (dutyRadio) dutyRadio.checked = true;

        syncInputs();
      }
    });
  });

  // Mock Mode Switch
  mockModeSwitch.addEventListener('change', () => {
    if (mockModeSwitch.checked) {
      modelStatusPill.style.background = 'rgba(245, 158, 11, 0.15)';
      modelStatusPill.style.borderColor = 'rgba(245, 158, 11, 0.4)';
      modelStatusPill.style.color = '#fbbf24';
      modelStatusText.textContent = 'Mock Fallback Mode';
    } else {
      modelStatusPill.style.background = 'rgba(16, 185, 129, 0.12)';
      modelStatusPill.style.borderColor = 'rgba(16, 185, 129, 0.3)';
      modelStatusPill.style.color = '#34d399';
      modelStatusText.textContent = 'ML Engine Active';
    }
    debouncedPredict();
  });

  // Real-Time Physics Calculation
  function computeLivePhysics() {
    const ambK = parseFloat(ambientTempInput.value) + 273.15;
    const procK = parseFloat(coolantTempInput.value) + 273.15;
    const rpm = parseFloat(engineRpmInput.value);
    const torque = parseFloat(engineTorqueInput.value);
    const wear = parseFloat(operatingWearInput.value);

    // Temp Diff
    const tempDiff = procK - ambK;
    calcTempDiff.textContent = `${tempDiff.toFixed(2)} K`;
    if (tempDiff < 8.6 && rpm < 1380) {
      hdfRiskNote.textContent = 'High Overheat Risk (< 8.6 K & Low RPM)';
      hdfRiskNote.className = 'p-sub danger';
    } else {
      hdfRiskNote.textContent = 'Nominal (> 8.6 K)';
      hdfRiskNote.className = 'p-sub';
    }

    // Power in kW
    const powerW = rpm * torque * (2 * Math.PI / 60.0);
    const powerKW = powerW / 1000.0;
    calcPower.textContent = `${powerKW.toFixed(2)} kW`;
    if (powerW < 3500 || powerW > 9000) {
      pwfRiskNote.textContent = powerW > 9000 ? 'Peak Overpower (> 9 kW)' : 'Underpower (< 3.5 kW)';
      pwfRiskNote.className = 'p-sub danger';
    } else {
      pwfRiskNote.textContent = 'Normal (3.5 - 9.0 kW)';
      pwfRiskNote.className = 'p-sub';
    }

    // Overstrain
    const strain = torque * wear;
    calcOverstrain.textContent = `${Math.round(strain).toLocaleString()} N·m·min`;
    if (strain > 11000) {
      osfRiskNote.textContent = 'Severe Overstrain (> 11,000)';
      osfRiskNote.className = 'p-sub danger';
    } else {
      osfRiskNote.textContent = 'Nominal (< 11,000)';
      osfRiskNote.className = 'p-sub';
    }

    // Ratio
    const ratio = torque / (rpm + 1e-6);
    calcRatio.textContent = ratio.toFixed(4);
  }

  // Debounce helper
  let debounceTimer;
  function debouncedPredict() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runPrediction, 120);
  }

  // Run Prediction via REST API
  async function runPrediction() {
    const selectedDuty = document.querySelector('input[name="vehicle_duty_type"]:checked')?.value || 'medium';
    const payload = {
      ambient_temp_c: parseFloat(ambientTempInput.value),
      coolant_temp_c: parseFloat(coolantTempInput.value),
      engine_rpm: parseFloat(engineRpmInput.value),
      engine_torque_nm: parseFloat(engineTorqueInput.value),
      operating_wear_min: parseFloat(operatingWearInput.value),
      vehicle_duty_type: selectedDuty,
      force_mock: mockModeSwitch.checked
    };

    try {
      const response = await fetch('/api/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
      const data = await response.json();
      updatePredictionUI(data);
    } catch (err) {
      console.warn('Prediction fetch failed, using local fallback:', err);
    }
  }

  // Update Prediction UI
  function updatePredictionUI(data) {
    const prob = data.failure_probability || 0.0;
    const probPct = (prob * 100).toFixed(1);
    probPercent.textContent = `${probPct}%`;

    // SVG Gauge: circumference = 2 * PI * 65 = ~408.4
    const circumference = 408.4;
    const offset = circumference - (prob * circumference);
    gaugeProgress.style.strokeDashoffset = offset;

    // Risk tier color & styling
    const risk = data.risk_level || 'LOW';
    riskTierPill.className = `risk-tier-pill ${risk.toLowerCase()}`;
    riskTierText.textContent = `${risk} RISK`;

    if (risk === 'CRITICAL') {
      gaugeProgress.style.stroke = '#ef4444';
      riskSummaryText.textContent = 'Severe mechanical failure risk detected. High likelihood of immediate component breakdown.';
      decisionActionText.textContent = 'Immediate Vehicle Grounding & Component Inspection';
    } else if (risk === 'HIGH') {
      gaugeProgress.style.stroke = '#f97316';
      riskSummaryText.textContent = 'Elevated operational stress. Degradation trajectory exceeds normal threshold.';
      decisionActionText.textContent = 'Expedited Maintenance Required within 24-48 Hours';
    } else if (risk === 'MEDIUM') {
      gaugeProgress.style.stroke = '#f59e0b';
      riskSummaryText.textContent = 'Moderate sensor stress indicators. Monitor component wear and cooling efficiency.';
      decisionActionText.textContent = 'Flag for Next Terminal Stop / Inspection';
    } else {
      gaugeProgress.style.stroke = '#10b981';
      riskSummaryText.textContent = 'Nominal vehicle operating profile. Telemetry conforms to safe degradation envelopes.';
      decisionActionText.textContent = 'Standard Routine Scheduled Maintenance';
    }

    // In-Range Badge & Warnings
    if (data.model_in_range) {
      rangeStatusBadge.className = 'range-badge';
      rangeStatusBadge.innerHTML = '<span class="badge-icon">✓</span> <span>Inputs In-Range</span>';
      outOfRangeContainer.classList.add('hidden');
    } else {
      rangeStatusBadge.className = 'range-badge out-of-range';
      rangeStatusBadge.innerHTML = '<span class="badge-icon">⚠️</span> <span>Outside Training Range</span>';
      outOfRangeContainer.classList.remove('hidden');

      warningList.innerHTML = '';
      (data.out_of_range_warnings || []).forEach(msg => {
        const li = document.createElement('li');
        li.textContent = `• ${msg}`;
        warningList.appendChild(li);
      });
    }

    // Dynamic Factor Breakdown Bars
    renderFactorBars(data);
  }

  function renderFactorBars(data) {
    const factors = [
      { name: 'Rotational Speed & Ratio Dynamics', weight: Math.min(100, Math.max(10, (data.processed_features?.['Rotational speed [rpm]'] / 2886) * 100)) },
      { name: 'Power Load Level', weight: Math.min(100, Math.max(8, (data.failure_probability * 120))) },
      { name: 'Torque-Wear Strain Accumulation', weight: Math.min(100, Math.max(5, (data.processed_features?.['Tool wear [min]'] / 253) * 100)) },
      { name: 'Heat Dissipation Gradient', weight: Math.min(100, Math.max(5, Math.abs(data.processed_features?.['Process temperature [K]'] - data.processed_features?.['Air temperature [K]']) * 8)) }
    ];

    factorBars.innerHTML = factors.map(f => `
      <div class="factor-row">
        <div class="factor-meta">
          <span class="factor-name">${f.name}</span>
          <span class="factor-val">${f.weight.toFixed(0)}% Impact</span>
        </div>
        <div class="factor-track">
          <div class="factor-fill" style="width: ${f.weight}%"></div>
        </div>
      </div>
    `).join('');
  }

  // Render Fleet Monitor Cards
  async function renderFleetCards() {
    fleetGrid.innerHTML = '<p style="color: #94a3b8;">Loading fleet telemetry...</p>';
    try {
      const resp = await fetch('/api/fleet');
      const fleet = await resp.json();
      
      fleetGrid.innerHTML = fleet.map(v => `
        <div class="vehicle-card status-${v.risk_level.toLowerCase()}" data-id="${v.id}" onclick="loadVehicleTelemetry('${v.id}')">
          <div class="vehicle-card-top">
            <div>
              <div class="vehicle-id">${v.id}</div>
              <div class="vehicle-model">${v.model} &bull; ${v.duty.toUpperCase()} Duty</div>
            </div>
            <span class="vehicle-status-tag ${v.risk_level.toLowerCase()}">${v.risk_level} (${(v.failure_probability * 100).toFixed(0)}%)</span>
          </div>
          <div class="vehicle-telemetry-mini">
            <div class="v-stat"><span class="v-label">Engine RPM</span><span class="v-val">${v.engine_rpm}</span></div>
            <div class="v-stat"><span class="v-label">Coolant</span><span class="v-val">${v.coolant_temp_c}°C</span></div>
            <div class="v-stat"><span class="v-label">Wear</span><span class="v-val">${v.operating_wear_min} min</span></div>
          </div>
          <div class="vehicle-action-link">
            <span>Diagnose in Simulator</span> &rarr;
          </div>
        </div>
      `).join('');

      // Filter buttons logic
      document.querySelectorAll('.filter-btn').forEach(fBtn => {
        fBtn.addEventListener('click', () => {
          document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
          fBtn.classList.add('active');
          const filter = fBtn.dataset.filter;
          document.querySelectorAll('.vehicle-card').forEach(card => {
            if (filter === 'all' || card.classList.contains(`status-${filter.toLowerCase()}`)) {
              card.style.display = 'block';
            } else {
              card.style.display = 'none';
            }
          });
        });
      });
    } catch (e) {
      fleetGrid.innerHTML = `<p style="color:#ef4444;">Failed to load fleet data: ${e.message}</p>`;
    }
  }

  // Load a single vehicle into the telemetry simulator
  window.loadVehicleTelemetry = (vId) => {
    const v = FLEET_DATA.find(item => item.id === vId);
    if (!v) return;

    ambientTempInput.value = v.ambient_temp_c;
    coolantTempInput.value = v.coolant_temp_c;
    engineRpmInput.value = v.engine_rpm;
    engineTorqueInput.value = v.engine_torque_nm;
    operatingWearInput.value = v.operating_wear_min;

    const dutyRadio = document.querySelector(`input[name="vehicle_duty_type"][value="${v.duty}"]`);
    if (dutyRadio) dutyRadio.checked = true;

    // Switch to telemetry tab
    document.getElementById('btnTabTelemetry').click();
    syncInputs();
  };

  // Load Model Metrics
  async function loadMetricsData() {
    try {
      const resp = await fetch('/api/metrics');
      const data = await resp.json();

      if (data.cv_metrics?.raw_rf_aggregated) {
        const rf = data.cv_metrics.raw_rf_aggregated;
        document.getElementById('metricAccuracy').textContent = `${(rf.accuracy.mean * 100).toFixed(2)}%`;
        document.getElementById('metricPrecision').textContent = `${(rf.precision.mean * 100).toFixed(2)}%`;
        document.getElementById('metricRecall').textContent = `${(rf.recall.mean * 100).toFixed(2)}%`;
        document.getElementById('metricF1').textContent = `${(rf.f1.mean * 100).toFixed(2)}%`;
        document.getElementById('metricRocAuc').textContent = rf.roc_auc.mean.toFixed(4);
        document.getElementById('metricPrAuc').textContent = rf.pr_auc.mean.toFixed(4);
      }

      if (data.cv_metrics?.aggregate_confusion_matrix) {
        const cm = data.cv_metrics.aggregate_confusion_matrix;
        document.getElementById('cmTn').textContent = cm.tn.toLocaleString();
        document.getElementById('cmFp').textContent = cm.fp.toLocaleString();
        document.getElementById('cmFn').textContent = cm.fn.toLocaleString();
        document.getElementById('cmTp').textContent = cm.tp.toLocaleString();
      }

      if (data.feature_importances) {
        const impContainer = document.getElementById('importanceList');
        const list = Object.entries(data.feature_importances);
        const maxImp = Math.max(...list.map(([_, v]) => v));

        impContainer.innerHTML = list.map(([name, val]) => `
          <div class="factor-row">
            <div class="factor-meta">
              <span class="factor-name">${name}</span>
              <span class="factor-val">${(val * 100).toFixed(2)}%</span>
            </div>
            <div class="factor-track">
              <div class="factor-fill" style="width: ${(val / maxImp) * 100}%"></div>
            </div>
          </div>
        `).join('');
      }
    } catch (e) {
      console.warn('Metrics load warning:', e);
    }
  }

  // ==========================================================================
  // TIME SERIES DEGRADATION ANALYTICS CONTROLLER
  // ==========================================================================
  const tsScenarioSelect = document.getElementById('tsScenarioSelect');
  const tsVehicleSelect = document.getElementById('tsVehicleSelect');
  const tsScenarioDescText = document.getElementById('tsScenarioDescText');
  const tsPlayBtn = document.getElementById('tsPlayBtn');
  const playIcon = document.getElementById('playIcon');
  const pauseIcon = document.getElementById('pauseIcon');
  const playBtnText = document.getElementById('playBtnText');
  const tsResetBtn = document.getElementById('tsResetBtn');
  const tsScrubber = document.getElementById('tsScrubber');
  const tsCurrentMinuteText = document.getElementById('tsCurrentMinuteText');
  const tsSpeedBtns = document.querySelectorAll('.speed-btn');

  // Time Series Readout Elements
  const tsStatePhaseBadge = document.getElementById('tsStatePhaseBadge');
  const tsStatePhaseText = document.getElementById('tsStatePhaseText');
  const tsProbScore = document.getElementById('tsProbScore');
  const tsRiskPill = document.getElementById('tsRiskPill');
  const tsRangeTag = document.getElementById('tsRangeTag');
  const tsLiveRpm = document.getElementById('tsLiveRpm');
  const tsLiveTorque = document.getElementById('tsLiveTorque');
  const tsLiveCoolant = document.getElementById('tsLiveCoolant');
  const tsLiveAmbient = document.getElementById('tsLiveAmbient');
  const tsLiveTempDiff = document.getElementById('tsLiveTempDiff');
  const tsLivePower = document.getElementById('tsLivePower');
  const tsLiveWear = document.getElementById('tsLiveWear');
  const tsEventsTimeline = document.getElementById('tsEventsTimeline');

  // Canvases
  const riskCanvas = document.getElementById('riskTimelineCanvas');
  const telemetryCanvas = document.getElementById('telemetryTimelineCanvas');
  const chartTooltip = document.getElementById('chartTooltip');

  let tsData = null;
  let isPlaying = false;
  let playbackTimer = null;
  let playbackSpeed = 1;
  let currentMinute = 0;

  // Load Time Series Data from Server
  async function loadTimeSeries(scenario = 'heat_dissipation', vehicleId = 'FL-101') {
    try {
      const resp = await fetch(`/api/timeseries?scenario=${scenario}&vehicle_id=${vehicleId}&mock=${mockModeSwitch.checked}`);
      if (!resp.ok) throw new Error(`HTTP error ${resp.status}`);
      tsData = await resp.json();

      tsScenarioDescText.textContent = tsData.scenario_description;
      currentMinute = 0;
      tsScrubber.value = 0;
      updatePlaybackUI();
      renderAllCharts();
      renderAnomalyEvents();
    } catch (err) {
      console.error('Failed to load time series data:', err);
    }
  }

  // Setup HiDPI Canvas
  function setupCanvas(canvas) {
    if (!canvas) return null;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || canvas.parentElement.clientWidth || 800;
    const height = parseInt(canvas.getAttribute('height')) || 220;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    return { ctx, width, height };
  }

  // Render Risk Trajectory Chart
  function drawRiskChart() {
    const setup = setupCanvas(riskCanvas);
    if (!setup || !tsData || !tsData.time_steps.length) return;
    const { ctx, width, height } = setup;

    const padLeft = 55;
    const padRight = 20;
    const padTop = 20;
    const padBottom = 30;
    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;

    ctx.clearRect(0, 0, width, height);

    // 1. Shaded Risk Zones
    // Normal: 0 to 15% (Bottom)
    // Elevated: 15 to 50%
    // High: 50 to 80%
    // Critical: 80 to 100% (Top)
    const y0 = padTop + plotH;
    const y15 = padTop + plotH * (1 - 0.15);
    const y50 = padTop + plotH * (1 - 0.50);
    const y80 = padTop + plotH * (1 - 0.80);
    const y100 = padTop;

    // Normal Zone
    ctx.fillStyle = 'rgba(16, 185, 129, 0.08)';
    ctx.fillRect(padLeft, y15, plotW, y0 - y15);

    // Elevated Zone
    ctx.fillStyle = 'rgba(245, 158, 11, 0.08)';
    ctx.fillRect(padLeft, y50, plotW, y15 - y50);

    // High Zone
    ctx.fillStyle = 'rgba(249, 115, 22, 0.10)';
    ctx.fillRect(padLeft, y80, plotW, y50 - y80);

    // Critical Zone
    ctx.fillStyle = 'rgba(239, 68, 68, 0.14)';
    ctx.fillRect(padLeft, y100, plotW, y80 - y100);

    // 2. Horizontal Gridlines & Y-Axis Labels
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#64748b';
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    const yTicks = [0, 0.25, 0.50, 0.75, 1.0];
    yTicks.forEach(tick => {
      const y = padTop + plotH * (1 - tick);
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(padLeft + plotW, y);
      ctx.stroke();
      ctx.fillText(`${(tick * 100).toFixed(0)}%`, padLeft - 8, y);
    });

    // 3. X-Axis Time Labels
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const totalSteps = tsData.time_steps.length - 1;
    for (let m = 0; m <= totalSteps; m += 10) {
      const x = padLeft + (m / totalSteps) * plotW;
      ctx.beginPath();
      ctx.moveTo(x, padTop + plotH);
      ctx.lineTo(x, padTop + plotH + 5);
      ctx.stroke();
      ctx.fillText(`${m}m`, x, padTop + plotH + 8);
    }

    // 4. Draw Risk Trajectory Curve
    const points = tsData.time_steps.map((step, idx) => {
      const x = padLeft + (idx / totalSteps) * plotW;
      const y = padTop + plotH * (1 - Math.min(1, Math.max(0, step.failure_probability)));
      return { x, y, prob: step.failure_probability };
    });

    // Area Fill with Gradient
    const grad = ctx.createLinearGradient(0, padTop, 0, padTop + plotH);
    grad.addColorStop(0, 'rgba(239, 68, 68, 0.45)');
    grad.addColorStop(0.4, 'rgba(249, 115, 22, 0.3)');
    grad.addColorStop(0.7, 'rgba(245, 158, 11, 0.15)');
    grad.addColorStop(1, 'rgba(16, 185, 129, 0.02)');

    ctx.beginPath();
    ctx.moveTo(points[0].x, padTop + plotH);
    points.forEach((p, i) => {
      if (i === 0) ctx.lineTo(p.x, p.y);
      else {
        const prev = points[i - 1];
        const cx = (prev.x + p.x) / 2;
        ctx.bezierCurveTo(cx, prev.y, cx, p.y, p.x, p.y);
      }
    });
    ctx.lineTo(points[points.length - 1].x, padTop + plotH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Line Stroke with Dynamic Glow
    ctx.beginPath();
    points.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else {
        const prev = points[i - 1];
        const cx = (prev.x + p.x) / 2;
        ctx.bezierCurveTo(cx, prev.y, cx, p.y, p.x, p.y);
      }
    });
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.shadowBlur = 0; // reset

    // 5. Anomaly Milestone Pins
    (tsData.anomaly_events || []).forEach(evt => {
      const pt = points[evt.time];
      if (pt) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 6, 0, 2 * Math.PI);
        ctx.fillStyle = evt.type === 'CRITICAL' ? '#ef4444' : '#f59e0b';
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Label above pin
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 10px var(--font-body)';
        ctx.textAlign = 'center';
        ctx.fillText(evt.title, pt.x, pt.y - 12);
      }
    });

    // 6. Scrubbing Cursor Line
    if (currentMinute >= 0 && currentMinute <= totalSteps) {
      const curPt = points[currentMinute];
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(curPt.x, padTop);
      ctx.lineTo(curPt.x, padTop + plotH);
      ctx.stroke();
      ctx.setLineDash([]); // reset

      // Cursor Highlight Dot
      ctx.beginPath();
      ctx.arc(curPt.x, curPt.y, 7, 0, 2 * Math.PI);
      ctx.fillStyle = curPt.prob > 0.8 ? '#ef4444' : curPt.prob > 0.5 ? '#f97316' : curPt.prob > 0.15 ? '#f59e0b' : '#10b981';
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 15;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  // Render Multi-Sensor Telemetry Curves
  function drawTelemetryChart() {
    const setup = setupCanvas(telemetryCanvas);
    if (!setup || !tsData || !tsData.time_steps.length) return;
    const { ctx, width, height } = setup;

    const padLeft = 55;
    const padRight = 20;
    const padTop = 20;
    const padBottom = 30;
    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;
    const totalSteps = tsData.time_steps.length - 1;

    ctx.clearRect(0, 0, width, height);

    // Gridlines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padTop + (plotH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(padLeft + plotW, y);
      ctx.stroke();
    }

    // X-Axis Time Markers
    ctx.fillStyle = '#64748b';
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let m = 0; m <= totalSteps; m += 10) {
      const x = padLeft + (m / totalSteps) * plotW;
      ctx.fillText(`${m}m`, x, padTop + plotH + 8);
    }

    // Normalization Scales
    const norm = {
      coolant: { min: 25, max: 45, color: '#f87171' },
      ambient: { min: 20, max: 35, color: '#38bdf8' },
      rpm:     { min: 1000, max: 3000, color: '#a855f7' },
      torque:  { min: 20, max: 80, color: '#fbbf24' },
      power:   { min: 2, max: 12, color: '#34d399' }
    };

    // Draw single waveform
    const drawWave = (getter, config) => {
      ctx.beginPath();
      tsData.time_steps.forEach((step, idx) => {
        const val = getter(step);
        const normVal = (val - config.min) / (config.max - config.min);
        const x = padLeft + (idx / totalSteps) * plotW;
        const y = padTop + plotH * (1 - Math.min(1, Math.max(0, normVal)));
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = config.color;
      ctx.lineWidth = 2;
      ctx.stroke();
    };

    // Plot all 5 lines
    drawWave(s => s.telemetry.coolant_temp_c, norm.coolant);
    drawWave(s => s.telemetry.ambient_temp_c, norm.ambient);
    drawWave(s => s.telemetry.engine_rpm, norm.rpm);
    drawWave(s => s.telemetry.engine_torque_nm, norm.torque);
    drawWave(s => s.physics.power_kw, norm.power);

    // Scrubbing Cursor Line
    if (currentMinute >= 0 && currentMinute <= totalSteps) {
      const x = padLeft + (currentMinute / totalSteps) * plotW;
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x, padTop);
      ctx.lineTo(x, padTop + plotH);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function renderAllCharts() {
    drawRiskChart();
    drawTelemetryChart();
  }

  // Update Live Telemetry & Phase Badge at Current Minute
  function updatePlaybackUI() {
    if (!tsData || !tsData.time_steps.length) return;
    const step = tsData.time_steps[currentMinute] || tsData.time_steps[0];
    const t = step.minute;

    tsCurrentMinuteText.textContent = `${t < 10 ? '0' + t : t}:00`;

    // Telemetry display
    tsLiveRpm.textContent = `${step.telemetry.engine_rpm.toLocaleString()} RPM`;
    tsLiveTorque.textContent = `${step.telemetry.engine_torque_nm.toFixed(1)} N·m`;
    tsLiveCoolant.textContent = `${step.telemetry.coolant_temp_c.toFixed(1)} °C`;
    tsLiveAmbient.textContent = `${step.telemetry.ambient_temp_c.toFixed(1)} °C`;
    tsLiveTempDiff.textContent = `${step.physics.temp_diff_k.toFixed(2)} K`;
    tsLivePower.textContent = `${step.physics.power_kw.toFixed(2)} kW`;
    tsLiveWear.textContent = `${step.telemetry.operating_wear_min.toFixed(1)} min`;

    // Probability & Risk
    const probPct = (step.failure_probability * 100).toFixed(1);
    tsProbScore.textContent = `${probPct}%`;
    tsRiskPill.className = `ts-risk-pill ${step.risk_level.toLowerCase()}`;
    tsRiskPill.textContent = `${step.risk_level} RISK`;

    if (step.model_in_range) {
      tsRangeTag.className = 'ts-range-tag in-range';
      tsRangeTag.textContent = 'In-Range';
    } else {
      tsRangeTag.className = 'ts-range-tag out-range';
      tsRangeTag.textContent = 'Out-of-Range';
    }

    // Phase State
    if (step.failure_probability > 0.6) {
      tsStatePhaseBadge.className = 'ts-state-phase failure';
      tsStatePhaseText.textContent = 'ANOMALOUS / FAILURE STATE TRIGGERED';
    } else if (step.failure_probability > 0.15 || t > 20) {
      tsStatePhaseBadge.className = 'ts-state-phase degrading';
      tsStatePhaseText.textContent = 'DEGRADATION ONSET & NARROWING ENVELOPE';
    } else {
      tsStatePhaseBadge.className = 'ts-state-phase';
      tsStatePhaseText.textContent = 'NORMAL HEALTHY OPERATING STATE';
    }
  }

  // Anomaly Events List
  function renderAnomalyEvents() {
    if (!tsData || !tsData.anomaly_events) {
      tsEventsTimeline.innerHTML = '<p style="color: #94a3b8;">No anomalies in scenario.</p>';
      return;
    }

    tsEventsTimeline.innerHTML = tsData.anomaly_events.map(evt => `
      <div class="timeline-item ${evt.type.toLowerCase()}" onclick="scrubToTime(${evt.time})">
        <span class="timeline-time-badge">${evt.time < 10 ? '0' + evt.time : evt.time}:00 min</span>
        <div class="timeline-item-body">
          <div class="timeline-item-title">${evt.title}</div>
          <div class="timeline-item-desc">${evt.desc}</div>
        </div>
      </div>
    `).join('');
  }

  window.scrubToTime = (t) => {
    currentMinute = Math.min(60, Math.max(0, t));
    tsScrubber.value = currentMinute;
    updatePlaybackUI();
    renderAllCharts();
  };

  // Playback Loop
  function startPlayback() {
    if (isPlaying) return;
    isPlaying = true;
    playIcon.classList.add('hidden');
    pauseIcon.classList.remove('hidden');
    playBtnText.textContent = 'Pause';

    playbackTimer = setInterval(() => {
      if (currentMinute >= 60) {
        pausePlayback();
        return;
      }
      currentMinute += 1;
      tsScrubber.value = currentMinute;
      updatePlaybackUI();
      renderAllCharts();
    }, 400 / playbackSpeed);
  }

  function pausePlayback() {
    isPlaying = false;
    clearInterval(playbackTimer);
    playIcon.classList.remove('hidden');
    pauseIcon.classList.add('hidden');
    playBtnText.textContent = 'Play Progression';
  }

  tsPlayBtn.addEventListener('click', () => {
    if (isPlaying) pausePlayback();
    else {
      if (currentMinute >= 60) currentMinute = 0;
      startPlayback();
    }
  });

  tsResetBtn.addEventListener('click', () => {
    pausePlayback();
    scrubToTime(0);
  });

  tsScrubber.addEventListener('input', (e) => {
    pausePlayback();
    currentMinute = parseInt(e.target.value);
    updatePlaybackUI();
    renderAllCharts();
  });

  tsSpeedBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tsSpeedBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      playbackSpeed = parseFloat(btn.dataset.speed) || 1;
      if (isPlaying) {
        pausePlayback();
        startPlayback();
      }
    });
  });

  tsScenarioSelect.addEventListener('change', () => {
    pausePlayback();
    loadTimeSeries(tsScenarioSelect.value, tsVehicleSelect.value);
  });

  tsVehicleSelect.addEventListener('change', () => {
    pausePlayback();
    loadTimeSeries(tsScenarioSelect.value, tsVehicleSelect.value);
  });

  // Canvas Mouse Hover Tooltip
  riskCanvas.addEventListener('mousemove', (e) => {
    if (!tsData || !tsData.time_steps.length) return;
    const rect = riskCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const padLeft = 55;
    const plotW = rect.width - padLeft - 20;

    if (x >= padLeft && x <= padLeft + plotW) {
      const minute = Math.round(((x - padLeft) / plotW) * 60);
      const step = tsData.time_steps[minute];
      if (step) {
        chartTooltip.classList.remove('hidden');
        chartTooltip.style.left = `${x + 10}px`;
        chartTooltip.style.top = `${e.clientY - rect.top - 40}px`;
        chartTooltip.innerHTML = `
          <strong>${step.timestamp_label} min</strong> &bull; Prob: <strong>${(step.failure_probability * 100).toFixed(1)}%</strong> (${step.risk_level})<br>
          RPM: ${step.telemetry.engine_rpm} | Torque: ${step.telemetry.engine_torque_nm} N·m | Coolant: ${step.telemetry.coolant_temp_c}°C
        `;
      }
    } else {
      chartTooltip.classList.add('hidden');
    }
  });

  riskCanvas.addEventListener('mouseleave', () => {
    chartTooltip.classList.add('hidden');
  });

  // Window resize re-renders canvases
  window.addEventListener('resize', () => {
    if (document.getElementById('timeseriesTab').classList.contains('active')) {
      renderAllCharts();
    }
  });

  // On Tab Switch to timeseries
  document.getElementById('btnTabTimeSeries')?.addEventListener('click', () => {
    if (!tsData) {
      loadTimeSeries(tsScenarioSelect.value, tsVehicleSelect.value);
    } else {
      setTimeout(renderAllCharts, 50);
    }
  });

  // Initial Run
  syncInputs();
});
