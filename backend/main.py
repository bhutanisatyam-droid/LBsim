"""
FastAPI Server for Optical Link Budget Calculator
All calculations included inline - no external module dependencies
"""

from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
import uvicorn
from datetime import datetime
import json
import os
import math

# Initialize FastAPI app
app = FastAPI(
    title="Optical Link Budget Calculator API",
    description="Calculate optical communication link budgets with detailed analysis",
    version="2.0.0"
)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Storage directory
STORAGE_DIR = "saved_calculations"
os.makedirs(STORAGE_DIR, exist_ok=True)


# ============= INLINE CALCULATIONS =============

PI = math.pi

def dbm_to_mw(dbm):
    return 10 ** (dbm / 10)

def mw_to_dbm(mw):
    if mw <= 0:
        raise ValueError("Power must be positive")
    return 10 * math.log10(mw)

def dbm_to_w(dbm):
    return dbm_to_mw(dbm) / 1000

def w_to_dbm(watts):
    return mw_to_dbm(watts * 1000)

def linear_to_db(linear_value):
    if linear_value <= 0:
        raise ValueError("Linear value must be positive")
    return 10 * math.log10(linear_value)

def calculate_beam_divergence(wavelength_m, diameter_m):
    """theta = 2.44 * wavelength / diameter"""
    return 2.44 * (wavelength_m / diameter_m)

def calculate_antenna_gain(efficiency, wavelength_m, diameter_m):
    """G = efficiency * (pi * D / wavelength)^2"""
    gain_abs = efficiency * ((PI * diameter_m / wavelength_m) ** 2)
    gain_db  = linear_to_db(gain_abs)
    return gain_db, gain_abs

def calculate_free_space_path_loss(distance_m, wavelength_m):
    """FSPL = (4 * pi * distance / wavelength)^2"""
    fspl    = ((4 * PI * distance_m) / wavelength_m) ** 2
    fspl_db = linear_to_db(fspl)
    return fspl_db

def validate_inputs(params):
    errors = []
    required = ['tx_power_dbm', 'tx_efficiency', 'rx_efficiency',
                 'wavelength_m', 'tx_diameter_m', 'rx_diameter_m', 'distance_m']
    for field in required:
        if field not in params:
            errors.append(f"Missing required field: {field}")
    if errors:
        return False, "; ".join(errors)

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
    if params.get('rx_lna_gain_db', 0) < 0:
        errors.append("Rx LNA gain must be 0 or positive")

    if errors:
        return False, "; ".join(errors)
    return True, None

def calculate_link_budget(params):
    """
    Full link budget calculation with LNA support.
    Returns:
      1. Rx power WITHOUT LNA
      2. Rx power WITH LNA
      3. Link margin (after LNA)
    """
    p_tx_dbm            = params['tx_power_dbm']
    tx_efficiency       = params['tx_efficiency']
    rx_efficiency       = params['rx_efficiency']
    wavelength_m        = params['wavelength_m']
    tx_diameter_m       = params['tx_diameter_m']
    rx_diameter_m       = params['rx_diameter_m']
    distance_m          = params['distance_m']
    impl_loss_db        = params.get('implementation_loss_db', 0)
    coupling_loss_db    = params.get('coupling_loss_db', 0)
    tx_pointing_loss_db = params.get('tx_pointing_loss_db', 0)
    rx_pointing_loss_db = params.get('rx_pointing_loss_db', 0)
    p_rx_sensitivity_dbm = params.get('rx_sensitivity_dbm', None)
    rx_lna_gain_db      = params.get('rx_lna_gain_db', 0)

    # Beam divergence
    tx_theta = calculate_beam_divergence(wavelength_m, tx_diameter_m)
    rx_theta = calculate_beam_divergence(wavelength_m, rx_diameter_m)

    # Antenna gains
    g_tx_db, g_tx_abs = calculate_antenna_gain(tx_efficiency, wavelength_m, tx_diameter_m)
    g_rx_db, g_rx_abs = calculate_antenna_gain(rx_efficiency, wavelength_m, rx_diameter_m)

    # Free space path loss
    path_loss_db = calculate_free_space_path_loss(distance_m, wavelength_m)

    # Total losses
    total_loss_db = (path_loss_db + impl_loss_db + coupling_loss_db +
                     tx_pointing_loss_db + rx_pointing_loss_db)

    # 1. Rx power WITHOUT LNA
    rcvd_power_dbm = p_tx_dbm + g_tx_db + g_rx_db - total_loss_db
    rcvd_power_mw  = dbm_to_mw(rcvd_power_dbm)
    rcvd_power_w   = dbm_to_w(rcvd_power_dbm)

    # 2. Rx power WITH LNA
    rcvd_power_lna_dbm = rcvd_power_dbm + rx_lna_gain_db
    rcvd_power_lna_mw  = dbm_to_mw(rcvd_power_lna_dbm)
    rcvd_power_lna_w   = dbm_to_w(rcvd_power_lna_dbm)

    # 3. Link margin (after LNA)
    link_margin_db = None
    if p_rx_sensitivity_dbm is not None:
        link_margin_db = rcvd_power_lna_dbm - p_rx_sensitivity_dbm

    return {
        'inputs': {
            'tx_power_dbm':          p_tx_dbm,
            'tx_power_mw':           dbm_to_mw(p_tx_dbm),
            'tx_efficiency_percent': tx_efficiency * 100,
            'rx_efficiency_percent': rx_efficiency * 100,
            'wavelength_nm':         wavelength_m * 1e9,
            'wavelength_m':          wavelength_m,
            'tx_diameter_m':         tx_diameter_m,
            'rx_diameter_m':         rx_diameter_m,
            'distance_m':            distance_m,
            'distance_km':           distance_m / 1000,
            'rx_sensitivity_dbm':    p_rx_sensitivity_dbm,
            'rx_lna_gain_db':        rx_lna_gain_db,
        },
        'antenna_gains': {
            'tx_gain_db':  g_tx_db,
            'tx_gain_abs': g_tx_abs,
            'rx_gain_db':  g_rx_db,
            'rx_gain_abs': g_rx_abs,
        },
        'beam_divergence': {
            'tx_theta_rad': tx_theta,
            'tx_theta_deg': math.degrees(tx_theta),
            'rx_theta_rad': rx_theta,
            'rx_theta_deg': math.degrees(rx_theta),
        },
        'losses': {
            'path_loss_db':           path_loss_db,
            'implementation_loss_db': impl_loss_db,
            'coupling_loss_db':       coupling_loss_db,
            'tx_pointing_loss_db':    tx_pointing_loss_db,
            'rx_pointing_loss_db':    rx_pointing_loss_db,
            'total_loss_db':          total_loss_db,
        },
        'received_power': {
            'power_dbm': rcvd_power_dbm,
            'power_mw':  rcvd_power_mw,
            'power_w':   rcvd_power_w,
        },
        'received_power_with_lna': {
            'power_dbm': rcvd_power_lna_dbm,
            'power_mw':  rcvd_power_lna_mw,
            'power_w':   rcvd_power_lna_w,
        },
        'link_margin': {
            'margin_db':        link_margin_db,
            'margin_available': link_margin_db is not None,
            'link_viable':      link_margin_db > 0 if link_margin_db is not None else None,
        },
    }

def flatten_results(raw: dict) -> dict:
    """Flatten nested results dict into flat dict for frontend."""
    inp  = raw.get('inputs', {})
    ag   = raw.get('antenna_gains', {})
    bd   = raw.get('beam_divergence', {})
    ls   = raw.get('losses', {})
    rp   = raw.get('received_power', {})
    rpl  = raw.get('received_power_with_lna', {})
    lm   = raw.get('link_margin', {})

    rx_sens_dbm = inp.get('rx_sensitivity_dbm')
    rx_sens_mw  = dbm_to_mw(rx_sens_dbm) if rx_sens_dbm is not None else None

    return {
        "tx_power_dbm":           inp.get('tx_power_dbm'),
        "tx_power_mw":            inp.get('tx_power_mw'),
        "rx_sensitivity_dbm":     rx_sens_dbm,
        "rx_sensitivity_mw":      rx_sens_mw,
        "rx_lna_gain_db":         inp.get('rx_lna_gain_db', 0),
        "distance_m":             inp.get('distance_m'),
        "distance_km":            inp.get('distance_km'),
        "wavelength_nm":          inp.get('wavelength_nm'),
        "tx_efficiency_percent":  inp.get('tx_efficiency_percent'),
        "rx_efficiency_percent":  inp.get('rx_efficiency_percent'),
        "tx_gain_db":             ag.get('tx_gain_db'),
        "tx_gain_absolute":       ag.get('tx_gain_abs'),
        "rx_gain_db":             ag.get('rx_gain_db'),
        "rx_gain_absolute":       ag.get('rx_gain_abs'),
        "tx_beam_divergence_rad": bd.get('tx_theta_rad'),
        "tx_beam_divergence_deg": bd.get('tx_theta_deg'),
        "rx_beam_divergence_rad": bd.get('rx_theta_rad'),
        "rx_beam_divergence_deg": bd.get('rx_theta_deg'),
        "path_loss_db":           ls.get('path_loss_db'),
        "impl_loss_db":           ls.get('implementation_loss_db'),
        "coupling_loss_db":       ls.get('coupling_loss_db'),
        "tx_pointing_loss_db":    ls.get('tx_pointing_loss_db'),
        "rx_pointing_loss_db":    ls.get('rx_pointing_loss_db'),
        "total_loss_db":          ls.get('total_loss_db'),
        "received_power_dbm":     rp.get('power_dbm'),
        "received_power_mw":      rp.get('power_mw'),
        "received_power_w":       rp.get('power_w'),
        "received_power_lna_dbm": rpl.get('power_dbm'),
        "received_power_lna_mw":  rpl.get('power_mw'),
        "received_power_lna_w":   rpl.get('power_w'),
        "link_margin_db":         lm.get('margin_db'),
        "link_viable":            lm.get('link_viable'),
    }


# ============= DATA MODELS =============

class LinkBudgetInput(BaseModel):
    tx_power_dbm:           float            = Field(..., description="Transmitter power in dBm")
    tx_efficiency:          float            = Field(..., ge=0, le=1)
    tx_diameter_m:          float            = Field(..., gt=0)
    rx_efficiency:          float            = Field(..., ge=0, le=1)
    rx_diameter_m:          float            = Field(..., gt=0)
    rx_sensitivity_dbm:     Optional[float]  = Field(None)
    rx_lna_gain_db:         Optional[float]  = Field(0.0, ge=0)
    wavelength_m:           float            = Field(..., gt=0)
    distance_m:             float            = Field(..., gt=0)
    implementation_loss_db: Optional[float]  = Field(0, ge=0)
    coupling_loss_db:       Optional[float]  = Field(0, ge=0)
    tx_pointing_loss_db:    Optional[float]  = Field(0, ge=0)
    rx_pointing_loss_db:    Optional[float]  = Field(0, ge=0)


class SaveCalculationRequest(BaseModel):
    calculation_name: str            = Field(..., min_length=1, max_length=100)
    inputs:           LinkBudgetInput
    results:          Dict[str, Any]
    notes:            Optional[str]  = Field(None, max_length=500)


# ============= API ENDPOINTS =============

@app.get("/")
async def root():
    return {
        "message": "Optical Link Budget Calculator API",
        "version": "2.0.0"
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}


@app.post("/api/calculate")
async def calculate_link_budget_endpoint(inputs: LinkBudgetInput):
    try:
        params = inputs.dict()

        is_valid, error_msg = validate_inputs(params)
        if not is_valid:
            raise HTTPException(status_code=400, detail=error_msg)

        raw_results  = calculate_link_budget(params)
        flat_outputs = flatten_results(raw_results)

        return {
            "success":   True,
            "timestamp": datetime.now().isoformat(),
            "inputs":    inputs.dict(),
            "outputs":   flat_outputs
        }

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Calculation error: {str(e)}")


@app.post("/api/save")
async def save_calculation(request: SaveCalculationRequest):
    try:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_name = "".join(
            c for c in request.calculation_name if c.isalnum() or c in (' ', '-', '_')
        ).strip().replace(' ', '_')
        filename = f"{safe_name}_{timestamp}.json"
        filepath = os.path.join(STORAGE_DIR, filename)

        save_data = {
            "name":      request.calculation_name,
            "timestamp": datetime.now().isoformat(),
            "inputs":    request.inputs.dict(),
            "results":   request.results,
            "notes":     request.notes
        }

        with open(filepath, 'w') as f:
            json.dump(save_data, f, indent=2)

        return {"success": True, "message": "Saved successfully", "filename": filename}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving: {str(e)}")


@app.get("/api/saved")
async def list_saved_calculations():
    try:
        saved_calcs = []
        if os.path.exists(STORAGE_DIR):
            for filename in os.listdir(STORAGE_DIR):
                if filename.endswith('.json'):
                    filepath = os.path.join(STORAGE_DIR, filename)
                    try:
                        with open(filepath, 'r') as f:
                            data = json.load(f)
                            saved_calcs.append({
                                "filename":  filename,
                                "name":      data.get("name", "Unnamed"),
                                "timestamp": data.get("timestamp", "Unknown"),
                                "notes":     data.get("notes", "")
                            })
                    except Exception:
                        continue
        saved_calcs.sort(key=lambda x: x["timestamp"], reverse=True)
        return {"success": True, "count": len(saved_calcs), "calculations": saved_calcs}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing: {str(e)}")


@app.get("/api/load/{filename}")
async def load_calculation(filename: str):
    try:
        filepath = os.path.join(STORAGE_DIR, filename)
        if not os.path.exists(filepath):
            raise HTTPException(status_code=404, detail="Calculation not found")
        with open(filepath, 'r') as f:
            data = json.load(f)
        return {"success": True, "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading: {str(e)}")


@app.delete("/api/delete/{filename}")
async def delete_calculation(filename: str):
    try:
        filepath = os.path.join(STORAGE_DIR, filename)
        if not os.path.exists(filepath):
            raise HTTPException(status_code=404, detail="Calculation not found")
        os.remove(filepath)
        return {"success": True, "message": "Deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting: {str(e)}")


# PDF endpoint
from pdf_generator import create_pdf_endpoint
create_pdf_endpoint(app)


# ============= RUN SERVER =============

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
