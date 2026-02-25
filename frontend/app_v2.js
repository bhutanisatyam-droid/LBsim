/**
 * Optical Link Budget Calculator - Frontend Logic v2
 * With Parameter Sweep support
 */

// ─── Configuration ────────────────────────────────────────────────────────────
const API_BASE_URL = '';
let currentCalculationData = null;
let sweepChartInstance = null;

// ─── Sweep state ──────────────────────────────────────────────────────────────
// Maps a UI param key -> { apiKey, label, toSI, formatVal }
// toSI(value) converts from the sweep unit (stated in the HTML hint) to the API's SI unit
// tx/rx pointing params are exempt from mutual exclusion (can both be swept)
const POINTING_KEYS = new Set(['txPointing', 'rxPointing']);

const SWEEP_PARAMS = {
    txPower: { apiKey: 'tx_power_dbm', label: 'Transmitter Power', unit: 'dBm', toSI: v => v },
    txEfficiency: { apiKey: 'tx_efficiency', label: 'Tx Efficiency', unit: '%', toSI: v => v / 100 },
    rxEfficiency: { apiKey: 'rx_efficiency', label: 'Rx Efficiency', unit: '%', toSI: v => v / 100 },
    rxSensitivity: { apiKey: 'rx_sensitivity_dbm', label: 'Rx Sensitivity', unit: 'dBm', toSI: v => v },
    rxLnaGain: { apiKey: 'rx_lna_gain_db', label: 'Rx LNA Gain', unit: 'dB', toSI: v => v },
    wavelength: { apiKey: 'wavelength_m', label: 'Wavelength', unit: 'nm', toSI: v => v * 1e-9 },
    txDiameter: { apiKey: 'tx_diameter_m', label: 'Tx Diameter', unit: 'm', toSI: v => v },
    rxDiameter: { apiKey: 'rx_diameter_m', label: 'Rx Diameter', unit: 'm', toSI: v => v },
    distance: { apiKey: 'distance_m', label: 'Distance', unit: 'm', toSI: v => v },
    implLoss: { apiKey: 'implementation_loss_db', label: 'Implementation Loss', unit: 'dB', toSI: v => v },
    couplingLoss: { apiKey: 'coupling_loss_db', label: 'Coupling Loss', unit: 'dB', toSI: v => v },
    txPointing: { apiKey: 'tx_pointing_loss_db', label: 'Tx Pointing Loss', unit: 'dB', toSI: v => v },
    rxPointing: { apiKey: 'rx_pointing_loss_db', label: 'Rx Pointing Loss', unit: 'dB', toSI: v => v },
};

// ─── Sweep display label helpers ──────────────────────────────────────────────
function formatSweepValue(paramKey, siValue) {
    switch (paramKey) {
        case 'txPower': return `${siValue.toFixed(2)} dBm`;
        case 'txEfficiency': return `${(siValue * 100).toFixed(1)} %`;
        case 'rxEfficiency': return `${(siValue * 100).toFixed(1)} %`;
        case 'rxSensitivity': return `${siValue.toFixed(2)} dBm`;
        case 'rxLnaGain': return `${siValue.toFixed(2)} dB`;
        case 'wavelength': return `${(siValue * 1e9).toFixed(1)} nm`;
        case 'txDiameter': return `${formatMetric(siValue)}`;
        case 'rxDiameter': return `${formatMetric(siValue)}`;
        case 'distance': return `${formatMetric(siValue)}`;
        case 'implLoss': return `${siValue.toFixed(2)} dB`;
        case 'couplingLoss': return `${siValue.toFixed(2)} dB`;
        case 'txPointing': return `${siValue.toFixed(2)} dB`;
        case 'rxPointing': return `${siValue.toFixed(2)} dB`;
        default: return `${siValue.toFixed(4)}`;
    }
}

function formatMetric(metres) {
    if (metres >= 1000) return `${(metres / 1000).toFixed(2)} km`;
    if (metres >= 1) return `${metres.toFixed(2)} m`;
    return `${(metres * 100).toFixed(2)} cm`;
}

// ─── Initialization ───────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
    setupInputValidation();
    checkAPIConnection();
    initSweepControls();
    setInterval(checkAPIConnection, 30000);
});

// Wire all sweep radio buttons and pointing mode radios via addEventListener
function initSweepControls() {
    // Sweep param radios
    Object.keys(SWEEP_PARAMS).forEach(paramKey => {
        ['fixed', 'sweep'].forEach(val => {
            const radio = document.getElementById(`sweep_${paramKey}_${val}`);
            if (radio) {
                radio.addEventListener('change', () => onSweepToggle(paramKey));
            }
        });
    });

    // Pointing mode radios
    ['tx', 'rx'].forEach(type => {
        ['Manual', 'Error'].forEach(mode => {
            const radio = document.getElementById(`${type}Mode${mode}`);
            if (radio) {
                radio.addEventListener('change', () => togglePointingMode(type));
            }
        });
    });
}

// ─── API connection ───────────────────────────────────────────────────────────
async function checkAPIConnection() {
    try {
        const response = await fetch(`${API_BASE_URL}/health`);
        const statusDiv = document.getElementById('apiStatus');
        if (response.ok) {
            statusDiv.className = 'api-status online';
            statusDiv.textContent = '✓ Backend API: Connected';
        } else { throw new Error(); }
    } catch {
        const statusDiv = document.getElementById('apiStatus');
        statusDiv.className = 'api-status offline';
        statusDiv.textContent = '⚠️ Backend API: Offline';
    }
}

// ─── Input validation ─────────────────────────────────────────────────────────
function setupInputValidation() {
    const inputs = document.querySelectorAll('input[type="text"]');
    inputs.forEach(input => {
        input.addEventListener('input', validateNumericInput);
        input.addEventListener('paste', e => setTimeout(() => validateNumericInput(e), 10));
        input.addEventListener('focus', () => {
            const errorDiv = document.getElementById(input.id + '-error');
            if (errorDiv) errorDiv.classList.remove('show');
        });
    });
}

function validateNumericInput(event) {
    const input = event.target;
    const value = input.value;
    const errorDiv = document.getElementById(input.id + '-error');
    const validPattern = /^-?\d*\.?\d*([eE][-+]?\d*)?$/;
    if (!validPattern.test(value) && value !== '') {
        if (errorDiv) { errorDiv.textContent = '❌ Only numbers allowed'; errorDiv.classList.add('show'); }
        input.value = value.replace(/[^0-9.\-eE]/g, '');
        if (!validPattern.test(input.value)) input.value = '';
    } else {
        if (errorDiv) errorDiv.classList.remove('show');
        hideError();
    }
}

// ─── Conversion helpers ───────────────────────────────────────────────────────
function mWtoDBm(mW) { return 10 * Math.log10(mW); }
function dBmToMW(dBm) { return Math.pow(10, dBm / 10); }
function WtoDBm(W) { return 10 * Math.log10(W * 1000); }
function linearToDb(l) { return 10 * Math.log10(l); }

function convertToMeters(value, unit) {
    if (unit === 'cm') return value / 100;
    if (unit === 'mm') return value / 1000;
    if (unit === 'km') return value * 1000;
    return value;
}
function convertToNanometers(value, unit) {
    if (unit === 'μm') return value * 1000;
    if (unit === 'm') return value * 1e9;
    return value;
}
function convertPowerToDBm(value, unit) {
    if (unit === 'mW') return mWtoDBm(value);
    if (unit === 'W') return WtoDBm(value);
    return value;
}
function convertToPercent(value, unit) {
    if (unit === 'decimal') return value * 100;
    return value;
}
function convertLossToDb(value, unit) {
    if (unit === 'linear') return linearToDb(value);
    return value;
}
function convertAngleToRadians(value, unit) {
    if (unit === 'urad') return value * 1e-6;
    if (unit === 'nrad') return value * 1e-9;
    return value;
}
function formatPower(mw) {
    if (mw === 0) return '0.000000';
    if (Math.abs(mw) < 0.0001) return mw.toExponential(4);
    return mw.toFixed(6);
}

// ─── Sweep toggle management ──────────────────────────────────────────────────
function onSweepToggle(paramKey) {
    const isSweep = document.querySelector(`input[name="sweep_${paramKey}"]:checked`).value === 'sweep';

    if (isSweep) {
        // Enforce mutual exclusion — deactivate all other non-pointing sweeps,
        // OR if this is a pointing param, deactivate all non-pointing sweeps but allow both pointing
        Object.keys(SWEEP_PARAMS).forEach(key => {
            if (key === paramKey) return;
            const isOtherPointing = POINTING_KEYS.has(key);
            const isThisPointing = POINTING_KEYS.has(paramKey);

            // If this newly activated sweep is non-pointing, clear everything else
            // If this newly activated sweep is pointing, only clear non-pointing sweeps
            if (!isThisPointing || !isOtherPointing) {
                const radio = document.getElementById(`sweep_${key}_fixed`);
                if (radio) {
                    radio.checked = true;
                    updateSweepUI(key, false);
                }
            }
        });
    }

    updateSweepUI(paramKey, isSweep);
}

function updateSweepUI(paramKey, isSweep) {
    const fixedEl = document.getElementById(`fixed-${paramKey}`);
    const sweepEl = document.getElementById(`sweep-${paramKey}`);
    const groupEl = document.getElementById(`ig-${paramKey}`) ||
        document.getElementById(`ig-${paramKey.replace('Pointing', 'Pointing')}`);

    if (fixedEl) fixedEl.style.display = isSweep ? 'none' : '';
    if (sweepEl) sweepEl.classList.toggle('show', isSweep);

    // Visual highlight on the card
    const igEl = paramKey === 'txPointing' ? document.getElementById('ig-txPointing')
        : paramKey === 'rxPointing' ? document.getElementById('ig-rxPointing')
            : document.getElementById(`ig-${paramKey}`);
    if (igEl) igEl.classList.toggle('sweep-active', isSweep);
}

function getActiveSweepParams() {
    return Object.keys(SWEEP_PARAMS).filter(key => {
        const el = document.querySelector(`input[name="sweep_${key}"]:checked`);
        return el && el.value === 'sweep';
    });
}

// ─── Collect fixed inputs (same as before) ────────────────────────────────────
function collectInputs() {
    const txPowerValue = parseFloat(document.getElementById('txPower').value);
    const txPowerUnit = document.getElementById('txPowerUnit').value;
    const txEffValue = parseFloat(document.getElementById('txEfficiency').value);
    const txEffUnit = document.getElementById('txEfficiencyUnit').value;
    const rxEffValue = parseFloat(document.getElementById('rxEfficiency').value);
    const rxEffUnit = document.getElementById('rxEfficiencyUnit').value;
    const rxSensValue = parseFloat(document.getElementById('rxSensitivity').value);
    const rxSensUnit = document.getElementById('rxSensitivityUnit').value;
    const rxLnaGainValue = parseFloat(document.getElementById('rxLnaGain').value) || 0;
    const wavelengthValue = parseFloat(document.getElementById('wavelength').value);
    const wavelengthUnit = document.getElementById('wavelengthUnit').value;
    const txDiaValue = parseFloat(document.getElementById('txDiameter').value);
    const txDiaUnit = document.getElementById('txDiameterUnit').value;
    const rxDiaValue = parseFloat(document.getElementById('rxDiameter').value);
    const rxDiaUnit = document.getElementById('rxDiameterUnit').value;
    const distValue = parseFloat(document.getElementById('distance').value);
    const distUnit = document.getElementById('distanceUnit').value;
    const implLossValue = parseFloat(document.getElementById('implLoss').value) || 0;
    const implLossUnit = document.getElementById('implLossUnit').value;
    const coupLossValue = parseFloat(document.getElementById('couplingLoss').value) || 0;
    const coupLossUnit = document.getElementById('couplingLossUnit').value;

    const txEffPct = convertToPercent(txEffValue, txEffUnit);
    const rxEffPct = convertToPercent(rxEffValue, rxEffUnit);

    const inputs = {
        tx_power_dbm: convertPowerToDBm(txPowerValue, txPowerUnit),
        tx_efficiency: txEffPct / 100,
        rx_efficiency: rxEffPct / 100,
        rx_sensitivity_dbm: convertPowerToDBm(rxSensValue, rxSensUnit),
        rx_lna_gain_db: rxLnaGainValue,
        wavelength_m: convertToNanometers(wavelengthValue, wavelengthUnit) * 1e-9,
        tx_diameter_m: convertToMeters(txDiaValue, txDiaUnit),
        rx_diameter_m: convertToMeters(rxDiaValue, rxDiaUnit),
        distance_m: convertToMeters(distValue, distUnit),
        implementation_loss_db: convertLossToDb(implLossValue, implLossUnit),
        coupling_loss_db: convertLossToDb(coupLossValue, coupLossUnit),
    };

    const txMode = document.querySelector('input[name="txPointingMode"]:checked').value;
    if (txMode === 'manual') {
        const v = parseFloat(document.getElementById('txPointingLoss').value) || 0;
        const u = document.getElementById('txPointingLossUnit').value;
        inputs.tx_pointing_loss_db = convertLossToDb(v, u);
        inputs.tx_pointing_error_rad = null;
    } else {
        const v = parseFloat(document.getElementById('txPointingError').value) || 0;
        const u = document.getElementById('txPointingErrorUnit').value;
        inputs.tx_pointing_error_rad = convertAngleToRadians(v, u);
        inputs.tx_pointing_loss_db = 0;
    }

    const rxMode = document.querySelector('input[name="rxPointingMode"]:checked').value;
    if (rxMode === 'manual') {
        const v = parseFloat(document.getElementById('rxPointingLoss').value) || 0;
        const u = document.getElementById('rxPointingLossUnit').value;
        inputs.rx_pointing_loss_db = convertLossToDb(v, u);
        inputs.rx_pointing_error_rad = null;
    } else {
        const v = parseFloat(document.getElementById('rxPointingError').value) || 0;
        const u = document.getElementById('rxPointingErrorUnit').value;
        inputs.rx_pointing_error_rad = convertAngleToRadians(v, u);
        inputs.rx_pointing_loss_db = 0;
    }

    return inputs;
}

// ─── Validation ───────────────────────────────────────────────────────────────
function validateRequiredInputs(inputs, skipKeys = []) {
    const required = [
        { name: 'tx_power_dbm', label: 'Transmitter Power' },
        { name: 'tx_efficiency', label: 'Transmitter Efficiency' },
        { name: 'rx_efficiency', label: 'Receiver Efficiency' },
        { name: 'rx_sensitivity_dbm', label: 'Receiver Sensitivity' },
        { name: 'wavelength_m', label: 'Wavelength' },
        { name: 'tx_diameter_m', label: 'Transmitter Diameter' },
        { name: 'rx_diameter_m', label: 'Receiver Diameter' },
        { name: 'distance_m', label: 'Distance' },
    ];
    for (const field of required) {
        if (skipKeys.includes(field.name)) continue;
        if (isNaN(inputs[field.name])) {
            showError(`Please fill in: ${field.label}`);
            return false;
        }
    }
    const positive = ['wavelength_m', 'tx_diameter_m', 'rx_diameter_m', 'distance_m'];
    for (const k of positive) {
        if (skipKeys.includes(k)) continue;
        if (inputs[k] <= 0) {
            showError(`${k} must be a positive value`);
            return false;
        }
    }
    if (inputs.rx_lna_gain_db < 0) {
        showError('Rx LNA Gain must be 0 or a positive value');
        return false;
    }
    return true;
}

// ─── Calculate (single point) ─────────────────────────────────────────────────
function handleCalculateClick() {
    const activeSweeps = getActiveSweepParams();
    if (activeSweeps.length > 0) {
        runSweep();
    } else {
        calculateLinkBudget();
    }
}

async function calculateLinkBudget() {
    hideError(); hideSuccess();
    const btn = document.getElementById('calculateBtn');
    btn.innerHTML = '<span class="loading"></span> Calculating...';
    btn.disabled = true;
    try {
        const inputs = collectInputs();
        if (!validateRequiredInputs(inputs)) return;

        const response = await fetch(`${API_BASE_URL}/api/calculate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(inputs)
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            let msg = err.detail || 'API calculation failed';
            if (typeof msg !== 'string') msg = JSON.stringify(msg);
            throw new Error(msg);
        }
        const data = await response.json();
        currentCalculationData = data;
        displayResults(data.outputs);
        document.getElementById('saveBtn').disabled = false;
        document.getElementById('pdfBtn').disabled = false;
    } catch (error) {
        showError('Calculation error: ' + error.message);
    } finally {
        btn.textContent = 'Calculate';
        btn.disabled = false;
    }
}

// ─── Run Sweep ────────────────────────────────────────────────────────────────
async function runSweep() {
    hideError(); hideSuccess();
    const activeSweeps = getActiveSweepParams();
    if (activeSweeps.length === 0) { showError('Please select at least one sweep parameter.'); return; }

    // We handle multiple sweeps by sweeping each one and stacking results.
    // For simplicity when both tx+rx pointing are swept, we do them separately
    // and show the first as the primary sweep (both share the same fixed base).
    const primaryKey = activeSweeps[0];

    const btn = document.getElementById('calculateBtn');
    btn.innerHTML = '<span class="loading"></span> Running Sweep...';
    btn.disabled = true;

    try {
        const baseInputs = collectInputs();

        // Build sweep request for primary sweep param
        const info = SWEEP_PARAMS[primaryKey];
        const rawMin = parseFloat(document.getElementById(`sweep_${primaryKey}_min`).value);
        const rawMax = parseFloat(document.getElementById(`sweep_${primaryKey}_max`).value);
        const steps = parseInt(document.getElementById(`sweep_${primaryKey}_steps`).value);

        if (isNaN(rawMin) || isNaN(rawMax) || isNaN(steps) || steps < 1) {
            showError('Please fill in valid Min, Max, and Steps values for the sweep parameter.');
            return;
        }
        if (rawMax <= rawMin) {
            showError('Sweep Max must be greater than Min.');
            return;
        }

        // Convert min/max to SI
        const siMin = info.toSI(rawMin);
        const siMax = info.toSI(rawMax);

        // Build the sweep request — skip the swept key in validation
        if (!validateRequiredInputs(baseInputs, [info.apiKey])) return;

        // Provide a valid dummy value for the swept parameter to pass backend validation
        // The backend sweep loop will overwrite this anyway.
        baseInputs[info.apiKey] = 1;

        const sweepReq = {
            base_inputs: baseInputs,
            sweep_param: info.apiKey,
            sweep_min: siMin,
            sweep_max: siMax,
            sweep_steps: steps
        };

        const response = await fetch(`${API_BASE_URL}/api/sweep`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sweepReq)
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            let msg = err.detail || 'Sweep API call failed';
            if (typeof msg !== 'string') msg = JSON.stringify(msg);
            throw new Error(msg);
        }

        const data = await response.json();
        renderSweepResults(data, primaryKey, rawMin, rawMax, steps);

    } catch (error) {
        showError('Sweep error: ' + error.message);
    } finally {
        btn.textContent = 'Calculate';
        btn.disabled = false;
    }
}

// ─── Render sweep results ─────────────────────────────────────────────────────
function renderSweepResults(data, paramKey, rawMin, rawMax, steps) {
    const results = data.results;  // array of { sweep_value, outputs }
    const info = SWEEP_PARAMS[paramKey];
    const numPts = data.num_points;

    // Update header
    document.getElementById('sweepParamLabel').textContent = info.label;
    document.getElementById('sweepSubtitle').textContent =
        `${numPts} points · ${info.unit}: ${rawMin} → ${rawMax} · Steps: ${steps}`;
    document.getElementById('sweepTableParamHeader').textContent = `${info.label} (${info.unit})`;

    // ── Chart ────────────────────────────────────────────────────────────────
    const labels = results.map(r => formatSweepValue(paramKey, r.sweep_value));
    const lmData = results.map(r => r.outputs.link_margin_db !== null ? r.outputs.link_margin_db : null);
    const rxData = results.map(r => r.outputs.received_power_lna_dbm);

    if (sweepChartInstance) { sweepChartInstance.destroy(); sweepChartInstance = null; }

    const ctx = document.getElementById('sweepChart').getContext('2d');
    sweepChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Link Margin (dB)',
                    data: lmData,
                    borderColor: '#39ff8a',
                    backgroundColor: 'rgba(57, 255, 138, 0.08)',
                    borderWidth: 2.5,
                    pointBackgroundColor: '#39ff8a',
                    pointRadius: 3,
                    tension: 0.3,
                    fill: true,
                    yAxisID: 'yLM',
                },
                {
                    label: 'Rx Power with LNA (dBm)',
                    data: rxData,
                    borderColor: '#00d8ff',
                    backgroundColor: 'rgba(0, 216, 255, 0.06)',
                    borderWidth: 2.5,
                    pointBackgroundColor: '#00d8ff',
                    pointRadius: 3,
                    tension: 0.3,
                    fill: false,
                    yAxisID: 'yRx',
                }
            ]
        },
        options: {
            responsive: true,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    labels: { color: '#cdd9e8', font: { size: 12 }, boxWidth: 30 }
                },
                tooltip: {
                    backgroundColor: 'rgba(10, 25, 41, 0.95)',
                    borderColor: 'rgba(0,200,255,0.4)',
                    borderWidth: 1,
                    titleColor: '#00d8ff',
                    bodyColor: '#cdd9e8',
                }
            },
            scales: {
                x: {
                    ticks: { color: '#8899aa', font: { size: 10 }, maxTicksLimit: 20 },
                    grid: { color: 'rgba(255,255,255,0.06)' },
                    title: { display: true, text: info.label, color: '#8899aa' }
                },
                yLM: {
                    type: 'linear',
                    position: 'left',
                    ticks: { color: '#39ff8a', font: { size: 10 } },
                    grid: { color: 'rgba(57, 255, 138, 0.08)' },
                    title: { display: true, text: 'Link Margin (dB)', color: '#39ff8a' }
                },
                yRx: {
                    type: 'linear',
                    position: 'right',
                    ticks: { color: '#00d8ff', font: { size: 10 } },
                    grid: { drawOnChartArea: false },
                    title: { display: true, text: 'Received Power (dBm)', color: '#00d8ff' }
                }
            }
        }
    });

    // ── Table ────────────────────────────────────────────────────────────────
    const tbody = document.getElementById('sweepTableBody');
    tbody.innerHTML = '';
    results.forEach(r => {
        const lm = r.outputs.link_margin_db;
        const viable = r.outputs.link_viable;
        const lmClass = (lm !== null && lm > 0) ? 'lm-positive' : 'lm-negative';
        const trClass = viable ? 'viable-yes' : 'viable-no';
        const lmText = lm !== null ? lm.toFixed(2) : '—';
        const viableText = viable === true ? '✓ Yes' : viable === false ? '✗ No' : '—';

        // Format sweep value for display (in original unit, not SI)
        const displayVal = formatSweepValue(paramKey, r.sweep_value);

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="sweep-val-cell">${displayVal}</td>
            <td class="${lmClass}">${lmText}</td>
            <td class="rx-power-cell">${r.outputs.received_power_lna_dbm.toFixed(2)}</td>
            <td>${r.outputs.path_loss_db.toFixed(2)}</td>
            <td class="${trClass}">${viableText}</td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById('sweepResults').classList.add('show');
    document.getElementById('sweepResults').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ─── Display single-point results ────────────────────────────────────────────
function displayResults(outputs) {
    const lnaGain = outputs.rx_lna_gain_db || 0;
    const linkMargin = outputs.link_margin_db;

    const linkMarginBox = document.getElementById('linkMarginBox');
    const linkMarginValue = document.getElementById('linkMarginValue');
    const linkStatus = document.getElementById('linkStatus');

    linkMarginValue.textContent = `${linkMargin !== null ? linkMargin.toFixed(2) : 'N/A'} dB`;

    if (linkMargin !== null && linkMargin > 0) {
        linkMarginBox.classList.remove('negative');
        linkStatus.textContent = linkMargin >= 6 ? '✓ LINK EXCELLENT'
            : linkMargin >= 3 ? '✓ LINK GOOD'
                : '✓ LINK VIABLE (Marginal)';
    } else {
        linkMarginBox.classList.add('negative');
        linkStatus.textContent = '✗ LINK NOT VIABLE';
    }

    document.getElementById('lmRxPowerNoLna').textContent =
        `${outputs.received_power_dbm.toFixed(2)} dBm  (${formatPower(outputs.received_power_mw)} mW)`;
    document.getElementById('lmRxPowerLna').textContent =
        `${outputs.received_power_lna_dbm.toFixed(2)} dBm  (${formatPower(outputs.received_power_lna_mw)} mW)`
        + (lnaGain > 0 ? `  [+${lnaGain.toFixed(1)} dB LNA]` : '  [No LNA]');
    document.getElementById('lmSensitivity').textContent =
        outputs.rx_sensitivity_dbm !== null
            ? `${outputs.rx_sensitivity_dbm.toFixed(2)} dBm  (${formatPower(outputs.rx_sensitivity_mw)} mW)` : '—';

    document.getElementById('resultTxPower').textContent =
        `${outputs.tx_power_dbm.toFixed(2)} dBm  (${formatPower(outputs.tx_power_mw)} mW)`;
    document.getElementById('resultRxSensitivity').textContent =
        outputs.rx_sensitivity_dbm !== null
            ? `${outputs.rx_sensitivity_dbm.toFixed(2)} dBm  (${formatPower(outputs.rx_sensitivity_mw)} mW)` : '—';
    document.getElementById('resultDistance').textContent =
        `${outputs.distance_m.toFixed(2)} m  (${outputs.distance_km.toFixed(3)} km)`;
    document.getElementById('resultWavelength').textContent =
        `${outputs.wavelength_nm.toFixed(2)} nm`;

    document.getElementById('resultTxGain').textContent =
        `${outputs.tx_gain_db.toFixed(2)} dB  (${outputs.tx_gain_absolute.toFixed(2)})`;
    document.getElementById('resultRxGain').textContent =
        `${outputs.rx_gain_db.toFixed(2)} dB  (${outputs.rx_gain_absolute.toFixed(2)})`;
    document.getElementById('resultTxDivergence').textContent =
        `${outputs.tx_beam_divergence_deg.toFixed(6)}°  (${outputs.tx_beam_divergence_rad.toFixed(6)} rad)`;
    document.getElementById('resultRxDivergence').textContent =
        `${outputs.rx_beam_divergence_deg.toFixed(6)}°  (${outputs.rx_beam_divergence_rad.toFixed(6)} rad)`;
    document.getElementById('resultPathLoss').textContent = `${outputs.path_loss_db.toFixed(2)} dB`;
    document.getElementById('resultTotalLoss').textContent = `${outputs.total_loss_db.toFixed(2)} dB`;

    document.getElementById('resultRxPowerNoLna').textContent =
        `${outputs.received_power_dbm.toFixed(2)} dBm  (${formatPower(outputs.received_power_mw)} mW)`;
    const lnaLabel = lnaGain > 0 ? ` [+${lnaGain.toFixed(1)} dB]` : ' [No LNA]';
    document.getElementById('resultRxPowerLna').textContent =
        `${outputs.received_power_lna_dbm.toFixed(2)} dBm  (${formatPower(outputs.received_power_lna_mw)} mW)${lnaLabel}`;

    const lmItem = document.getElementById('resultLinkMarginItem');
    const lmSmall = document.getElementById('resultLinkMarginSmall');
    lmSmall.textContent = linkMargin !== null ? `${linkMargin.toFixed(2)} dB` : '—';
    if (linkMargin !== null && linkMargin > 0) {
        lmItem.classList.remove('warning'); lmItem.classList.add('highlight');
        lmSmall.style.color = '#28a745';
    } else {
        lmItem.classList.remove('highlight'); lmItem.classList.add('warning');
        lmSmall.style.color = '#dc3545';
    }

    document.getElementById('resultEfficiencies').textContent =
        `Tx: ${outputs.tx_efficiency_percent.toFixed(2)}%  |  Rx: ${outputs.rx_efficiency_percent.toFixed(2)}%`;

    document.getElementById('results').classList.add('show');
}

// ─── Save ─────────────────────────────────────────────────────────────────────
async function saveCalculation() {
    if (!currentCalculationData) { showError('No calculation to save'); return; }
    const saveBtn = document.getElementById('saveBtn');
    saveBtn.innerHTML = '<span class="loading"></span> Saving...';
    saveBtn.disabled = true;
    try {
        const name = prompt('Enter a name for this calculation:', 'Optical_Link_Calculation');
        if (!name) return;
        const notes = prompt('Add notes (optional):');
        const response = await fetch(`${API_BASE_URL}/api/save`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                calculation_name: name.trim() || 'Link_Calculation',
                inputs: currentCalculationData.inputs,
                results: currentCalculationData.outputs,
                notes: notes || ''
            })
        });
        if (!response.ok) throw new Error('Failed to save calculation');
        const data = await response.json();
        showSuccess(`Calculation saved! File: ${data.filename}`);
    } catch (error) {
        showError('Save error: ' + error.message);
    } finally {
        saveBtn.textContent = 'Save Calculation';
        saveBtn.disabled = false;
    }
}

// ─── Export PDF ───────────────────────────────────────────────────────────────
async function exportToPDF() {
    if (!currentCalculationData) { showError('No calculation to export'); return; }
    const pdfBtn = document.getElementById('pdfBtn');
    pdfBtn.innerHTML = '<span class="loading"></span> Generating PDF...';
    pdfBtn.disabled = true;
    try {
        const response = await fetch(`${API_BASE_URL}/api/generate-pdf`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(currentCalculationData)
        });
        if (!response.ok) throw new Error('Failed to generate PDF');
        const data = await response.json();
        showSuccess(`PDF saved to: Documents/OpticalLinkCalculations/${data.filename}`);
    } catch (error) {
        showError('PDF generation error: ' + error.message);
    } finally {
        pdfBtn.textContent = 'Export to PDF';
        pdfBtn.disabled = false;
    }
}

// ─── Reset ────────────────────────────────────────────────────────────────────
function resetForm() {
    document.querySelectorAll('input[type="text"], input[type="number"]').forEach(input => {
        if (!input.type || input.type === 'text' || input.type === 'number') input.value = '';
    });

    const selects = {
        txPowerUnit: 'dBm', txEfficiencyUnit: '%', rxEfficiencyUnit: '%',
        rxSensitivityUnit: 'dBm', wavelengthUnit: 'nm', txDiameterUnit: 'm',
        rxDiameterUnit: 'm', distanceUnit: 'm', implLossUnit: 'dB',
        couplingLossUnit: 'dB', txPointingLossUnit: 'dB', rxPointingLossUnit: 'dB'
    };
    Object.entries(selects).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el) el.value = val;
    });

    // Reset all sweep toggles to Fixed
    Object.keys(SWEEP_PARAMS).forEach(key => {
        const radio = document.getElementById(`sweep_${key}_fixed`);
        if (radio) { radio.checked = true; updateSweepUI(key, false); }
    });

    document.getElementById('results').classList.remove('show');
    document.getElementById('sweepResults').classList.remove('show');
    document.getElementById('saveBtn').disabled = true;
    document.getElementById('pdfBtn').disabled = true;
    document.getElementById('sweepBtn').disabled = true;
    if (sweepChartInstance) { sweepChartInstance.destroy(); sweepChartInstance = null; }
    hideError(); hideSuccess();
    currentCalculationData = null;
}

// ─── Pointing mode toggle ─────────────────────────────────────────────────────
function togglePointingMode(type) {
    const mode = document.querySelector(`input[name="${type}PointingMode"]:checked`).value;
    const manualInput = document.getElementById(`${type}PointingManualInput`);
    const errorInput = document.getElementById(`${type}PointingErrorInput`);
    if (mode === 'manual') {
        manualInput.style.display = 'block';
        errorInput.style.display = 'none';
        document.getElementById(`${type}PointingError`).value = '';
    } else {
        manualInput.style.display = 'none';
        errorInput.style.display = 'block';
        document.getElementById(`${type}PointingLoss`).value = '';
        // Cannot sweep pointing error mode — reset sweep if it was on
        const radio = document.getElementById(`sweep_${type}Pointing_fixed`);
        if (radio) { radio.checked = true; updateSweepUI(`${type}Pointing`, false); updateSweepButton(); }
    }
}

// ─── UI helpers ───────────────────────────────────────────────────────────────
function showError(message) {
    const div = document.getElementById('errorMsg');
    div.textContent = message;
    div.classList.add('show');
    document.getElementById('results').classList.remove('show');
}
function hideError() { document.getElementById('errorMsg').classList.remove('show'); }
function showSuccess(message) {
    const div = document.getElementById('successMsg');
    div.textContent = message;
    div.classList.add('show');
    setTimeout(() => div.classList.remove('show'), 5000);
}
function hideSuccess() { document.getElementById('successMsg').classList.remove('show'); }

// ─── Keyboard shortcut ────────────────────────────────────────────────────────
document.addEventListener('keypress', e => {
    if (e.key === 'Enter' && !e.shiftKey) calculateLinkBudget();
});
