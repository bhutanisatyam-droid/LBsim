"""
Optical Link Budget Calculator - Core Calculations
Matches MATLAB script for Optical ISL LEO to GEO Power Analytics
"""

import math

class OpticalLinkCalculator:
    """
    Complete optical link budget calculator with all formulas from MATLAB
    """
    
    def __init__(self):
        self.pi = math.pi
        self.c = 3e8  # Speed of light in m/s
    
    def db_to_linear(self, db_value):
        """Convert dB to linear scale"""
        return 10 ** (db_value / 10)
    
    def linear_to_db(self, linear_value):
        """Convert linear to dB scale"""
        if linear_value <= 0:
            raise ValueError("Linear value must be positive")
        return 10 * math.log10(linear_value)
    
    def mw_to_dbm(self, mw):
        """Convert milliwatts to dBm"""
        if mw <= 0:
            raise ValueError("Power must be positive")
        return 10 * math.log10(mw)
    
    def dbm_to_mw(self, dbm):
        """Convert dBm to milliwatts"""
        return 10 ** (dbm / 10)
    
    def w_to_dbm(self, watts):
        """Convert watts to dBm"""
        return self.mw_to_dbm(watts * 1000)
    
    def dbm_to_w(self, dbm):
        """Convert dBm to watts"""
        return self.dbm_to_mw(dbm) / 1000
    
    def calculate_beam_divergence(self, wavelength_m, diameter_m):
        """
        Calculate beam divergence (theta)
        Formula: theta = 2.44 * (wavelength / diameter)
        
        Args:
            wavelength_m: Wavelength in meters
            diameter_m: Telescope diameter in meters
            
        Returns:
            Beam divergence in radians
        """
        if diameter_m <= 0:
            raise ValueError("Diameter must be positive")
        
        theta = 2.44 * (wavelength_m / diameter_m)
        return theta
    
    def calculate_antenna_gain(self, efficiency, wavelength_m, diameter_m):
        """
        Calculate antenna gain in dB
        Formula: G = 10*log10(efficiency * (pi*D/wavelength)^2)
        
        Args:
            efficiency: Telescope efficiency (0-1)
            wavelength_m: Wavelength in meters
            diameter_m: Telescope diameter in meters
            
        Returns:
            Antenna gain in dB
        """
        if efficiency <= 0 or efficiency > 1:
            raise ValueError("Efficiency must be between 0 and 1")
        if diameter_m <= 0:
            raise ValueError("Diameter must be positive")
        if wavelength_m <= 0:
            raise ValueError("Wavelength must be positive")
        
        # Absolute gain value
        gain_abs = efficiency * ((self.pi * diameter_m / wavelength_m) ** 2)
        
        # Convert to dB
        gain_db = self.linear_to_db(gain_abs)
        
        return gain_db, gain_abs
    
    def calculate_free_space_path_loss(self, distance_m, wavelength_m):
        """
        Calculate Free Space Path Loss (FSPL)
        Formula: FSPL = 10*log10((4*pi*distance/wavelength)^2)
        
        Args:
            distance_m: Distance in meters
            wavelength_m: Wavelength in meters
            
        Returns:
            Path loss in dB
        """
        if distance_m <= 0:
            raise ValueError("Distance must be positive")
        if wavelength_m <= 0:
            raise ValueError("Wavelength must be positive")
        
        # FSPL formula
        fspl = ((4 * self.pi * distance_m) / wavelength_m) ** 2
        fspl_db = self.linear_to_db(fspl)
        
        return fspl_db
    
    def calculate_link_budget(self, params):
        """
        Complete link budget calculation
        
        Args:
            params: Dictionary containing all input parameters
            
        Returns:
            Dictionary with all calculated results
        """
        # Extract and convert all inputs to standard units
        
        # Transmitter power in dBm
        p_tx_dbm = params['tx_power_dbm']
        
        # Efficiencies (0-1 scale)
        tx_efficiency = params['tx_efficiency']
        rx_efficiency = params['rx_efficiency']
        
        # Wavelength in meters
        wavelength_m = params['wavelength_m']
        
        # Diameters in meters
        tx_diameter_m = params['tx_diameter_m']
        rx_diameter_m = params['rx_diameter_m']
        
        # Distance in meters
        distance_m = params['distance_m']
        
        # Optional losses in dB (default to 0)
        impl_loss_db = params.get('implementation_loss_db', 0)
        coupling_loss_db = params.get('coupling_loss_db', 0)
        tx_pointing_loss_db = params.get('tx_pointing_loss_db', 0)
        rx_pointing_loss_db = params.get('rx_pointing_loss_db', 0)
        
        # Receiver sensitivity in dBm (if provided)
        p_rx_sensitivity_dbm = params.get('rx_sensitivity_dbm', None)
        
        # Calculate beam divergences
        tx_theta = self.calculate_beam_divergence(wavelength_m, tx_diameter_m)
        rx_theta = self.calculate_beam_divergence(wavelength_m, rx_diameter_m)
        
        # Calculate antenna gains
        g_tx_db, g_tx_abs = self.calculate_antenna_gain(tx_efficiency, wavelength_m, tx_diameter_m)
        g_rx_db, g_rx_abs = self.calculate_antenna_gain(rx_efficiency, wavelength_m, rx_diameter_m)
        
        # Calculate free space path loss
        path_loss_db = self.calculate_free_space_path_loss(distance_m, wavelength_m)
        
        # Calculate total losses
        total_loss_db = (
            path_loss_db + 
            impl_loss_db + 
            coupling_loss_db + 
            tx_pointing_loss_db + 
            rx_pointing_loss_db
        )
        
        # Calculate received power
        # P_rcvd = P_tx + G_tx + G_rx - Total_Losses
        rcvd_power_dbm = p_tx_dbm + g_tx_db + g_rx_db - total_loss_db
        rcvd_power_mw = self.dbm_to_mw(rcvd_power_dbm)
        rcvd_power_w = self.dbm_to_w(rcvd_power_dbm)
        
        # Calculate link margin if receiver sensitivity is provided
        link_margin_db = None
        if p_rx_sensitivity_dbm is not None:
            link_margin_db = rcvd_power_dbm - p_rx_sensitivity_dbm
        
        # Prepare results
        results = {
            # Input echo (for confirmation)
            'inputs': {
                'tx_power_dbm': p_tx_dbm,
                'tx_power_mw': self.dbm_to_mw(p_tx_dbm),
                'tx_efficiency_percent': tx_efficiency * 100,
                'rx_efficiency_percent': rx_efficiency * 100,
                'wavelength_nm': wavelength_m * 1e9,
                'wavelength_m': wavelength_m,
                'tx_diameter_m': tx_diameter_m,
                'rx_diameter_m': rx_diameter_m,
                'distance_m': distance_m,
                'distance_km': distance_m / 1000,
                'rx_sensitivity_dbm': p_rx_sensitivity_dbm
            },
            
            # Intermediate calculations
            'antenna_gains': {
                'tx_gain_db': g_tx_db,
                'tx_gain_abs': g_tx_abs,
                'rx_gain_db': g_rx_db,
                'rx_gain_abs': g_rx_abs
            },
            
            'beam_divergence': {
                'tx_theta_rad': tx_theta,
                'tx_theta_deg': math.degrees(tx_theta),
                'tx_theta_mrad': tx_theta * 1000,
                'rx_theta_rad': rx_theta,
                'rx_theta_deg': math.degrees(rx_theta),
                'rx_theta_mrad': rx_theta * 1000
            },
            
            'losses': {
                'path_loss_db': path_loss_db,
                'implementation_loss_db': impl_loss_db,
                'coupling_loss_db': coupling_loss_db,
                'tx_pointing_loss_db': tx_pointing_loss_db,
                'rx_pointing_loss_db': rx_pointing_loss_db,
                'total_loss_db': total_loss_db
            },
            
            # Final results
            'received_power': {
                'power_dbm': rcvd_power_dbm,
                'power_mw': rcvd_power_mw,
                'power_w': rcvd_power_w
            },
            
            'link_margin': {
                'margin_db': link_margin_db,
                'margin_available': link_margin_db is not None,
                'link_viable': link_margin_db > 0 if link_margin_db is not None else None
            }
        }
        
        return results
    
    def validate_inputs(self, params):
        """
        Validate all input parameters
        
        Args:
            params: Dictionary of input parameters
            
        Returns:
            Tuple of (is_valid, error_message)
        """
        errors = []
        
        # Check required fields
        required_fields = [
            'tx_power_dbm', 'tx_efficiency', 'rx_efficiency',
            'wavelength_m', 'tx_diameter_m', 'rx_diameter_m', 'distance_m'
        ]
        
        for field in required_fields:
            if field not in params:
                errors.append(f"Missing required field: {field}")
        
        if errors:
            return False, "; ".join(errors)
        
        # Validate ranges
        if not (0 < params['tx_efficiency'] <= 1):
            errors.append("TX efficiency must be between 0 and 1")
        
        if not (0 < params['rx_efficiency'] <= 1):
            errors.append("RX efficiency must be between 0 and 1")
        
        if params['wavelength_m'] <= 0:
            errors.append("Wavelength must be positive")
        
        if params['tx_diameter_m'] <= 0:
            errors.append("TX diameter must be positive")
        
        if params['rx_diameter_m'] <= 0:
            errors.append("RX diameter must be positive")
        
        if params['distance_m'] <= 0:
            errors.append("Distance must be positive")
        
        if errors:
            return False, "; ".join(errors)
        
        return True, None
