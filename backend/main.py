"""
Optical Link Budget Calculator - Backend API (Fixed Version)
FastAPI server with complete calculations matching MATLAB script
PDF generation integrated directly
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
import math
import json
from datetime import datetime
import os
import sys
import tempfile

# Resolve frontend directory path (works from any cwd)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")

# PDF Generation Imports
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.pdfgen import canvas
from reportlab.lib.enums import TA_CENTER

app = FastAPI(
    title="Optical Link Budget Calculator API",
    description="Calculate optical communication system parameters",
    version="1.0.0"
)

# CORS middleware for web access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Static file serving (for consolidated deployment) ---
@app.get("/")
async def serve_root():
    return FileResponse(os.path.join(FRONTEND_DIR, "index_v2.html"))

@app.get("/app_v2.js")
async def serve_app_js():
    return FileResponse(os.path.join(FRONTEND_DIR, "app_v2.js"))

@app.get("/sw.js")
async def serve_sw_js():
    return FileResponse(os.path.join(FRONTEND_DIR, "sw.js"))

@app.get("/manifest.json")
async def serve_manifest():
    return FileResponse(os.path.join(FRONTEND_DIR, "manifest.json"))

# Pydantic models for request/response validation
class CalculationInput(BaseModel):
    """Input parameters for link budget calculation"""
    tx_power: float = Field(..., description="Transmitter power in dBm")
    tx_efficiency: float = Field(..., description="Transmitter efficiency in %")
    rx_efficiency: float = Field(..., description="Receiver efficiency in %")
    rx_sensitivity: float = Field(..., description="Receiver sensitivity in dBm")
    wavelength: float = Field(..., description="Optical wavelength in nm")
    tx_diameter: float = Field(..., description="Transmitter diameter in meters")
    rx_diameter: float = Field(..., description="Receiver diameter in meters")
    distance: float = Field(..., description="Distance in meters")
    
    # Optional losses
    impl_loss: Optional[float] = Field(0.0, description="Implementation loss in dB")
    coupling_loss: Optional[float] = Field(0.0, description="Coupling loss in dB")
    tx_pointing_loss: Optional[float] = Field(0.0, description="Tx pointing loss in dB")
    rx_pointing_loss: Optional[float] = Field(0.0, description="Rx pointing loss in dB")
    
    # Optional Pointing Errors (in radians)
    tx_pointing_error_rad: Optional[float] = Field(None, description="Tx pointing error in radians")
    rx_pointing_error_rad: Optional[float] = Field(None, description="Rx pointing error in radians")

class CalculationResult(BaseModel):
    """Output results from calculation"""
    inputs: Dict[str, Any]
    outputs: Dict[str, float]
    timestamp: str
    success: bool

class SaveRequest(BaseModel):
    """Request to save a calculation"""
    calculation_data: CalculationResult
    notes: Optional[str] = None

# Constants
PI = 3.14159265359

# ============================================================================
# CONVERSION FUNCTIONS
# ============================================================================

def dbm_to_mw(dbm: float) -> float:
    """Convert dBm to milliwatts"""
    return 10 ** (dbm / 10)

def mw_to_dbm(mw: float) -> float:
    """Convert milliwatts to dBm"""
    return 10 * math.log10(mw)

def db_to_linear(db: float) -> float:
    """Convert dB to linear scale"""
    return 10 ** (db / 10)

def linear_to_db(linear: float) -> float:
    """Convert linear to dB"""
    return 10 * math.log10(linear)

# ============================================================================
# CORE CALCULATIONS (MATCHING MATLAB)
# ============================================================================

def calculate_tx_antenna_gain(diameter: float, wavelength_m: float) -> tuple:
    """Calculate Transmitter antenna gain (absolute and dB) using aperture diameter
    Formula: tx_absGain = (pi * tx_D / op_wv)^2"""
    gain_absolute = (PI * diameter / wavelength_m) ** 2
    gain_db = 10 * math.log10(gain_absolute)
    return gain_absolute, gain_db

def calculate_rx_antenna_gain(diameter: float, wavelength_m: float) -> tuple:
    """Calculate Receiver antenna gain (absolute and dB) using aperture diameter
    MATLAB: rx_absGain = (pi * rx_D / op_wv)^2"""
    gain_absolute = (PI * diameter / wavelength_m) ** 2
    gain_db = 10 * math.log10(gain_absolute)
    return gain_absolute, gain_db

def calculate_beam_divergence(wavelength_m: float, diameter: float) -> float:
    """Calculate beam divergence in radians"""
    return (2.44 * wavelength_m) / diameter

def calculate_pointing_loss(gain_abs: float, error_rad: float) -> float:
    """
    Calculate pointing loss from pointing error
    Formula: L = exp(-G * theta^2)
    Returns positive dB loss value
    """
    if error_rad is None or error_rad == 0:
        return 0.0
        
    # Python's math.exp raises OverflowError for very large inputs, 
    # but underflows to 0.0 for very small inputs (exponent < -700 approx).
    # If it underflows to 0.0, math.log10(0.0) raises ValueError: math domain error.
    exponent = -gain_abs * (error_rad ** 2)
    
    # If loss is extremely high (signal effectively zero), return capped max loss
    if exponent < -700:
        return 1000.0
        
    loss_linear = math.exp(exponent)
    
    # Extra safety check for 0.0
    if loss_linear <= 0:
         return 1000.0

    # Convert to dB (will be negative)
    loss_db = 10 * math.log10(loss_linear)
    # Return absolute value for link budget subtraction
    return abs(loss_db)

def calculate_free_space_path_loss(distance: float, wavelength_m: float) -> float:
    """Calculate free space path loss in dB"""
    fspl_db = 20 * math.log10((4 * PI * distance) / wavelength_m)
    return fspl_db

def calculate_link_budget(inputs: CalculationInput) -> Dict[str, float]:
    """Main link budget calculation function"""
    wavelength_m = inputs.wavelength * 1e-9
    
    # Calculate Beam Divergence (still returned in results)
    tx_beam_divergence = calculate_beam_divergence(wavelength_m, inputs.tx_diameter)
    rx_beam_divergence = calculate_beam_divergence(wavelength_m, inputs.rx_diameter)

    # Tx Gain uses Diameter - now matches Rx formula
    tx_gain_abs, tx_gain_db = calculate_tx_antenna_gain(
        inputs.tx_diameter, wavelength_m
    )
    
    # Rx Gain uses Diameter - MATLAB formula
    rx_gain_abs, rx_gain_db = calculate_rx_antenna_gain(
        inputs.rx_diameter, wavelength_m
    )
    
    # Calculate Pointing Losses (Prioritize Error Input)
    tx_pointing_loss_db = inputs.tx_pointing_loss
    if inputs.tx_pointing_error_rad is not None:
        tx_pointing_loss_db = calculate_pointing_loss(tx_gain_abs, inputs.tx_pointing_error_rad)
        
    rx_pointing_loss_db = inputs.rx_pointing_loss
    if inputs.rx_pointing_error_rad is not None:
        rx_pointing_loss_db = calculate_pointing_loss(rx_gain_abs, inputs.rx_pointing_error_rad)
    
    path_loss_db = calculate_free_space_path_loss(inputs.distance, wavelength_m)
    
    total_loss_db = (
        path_loss_db +
        inputs.impl_loss +
        inputs.coupling_loss +
        tx_pointing_loss_db +
        rx_pointing_loss_db
    )
    
    tx_efficiency_db = 10 * math.log10(inputs.tx_efficiency / 100)
    rx_efficiency_db = 10 * math.log10(inputs.rx_efficiency / 100)
    
    received_power_dbm = (
        inputs.tx_power +
        tx_efficiency_db +
        rx_efficiency_db +
        tx_gain_db +
        rx_gain_db -
        total_loss_db
    )
    
    received_power_mw = dbm_to_mw(received_power_dbm)
    link_margin_db = received_power_dbm - inputs.rx_sensitivity
    
    results = {
        "tx_power_dbm": inputs.tx_power,
        "tx_power_mw": dbm_to_mw(inputs.tx_power),
        "rx_sensitivity_dbm": inputs.rx_sensitivity,
        "rx_sensitivity_mw": dbm_to_mw(inputs.rx_sensitivity),
        "distance_m": inputs.distance,
        "distance_km": inputs.distance / 1000,
        "wavelength_nm": inputs.wavelength,
        "wavelength_m": wavelength_m,
        "tx_gain_absolute": tx_gain_abs,
        "tx_gain_db": tx_gain_db,
        "rx_gain_absolute": rx_gain_abs,
        "rx_gain_db": rx_gain_db,
        "tx_beam_divergence_rad": tx_beam_divergence,
        "tx_beam_divergence_deg": math.degrees(tx_beam_divergence),
        "rx_beam_divergence_rad": rx_beam_divergence,
        "rx_beam_divergence_deg": math.degrees(rx_beam_divergence),
        "path_loss_db": path_loss_db,
        "total_loss_db": total_loss_db,
        "impl_loss_db": inputs.impl_loss,
        "coupling_loss_db": inputs.coupling_loss,
        "tx_pointing_loss_db": tx_pointing_loss_db,
        "rx_pointing_loss_db": rx_pointing_loss_db,
        "tx_pointing_error_rad": inputs.tx_pointing_error_rad if inputs.tx_pointing_error_rad is not None else 0,
        "rx_pointing_error_rad": inputs.rx_pointing_error_rad if inputs.rx_pointing_error_rad is not None else 0,
        "tx_efficiency_percent": inputs.tx_efficiency,
        "tx_efficiency_db": tx_efficiency_db,
        "rx_efficiency_percent": inputs.rx_efficiency,
        "rx_efficiency_db": rx_efficiency_db,
        "received_power_dbm": received_power_dbm,
        "received_power_mw": received_power_mw,
        "received_power_w": received_power_mw / 1000,
        "link_margin_db": link_margin_db,
    }
    
    return results

# ============================================================================
# PDF GENERATION (INTEGRATED)
# ============================================================================

class WatermarkCanvas(canvas.Canvas):
    """Custom canvas class to add watermark to every page"""
    
    def __init__(self, *args, **kwargs):
        canvas.Canvas.__init__(self, *args, **kwargs)
        self.pages = []
    
    def showPage(self):
        self.pages.append(dict(self.__dict__))
        self._startPage()
    
    def save(self):
        num_pages = len(self.pages)
        for page_num, page in enumerate(self.pages, 1):
            self.__dict__.update(page)
            self.draw_watermark(page_num, num_pages)
            canvas.Canvas.showPage(self)
        canvas.Canvas.save(self)
    
    def draw_watermark(self, page_num, total_pages):
        self.saveState()
        self.setFillColorRGB(0.9, 0.9, 0.9, alpha=0.3)
        self.setFont("Helvetica-Bold", 60)
        self.translate(letter[0]/2, letter[1]/2)
        self.rotate(45)
        self.drawCentredString(0, 0, "OPTICAL LINK CALCULATOR")
        self.restoreState()
        
        self.saveState()
        self.setFillColorRGB(0.3, 0.3, 0.3)
        self.setFont("Helvetica", 8)
        self.drawString(0.5*inch, 0.5*inch, 
                       f"Generated by Optical Link Budget Calculator | {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        self.drawRightString(letter[0] - 0.5*inch, 0.5*inch, 
                            f"Page {page_num} of {total_pages}")
        self.restoreState()

def generate_pdf_report(calculation_data: dict, output_path: str):
    """Generate a professional PDF report with calculation results"""
    doc = SimpleDocTemplate(
        output_path,
        pagesize=letter,
        rightMargin=0.75*inch,
        leftMargin=0.75*inch,
        topMargin=1*inch,
        bottomMargin=1*inch
    )
    
    story = []
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Title'],
        fontSize=24,
        textColor=colors.HexColor('#007bff'),
        spaceAfter=30,
        alignment=TA_CENTER
    )
    
    heading_style = ParagraphStyle(
        'CustomHeading',
        parent=styles['Heading1'],
        fontSize=16,
        textColor=colors.HexColor('#007bff'),
        spaceAfter=12,
        spaceBefore=12
    )
    
    # Title
    title = Paragraph("Optical Link Budget Calculation Report", title_style)
    story.append(title)
    story.append(Spacer(1, 0.3*inch))
    
    timestamp = Paragraph(
        f"<b>Generated:</b> {datetime.now().strftime('%B %d, %Y at %H:%M:%S')}",
        styles['Normal']
    )
    story.append(timestamp)
    story.append(Spacer(1, 0.5*inch))
    
    inputs = calculation_data.get('inputs', {})
    outputs = calculation_data.get('outputs', {})
    
    # Link Margin Highlight
    story.append(Paragraph("Link Margin Analysis", heading_style))
    link_margin = outputs.get('link_margin_db', 0)
    
    if link_margin > 0:
        status_text = f"<font color='green'><b>LINK VIABLE</b></font><br/>Link Margin: <b>{link_margin:.2f} dB</b>"
    else:
        status_text = f"<font color='red'><b>LINK NOT VIABLE</b></font><br/>Link Margin: <b>{link_margin:.2f} dB</b>"
    
    story.append(Paragraph(status_text, styles['Normal']))
    story.append(Spacer(1, 0.3*inch))
    
    # Input Parameters
    story.append(Paragraph("Input Parameters", heading_style))
    
    input_data = [
        ['Parameter', 'Value', 'Unit'],
        ['Transmitter Power', f"{inputs.get('tx_power', 0):.2f}", 'dBm'],
        ['Tx Efficiency', f"{inputs.get('tx_efficiency', 0):.2f}", '%'],
        ['Rx Efficiency', f"{inputs.get('rx_efficiency', 0):.2f}", '%'],
        ['Receiver Sensitivity', f"{inputs.get('rx_sensitivity', 0):.2f}", 'dBm'],
        ['Wavelength', f"{inputs.get('wavelength', 0):.2f}", 'nm'],
        ['Tx Diameter', f"{inputs.get('tx_diameter', 0):.3f}", 'm'],
        ['Rx Diameter', f"{inputs.get('rx_diameter', 0):.3f}", 'm'],
        ['Distance', f"{inputs.get('distance', 0):.2f}", 'm'],
    ]
    
    input_table = Table(input_data, colWidths=[3.5*inch, 1.5*inch, 1*inch])
    input_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#007bff')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8f9fa')]),
    ]))
    
    story.append(input_table)
    story.append(Spacer(1, 0.3*inch))
    
    # Results
    story.append(Paragraph("Calculation Results", heading_style))
    
    result_data = [
        ['Parameter', 'Value'],
        ['Tx Gain', f"{outputs.get('tx_gain_db', 0):.2f} dB"],
        ['Rx Gain', f"{outputs.get('rx_gain_db', 0):.2f} dB"],
        ['Path Loss', f"{outputs.get('path_loss_db', 0):.2f} dB"],
        ['Total Loss', f"{outputs.get('total_loss_db', 0):.2f} dB"],
        ['Received Power', f"{outputs.get('received_power_dbm', 0):.2f} dBm"],
        ['Link Margin', f"{outputs.get('link_margin_db', 0):.2f} dB"],
    ]
    
    result_table = Table(result_data, colWidths=[3*inch, 3.5*inch])
    result_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#28a745')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('GRID', (0, 0), (-1, -1), 2, colors.black),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8f9fa')]),
    ]))
    
    story.append(result_table)
    
    doc.build(story, canvasmaker=WatermarkCanvas)
    return output_path

# ============================================================================
# API ENDPOINTS
# ============================================================================

@app.get("/")
async def root():
    """API root endpoint"""
    return {
        "message": "Optical Link Budget Calculator API",
        "version": "1.0.0",
        "endpoints": {
            "calculate": "/api/calculate",
            "generate_pdf": "/api/generate-pdf",
            "save": "/api/save",
            "history": "/api/history",
            "health": "/api/health"
        }
    }

@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}

@app.post("/api/calculate", response_model=CalculationResult)
async def calculate(inputs: CalculationInput):
    """Calculate optical link budget"""
    try:
        results = calculate_link_budget(inputs)
        response = CalculationResult(
            inputs=inputs.dict(),
            outputs=results,
            timestamp=datetime.now().isoformat(),
            success=True
        )
        return response
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Calculation error: {str(e)}")

@app.post("/api/generate-pdf")
async def generate_pdf(calculation_data: dict):
    """Generate PDF report for calculation"""
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as tmp:
            output_path = tmp.name
        
        generate_pdf_report(calculation_data, output_path)
        
        return FileResponse(
            output_path,
            media_type='application/pdf',
            filename=f"optical_link_calculation_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF generation error: {str(e)}")

@app.post("/api/save")
async def save_calculation(request: SaveRequest):
    """Save a calculation to local storage"""
    try:
        save_dir = "saved_calculations"
        os.makedirs(save_dir, exist_ok=True)
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"calculation_{timestamp}.json"
        filepath = os.path.join(save_dir, filename)
        
        save_data = {
            "calculation": request.calculation_data.dict(),
            "notes": request.notes,
            "saved_at": datetime.now().isoformat()
        }
        
        with open(filepath, 'w') as f:
            json.dump(save_data, f, indent=2)
        
        return {
            "success": True,
            "message": "Calculation saved successfully",
            "filename": filename,
            "filepath": filepath
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving calculation: {str(e)}")

@app.get("/api/history")
async def get_history():
    """Get list of saved calculations"""
    try:
        save_dir = "saved_calculations"
        
        if not os.path.exists(save_dir):
            return {"calculations": [], "count": 0}
        
        files = [f for f in os.listdir(save_dir) if f.endswith('.json')]
        files.sort(reverse=True)
        
        calculations = []
        for filename in files:
            filepath = os.path.join(save_dir, filename)
            try:
                with open(filepath, 'r') as f:
                    data = json.load(f)
                    calculations.append({
                        "filename": filename,
                        "timestamp": data.get("saved_at"),
                        "notes": data.get("notes"),
                        "preview": {
                            "tx_power": data["calculation"]["inputs"]["tx_power"],
                            "distance": data["calculation"]["inputs"]["distance"],
                            "link_margin": data["calculation"]["outputs"]["link_margin_db"]
                        }
                    })
            except Exception as e:
                print(f"Error reading {filename}: {e}")
                continue
        
        return {
            "calculations": calculations,
            "count": len(calculations)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving history: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    print("=" * 60)
    print("Optical Link Budget Calculator - Backend Server")
    print("=" * 60)
    print("Starting server...")
    print("API: http://localhost:8000")
    print("Docs: http://localhost:8000/docs")
    print("=" * 60)
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
