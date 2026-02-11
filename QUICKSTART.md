# 🚀 Quick Start Guide

## Fastest Way to Get Started (3 methods)

### Method 1: Automated Script (Easiest!)

**Linux/Mac:**
```bash
chmod +x start.sh
./start.sh
```

**Windows:**
```cmd
start.bat
```

That's it! The script will:
1. Set up Python virtual environment
2. Install all dependencies
3. Start backend server
4. Start frontend server
5. Open your browser automatically

---

### Method 2: Docker (Most Reliable)

```bash
# One command to rule them all!
docker-compose up --build
```

Access: http://localhost:80

---

### Method 3: Manual Setup

**Terminal 1 - Backend:**
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

**Terminal 2 - Frontend:**
```bash
cd frontend
python -m http.server 8080
```

Access: http://localhost:8080

---

## 📱 Install as Mobile App (PWA)

### Android:
1. Open http://your-domain.com in Chrome
2. Tap menu (⋮) → "Add to Home Screen"
3. Use offline!

### iPhone:
1. Open in Safari
2. Tap Share → "Add to Home Screen"
3. Works offline!

---

## 🧪 Test the API

```bash
# Test health endpoint
curl http://localhost:8000/api/health

# Test calculation (Linux/Mac)
curl -X POST http://localhost:8000/api/calculate \
  -H "Content-Type: application/json" \
  -d @test_data.json

# View API documentation
open http://localhost:8000/docs
```

---

## 🎯 First Calculation

1. Open http://localhost:8080
2. Fill in the required fields (marked with *):
   - Transmitter Power: `34` dBm
   - Tx Efficiency: `50` %
   - Rx Efficiency: `50` %
   - **Rx Sensitivity: `-60` dBm** (Important!)
   - Wavelength: `1550` nm
   - Tx Diameter: `0.15` m
   - Rx Diameter: `0.15` m
   - Distance: `40000` m

3. Optional losses (can leave as 0):
   - Implementation Loss: `1.5` dB
   - Coupling Loss: `4` dB
   - Tx Pointing Loss: `1.5` dB
   - Rx Pointing Loss: `1.5` dB

4. Click **"Calculate"**

5. View results:
   - ✅ **Link Margin** will show if link is viable
   - Green = Good to go!
   - Red = Link won't work

6. **Save** your calculation (optional)
7. **Export to PDF** with watermark

---

## 🌐 Deploy to Production

### Vercel (Free & Easy):
```bash
npm install -g vercel
vercel
```

### Heroku:
```bash
heroku create optical-calculator
git push heroku main
```

### Your Own Server:
```bash
docker-compose up -d
```

---

## ❓ Common Issues

### "Backend API: Offline"
- Backend not running
- Check: `http://localhost:8000/api/health`
- Solution: Start backend with `python backend/main.py`

### "Calculation Error"
- Missing required fields
- Check all fields marked with *
- **Don't forget Receiver Sensitivity!** (New field)

### Port Already in Use
```bash
# Find what's using port 8000
lsof -i :8000  # Mac/Linux
netstat -ano | findstr :8000  # Windows

# Kill the process or use different port
```

---

## 📊 What's Different from Original HTML?

### ✅ New Features:
1. **Receiver Sensitivity input** (was missing!)
2. **Link Margin calculation** (Critical!)
3. **Antenna Gains** (G_tx, G_rx)
4. **Beam Divergence** calculations
5. **Backend API** (not just client-side)
6. **Save functionality** (user-controlled)
7. **PDF Export** with watermark
8. **Offline support** (PWA)
9. **Calculation history**

### 🎨 UI Improvements:
- Prominent Link Margin display
- Better result organization
- Mobile-responsive
- Real-time validation
- Loading indicators

---

## 🎓 Understanding the Results

### Link Margin (Most Important!)
- **> 6 dB**: Excellent link (recommended)
- **3-6 dB**: Good link
- **0-3 dB**: Marginal link
- **< 0 dB**: Link will NOT work ❌

### What It Means:
Link Margin = Received Power - Receiver Sensitivity

If you receive -55 dBm but need -60 dBm minimum:
Link Margin = -55 - (-60) = +5 dB ✅ Good!

If you receive -65 dBm but need -60 dBm minimum:
Link Margin = -65 - (-60) = -5 dB ❌ Won't work!

---

## 🎉 You're Ready!

**Next Steps:**
1. Run the calculator
2. Test with sample data
3. Save important calculations
4. Export PDFs for reports
5. Install as PWA on mobile
6. Deploy to production

**Need Help?**
- Check full README.md
- View API docs: http://localhost:8000/docs
- Review test_data.json examples

---

**Happy Calculating! 🛰️**
