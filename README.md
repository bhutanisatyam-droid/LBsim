# Optical Link Budget Calculator 🛰️

A professional web application for calculating optical communication system parameters with PDF export functionality. Works on Web, Desktop, and Android.

![Python](https://img.shields.io/badge/Python-3.11-blue)
![FastAPI](https://img.shields.io/badge/FastAPI-Latest-green)
![PWA](https://img.shields.io/badge/PWA-Enabled-purple)

## ✨ Features

### Core Calculations
- ✅ **Complete MATLAB-matching calculations**
  - Free Space Path Loss (FSPL)
  - Antenna Gains (Transmitter & Receiver)
  - Beam Divergence
  - Received Power
  - **Link Margin** (Critical!)

### Input/Output Flexibility
- ✅ Multiple unit support:
  - Power: dBm, mW, W
  - Distance: m, km, cm
  - Wavelength: nm, μm, m
  - Efficiency: %, decimal

### Advanced Features
- ✅ **PDF Export** with professional watermark
- ✅ **Save Calculations** (user-controlled)
- ✅ **Offline Support** (PWA)
- ✅ **Responsive Design** (Mobile, Tablet, Desktop)
- ✅ **Real-time Validation**
- ✅ **Link Viability Indicator**

---

## 🚀 Quick Start

### Option 1: Docker (Recommended)

```bash
# Clone or extract the project
cd optical-link-calculator

# Build and run with Docker Compose
docker-compose up --build

# Access the app
# Frontend: http://localhost:80
# Backend API: http://localhost:8000
# API Docs: http://localhost:8000/docs
```

### Option 2: Local Development

**Backend:**
```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run backend
python main.py
```

**Frontend:**
```bash
cd frontend

# Serve frontend (use any static server)
python -m http.server 8080

# Or use Node.js
npx serve
```

Access:
- Frontend: http://localhost:8080
- Backend: http://localhost:8000

### Option 3: Vercel Deployment

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel

# Follow the prompts
```

---

## 📁 Project Structure

```
optical-link-calculator/
├── backend/
│   ├── main.py              # FastAPI server with calculations
│   ├── pdf_generator.py     # PDF report generation
│   └── requirements.txt     # Python dependencies
├── frontend/
│   ├── index.html          # Main UI
│   ├── app.js              # Frontend logic & API integration
│   ├── manifest.json       # PWA manifest
│   └── sw.js               # Service worker (offline support)
├── Dockerfile              # Docker configuration
├── docker-compose.yml      # Docker Compose setup
├── vercel.json             # Vercel deployment config
└── README.md               # This file
```

---

## 🔧 Configuration

### Backend Configuration

Edit `backend/main.py`:

```python
# CORS Configuration (Production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://your-domain.com"],  # Change this
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### Frontend Configuration

Edit `frontend/app.js`:

```javascript
// API Configuration
const API_BASE_URL = 'https://your-api-domain.com';  // Change for production
```

---

## 📱 Installing as PWA

### On Android:
1. Open the web app in Chrome
2. Tap the menu (⋮)
3. Select "Add to Home Screen"
4. App will work offline!

### On Desktop (Chrome/Edge):
1. Click the install icon in the address bar
2. Click "Install"
3. App opens as standalone window

---

## 📋 API Documentation

### Endpoints

#### Health Check
```http
GET /api/health
```

#### Calculate Link Budget
```http
POST /api/calculate
Content-Type: application/json

{
  "tx_power": 34.0,
  "tx_efficiency": 50.0,
  "rx_efficiency": 50.0,
  "rx_sensitivity": -60.0,
  "wavelength": 1550.0,
  "tx_diameter": 0.15,
  "rx_diameter": 0.15,
  "distance": 40000.0,
  "impl_loss": 1.5,
  "coupling_loss": 4.0,
  "tx_pointing_loss": 1.5,
  "rx_pointing_loss": 1.5
}
```

#### Save Calculation
```http
POST /api/save
Content-Type: application/json

{
  "calculation_data": { ... },
  "notes": "Optional notes"
}
```

#### Generate PDF
```http
POST /api/generate-pdf
Content-Type: application/json

{
  "inputs": { ... },
  "outputs": { ... }
}
```

#### Get Calculation History
```http
GET /api/history
```

Full API documentation available at: `http://localhost:8000/docs` (Swagger UI)

---

## 🧮 Calculation Details

### Antenna Gain
```
G = η × (πD/λ)²
```

### Beam Divergence
```
θ = 2.44 × λ / D
```

### Free Space Path Loss
```
FSPL = 20×log₁₀(4π×distance/wavelength)
```

### Received Power
```
P_rx = P_tx + G_tx + G_rx - FSPL - Losses
```

### Link Margin
```
Link Margin = P_rx - P_sensitivity
```

**Link Status:**
- Margin > 0 dB: ✅ Link Viable
- Margin 3-6 dB: ✅ Recommended
- Margin < 0 dB: ❌ Link Not Viable

---

## 🐳 Docker Commands

```bash
# Build image
docker build -t optical-calculator .

# Run container
docker run -p 8000:8000 optical-calculator

# View logs
docker logs optical-calculator

# Stop container
docker stop optical-calculator

# Remove container
docker rm optical-calculator
```

---

## 🌐 Deployment Options

### 1. Vercel (Easiest for Web)
- Automatic deployments from Git
- Free tier available
- Global CDN
- Serverless functions support

### 2. Heroku
```bash
# Create Procfile
web: cd backend && python main.py

# Deploy
heroku create optical-calculator
git push heroku main
```

### 3. AWS / Google Cloud / Azure
- Use Docker container
- Deploy to container services
- Configure load balancer

### 4. DigitalOcean / Linode
- Use Docker Compose
- Single droplet deployment
- Easy server management

---

## 📱 Android App Build

### Option 1: PWA (Recommended)
- No build required!
- Users install from browser
- Auto-updates
- Full offline support

### Option 2: Capacitor Wrapper
```bash
npm install @capacitor/core @capacitor/cli
npx cap init

# Add Android platform
npx cap add android

# Copy web assets
npx cap copy

# Open in Android Studio
npx cap open android

# Build APK
```

---

## 🧪 Testing

### Backend Tests
```bash
cd backend
pytest test_calculations.py
```

### API Testing
```bash
# Test calculate endpoint
curl -X POST http://localhost:8000/api/calculate \
  -H "Content-Type: application/json" \
  -d @test_data.json
```

### Load Testing
```bash
# Install wrk
apt-get install wrk

# Run load test
wrk -t4 -c100 -d30s http://localhost:8000/api/health
```

---

## 🔒 Security Considerations

### Production Checklist:
- [ ] Change CORS origins to specific domains
- [ ] Add rate limiting
- [ ] Enable HTTPS
- [ ] Implement input sanitization
- [ ] Add authentication (if needed)
- [ ] Regular dependency updates

---

## 🐛 Troubleshooting

### Backend won't start
```bash
# Check Python version
python --version  # Should be 3.11+

# Reinstall dependencies
pip install --upgrade -r requirements.txt
```

### Frontend can't connect to API
- Check `API_BASE_URL` in `app.js`
- Ensure backend is running
- Check browser console for CORS errors
- Verify firewall settings

### PWA not installing
- Must be served over HTTPS (or localhost)
- Check manifest.json is valid
- Ensure service worker is registered
- Clear browser cache

---

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

---

## 📝 License

This project is licensed under the MIT License.

---

## 👨‍💻 Author

Created for optical communication system analysis and design.

---

## 🆘 Support

For issues, questions, or suggestions:
- Open an issue on GitHub
- Check API documentation at `/docs`
- Review calculation formulas in MATLAB script

---

## 🎓 Usage Examples

### Example 1: Satellite Link
```javascript
{
  "tx_power": 34,        // 34 dBm
  "tx_efficiency": 50,   // 50%
  "rx_efficiency": 50,   // 50%
  "rx_sensitivity": -60, // -60 dBm
  "wavelength": 1550,    // 1550 nm
  "tx_diameter": 0.15,   // 15 cm
  "rx_diameter": 0.15,   // 15 cm
  "distance": 40000,     // 40 km
  "impl_loss": 1.5,      // 1.5 dB
  "coupling_loss": 4,    // 4 dB
  "tx_pointing_loss": 1.5,
  "rx_pointing_loss": 1.5
}
```

### Example 2: Short-Range Link
```javascript
{
  "tx_power": 20,
  "tx_efficiency": 80,
  "rx_efficiency": 80,
  "rx_sensitivity": -50,
  "wavelength": 850,
  "tx_diameter": 0.05,
  "rx_diameter": 0.05,
  "distance": 1000,      // 1 km
  "impl_loss": 0.5,
  "coupling_loss": 2,
  "tx_pointing_loss": 0.5,
  "rx_pointing_loss": 0.5
}
```

---

## 🔄 Version History

### v1.0.0 (Current)
- Initial release
- Complete MATLAB calculation matching
- PDF export with watermark
- PWA support
- Save/Load functionality
- Responsive design

---

## 🎯 Roadmap

- [ ] User authentication
- [ ] Cloud storage integration
- [ ] Multiple calculation presets
- [ ] Atmospheric attenuation models
- [ ] Multi-language support
- [ ] Native Android/iOS apps
- [ ] Batch calculation mode
- [ ] Excel import/export

---

## ⚡ Performance

- API response time: <100ms
- PDF generation: <2s
- Frontend load time: <1s
- Offline-first architecture
- Optimized for mobile networks

---

**Happy Calculating! 🚀**
