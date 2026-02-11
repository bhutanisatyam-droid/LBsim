@echo off
echo ========================================
echo Optical Link Budget Calculator
echo ========================================
echo.

REM Check Python installation
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed!
    echo Please install Python 3.11 or higher
    pause
    exit /b 1
)

echo [OK] Python found
echo.

REM Backend setup
echo [1/3] Setting up backend...
cd backend

REM Create virtual environment
if not exist "venv" (
    echo Creating virtual environment...
    python -m venv venv
)

REM Activate virtual environment
call venv\Scripts\activate.bat

REM Install dependencies
echo Installing dependencies...
pip install -q -r requirements.txt

echo [OK] Backend ready!
echo.

REM Start backend
echo [2/3] Starting backend server...
start /B python main.py
timeout /t 3 >nul

REM Start frontend
echo [3/3] Starting frontend server...
cd ..\frontend
start /B python -m http.server 8080
timeout /t 2 >nul

REM Open browser
start http://localhost:8080

echo.
echo ========================================
echo Application is running!
echo ========================================
echo.
echo Backend:  http://localhost:8000
echo Frontend: http://localhost:8080
echo API Docs: http://localhost:8000/docs
echo.
echo Press Ctrl+C to stop servers
echo ========================================
echo.

pause
