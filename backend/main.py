"""
FastAPI Server for Optical Link Budget Calculator
"""

from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field, validator
from typing import Optional, Dict, Any
import uvicorn
from datetime import datetime
import json
import os

from calculations import OpticalLinkCalculator

# Initialize FastAPI app
app = FastAPI(
    title="Optical Link Budget Calculator API",
    description="Calculate optical communication link budgets with detailed analysis",
    version="2.0.0"
)

# Enable CORS for web access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific domains
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize calculator
calculator = OpticalLinkCalculator()

# Create storage directory for saved calculations
STORAGE_DIR = "saved_calculations"
os.makedirs(STORAGE_DIR, exist_ok=True)


# ============= DATA MODELS =============

class LinkBudgetInput(BaseModel):
    """Input model for link budget calculation"""

    # Transmitter parameters
    tx_power_dbm: float = Field(..., description="Transmitter power in dBm")
    tx_efficiency: float = Field(..., ge=0, le=1, description="Transmitter efficiency (0-1)")
    tx_diameter_m: float = Field(..., gt=0, description="Transmitter diameter in meters")

    # Receiver parameters
    rx_efficiency: float = Field(..., ge=0, le=1, description="Receiver efficiency (0-1)")
    rx_diameter_m: float = Field(..., gt=0, description="Receiver diameter in meters")
    rx_sensitivity_dbm: Optional[float] = Field(None, description="Receiver sensitivity in dBm")

    # NEW: Rx Optical LNA gain (dB). Set to 0 if no LNA is used.
    rx_lna_gain_db: Optional[float] = Field(0.0, ge=0, description="Rx Optical LNA gain in dB (0 = no LNA)")

    # Link parameters
    wavelength_m: float = Field(..., gt=0, description="Optical wavelength in meters")
    distance_m: float = Field(..., gt=0, description="Link distance in meters")

    # Optional losses (all in dB)
    implementation_loss_db: Optional[float] = Field(0, ge=0, description="Implementation loss in dB")
    coupling_loss_db: Optional[float] = Field(0, ge=0, description="Coupling loss in dB")
    tx_pointing_loss_db: Optional[float] = Field(0, ge=0, description="TX pointing loss in dB")
    rx_pointing_loss_db: Optional[float] = Field(0, ge=0, description="RX pointing loss in dB")

    class Config:
        schema_extra = {
            "example": {
                "tx_power_dbm": 34,
                "tx_efficiency": 0.5,
                "tx_diameter_m": 0.15,
                "rx_efficiency": 0.5,
                "rx_diameter_m": 0.15,
                "rx_sensitivity_dbm": -60,
                "rx_lna_gain_db": 20,
                "wavelength_m": 1.55e-6,
                "distance_m": 40000000,
                "implementation_loss_db": 1,
                "coupling_loss_db": 4,
                "tx_pointing_loss_db": 1.5,
                "rx_pointing_loss_db": 1.5
            }
        }


class SaveCalculationRequest(BaseModel):
    """Request model for saving a calculation"""
    calculation_name: str = Field(..., min_length=1, max_length=100)
    inputs: LinkBudgetInput
    results: Dict[str, Any]
    notes: Optional[str] = Field(None, max_length=500)


# ============= HELPER: flatten nested results for frontend =============

def flatten_results(raw: dict) -> dict:
    """
    The calculator returns a nested dict. The frontend expects a flat dict.
    This function produces the flat output format consumed by displayResults().
    """
    inp  = raw.get('inputs', {})
    ag   = raw.get('antenna_gains', {})
    bd   = raw.get('beam_divergence', {})
    ls   = raw.get('losses', {})
    rp   = raw.get('received_power', {})
    rpl  = raw.get('received_power_with_lna', {})
    lm   = raw.get('link_margin', {})

    rx_sens_dbm = inp.get('rx_sensitivity_dbm')
    rx_sens_mw  = calculator.dbm_to_mw(rx_sens_dbm) if rx_sens_dbm is not None else None

    return {
        # Input echo
        "tx_power_dbm":            inp.get('tx_power_dbm'),
        "tx_power_mw":             inp.get('tx_power_mw'),
        "rx_sensitivity_dbm":      rx_sens_dbm,
        "rx_sensitivity_mw":       rx_sens_mw,
        "rx_lna_gain_db":          inp.get('rx_lna_gain_db', 0),
        "distance_m":              inp.get('distance_m'),
        "distance_km":             inp.get('distance_km'),
        "wavelength_nm":           inp.get('wavelength_nm'),
        "tx_efficiency_percent":   inp.get('tx_efficiency_percent'),
        "rx_efficiency_percent":   inp.get('rx_efficiency_percent'),

        # Gains
        "tx_gain_db":              ag.get('tx_gain_db'),
        "tx_gain_absolute":        ag.get('tx_gain_abs'),
        "rx_gain_db":              ag.get('rx_gain_db'),
        "rx_gain_absolute":        ag.get('rx_gain_abs'),

        # Beam divergence
        "tx_beam_divergence_rad":  bd.get('tx_theta_rad'),
        "tx_beam_divergence_deg":  bd.get('tx_theta_deg'),
        "rx_beam_divergence_rad":  bd.get('rx_theta_rad'),
        "rx_beam_divergence_deg":  bd.get('rx_theta_deg'),

        # Losses
        "path_loss_db":            ls.get('path_loss_db'),
        "impl_loss_db":            ls.get('implementation_loss_db'),
        "coupling_loss_db":        ls.get('coupling_loss_db'),
        "tx_pointing_loss_db":     ls.get('tx_pointing_loss_db'),
        "rx_pointing_loss_db":     ls.get('rx_pointing_loss_db'),
        "total_loss_db":           ls.get('total_loss_db'),

        # 1. Rx power WITHOUT LNA
        "received_power_dbm":      rp.get('power_dbm'),
        "received_power_mw":       rp.get('power_mw'),
        "received_power_w":        rp.get('power_w'),

        # 2. Rx power WITH LNA
        "received_power_lna_dbm":  rpl.get('power_dbm'),
        "received_power_lna_mw":   rpl.get('power_mw'),
        "received_power_lna_w":    rpl.get('power_w'),

        # 3. Link margin (after LNA)
        "link_margin_db":          lm.get('margin_db'),
        "link_viable":             lm.get('link_viable'),
    }


# ============= API ENDPOINTS =============

@app.get("/")
async def root():
    return {
        "message": "Optical Link Budget Calculator API",
        "version": "2.0.0",
        "endpoints": {
            "calculate":  "/api/calculate",
            "save":       "/api/save",
            "list":       "/api/saved",
            "load":       "/api/load/{filename}",
            "delete":     "/api/delete/{filename}",
            "export_pdf": "/api/generate-pdf",
            "health":     "/health"
        }
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}


@app.post("/api/calculate")
async def calculate_link_budget(inputs: LinkBudgetInput):
    """
    Calculate optical link budget.

    Returns:
      - outputs.received_power_dbm / _mw      : Rx power WITHOUT LNA
      - outputs.received_power_lna_dbm / _mw  : Rx power WITH LNA
      - outputs.link_margin_db                 : Link margin (after LNA)
    """
    try:
        params = inputs.dict()

        is_valid, error_msg = calculator.validate_inputs(params)
        if not is_valid:
            raise HTTPException(status_code=400, detail=error_msg)

        raw_results = calculator.calculate_link_budget(params)
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
    """Save a calculation to local storage."""
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

        return {
            "success":   True,
            "message":   "Calculation saved successfully",
            "filename":  filename,
            "timestamp": save_data["timestamp"]
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving calculation: {str(e)}")


@app.get("/api/saved")
async def list_saved_calculations():
    """List all saved calculations."""
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
        raise HTTPException(status_code=500, detail=f"Error listing calculations: {str(e)}")


@app.get("/api/load/{filename}")
async def load_calculation(filename: str):
    """Load a specific saved calculation."""
    try:
        filepath = os.path.join(STORAGE_DIR, filename)
        if not os.path.exists(filepath):
            raise HTTPException(status_code=404, detail="Calculation not found")
        with open(filepath, 'r') as f:
            data = json.load(f)
        return {"success": True, "data": data}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Calculation not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading calculation: {str(e)}")


@app.delete("/api/delete/{filename}")
async def delete_calculation(filename: str):
    """Delete a saved calculation."""
    try:
        filepath = os.path.join(STORAGE_DIR, filename)
        if not os.path.exists(filepath):
            raise HTTPException(status_code=404, detail="Calculation not found")
        os.remove(filepath)
        return {"success": True, "message": "Calculation deleted successfully"}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Calculation not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting calculation: {str(e)}")


@app.post("/api/convert/power")
async def convert_power(
    value: float = Body(...),
    from_unit: str = Body(...),
    to_unit: str = Body(...)
):
    """Convert power between units (dBm, mW, W)."""
    try:
        if from_unit.lower() == "dbm":
            dbm = value
        elif from_unit.lower() == "mw":
            dbm = calculator.mw_to_dbm(value)
        elif from_unit.lower() == "w":
            dbm = calculator.w_to_dbm(value)
        else:
            raise HTTPException(status_code=400, detail=f"Unknown unit: {from_unit}")

        if to_unit.lower() == "dbm":
            result = dbm
        elif to_unit.lower() == "mw":
            result = calculator.dbm_to_mw(dbm)
        elif to_unit.lower() == "w":
            result = calculator.dbm_to_w(dbm)
        else:
            raise HTTPException(status_code=400, detail=f"Unknown unit: {to_unit}")

        return {
            "success": True,
            "input":   {"value": value, "unit": from_unit},
            "output":  {"value": result, "unit": to_unit}
        }

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Conversion error: {str(e)}")


# PDF endpoint is registered by pdf_generator
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
