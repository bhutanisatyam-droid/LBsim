#!/bin/bash

echo "🛰️  Optical Link Budget Calculator - Startup Script"
echo "=================================================="
echo ""

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed. Please install Python 3.11 or higher."
    exit 1
fi

echo "✓ Python found: $(python3 --version)"
echo ""

# Backend setup
echo "📦 Setting up backend..."
cd backend

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install dependencies
echo "Installing dependencies..."
pip install -q -r requirements.txt

echo "✓ Backend ready!"
echo ""

# Start backend
echo "🚀 Starting backend server on http://localhost:8000"
echo "   API Docs: http://localhost:8000/docs"
echo ""
python main.py &
BACKEND_PID=$!

# Wait for backend to start
sleep 3

# Open frontend
cd ../frontend
echo "🌐 Starting frontend server on http://localhost:8080"
echo ""
python3 -m http.server 8080 &
FRONTEND_PID=$!

sleep 2

# Open browser
if command -v xdg-open &> /dev/null; then
    xdg-open http://localhost:8080
elif command -v open &> /dev/null; then
    open http://localhost:8080
fi

echo ""
echo "=================================================="
echo "✅ Application is running!"
echo ""
echo "Backend:  http://localhost:8000"
echo "Frontend: http://localhost:8080"
echo "API Docs: http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop both servers"
echo "=================================================="

# Wait for user interrupt
trap "echo ''; echo 'Stopping servers...'; kill $BACKEND_PID $FRONTEND_PID; exit 0" INT
wait
