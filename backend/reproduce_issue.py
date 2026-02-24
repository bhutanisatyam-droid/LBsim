import math
import sys

# Define the fixed function (simulated)
def calculate_pointing_loss_fixed(gain_abs, error_rad):
    if error_rad is None or error_rad == 0:
        return 0.0
        
    exponent = -gain_abs * (error_rad ** 2)
    
    print(f"DEBUG: Gain={gain_abs}, Error={error_rad}, Exponent={exponent}")
    
    if exponent < -700:
        return 1000.0
        
    loss_linear = math.exp(exponent)
    
    if loss_linear <= 0:
         return 1000.0

    loss_db = 10 * math.log10(loss_linear)
    return abs(loss_db)

# Define the original broken function (simulated)
def calculate_pointing_loss_original(gain_abs, error_rad):
    if error_rad is None or error_rad == 0:
        return 0.0
        
    loss_linear = math.exp(-gain_abs * (error_rad ** 2))
    loss_db = 10 * math.log10(loss_linear)
    return abs(loss_db)

# Test Parameters causing crash
# Scenario: Rx Diameter = 5m at 1550nm -> Massive Gain
wavelength = 1550e-9
rx_diameter = 5.0
PI = 3.14159265359

# Calculate Gain
rx_gain_abs = (PI * rx_diameter / wavelength) ** 2
print(f"Rx Gain (Absolute): {rx_gain_abs:.2e}")

# Scenario: Pointing error of 5 microradians
error_rad = 5e-6 

print("-" * 30)
print("Testing Original Function:")
try:
    loss = calculate_pointing_loss_original(rx_gain_abs, error_rad)
    print(f"Result: {loss} dB")
except ValueError as e:
    print(f"CRASHED as expected: {e}")
except Exception as e:
    print(f"CRASHED with: {e}")

print("-" * 30)
print("Testing Fixed Function:")
try:
    loss = calculate_pointing_loss_fixed(rx_gain_abs, error_rad)
    print(f"Result: {loss} dB")
    if loss == 1000.0:
        print("SUCCESS: Handled safe fallback.")
    else:
        print("SUCCESS: Calculated value.")
except Exception as e:
    print(f"FAILED: {e}")
