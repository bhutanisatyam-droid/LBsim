# Multi-stage build for Optical Link Budget Calculator

# Stage 1: Python backend
FROM python:3.11-slim as backend

WORKDIR /app/backend

# Copy backend files
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .

# Stage 2: Final image
FROM python:3.11-slim

WORKDIR /app

# Install backend dependencies
COPY --from=backend /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY backend/ /app/backend/

# Copy frontend files
COPY frontend/ /app/frontend/

# Expose port
EXPOSE 8000

# Create saved_calculations directory
RUN mkdir -p /app/saved_calculations

# Run the application
CMD ["python", "/app/backend/main.py"]
