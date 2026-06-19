# LBsim (Web Version): Optical Link Budget Estimation Tool

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**🌍 Live Web Version:** [https://lbsim.onrender.com](https://lbsim.onrender.com)

LBsim is a deterministic, open-source optical link budget analysis tool tailored for Optical Inter-Satellite Links (OISLs). This file documents the **web-based version** of the tool, built with a FastAPI Python backend and a lightweight HTML/JS frontend. It provides researchers with an accessible, high-performance alternative to heavy commercial simulation platforms directly from a web browser.

## Validation
LBsim has been rigorously validated against OptiSystem across 100+ randomized LEO-class configurations, demonstrating near-identical tracking:
- **Mean Absolute Error (MAE):** 0.018 dB
- **Mean Squared Error (MSE):** 3.334 × 10⁻⁴ dB²

## Features
- **Accurate Link Budget Math:** Includes detailed modeling of path loss, implementation loss, coupling loss, pointings errors, and efficiencies.
- **Dynamic Sweeps:** Supports 1D and 2D parameter sweeping to analyze performance bounds interactively.
- **Report Generation:** Generates comprehensive, downloadable PDF reports of simulations including inputs, outputs, and graphs.
- **FastAPI Backend:** Fast, asynchronous Python backend for robust calculation processing.

## Running the Web Version Locally

### Prerequisites
- Python 3.8+
- Modern Web Browser

### Setup Instructions

1. Clone the repository:
   ```bash
   git clone https://github.com/bhutanisatyam-droid/LBsim.git
   cd LBsim
   ```

2. Set up a virtual environment and install dependencies:
   ```bash
   python -m venv venv
   # On Windows:
   .\venv\Scripts\activate
   # On Linux/Mac:
   # source venv/bin/activate
   
   pip install -r requirements.txt
   ```

3. Start the FastAPI backend server:
   ```bash
   cd backend
   uvicorn main:app --reload --port 8000
   ```

4. Launch the Frontend:
   Open the `frontend/index_v2.html` file in your preferred web browser. Alternatively, you can serve the frontend directory using a simple HTTP server:
   ```bash
   # In a new terminal window
   cd frontend
   python -m http.server 8080
   ```
   Then navigate to `http://localhost:8080/index_v2.html`.
