/**
 * Optical Link Budget Calculator - Frontend Logic
 * Handles API integration, calculations, save/load, PDF export
 *
 * v2 changes:
 *   - Collects rx_lna_gain_db from new input field
 *   - displayResults() shows:
 *       1. Rx Power (Without LNA Amplification)
 *       2. Rx Power (With LNA Amplification)
 *       3. Link Margin (Calculated after LNA Amplification)
 */

// Configuration
const API_BASE_URL = '';  // Relative path for deployed environment
let currentCalculationData = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', function () {
    setupInputValidation();
    checkAPIConnection();
    setupServiceWorker();

    // Check API connection periodically
    setInterval(checkAPIConnection, 30000);
});

// ============================================================================
// API CONNECTION CHECK
// ============================================================================

async function checkAPIConnection() {
    try {
        const response = await fetch(`${API_BASE_URL}/health`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });

        const statusDiv = document.getElementById('apiStatus');
        if (response.ok) {
            statusDiv.className = 'api-status online';
            statusDiv.textContent = '✓ Backend API: Connected';
        } else {
            throw new Error('API not responding');
        }
    } catch (error) {
        const statusDiv = document.getElementById('apiStatus');
        statusDiv.className = 'api-status offline';
        statusDiv.textContent = '⚠️ Backend API: Offline';
        console.warn('API connection failed:', error);
    }
}

// ============================================================================
// SERVICE WORKER SETUP (PWA)
// ============================================================================

async function setupServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('/sw.js');
            console.log('Service Worker registered:', registration.scope);
        } catch (error) {
            console.error('Service Worker registration failed:', error);
        }
    }
}

// ============================================================================
// INPUT VALIDATION
// ============================================================================

function setupInputValidation() {
    const inputs = document.querySelectorAll('input[type="text"]');
    inputs.forEach(input => {
        input.addEventListener('input', validateNumericInput);
        input.addEventListener('paste', function (e) {
            setTimeout(() => validateNumericInput(e), 10);
        });
        input.addEventListener('focus', function () {
            const errorDiv = document.getElementById(input.id + '-error');
            if (errorDiv) errorDiv.classList.remove('show');
        });
    });
}

function validateNumericInput(event) {
    const input    = event.target;
    const value    = input.value;
    const inputId  = input.id;
    const errorDiv = document.getElementById(inputId + '-error');
    const validPattern = /^-?\d*\.?\d*([eE][-+]?\d*)?$/;

    if (!validPattern.test(value) && value !== '') {
        if (errorDiv) {
            errorDiv.textContent = '❌ Only numbers allowed';
            errorDiv.classList.add('show');
        }
        input.value = value.replace(/[^0-9.\-eE]/g, '');
        if (!validPattern.test(input.value)) input.value = '';
    } else {
        if (errorDiv) errorDiv.classList.remove('show');
        hideError();
    }
}

// ============================================================================
// CONVERSION FUNCTIONS
// ============================================================================

function mWtoDBm(mW)      { return 10 * Math.log10(mW); }
function dBmToMW(dBm)     { return Math.pow(10, dBm / 10); }
function WtoDBm(W)        { return 10 * Math.log10(W * 1000); }
function linearToDb(l)    { return 10 * Math.log10(l); }

function convertToMeters(value, unit) {
    switch (unit) {
        case 'm':  return value;
        case 'cm': return value / 100;
        case 'mm': return value / 1000;
        case 'km': return value * 1000;
        default:   return value;
    }
}

function convertToNanometers(value, unit) {
    switch (unit) {
        case 'nm': return value;
        case 'μm': return value * 1000;
        case 'm':  return value * 1e9;
        default:   return value;
    }
}

function convertPowerToDBm(value, unit) {
    switch (unit) {
        case 'dBm': return value;
        case 'mW':  return mWtoDBm(value);
        case 'W':   return WtoDBm(value);
        default:    return value;
    }
}

function convertToPercent(value, unit) {
    switch (unit) {
        case '%':       return value;
        case 'decimal': return value * 100;
        default:        return value;
    }
}

function convertLossToDb(value, unit) {
    switch (unit) {
        case 'dB':     return value;
        case 'linear': return linearToDb(value);
        default:       return value;
    }
}

function convertAngleToRadians(value, unit) {
    switch (unit) {
        case 'rad':  return value;
        case 'urad': return value * 1e-6;
        case 'nrad': return value * 1e-9;
        default:     return value;
    }
}

// Smart formatting for power values
function formatPower(mw) {
    if (mw === 0) return "0.000000";
    if (Math.abs(mw) < 0.0001) return mw.toExponential(4);
    return mw.toFixed(6);
}

// ============================================================================
// MAIN CALCULATION FUNCTION
// ============================================================================

async function calculateLinkBudget() {
    hideError();
    hideSuccess();

    const calculateBtn   = document.getElementById('calculateBtn');
    const originalText   = calculateBtn.textContent;
    calculateBtn.innerHTML = '<span class="loading"></span> Calculating...';
    calculateBtn.disabled  = true;

    try {
        const inputs = collectInputs();

        if (!validateRequiredInputs(inputs)) return;

        const response = await fetch(`${API_BASE_URL}/api/calculate`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(inputs)
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || 'API calculation failed');
        }

        const data = await response.json();
        currentCalculationData = data;
        displayResults(data.outputs);

        document.getElementById('saveBtn').disabled = false;
        document.getElementById('pdfBtn').disabled  = false;

    } catch (error) {
        showError('Calculation error: ' + error.message);
    } finally {
        calculateBtn.textContent = originalText;
        calculateBtn.disabled    = false;
    }
}

// ============================================================================
// COLLECT INPUTS
// ============================================================================

function collectInputs() {
    const txPowerValue       = parseFloat(document.getElementById('txPower').value);
    const txPowerUnit        = document.getElementById('txPowerUnit').value;

    const txEfficiencyValue  = parseFloat(document.getElementById('txEfficiency').value);
    const txEfficiencyUnit   = document.getElementById('txEfficiencyUnit').value;

    const rxEfficiencyValue  = parseFloat(document.getElementById('rxEfficiency').value);
    const rxEfficiencyUnit   = document.getElementById('rxEfficiencyUnit').value;

    const rxSensitivityValue = parseFloat(document.getElementById('rxSensitivity').value);
    const rxSensitivityUnit  = document.getElementById('rxSensitivityUnit').value;

    // NEW: Rx Optical LNA gain
    const rxLnaGainValue     = parseFloat(document.getElementById('rxLnaGain').value) || 0;

    const wavelengthValue    = parseFloat(document.getElementById('wavelength').value);
    const wavelengthUnit     = document.getElementById('wavelengthUnit').value;

    const txDiameterValue    = parseFloat(document.getElementById('txDiameter').value);
    const txDiameterUnit     = document.getElementById('txDiameterUnit').value;

    const rxDiameterValue    = parseFloat(document.getElementById('rxDiameter').value);
    const rxDiameterUnit     = document.getElementById('rxDiameterUnit').value;

    const distanceValue      = parseFloat(document.getElementById('distance').value);
    const distanceUnit       = document.getElementById('distanceUnit').value;

    const implLossValue      = parseFloat(document.getElementById('implLoss').value) || 0;
    const implLossUnit       = document.getElementById('implLossUnit').value;

    const couplingLossValue  = parseFloat(document.getElementById('couplingLoss').value) || 0;
    const couplingLossUnit   = document.getElementById('couplingLossUnit').value;

    // Convert efficiency from % to decimal (0-1) for the API
    const txEfficiencyPct = convertToPercent(txEfficiencyValue, txEfficiencyUnit);
    const rxEfficiencyPct = convertToPercent(rxEfficiencyValue, rxEfficiencyUnit);

    const inputs = {
        tx_power_dbm:           convertPowerToDBm(txPowerValue, txPowerUnit),
        tx_efficiency:          txEfficiencyPct / 100,   // API expects 0-1
        rx_efficiency:          rxEfficiencyPct / 100,
        rx_sensitivity_dbm:     convertPowerToDBm(rxSensitivityValue, rxSensitivityUnit),
        rx_lna_gain_db:         rxLnaGainValue,          // NEW field
        wavelength_m:           convertToNanometers(wavelengthValue, wavelengthUnit) * 1e-9,
        tx_diameter_m:          convertToMeters(txDiameterValue, txDiameterUnit),
        rx_diameter_m:          convertToMeters(rxDiameterValue, rxDiameterUnit),
        distance_m:             convertToMeters(distanceValue, distanceUnit),
        implementation_loss_db: convertLossToDb(implLossValue, implLossUnit),
        coupling_loss_db:       convertLossToDb(couplingLossValue, couplingLossUnit)
    };

    // Handle Tx Pointing Mode
    const txPointingMode = document.querySelector('input[name="txPointingMode"]:checked').value;
    if (txPointingMode === 'manual') {
        const txPLv = parseFloat(document.getElementById('txPointingLoss').value) || 0;
        const txPLu = document.getElementById('txPointingLossUnit').value;
        inputs.tx_pointing_loss_db    = convertLossToDb(txPLv, txPLu);
        inputs.tx_pointing_error_rad  = null;
    } else {
        const txPEv = parseFloat(document.getElementById('txPointingError').value) || 0;
        const txPEu = document.getElementById('txPointingErrorUnit').value;
        inputs.tx_pointing_error_rad  = convertAngleToRadians(txPEv, txPEu);
        inputs.tx_pointing_loss_db    = 0;
    }

    // Handle Rx Pointing Mode
    const rxPointingMode = document.querySelector('input[name="rxPointingMode"]:checked').value;
    if (rxPointingMode === 'manual') {
        const rxPLv = parseFloat(document.getElementById('rxPointingLoss').value) || 0;
        const rxPLu = document.getElementById('rxPointingLossUnit').value;
        inputs.rx_pointing_loss_db    = convertLossToDb(rxPLv, rxPLu);
        inputs.rx_pointing_error_rad  = null;
    } else {
        const rxPEv = parseFloat(document.getElementById('rxPointingError').value) || 0;
        const rxPEu = document.getElementById('rxPointingErrorUnit').value;
        inputs.rx_pointing_error_rad  = convertAngleToRadians(rxPEv, rxPEu);
        inputs.rx_pointing_loss_db    = 0;
    }

    return inputs;
}

// ============================================================================
// VALIDATION
// ============================================================================

function validateRequiredInputs(inputs) {
    const requiredFields = [
        { name: 'tx_power_dbm',      label: 'Transmitter Power' },
        { name: 'tx_efficiency',      label: 'Transmitter Efficiency' },
        { name: 'rx_efficiency',      label: 'Receiver Efficiency' },
        { name: 'rx_sensitivity_dbm', label: 'Receiver Sensitivity' },
        { name: 'wavelength_m',       label: 'Wavelength' },
        { name: 'tx_diameter_m',      label: 'Transmitter Diameter' },
        { name: 'rx_diameter_m',      label: 'Receiver Diameter' },
        { name: 'distance_m',         label: 'Distance' }
    ];

    for (const field of requiredFields) {
        if (isNaN(inputs[field.name])) {
            showError(`Please fill in: ${field.label}`);
            return false;
        }
    }

    if (inputs.wavelength_m <= 0 || inputs.tx_diameter_m <= 0 ||
        inputs.rx_diameter_m <= 0 || inputs.distance_m <= 0) {
        showError('Wavelength, diameters, and distance must be positive values');
        return false;
    }

    if (inputs.rx_lna_gain_db < 0) {
        showError('Rx LNA Gain must be 0 or a positive value (enter 0 if no LNA)');
        return false;
    }

    return true;
}

// ============================================================================
// DISPLAY RESULTS
// ============================================================================

function displayResults(outputs) {
    const lnaGain    = outputs.rx_lna_gain_db || 0;
    const linkMargin = outputs.link_margin_db;

    // ── Big Link Margin box ──────────────────────────────────────────────
    const linkMarginBox   = document.getElementById('linkMarginBox');
    const linkMarginValue = document.getElementById('linkMarginValue');
    const linkStatus      = document.getElementById('linkStatus');

    linkMarginValue.textContent = `${linkMargin !== null ? linkMargin.toFixed(2) : 'N/A'} dB`;

    if (linkMargin !== null && linkMargin > 0) {
        linkMarginBox.classList.remove('negative');
        linkStatus.textContent = linkMargin >= 6
            ? '✓ LINK EXCELLENT'
            : linkMargin >= 3
                ? '✓ LINK GOOD'
                : '✓ LINK VIABLE (Marginal)';
    } else {
        linkMarginBox.classList.add('negative');
        linkStatus.textContent = '✗ LINK NOT VIABLE';
    }

    // Three power rows inside the margin box
    document.getElementById('lmRxPowerNoLna').textContent =
        `${outputs.received_power_dbm.toFixed(2)} dBm  (${formatPower(outputs.received_power_mw)} mW)`;

    document.getElementById('lmRxPowerLna').textContent =
        `${outputs.received_power_lna_dbm.toFixed(2)} dBm  (${formatPower(outputs.received_power_lna_mw)} mW)`
        + (lnaGain > 0 ? `  [+${lnaGain.toFixed(1)} dB LNA]` : '  [No LNA]');

    document.getElementById('lmSensitivity').textContent =
        outputs.rx_sensitivity_dbm !== null
            ? `${outputs.rx_sensitivity_dbm.toFixed(2)} dBm  (${formatPower(outputs.rx_sensitivity_mw)} mW)`
            : '—';

    // ── Input Summary ────────────────────────────────────────────────────
    document.getElementById('resultTxPower').textContent =
        `${outputs.tx_power_dbm.toFixed(2)} dBm  (${formatPower(outputs.tx_power_mw)} mW)`;

    document.getElementById('resultRxSensitivity').textContent =
        outputs.rx_sensitivity_dbm !== null
            ? `${outputs.rx_sensitivity_dbm.toFixed(2)} dBm  (${formatPower(outputs.rx_sensitivity_mw)} mW)`
            : '—';

    document.getElementById('resultDistance').textContent =
        `${outputs.distance_m.toFixed(2)} m  (${outputs.distance_km.toFixed(3)} km)`;

    document.getElementById('resultWavelength').textContent =
        `${outputs.wavelength_nm.toFixed(2)} nm`;

    // ── Antenna Gains ────────────────────────────────────────────────────
    document.getElementById('resultTxGain').textContent =
        `${outputs.tx_gain_db.toFixed(2)} dB  (${outputs.tx_gain_absolute.toFixed(2)})`;
    document.getElementById('resultRxGain').textContent =
        `${outputs.rx_gain_db.toFixed(2)} dB  (${outputs.rx_gain_absolute.toFixed(2)})`;

    // ── Beam Divergence ──────────────────────────────────────────────────
    document.getElementById('resultTxDivergence').textContent =
        `${outputs.tx_beam_divergence_deg.toFixed(6)}°  (${outputs.tx_beam_divergence_rad.toFixed(6)} rad)`;
    document.getElementById('resultRxDivergence').textContent =
        `${outputs.rx_beam_divergence_deg.toFixed(6)}°  (${outputs.rx_beam_divergence_rad.toFixed(6)} rad)`;

    // ── Losses ───────────────────────────────────────────────────────────
    document.getElementById('resultPathLoss').textContent  = `${outputs.path_loss_db.toFixed(2)} dB`;
    document.getElementById('resultTotalLoss').textContent = `${outputs.total_loss_db.toFixed(2)} dB`;

    // ── Power Budget — three result cards ────────────────────────────────

    // 1. Rx Power WITHOUT LNA
    document.getElementById('resultRxPowerNoLna').textContent =
        `${outputs.received_power_dbm.toFixed(2)} dBm  (${formatPower(outputs.received_power_mw)} mW)`;

    // 2. Rx Power WITH LNA
    const lnaLabel = lnaGain > 0 ? ` [+${lnaGain.toFixed(1)} dB]` : ' [No LNA]';
    document.getElementById('resultRxPowerLna').textContent =
        `${outputs.received_power_lna_dbm.toFixed(2)} dBm  (${formatPower(outputs.received_power_lna_mw)} mW)${lnaLabel}`;

    // 3. Link Margin (after LNA) — small card
    const lmItem = document.getElementById('resultLinkMarginItem');
    const lmSmall = document.getElementById('resultLinkMarginSmall');
    lmSmall.textContent = linkMargin !== null ? `${linkMargin.toFixed(2)} dB` : '—';
    if (linkMargin !== null && linkMargin > 0) {
        lmItem.classList.remove('warning');
        lmItem.classList.add('highlight');
        lmSmall.style.color = '#28a745';
    } else {
        lmItem.classList.remove('highlight');
        lmItem.classList.add('warning');
        lmSmall.style.color = '#dc3545';
    }

    // Efficiencies
    document.getElementById('resultEfficiencies').textContent =
        `Tx: ${outputs.tx_efficiency_percent.toFixed(2)}%  |  Rx: ${outputs.rx_efficiency_percent.toFixed(2)}%`;

    // Show results panel
    document.getElementById('results').classList.add('show');
}

// ============================================================================
// SAVE CALCULATION
// ============================================================================

async function saveCalculation() {
    if (!currentCalculationData) {
        showError('No calculation to save');
        return;
    }

    const saveBtn      = document.getElementById('saveBtn');
    const originalText = saveBtn.textContent;
    saveBtn.innerHTML  = '<span class="loading"></span> Saving...';
    saveBtn.disabled   = true;

    try {
        const notes = prompt('Add notes (optional):');

        const response = await fetch(`${API_BASE_URL}/api/save`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
                calculation_data: currentCalculationData,
                notes:            notes
            })
        });

        if (!response.ok) throw new Error('Failed to save calculation');

        const data = await response.json();
        showSuccess(`Calculation saved! File: ${data.filename}`);

    } catch (error) {
        showError('Save error: ' + error.message);
    } finally {
        saveBtn.textContent = originalText;
        saveBtn.disabled    = false;
    }
}

// ============================================================================
// EXPORT TO PDF
// ============================================================================

async function exportToPDF() {
    if (!currentCalculationData) {
        showError('No calculation to export');
        return;
    }

    const pdfBtn       = document.getElementById('pdfBtn');
    const originalText = pdfBtn.textContent;
    pdfBtn.innerHTML   = '<span class="loading"></span> Generating PDF...';
    pdfBtn.disabled    = true;

    try {
        const response = await fetch(`${API_BASE_URL}/api/generate-pdf`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(currentCalculationData)
        });

        if (!response.ok) throw new Error('Failed to generate PDF');

        const blob = await response.blob();
        const url  = window.URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `optical_link_calculation_${new Date().getTime()}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        showSuccess('PDF downloaded successfully!');

    } catch (error) {
        showError('PDF generation error: ' + error.message);
    } finally {
        pdfBtn.textContent = originalText;
        pdfBtn.disabled    = false;
    }
}

// ============================================================================
// RESET FORM
// ============================================================================

function resetForm() {
    document.querySelectorAll('input').forEach(input => input.value = '');

    // Reset selects
    const selects = {
        txPowerUnit:        'dBm',
        txEfficiencyUnit:   '%',
        rxEfficiencyUnit:   '%',
        rxSensitivityUnit:  'dBm',
        wavelengthUnit:     'nm',
        txDiameterUnit:     'm',
        rxDiameterUnit:     'm',
        distanceUnit:       'm',
        implLossUnit:       'dB',
        couplingLossUnit:   'dB',
        txPointingLossUnit: 'dB',
        rxPointingLossUnit: 'dB'
    };
    Object.entries(selects).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el) el.value = val;
    });

    document.getElementById('results').classList.remove('show');
    document.getElementById('saveBtn').disabled = true;
    document.getElementById('pdfBtn').disabled  = true;
    hideError();
    hideSuccess();

    currentCalculationData = null;
}

// ============================================================================
// UI TOGGLES
// ============================================================================

function togglePointingMode(type) {
    const mode        = document.querySelector(`input[name="${type}PointingMode"]:checked`).value;
    const manualInput = document.getElementById(`${type}PointingManualInput`);
    const errorInput  = document.getElementById(`${type}PointingErrorInput`);

    if (mode === 'manual') {
        manualInput.style.display = 'block';
        errorInput.style.display  = 'none';
        document.getElementById(`${type}PointingError`).value = '';
    } else {
        manualInput.style.display = 'none';
        errorInput.style.display  = 'block';
        document.getElementById(`${type}PointingLoss`).value  = '';
    }
}

// ============================================================================
// UI HELPERS
// ============================================================================

function showError(message) {
    const errorDiv = document.getElementById('errorMsg');
    errorDiv.textContent = message;
    errorDiv.classList.add('show');
    document.getElementById('results').classList.remove('show');
}

function hideError() {
    document.getElementById('errorMsg').classList.remove('show');
}

function showSuccess(message) {
    const successDiv = document.getElementById('successMsg');
    successDiv.textContent = message;
    successDiv.classList.add('show');
    setTimeout(() => successDiv.classList.remove('show'), 5000);
}

function hideSuccess() {
    document.getElementById('successMsg').classList.remove('show');
}

function showWarning(message) {
    console.warn(message);
}

// ============================================================================
// KEYBOARD SHORTCUTS
// ============================================================================

document.addEventListener('keypress', function (event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        calculateLinkBudget();
    }
});
