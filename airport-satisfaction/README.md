# ✈ Airport Passenger Satisfaction System

Real-time emotion analytics for airport terminals using computer vision.

## Quick Start

### 1. Install dependencies
```bash
pip install -r requirements.txt
```

### 2. Configure
Edit `config.py`:
- Set `DB_PASSWORD` for your MySQL instance
- Set `NTFY_TOPIC` for push alerts
- Update `CAMERAS` video paths

### 3. Initialize database
```bash
python -c "from backend.database import init_db; init_db()"
```

### 4. Start backend
```bash
python -m backend.main
# API available at http://localhost:8000
```

### 5. Start AI pipeline (in a second terminal)
```bash
python -m ai_pipeline.pipeline
```

### 6. Open dashboard
Open `frontend/index.html` in a browser (or serve via any static file server).

---

## Architecture
```
videos/ (MP4)
    ↓ frame every 5s
ai_pipeline/frame_extractor.py   — CameraSimulator threads
    ↓
ai_pipeline/face_detector.py     — RetinaFace
    ↓
ai_pipeline/emotion_classifier.py — DeepFace (AffectNet)
    ↓
POST /api/update
    ↓
backend/main.py                  — FastAPI
    ↓              ↓
live_status     history (15min)
    ↓
frontend/index.html              — Dashboard
```

## Alert Logic
- If a camera detects >50% sad passengers in **3 consecutive frames** (~15 sec)
- A push notification is sent via **ntfy.sh**
- 10-minute cooldown per camera to prevent spam
