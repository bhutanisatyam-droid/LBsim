# Optical Link Budget Calculation Logic

This document details the mathematical models and formulas used in `backend/main.py`.

## 1. Core Constants & Conversions
- **$\pi$ (Pi)**: `3.14159265359`
- **Wavelength ($\lambda$)**: Converted from nanometers (nm) to meters (m).
  - `wavelength_m = inputs.wavelength * 1e-9`
- **Distance ($d$)**: In meters.

---

## 2. Geometric Parameters

### 2.1 Beam Divergence ($\theta$)
Calculated from wavelength and aperture diameter (diffraction limit approximation).
- **Formula:** $\theta = \frac{2.44 \cdot \lambda}{D}$
- **Code:** `(2.44 * wavelength_m) / diameter`
- **Units:** Radians

### 2.2 Antenna Gains
The gain is calculated differently for Transmitter (based on divergence) and Receiver (based on area).

**Transmitter Gain ($G_{tx}$)**
- **Formula (Absolute):** $G_{tx} = \frac{32}{\theta^2}$
- **Formula (dB):** $G_{tx(dB)} = 10 \log_{10}(G_{tx})$
- **Source:** Matches MATLAB script typical approximation for Gaussian beams.

**Receiver Gain ($G_{rx}$)**
- **Formula (Absolute):** $G_{rx} = (\frac{\pi \cdot D_{rx}}{\lambda})^2$
- **Formula (dB):** $G_{rx(dB)} = 10 \log_{10}(G_{rx})$
- **Source:** Standard aperture gain formula.

---

## 3. Losses

### 3.1 Free Space Path Loss ($L_{fs}$)
Loss due to signal spreading over distance.
- **Formula:** $L_{fs} = 20 \log_{10}(\frac{4 \pi d}{\lambda})$
- **Code:** `20 * math.log10((4 * PI * distance) / wavelength_m)`

### 3.2 Pointing Loss ($L_{point}$)
Loss due to misalignment errors ($\theta_{error}$).
- **Formula:** $L_{point} = \left| 10 \log_{10}(e^{-G \cdot \theta_{error}^2}) \right|$
- **Code:** `abs(10 * math.log10(math.exp(-gain_abs * (error_rad ** 2))))`
- **Logic:**
  - Uses specific gain ($G_{tx}$ or $G_{rx}$) depending on which end has the error.
  - Returns absolute dB value to be subtracted later.

### 3.3 Efficiencies
Converting percentage efficiency to dB loss/gain factor.
- **Formula:** $E_{dB} = 10 \log_{10}(\frac{Efficiency\%}{100})$
- **Note:** This usually results in a negative dB value (loss).

---

## 4. Total Link Budget Equation

The received power ($P_{rx}$) is the sum of gains minus the sum of losses.

$$ P_{rx} = P_{tx} + G_{tx} + G_{rx} + E_{tx} + E_{rx} - L_{total} $$

Where:
- $P_{tx}$ = Transmitter Power (dBm)
- $G_{tx}, G_{rx}$ = Antenna Gains (dB)
- $E_{tx}, E_{rx}$ = Efficiencies (dB)
- $L_{total}$ = Sum of all losses (Path Loss + Pointing Loss + Implementation Loss + Coupling Loss)

**Code Implementation:**
```python
received_power_dbm = (
    inputs.tx_power +
    tx_efficiency_db +
    rx_efficiency_db +
    tx_gain_db +
    rx_gain_db -
    total_loss_db
)
```

## 5. Link Margin
The safety margin above the receiver's sensitivity threshold.
- **Formula:** $Margin = P_{rx} - Sensitivity_{rx}$
- **Result:**
  - $> 0$ dB: **Link Viable**
  - $< 0$ dB: **Link Not Viable**
