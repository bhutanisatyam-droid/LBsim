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
    version="1.0.0"
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
    
    calculation_name: str = Field(..., min_length=1, max_length=100, description="Name for this calculation")
    inputs: LinkBudgetInput
    results: Dict[str, Any]
    notes: Optional[str] = Field(None, max_length=500, description="Optional notes")


# ============= API ENDPOINTS =============

@app.get("/")
async def root():
    """Root endpoint - API info"""
    return {
        "message": "Optical Link Budget Calculator API",
        "version": "1.0.0",
        "endpoints": {
            "calculate": "/api/calculate",
            "save": "/api/save",
            "list": "/api/saved",
            "load": "/api/load/{filename}",
            "delete": "/api/delete/{filename}",
            "export_pdf": "/api/export/pdf",
            "health": "/health"
        }
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat()
    }


@app.post("/api/calculate")
async def calculate_link_budget(inputs: LinkBudgetInput):
    """
    Calculate optical link budget
    
    Returns complete analysis including:
    - Antenna gains
    - Beam divergence
    - Path loss and total losses
    - Received power
    - Link margin (if receiver sensitivity provided)
    """
    try:
        # Convert input model to dict
        params = inputs.dict()
        
        # Validate inputs
        is_valid, error_msg = calculator.validate_inputs(params)
        if not is_valid:
            raise HTTPException(status_code=400, detail=error_msg)
        
        # Perform calculation
        results = calculator.calculate_link_budget(params)
        
        return {
            "success": True,
            "timestamp": datetime.now().isoformat(),
            "results": results
        }
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Calculation error: {str(e)}")


@app.post("/api/save")
async def save_calculation(request: SaveCalculationRequest):
    """
    Save a calculation to local storage
    
    User can save specific calculations they want to keep
    """
    try:
        # Create filename from name and timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_name = "".join(c for c in request.calculation_name if c.isalnum() or c in (' ', '-', '_')).strip()
        safe_name = safe_name.replace(' ', '_')
        filename = f"{safe_name}_{timestamp}.json"
        filepath = os.path.join(STORAGE_DIR, filename)
        
        # Prepare data to save
        save_data = {
            "name": request.calculation_name,
            "timestamp": datetime.now().isoformat(),
            "inputs": request.inputs.dict(),
            "results": request.results,
            "notes": request.notes
        }
        
        # Save to file
        with open(filepath, 'w') as f:
            json.dump(save_data, f, indent=2)
        
        return {
            "success": True,
            "message": "Calculation saved successfully",
            "filename": filename,
            "timestamp": save_data["timestamp"]
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving calculation: {str(e)}")


@app.get("/api/saved")
async def list_saved_calculations():
    """
    List all saved calculations
    
    Returns metadata of all saved calculations
    """
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
                                "filename": filename,
                                "name": data.get("name", "Unnamed"),
                                "timestamp": data.get("timestamp", "Unknown"),
                                "notes": data.get("notes", "")
                            })
                    except:
                        continue
        
        # Sort by timestamp (newest first)
        saved_calcs.sort(key=lambda x: x["timestamp"], reverse=True)
        
        return {
            "success": True,
            "count": len(saved_calcs),
            "calculations": saved_calcs
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing calculations: {str(e)}")


@app.get("/api/load/{filename}")
async def load_calculation(filename: str):
    """
    Load a specific saved calculation
    """
    try:
        filepath = os.path.join(STORAGE_DIR, filename)
        
        if not os.path.exists(filepath):
            raise HTTPException(status_code=404, detail="Calculation not found")
        
        with open(filepath, 'r') as f:
            data = json.load(f)
        
        return {
            "success": True,
            "data": data
        }
        
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Calculation not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading calculation: {str(e)}")


@app.delete("/api/delete/{filename}")
async def delete_calculation(filename: str):
    """
    Delete a saved calculation
    """
    try:
        filepath = os.path.join(STORAGE_DIR, filename)
        
        if not os.path.exists(filepath):
            raise HTTPException(status_code=404, detail="Calculation not found")
        
        os.remove(filepath)
        
        return {
            "success": True,
            "message": "Calculation deleted successfully"
        }
        
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
    """
    Convert power between units (dBm, mW, W)
    """
    try:
        # First convert to dBm
        if from_unit.lower() == "dbm":
            dbm = value
        elif from_unit.lower() == "mw":
            dbm = calculator.mw_to_dbm(value)
        elif from_unit.lower() == "w":
            dbm = calculator.w_to_dbm(value)
        else:
            raise HTTPException(status_code=400, detail=f"Unknown unit: {from_unit}")
        
        # Then convert to target unit
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
            "input": {"value": value, "unit": from_unit},
            "output": {"value": result, "unit": to_unit}
        }
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Conversion error: {str(e)}")


# ============= RUN SERVER =============

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,  # Auto-reload on code changes (development only)
        log_level="info"
    )
