/**
 * Optical Link Budget Calculator - Frontend Logic
 * Handles API integration, calculations, save/load, PDF export
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
    setInterval(checkAPIConnection, 30000);  // Every 30 seconds
});

// ============================================================================
// API CONNECTION CHECK
// ============================================================================

async function checkAPIConnection() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/health`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
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
        statusDiv.textContent = '⚠️ Backend API: Offline (Using local calculations)';
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
            if (errorDiv) {
                errorDiv.classList.remove('show');
            }
        });
    });
}

function validateNumericInput(event) {
    const input = event.target;
    const value = input.value;
    const inputId = input.id;
    const errorDiv = document.getElementById(inputId + '-error');

    const validPattern = /^-?\d*\.?\d*([eE][-+]?\d*)?$/;

    if (!validPattern.test(value) && value !== '') {
        if (errorDiv) {
            errorDiv.textContent = '❌ Only numbers allowed';
            errorDiv.classList.add('show');
        }
        input.value = value.replace(/[^0-9.\-eE]/g, '');
        if (!validPattern.test(input.value)) {
            input.value = '';
        }
    } else {
        if (errorDiv) {
            errorDiv.classList.remove('show');
        }
        hideError();
    }
}

// ============================================================================
// CONVERSION FUNCTIONS (CLIENT-SIDE FALLBACK)
// ============================================================================

function mWtoDBm(mW) {
    return 10 * Math.log10(mW);
}

function dBmToMW(dBm) {
    return Math.pow(10, dBm / 10);
}

function WtoDBm(W) {
    return 10 * Math.log10(W * 1000);
}

function linearToDb(linear) {
    return 10 * Math.log10(linear);
}

function convertToMeters(value, unit) {
    switch (unit) {
        case 'm': return value;
        case 'cm': return value / 100;
        case 'mm': return value / 1000;
        case 'km': return value * 1000;
        default: return value;
    }
}

function convertToNanometers(value, unit) {
    switch (unit) {
        case 'nm': return value;
        case 'μm': return value * 1000;
        case 'm': return value * 1e9;
        default: return value;
    }
}

function convertPowerToDBm(value, unit) {
    switch (unit) {
        case 'dBm': return value;
        case 'mW': return mWtoDBm(value);
        case 'W': return WtoDBm(value);
        default: return value;
    }
}

function convertToPercent(value, unit) {
    switch (unit) {
        case '%': return value;
        case 'decimal': return value * 100;
        default: return value;
    }
}

function convertLossToDb(value, unit) {
    switch (unit) {
        case 'dB': return value;
        case 'linear': return linearToDb(value);
        default: return value;
    }
}

// ============================================================================
// MAIN CALCULATION FUNCTION
// ============================================================================

async function calculateLinkBudget() {
    hideError();
    hideSuccess();

    const calculateBtn = document.getElementById('calculateBtn');
    const originalText = calculateBtn.textContent;
    calculateBtn.innerHTML = '<span class="loading"></span> Calculating...';
    calculateBtn.disabled = true;

    try {
        // Collect all input values
        const inputs = collectInputs();

        // Validate required inputs
        if (!validateRequiredInputs(inputs)) {
            return;
        }

        // Try API first, fallback to client-side calculation
        try {
            const response = await fetch(`${API_BASE_URL}/api/calculate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(inputs)
            });

            if (!response.ok) {
                throw new Error('API calculation failed');
            }

            const data = await response.json();
            currentCalculationData = data;
            displayResults(data.outputs);

            // Enable save and PDF buttons
            document.getElementById('saveBtn').disabled = false;
            document.getElementById('pdfBtn').disabled = false;

        } catch (apiError) {
            console.warn('API calculation failed, using client-side fallback');
            showWarning('Using offline calculation mode');
            // Implement client-side calculation here if needed
            throw new Error('Calculation requires backend API');
        }

    } catch (error) {
        showError('Calculation error: ' + error.message);
    } finally {
        calculateBtn.textContent = originalText;
        calculateBtn.disabled = false;
    }
}

function collectInputs() {
    // Get all input values and convert to standard units
    const txPowerValue = parseFloat(document.getElementById('txPower').value);
    const txPowerUnit = document.getElementById('txPowerUnit').value;

    const txEfficiencyValue = parseFloat(document.getElementById('txEfficiency').value);
    const txEfficiencyUnit = document.getElementById('txEfficiencyUnit').value;

    const rxEfficiencyValue = parseFloat(document.getElementById('rxEfficiency').value);
    const rxEfficiencyUnit = document.getElementById('rxEfficiencyUnit').value;

    const rxSensitivityValue = parseFloat(document.getElementById('rxSensitivity').value);
    const rxSensitivityUnit = document.getElementById('rxSensitivityUnit').value;

    const wavelengthValue = parseFloat(document.getElementById('wavelength').value);
    const wavelengthUnit = document.getElementById('wavelengthUnit').value;

    const txDiameterValue = parseFloat(document.getElementById('txDiameter').value);
    const txDiameterUnit = document.getElementById('txDiameterUnit').value;

    const rxDiameterValue = parseFloat(document.getElementById('rxDiameter').value);
    const rxDiameterUnit = document.getElementById('rxDiameterUnit').value;

    const distanceValue = parseFloat(document.getElementById('distance').value);
    const distanceUnit = document.getElementById('distanceUnit').value;

    // Optional losses
    const implLossValue = parseFloat(document.getElementById('implLoss').value) || 0;
    const implLossUnit = document.getElementById('implLossUnit').value;

    const couplingLossValue = parseFloat(document.getElementById('couplingLoss').value) || 0;
    const couplingLossUnit = document.getElementById('couplingLossUnit').value;

    // Convert to standard units for API
    const inputs = {
        tx_power: convertPowerToDBm(txPowerValue, txPowerUnit),
        tx_efficiency: convertToPercent(txEfficiencyValue, txEfficiencyUnit),
        rx_efficiency: convertToPercent(rxEfficiencyValue, rxEfficiencyUnit),
        rx_sensitivity: convertPowerToDBm(rxSensitivityValue, rxSensitivityUnit),
        wavelength: convertToNanometers(wavelengthValue, wavelengthUnit),
        tx_diameter: convertToMeters(txDiameterValue, txDiameterUnit),
        rx_diameter: convertToMeters(rxDiameterValue, rxDiameterUnit),
        distance: convertToMeters(distanceValue, distanceUnit),
        impl_loss: convertLossToDb(implLossValue, implLossUnit),
        coupling_loss: convertLossToDb(couplingLossValue, couplingLossUnit)
    };

    // Handle Tx Pointing Mode
    const txPointingMode = document.querySelector('input[name="txPointingMode"]:checked').value;
    if (txPointingMode === 'manual') {
        const txPointingLossValue = parseFloat(document.getElementById('txPointingLoss').value) || 0;
        const txPointingLossUnit = document.getElementById('txPointingLossUnit').value;
        inputs.tx_pointing_loss = convertLossToDb(txPointingLossValue, txPointingLossUnit);
        inputs.tx_pointing_error_rad = null;
    } else {
        const txPointingErrorValue = parseFloat(document.getElementById('txPointingError').value) || 0;
        const txPointingErrorUnit = document.getElementById('txPointingErrorUnit').value;
        inputs.tx_pointing_error_rad = convertAngleToRadians(txPointingErrorValue, txPointingErrorUnit);
        inputs.tx_pointing_loss = 0; // Will be calculated by backend
    }

    // Handle Rx Pointing Mode
    const rxPointingMode = document.querySelector('input[name="rxPointingMode"]:checked').value;
    if (rxPointingMode === 'manual') {
        const rxPointingLossValue = parseFloat(document.getElementById('rxPointingLoss').value) || 0;
        const rxPointingLossUnit = document.getElementById('rxPointingLossUnit').value;
        inputs.rx_pointing_loss = convertLossToDb(rxPointingLossValue, rxPointingLossUnit);
        inputs.rx_pointing_error_rad = null;
    } else {
        const rxPointingErrorValue = parseFloat(document.getElementById('rxPointingError').value) || 0;
        const rxPointingErrorUnit = document.getElementById('rxPointingErrorUnit').value;
        inputs.rx_pointing_error_rad = convertAngleToRadians(rxPointingErrorValue, rxPointingErrorUnit);
        inputs.rx_pointing_loss = 0; // Will be calculated by backend
    }

    return inputs;
}

function convertAngleToRadians(value, unit) {
    switch (unit) {
        case 'rad': return value;
        case 'urad': return value * 1e-6;
        case 'nrad': return value * 1e-9;
        default: return value;
    }
}

function validateRequiredInputs(inputs) {
    const requiredFields = [
        { name: 'tx_power', label: 'Transmitter Power' },
        { name: 'tx_efficiency', label: 'Transmitter Efficiency' },
        { name: 'rx_efficiency', label: 'Receiver Efficiency' },
        { name: 'rx_sensitivity', label: 'Receiver Sensitivity' },
        { name: 'wavelength', label: 'Wavelength' },
        { name: 'tx_diameter', label: 'Transmitter Diameter' },
        { name: 'rx_diameter', label: 'Receiver Diameter' },
        { name: 'distance', label: 'Distance' }
    ];

    for (const field of requiredFields) {
        if (isNaN(inputs[field.name])) {
            showError(`Please fill in: ${field.label}`);
            return false;
        }
    }

    // Check for positive values where needed
    if (inputs.wavelength <= 0 || inputs.tx_diameter <= 0 || inputs.rx_diameter <= 0 || inputs.distance <= 0) {
        showError('Wavelength, diameters, and distance must be positive values');
        return false;
    }

    return true;
}

// ============================================================================
// DISPLAY RESULTS
// ============================================================================

function displayResults(outputs) {
    // Link Margin (PROMINENT DISPLAY)
    const linkMargin = outputs.link_margin_db;
    const linkMarginBox = document.getElementById('linkMarginBox');
    const linkMarginValue = document.getElementById('linkMarginValue');
    const linkStatus = document.getElementById('linkStatus');

    // Calculate link margin in mW (difference between received and required power)
    const linkMarginMw = outputs.received_power_mw - outputs.rx_sensitivity_mw;

    // Display margin in dB and mW
    linkMarginValue.textContent = `${linkMargin.toFixed(2)} dB (${linkMarginMw.toFixed(6)} mW)`;

    // Update power details in Link Margin box
    const rxPowerElement = document.getElementById('linkMarginRxPower');
    const sensitivityElement = document.getElementById('linkMarginSensitivity');

    if (rxPowerElement && sensitivityElement) {
        rxPowerElement.textContent =
            `Received: ${outputs.received_power_dbm.toFixed(2)} dBm (${outputs.received_power_mw.toFixed(6)} mW)`;
        sensitivityElement.textContent =
            `Required: ${outputs.rx_sensitivity_dbm.toFixed(2)} dBm (${outputs.rx_sensitivity_mw.toFixed(9)} mW)`;
    }

    if (linkMargin > 0) {
        linkMarginBox.classList.remove('negative');
        linkStatus.textContent = '✓ LINK VIABLE';
        if (linkMargin >= 3 && linkMargin <= 6) {
            linkStatus.textContent = '✓ LINK EXCELLENT (Recommended Margin)';
        }
    } else {
        linkMarginBox.classList.add('negative');
        linkStatus.textContent = '✗ LINK NOT VIABLE';
    }

    // Input Parameters
    document.getElementById('resultTxPower').textContent =
        `${outputs.tx_power_dbm.toFixed(2)} dBm (${outputs.tx_power_mw.toFixed(6)} mW)`;
    document.getElementById('resultRxSensitivity').textContent =
        `${outputs.rx_sensitivity_dbm.toFixed(2)} dBm (${outputs.rx_sensitivity_mw.toFixed(9)} mW)`;
    document.getElementById('resultDistance').textContent =
        `${outputs.distance_m.toFixed(2)} m (${outputs.distance_km.toFixed(3)} km)`;
    document.getElementById('resultWavelength').textContent =
        `${outputs.wavelength_nm.toFixed(2)} nm`;

    // Antenna Gains
    document.getElementById('resultTxGain').textContent =
        `${outputs.tx_gain_db.toFixed(2)} dB (${outputs.tx_gain_absolute.toFixed(2)})`;
    document.getElementById('resultRxGain').textContent =
        `${outputs.rx_gain_db.toFixed(2)} dB (${outputs.rx_gain_absolute.toFixed(2)})`;

    // Beam Divergence
    document.getElementById('resultTxDivergence').textContent =
        `${outputs.tx_beam_divergence_deg.toFixed(6)}° (${outputs.tx_beam_divergence_rad.toFixed(6)} rad)`;
    document.getElementById('resultRxDivergence').textContent =
        `${outputs.rx_beam_divergence_deg.toFixed(6)}° (${outputs.rx_beam_divergence_rad.toFixed(6)} rad)`;

    // Losses
    document.getElementById('resultPathLoss').textContent = `${outputs.path_loss_db.toFixed(2)} dB`;
    document.getElementById('resultTotalLoss').textContent = `${outputs.total_loss_db.toFixed(2)} dB`;

    // Final Results
    document.getElementById('resultRxPower').textContent =
        `${outputs.received_power_dbm.toFixed(2)} dBm (${outputs.received_power_mw.toFixed(6)} mW)`;
    document.getElementById('resultEfficiencies').textContent =
        `Tx: ${outputs.tx_efficiency_percent.toFixed(2)}% | Rx: ${outputs.rx_efficiency_percent.toFixed(2)}%`;

    // Show results section
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

    const saveBtn = document.getElementById('saveBtn');
    const originalText = saveBtn.textContent;
    saveBtn.innerHTML = '<span class="loading"></span> Saving...';
    saveBtn.disabled = true;

    try {
        const notes = prompt('Add notes (optional):');

        const response = await fetch(`${API_BASE_URL}/api/save`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                calculation_data: currentCalculationData,
                notes: notes
            })
        });

        if (!response.ok) {
            throw new Error('Failed to save calculation');
        }

        const data = await response.json();
        showSuccess(`Calculation saved successfully! File: ${data.filename}`);

    } catch (error) {
        showError('Save error: ' + error.message);
    } finally {
        saveBtn.textContent = originalText;
        saveBtn.disabled = false;
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

    const pdfBtn = document.getElementById('pdfBtn');
    const originalText = pdfBtn.textContent;
    pdfBtn.innerHTML = '<span class="loading"></span> Generating PDF...';
    pdfBtn.disabled = true;

    try {
        const response = await fetch(`${API_BASE_URL}/api/generate-pdf`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(currentCalculationData)
        });

        if (!response.ok) {
            throw new Error('Failed to generate PDF');
        }

        // Download the PDF
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
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
        pdfBtn.disabled = false;
    }
}

// ============================================================================
// RESET FORM
// ============================================================================

function resetForm() {
    // Clear all input fields
    const inputs = document.querySelectorAll('input');
    inputs.forEach(input => input.value = '');

    // Reset all selects to default values
    document.getElementById('txPowerUnit').value = 'dBm';
    document.getElementById('txEfficiencyUnit').value = '%';
    document.getElementById('rxEfficiencyUnit').value = '%';
    document.getElementById('rxSensitivityUnit').value = 'dBm';
    document.getElementById('wavelengthUnit').value = 'nm';
    document.getElementById('txDiameterUnit').value = 'm';
    document.getElementById('rxDiameterUnit').value = 'm';
    document.getElementById('distanceUnit').value = 'm';
    document.getElementById('implLossUnit').value = 'dB';
    document.getElementById('couplingLossUnit').value = 'dB';
    document.getElementById('txPointingLossUnit').value = 'dB';
    document.getElementById('rxPointingLossUnit').value = 'dB';

    // Hide results and errors
    document.getElementById('results').classList.remove('show');
    document.getElementById('saveBtn').disabled = true;
    document.getElementById('pdfBtn').disabled = true;
    hideError();
    hideSuccess();

    currentCalculationData = null;
}

// ============================================================================
// UI TOGGLES
// ============================================================================

function togglePointingMode(type) {
    const mode = document.querySelector(`input[name="${type}PointingMode"]:checked`).value;
    const manualInput = document.getElementById(`${type}PointingManualInput`);
    const errorInput = document.getElementById(`${type}PointingErrorInput`);

    if (mode === 'manual') {
        manualInput.style.display = 'block';
        errorInput.style.display = 'none';

        // Clear value in error input to avoid confusion
        document.getElementById(`${type}PointingError`).value = '';
    } else {
        manualInput.style.display = 'none';
        errorInput.style.display = 'block';

        // Clear value in manual input
        document.getElementById(`${type}PointingLoss`).value = '';
    }
}

// ============================================================================
// UI TOGGLES
// ============================================================================

function togglePointingMode(type) {
    const mode = document.querySelector(`input[name="${type}PointingMode"]:checked`).value;
    const manualInput = document.getElementById(`${type}PointingManualInput`);
    const errorInput = document.getElementById(`${type}PointingErrorInput`);

    if (mode === 'manual') {
        manualInput.style.display = 'block';
        errorInput.style.display = 'none';

        // Clear value in error input to avoid confusion
        document.getElementById(`${type}PointingError`).value = '';
    } else {
        manualInput.style.display = 'none';
        errorInput.style.display = 'block';

        // Clear value in manual input
        document.getElementById(`${type}PointingLoss`).value = '';
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
    setTimeout(() => {
        successDiv.classList.remove('show');
    }, 5000);
}

function hideSuccess() {
    document.getElementById('successMsg').classList.remove('show');
}

function showWarning(message) {
    console.warn(message);
    // Could add a warning UI element here
}

// ============================================================================
// KEYBOARD SHORTCUTS
// ============================================================================

document.addEventListener('keypress', function (event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        calculateLinkBudget();
    }
});
