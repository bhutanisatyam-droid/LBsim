import math

# ============= INLINE CALCULATIONS CONVERTED WITH DETAILED EXPLANATIONS =============

# Pi is used in several geometric calculations for circular apertures (antennas)
PI = math.pi

# -----------------------------------------------------------------------------
# Utility Functions for Unit Conversions
# -----------------------------------------------------------------------------

def dbm_to_mw(dbm):
    # Converts power from Decibels relative to 1 milliwatt (dBm) to milliwatts (mW)
    # The formula is: P(mW) = 10^(P(dBm) / 10)
    # 0 dBm = 1 mW, 10 dBm = 10 mW, -10 dBm = 0.1 mW, etc.
    return 10 ** (dbm / 10)

def mw_to_dbm(mw):
    # Converts power from milliwatts (mW) to Decibels relative to 1 milliwatt (dBm)
    # This is the inverse of the above function.
    # Logarithms are only defined for positive values, hence the safeguard.
    if mw <= 0:
        raise ValueError("Power must be positive")
    return 10 * math.log10(mw)

def dbm_to_w(dbm):
    # Converts dBm to Watts (W).
    # First converts dBm to mW, then divides by 1000 since there are 1000 mW in 1 W.
    return dbm_to_mw(dbm) / 1000

def w_to_dbm(watts):
    # Converts Watts to dBm.
    # First multiplies by 1000 to get mW, then converts mW to dBm.
    return mw_to_dbm(watts * 1000)

def linear_to_db(linear_value):
    # Converts a generic linear ratio (like gain or loss factor) to Decibels (dB).
    # dB is 10 * log10(Linear_Ratio).
    if linear_value <= 0:
        raise ValueError("Linear value must be positive")
    return 10 * math.log10(linear_value)

# -----------------------------------------------------------------------------
# Core Physics Calculations for Optical Communication
# -----------------------------------------------------------------------------

def calculate_beam_divergence(wavelength_m, diameter_m):
    # Calculates the full divergence angle (theta) of a diffraction-limited laser beam.
    # The formula '2.44 * (wavelength / diameter)' gives the divergence in radians 
    # to the first null of an Airy disk (for a circular aperture uniformly illuminated).
    # Wavelength and diameter must be in the same units (meters).
    return 2.44 * (wavelength_m / diameter_m)

def calculate_antenna_gain(efficiency, wavelength_m, diameter_m):
    # Calculates the physical optical antenna (telescope) gain.
    # It relates the directional concentration of optical power to an isotropic radiator.
    # Absolute gain G = Efficiency * (pi * D / lambda)^2
    gain_abs = efficiency * ((PI * diameter_m / wavelength_m) ** 2)
    # Convert the absolute linear gain multiplier to a logarithmic dB scale
    gain_db  = linear_to_db(gain_abs)
    # Return both the logarithmic value and the linear multiplier
    return gain_db, gain_abs

def calculate_free_space_path_loss(distance_m, wavelength_m):
    # Calculates Free Space Path Loss (FSPL) - the attenuation of energy simply 
    # due to the geometric spreading of the wavefront over distance in free space.
    # Linear FSPL = (4 * pi * d / lambda)^2
    fspl    = ((4 * PI * distance_m) / wavelength_m) ** 2
    # Convert the loss factor to decibels (dB)
    fspl_db = linear_to_db(fspl)
    return fspl_db

def calculate_pointing_loss(gain_abs, error_rad):
    # Calculates pointing constraint loss caused by misalignment of the beam.
    # error_rad is the pointing error angle in radians.
    # If there is no pointing error, the loss is automatically 0 dB.
    if not error_rad or error_rad <= 0:
        return 0.0
        
    # The linear alignment loss factor follows a Gaussian beam approximation profile.
    # The theoretical fraction of power retained is approximated by: exp(-Gain * error_angle^2).
    exponent = -gain_abs * (error_rad ** 2)
    
    # Python's math.exp() will crash (math domain error) if the exponent is too highly negative.
    # This happens for massive telescopes at huge pointing errors (exponent < -709).
    # We add this safeguard to catch it early and return an effectively infinite loss (1000 dB).
    if exponent < -700:
        return 1000.0
        
    # Calculate the linear fractional amount of power surviving the pointing error
    loss_linear = math.exp(exponent)
    
    # Another safeguard. If linear survival power is effectively 0, loss is infinite.
    if loss_linear <= 0:
         return 1000.0

    # Convert the linear power fraction back into a positive dB loss magnitude.
    loss_db = 10 * math.log10(loss_linear)
    return abs(loss_db)


# -----------------------------------------------------------------------------
# Main Budget Calculation Aggregator
# -----------------------------------------------------------------------------

def calculate_link_budget(params):
    # 1. We first extract all base variables from the user parameters input dictionary
    p_tx_dbm             = params['tx_power_dbm']          # Transmit power in dBm
    tx_efficiency        = params['tx_efficiency']         # Tx optics efficiency (0 to 1)
    rx_efficiency        = params['rx_efficiency']         # Rx optics efficiency (0 to 1)
    wavelength_m         = params['wavelength_m']          # Laser wavelength in meters
    tx_diameter_m        = params['tx_diameter_m']         # Tx aperture diameter in meters
    rx_diameter_m        = params['rx_diameter_m']         # Rx aperture diameter in meters
    distance_m           = params['distance_m']            # Distance between Tx and Rx in meters
    
    # 2. Extract given external or static losses
    impl_loss_db         = params.get('implementation_loss_db', 0)     # Static implementation loss
    coupling_loss_db     = params.get('coupling_loss_db', 0)           # Static coupling/fiber loss
    
    # Extra static pointing losses initially grabbed assuming purely manual entry
    tx_pointing_loss_db  = params.get('tx_pointing_loss_db', 0)
    rx_pointing_loss_db  = params.get('rx_pointing_loss_db', 0)
    
    # Look for dynamically entered pointing error radians
    tx_pointing_error_rad= params.get('tx_pointing_error_rad', None)
    rx_pointing_error_rad= params.get('rx_pointing_error_rad', None)
    
    # Extract Rx constraints and optional extra amplifications
    p_rx_sensitivity_dbm = params.get('rx_sensitivity_dbm', None)      # The minimum power needed for link
    rx_lna_gain_db       = params.get('rx_lna_gain_db', 0)             # Rx optical low-noise amp gain
    
    # -------------------------------------------------------------------------
    # Perform Step-by-Step System Math
    # -------------------------------------------------------------------------

    # A) Beam Divergences: purely informational to display to the user
    tx_theta = calculate_beam_divergence(wavelength_m, tx_diameter_m)
    rx_theta = calculate_beam_divergence(wavelength_m, rx_diameter_m)

    # B) Antenna Gains: Compute transmit and receive telescope gains (linear and dB)
    g_tx_db, g_tx_abs = calculate_antenna_gain(tx_efficiency, wavelength_m, tx_diameter_m)
    g_rx_db, g_rx_abs = calculate_antenna_gain(rx_efficiency, wavelength_m, rx_diameter_m)

    # C) Dynamic Pointing Loss: Optional override if angles were physically provided.
    # Uses the previously constructed 'calculate_pointing_loss' with linear gain and error angle.
    if tx_pointing_error_rad and tx_pointing_error_rad > 0:
        tx_pointing_loss_db = calculate_pointing_loss(g_tx_abs, tx_pointing_error_rad)
        
    if rx_pointing_error_rad and rx_pointing_error_rad > 0:
        rx_pointing_loss_db = calculate_pointing_loss(g_rx_abs, rx_pointing_error_rad)

    # D) Free Space Path Loss (FSPL): Attenuation strictly over distance metric
    path_loss_db = calculate_free_space_path_loss(distance_m, wavelength_m)

    # E) Total Losses Summation: Add all physical and static system losses together
    total_loss_db = (path_loss_db + impl_loss_db + coupling_loss_db +
                     tx_pointing_loss_db + rx_pointing_loss_db)

    # F) Link Equation (Received Power): 
    # Friis Transmission Equation applied conceptually to optics: 
    # P_rx(dB) = P_tx(dB) + G_tx(dB) + G_rx(dB) - Losses(dB)
    rcvd_power_dbm = p_tx_dbm + g_tx_db + g_rx_db - total_loss_db
    rcvd_power_mw  = dbm_to_mw(rcvd_power_dbm)        # Translate to mW for physical understanding
    rcvd_power_w   = dbm_to_w(rcvd_power_dbm)         # Translate to Watts

    # G) Rx LNA Amplification: 
    # The optical pre-amplifier boosts the photon/signal magnitude directly after Rx aperture capture
    rcvd_power_lna_dbm = rcvd_power_dbm + rx_lna_gain_db
    rcvd_power_lna_mw  = dbm_to_mw(rcvd_power_lna_dbm)
    rcvd_power_lna_w   = dbm_to_w(rcvd_power_lna_dbm)

    # H) Link Margin Viability:
    # Compares the final signal strength (AFTER the pre-amp LNA) against the minimum hardware requirement
    link_margin_db = None
    if p_rx_sensitivity_dbm is not None:
        link_margin_db = rcvd_power_lna_dbm - p_rx_sensitivity_dbm

    # Pack the results into a nested dictionary to be returned back to the API/Frontend to consume.
    # The formatting functions (like degrees to radians) simply give variations of the same information.
    return {
        'inputs': { ... },          # Echoes all input parameters back
        'antenna_gains': { ... },   # The G_tx and G_rx details 
        'beam_divergence': { ... }, # Results of calculate_beam_divergence
        'losses': { ... },          # All physical breakdown losses 
        'received_power': { ... },  # Power received BEFORE preamp LNA
        'received_power_with_lna': { ... }, # Power AFTER preamp LNA
        'link_margin': { ... }      # Margin (Rx power logic minus Sensitivity)
    }
