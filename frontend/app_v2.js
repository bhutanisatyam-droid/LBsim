/**
 * Optical Link Budget Calculator - Frontend Logic v2
 * With Parameter Sweep support
 */

// ─── Configuration ────────────────────────────────────────────────────────────
const API_BASE_URL = '';
let currentCalculationData = null;
let sweepChartInstance = null;
let currentSweepResults = null;
let currentSweepParamKey = null;

// ─── Sweep state ──────────────────────────────────────────────────────────────
// Maps a UI param key -> { apiKey, label, toSI, formatVal }
// toSI(value) converts from the sweep unit (stated in the HTML hint) to the API's SI unit
// tx/rx pointing params are exempt from mutual exclusion (can both be swept)
const POINTING_KEYS = new Set(['txPointing', 'rxPointing']);

const SWEEP_PARAMS = {
    txPower: { apiKey: 'tx_power_dbm', label: 'Transmitter Power', toSI: v => convertPowerToDBm(v, document.getElementById('txPowerUnit').value) },
    txEfficiency: { apiKey: 'tx_efficiency', label: 'Tx Efficiency', toSI: v => convertToPercent(v, document.getElementById('txEfficiencyUnit').value) / 100 },
    rxEfficiency: { apiKey: 'rx_efficiency', label: 'Rx Efficiency', toSI: v => convertToPercent(v, document.getElementById('rxEfficiencyUnit').value) / 100 },
    rxSensitivity: { apiKey: 'rx_sensitivity_dbm', label: 'Rx Sensitivity', toSI: v => convertPowerToDBm(v, document.getElementById('rxSensitivityUnit').value) },
    rxLnaGain: { apiKey: 'rx_lna_gain_db', label: 'Rx LNA Gain', toSI: v => convertLossToDb(v, document.getElementById('rxLnaGainUnit').value) },
    wavelength: { apiKey: 'wavelength_m', label: 'Wavelength', toSI: v => convertToNanometers(v, document.getElementById('wavelengthUnit').value) * 1e-9 },
    txDiameter: { apiKey: 'tx_diameter_m', label: 'Tx Diameter', toSI: v => convertToMeters(v, document.getElementById('txDiameterUnit').value) },
    rxDiameter: { apiKey: 'rx_diameter_m', label: 'Rx Diameter', toSI: v => convertToMeters(v, document.getElementById('rxDiameterUnit').value) },
    distance: { apiKey: 'distance_m', label: 'Distance', toSI: v => convertToMeters(v, document.getElementById('distanceUnit').value) },
    implLoss: { apiKey: 'implementation_loss_db', label: 'System Loss', toSI: v => convertLossToDb(v, document.getElementById('implLossUnit').value) },
    couplingLoss: { apiKey: 'coupling_loss_db', label: 'Coupling Loss', toSI: v => convertLossToDb(v, document.getElementById('couplingLossUnit').value) },
    txPointing: {
        getApiKey: () => document.getElementById('txModeError').checked ? 'tx_pointing_error_rad' : 'tx_pointing_loss_db',
        label: 'Tx Pointing Loss',
        getToSI: () => {
            if (document.getElementById('txModeError').checked) {
                return v => convertAngleToRadians(v, document.getElementById('txPointingErrorUnit').value);
            }
            return v => convertLossToDb(v, document.getElementById('txPointingLossUnit').value);
        }
    },
    rxPointing: {
        getApiKey: () => document.getElementById('rxModeError').checked ? 'rx_pointing_error_rad' : 'rx_pointing_loss_db',
        label: 'Rx Pointing Loss',
        getToSI: () => {
            if (document.getElementById('rxModeError').checked) {
                return v => convertAngleToRadians(v, document.getElementById('rxPointingErrorUnit').value);
            }
            return v => convertLossToDb(v, document.getElementById('rxPointingLossUnit').value);
        }
    },
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
        case 'txPointing': {
            let isErrorSweep = document.getElementById('txModeError').checked;
            let dynamicUnit = isErrorSweep ? document.getElementById('txPointingErrorUnit').value : document.getElementById('txPointingLossUnit').value;
            if (isErrorSweep) {
                // siValue is radians. Convert back to displayed unit.
                let displayVal = siValue;
                if (dynamicUnit === 'urad') displayVal = siValue * 1e6;
                if (dynamicUnit === 'nrad') displayVal = siValue * 1e9;
                return `${displayVal.toFixed(2)} ${dynamicUnit}`;
            }
            return `${siValue.toFixed(2)} dB`;
        }
        case 'rxPointing': {
            let isErrorSweep = document.getElementById('rxModeError').checked;
            let dynamicUnit = isErrorSweep ? document.getElementById('rxPointingErrorUnit').value : document.getElementById('rxPointingLossUnit').value;
            if (isErrorSweep) {
                // siValue is radians. Convert back to displayed unit.
                let displayVal = siValue;
                if (dynamicUnit === 'urad') displayVal = siValue * 1e6;
                if (dynamicUnit === 'nrad') displayVal = siValue * 1e9;
                return `${displayVal.toFixed(2)} ${dynamicUnit}`;
            }
            return `${siValue.toFixed(2)} dB`;
        }
        default: return `${siValue.toFixed(4)}`;
    }
}

function formatMetric(metres) {
    if (metres >= 1000) return `${(metres / 1000).toFixed(2)} km`;
    if (metres >= 1) return `${metres.toFixed(2)} m`;
    return `${(metres * 100).toFixed(2)} cm`;
}

// Helper to extract the numerical portion from formatSweepValue for summing
function extractNumberFromFormat(formattedString) {
    const match = formattedString.match(/^-?[\d.]+/);
    return match ? parseFloat(match[0]) : 0;
}

// Helper to extract the unit portion from formatSweepValue
function extractUnitFromFormat(formattedString) {
    const match = formattedString.match(/[a-zA-Z%]+$/);
    return match ? match[0] : '';
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

    // Sync pointing sweep steps
    const txSteps = document.getElementById('sweep_txPointing_steps');
    const rxSteps = document.getElementById('sweep_rxPointing_steps');
    if (txSteps && rxSteps) {
        txSteps.addEventListener('input', (e) => { rxSteps.value = e.target.value; });
        rxSteps.addEventListener('input', (e) => { txSteps.value = e.target.value; });
    }
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

function togglePointingMode(type) {
    const isError = document.getElementById(`${type}ModeError`).checked;
    const isSweep = document.getElementById(`sweep_${type}Pointing_sweep`)?.checked || false;

    // Fixed inputs should be completely hidden if sweep is active
    document.getElementById(`${type}PointingManualInput`).style.display = isSweep ? 'none' : (isError ? 'none' : 'block');
    document.getElementById(`${type}PointingErrorInput`).style.display = isSweep ? 'none' : (isError ? 'block' : 'none');

    // Unit dropdowns are always visible but we swap which one is shown based on the active mode
    const lossUnit = document.getElementById(`${type}PointingLossUnit`);
    const errorUnit = document.getElementById(`${type}PointingErrorUnit`);
    if (lossUnit) lossUnit.style.display = isError ? 'none' : 'block';
    if (errorUnit) errorUnit.style.display = isError ? 'block' : 'none';
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

    // Special handling for pointing: hide both manual variants when sweeping
    if (paramKey === 'txPointing') {
        const type = 'tx';
        const isError = document.getElementById(`${type}ModeError`).checked;
        document.getElementById(`${type}PointingManualInput`).style.display = isSweep ? 'none' : (isError ? 'none' : 'block');
        document.getElementById(`${type}PointingErrorInput`).style.display = isSweep ? 'none' : (isError ? 'block' : 'none');

        // Ensure the correct unit select is visible whether sweeping or fixed
        const lossUnit = document.getElementById(`${type}PointingLossUnit`);
        const errorUnit = document.getElementById(`${type}PointingErrorUnit`);
        if (lossUnit) lossUnit.style.display = isError ? 'none' : 'block';
        if (errorUnit) errorUnit.style.display = isError ? 'block' : 'none';

    } else if (paramKey === 'rxPointing') {
        const type = 'rx';
        const isError = document.getElementById(`${type}ModeError`).checked;
        document.getElementById(`${type}PointingManualInput`).style.display = isSweep ? 'none' : (isError ? 'none' : 'block');
        document.getElementById(`${type}PointingErrorInput`).style.display = isSweep ? 'none' : (isError ? 'block' : 'none');

        // Ensure the correct unit select is visible whether sweeping or fixed
        const lossUnit = document.getElementById(`${type}PointingLossUnit`);
        const errorUnit = document.getElementById(`${type}PointingErrorUnit`);
        if (lossUnit) lossUnit.style.display = isError ? 'none' : 'block';
        if (errorUnit) errorUnit.style.display = isError ? 'block' : 'none';
    }

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
    document.getElementById('sweepDetailSelector').style.display = 'none';
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
    const secondaryKey = activeSweeps.length > 1 ? activeSweeps[1] : null;

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

        // Determine the dynamic API key and unit converter
        const apiKey = info.getApiKey ? info.getApiKey() : info.apiKey;
        const toSI = info.getToSI ? info.getToSI() : info.toSI;

        // Convert min/max to SI
        const siMin = toSI(rawMin);
        const siMax = toSI(rawMax);

        // Build the sweep request — skip the swept key in validation
        if (!validateRequiredInputs(baseInputs, [apiKey])) return;

        // Provide a valid dummy value for the swept parameter to pass backend validation
        // The backend sweep loop will overwrite this anyway.
        baseInputs[apiKey] = 1;

        const sweepReq = {
            base_inputs: baseInputs,
            sweep_param: apiKey,
            sweep_min: siMin,
            sweep_max: siMax,
            sweep_steps: steps
        };

        if (secondaryKey) {
            const info2 = SWEEP_PARAMS[secondaryKey];
            const rawMin2 = parseFloat(document.getElementById(`sweep_${secondaryKey}_min`).value);
            const rawMax2 = parseFloat(document.getElementById(`sweep_${secondaryKey}_max`).value);

            if (isNaN(rawMin2) || isNaN(rawMax2)) {
                showError('Please fill in valid Min and Max values for the second sweep parameter.');
                return;
            }
            if (rawMax2 <= rawMin2) {
                showError('Secondary Sweep Max must be greater than Min.');
                return;
            }

            const apiKey2 = info2.getApiKey ? info2.getApiKey() : info2.apiKey;
            const toSI2 = info2.getToSI ? info2.getToSI() : info2.toSI;

            baseInputs[apiKey2] = 1;

            sweepReq.sweep_param2 = apiKey2;
            sweepReq.sweep_min2 = toSI2(rawMin2);
            sweepReq.sweep_max2 = toSI2(rawMax2);
        }

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
        renderSweepResults(data, activeSweeps, rawMin, rawMax, steps);

    } catch (error) {
        showError('Sweep error: ' + error.message);
    } finally {
        btn.textContent = 'Calculate';
        btn.disabled = false;
    }
}

// ─── Render sweep results ─────────────────────────────────────────────────────
function renderSweepResults(data, activeSweeps, rawMin, rawMax, steps) {
    const results = data.results;  // array of { sweep_value, outputs }
    const isDualSweep = Array.isArray(activeSweeps) && activeSweeps.length > 1;
    const paramKey = Array.isArray(activeSweeps) ? activeSweeps[0] : activeSweeps;
    const secondaryKey = isDualSweep ? activeSweeps[1] : null;

    const info = SWEEP_PARAMS[paramKey];
    const numPts = data.num_points;

    const isErrorSweep = info.getApiKey && info.getApiKey().includes('error_rad');
    let dynamicLabel = isErrorSweep ? (paramKey === 'txPointing' ? 'Tx Pointing Error' : 'Rx Pointing Error') : info.label;

    if (isDualSweep) {
        dynamicLabel = "Combined Tx + Rx Pointing Error";
    }

    document.getElementById('sweepParamLabel').textContent = dynamicLabel;

    // Determine dynamic unit for display
    let dynamicUnit = '';
    if (info.getApiKey) {
        if (isErrorSweep) {
            dynamicUnit = document.getElementById(`${paramKey === 'txPointing' ? 'tx' : 'rx'}PointingErrorUnit`).value;
        } else {
            dynamicUnit = document.getElementById(`${paramKey === 'txPointing' ? 'tx' : 'rx'}PointingLossUnit`).value;
        }
    } else {
        dynamicUnit = document.getElementById(`${paramKey}Unit`) ? document.getElementById(`${paramKey}Unit`).value : '';
    }

    let subtitleText = `${numPts} points · ${dynamicUnit}: ${rawMin} → ${rawMax} · Steps: ${steps}`;
    if (isDualSweep) {
        const rawMin2 = document.getElementById(`sweep_${secondaryKey}_min`).value;
        const rawMax2 = document.getElementById(`sweep_${secondaryKey}_max`).value;

        let dynamicUnit2 = '';
        const info2 = SWEEP_PARAMS[secondaryKey];
        const isErrorSweep2 = info2.getApiKey && info2.getApiKey().includes('error_rad');
        if (info2.getApiKey) {
            if (isErrorSweep2) {
                dynamicUnit2 = document.getElementById(`${secondaryKey === 'txPointing' ? 'tx' : 'rx'}PointingErrorUnit`).value;
            } else {
                dynamicUnit2 = document.getElementById(`${secondaryKey === 'txPointing' ? 'tx' : 'rx'}PointingLossUnit`).value;
            }
        } else {
            dynamicUnit2 = document.getElementById(`${secondaryKey}Unit`) ? document.getElementById(`${secondaryKey}Unit`).value : '';
        }

        subtitleText = `${numPts} points · Tx (${dynamicUnit}): ${rawMin} → ${rawMax} | Rx (${dynamicUnit2}): ${rawMin2} → ${rawMax2}`;
    }

    document.getElementById('sweepSubtitle').textContent = subtitleText;
    document.getElementById('sweepTableParamHeader').textContent = isDualSweep ? `Total Ptr Error (${dynamicUnit})` : `${dynamicLabel} (${dynamicUnit})`;

    // ── Chart ────────────────────────────────────────────────────────────────
    const labels = results.map((r, i) => {
        const primaryFormatted = formatSweepValue(paramKey, r.sweep_value);
        if (isDualSweep && r.outputs && POINTING_KEYS.has(paramKey) && POINTING_KEYS.has(secondaryKey)) {
            const info2 = SWEEP_PARAMS[secondaryKey];
            const apiKey2 = info2.getApiKey ? info2.getApiKey() : info2.apiKey;
            const secondarySiValue = r.outputs[apiKey2];
            if (secondarySiValue !== undefined) {
                const secondaryFormatted = formatSweepValue(secondaryKey, secondarySiValue);
                const val1 = extractNumberFromFormat(primaryFormatted);
                const val2 = extractNumberFromFormat(secondaryFormatted);
                const unit = extractUnitFromFormat(primaryFormatted);
                return `${(val1 + val2).toFixed(2)} ${unit}`;
            }
        }
        return primaryFormatted;
    });
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
                    title: { display: true, text: document.getElementById('sweepTableParamHeader').textContent, color: '#8899aa' }
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
        let displayVal = formatSweepValue(paramKey, r.sweep_value);

        if (isDualSweep && r.outputs && POINTING_KEYS.has(paramKey) && POINTING_KEYS.has(secondaryKey)) {
            const info2 = SWEEP_PARAMS[secondaryKey];
            const apiKey2 = info2.getApiKey ? info2.getApiKey() : info2.apiKey;
            const secondarySiValue = r.outputs[apiKey2];
            if (secondarySiValue !== undefined) {
                const secondaryFormatted = formatSweepValue(secondaryKey, secondarySiValue);
                const val1 = extractNumberFromFormat(displayVal);
                const val2 = extractNumberFromFormat(secondaryFormatted);
                const unit = extractUnitFromFormat(displayVal);
                displayVal = `${(val1 + val2).toFixed(2)} ${unit}`;
            }
        }

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
    document.getElementById('saveBtn').disabled = false;
    document.getElementById('pdfBtn').disabled = false;

    // Setup the detailed selector
    currentSweepResults = results;
    currentSweepParamKey = paramKey;
    const select = document.getElementById('sweepPointSelect');
    if (select) {
        select.innerHTML = '';
        results.forEach((r, idx) => {
            const opt = document.createElement('option');
            opt.value = idx;

            let displayVal = formatSweepValue(paramKey, r.sweep_value);
            if (isDualSweep && r.outputs && POINTING_KEYS.has(paramKey) && POINTING_KEYS.has(secondaryKey)) {
                const info2 = SWEEP_PARAMS[secondaryKey];
                const apiKey2 = info2.getApiKey ? info2.getApiKey() : info2.apiKey;
                const secondarySiValue = r.outputs[apiKey2];
                if (secondarySiValue !== undefined) {
                    const secondaryFormatted = formatSweepValue(secondaryKey, secondarySiValue);
                    const val1 = extractNumberFromFormat(displayVal);
                    const val2 = extractNumberFromFormat(secondaryFormatted);
                    const unit = extractUnitFromFormat(displayVal);
                    displayVal = `${(val1 + val2).toFixed(2)} ${unit}`;
                }
            }
            opt.textContent = displayVal;
            select.appendChild(opt);
        });
        document.getElementById('sweepDetailSelector').style.display = 'block';
        select.value = "0";
        handleSweepPointSelect();
    }

    document.getElementById('sweepResults').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function handleSweepPointSelect() {
    const idx = document.getElementById('sweepPointSelect').value;
    if (currentSweepResults && currentSweepResults[idx]) {
        // Also update the global calculation data so the PDF knows what point we just selected
        currentCalculationData = {
            inputs: currentSweepResults[idx].outputs.inputs || {},
            outputs: currentSweepResults[idx].outputs
        };
        displayResults(currentSweepResults[idx].outputs);
    }
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
    const elTxPoint = document.getElementById('resultTxPointingLoss'); if (elTxPoint) elTxPoint.textContent = `${outputs.tx_pointing_loss_db.toFixed(2)} dB`;
    const elRxPoint = document.getElementById('resultRxPointingLoss'); if (elRxPoint) elRxPoint.textContent = `${outputs.rx_pointing_loss_db.toFixed(2)} dB`;
    const elSys = document.getElementById('resultSystemLoss'); if (elSys) elSys.textContent = `${outputs.impl_loss_db.toFixed(2)} dB`;
    const elCpl = document.getElementById('resultCouplingLoss'); if (elCpl) elCpl.textContent = `${outputs.coupling_loss_db.toFixed(2)} dB`;
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
        let payload = { ...currentCalculationData };
        if (document.getElementById('sweepResults').classList.contains('show') && currentSweepResults && currentSweepResults.length > 0) {
            payload.sweep_results = currentSweepResults;
            payload.sweep_param_label = document.getElementById('sweepTableParamHeader').textContent;
            if (sweepChartInstance) {
                payload.sweep_chart_base64 = sweepChartInstance.toBase64Image();
            }
        }

        const response = await fetch(`${API_BASE_URL}/api/generate-pdf`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
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
    document.getElementById('sweepDetailSelector').style.display = 'none';
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
