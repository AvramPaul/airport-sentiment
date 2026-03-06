# ─────────────────────────────────────────────────────────────
#  Airport Passenger Satisfaction System — Global Configuration
# ─────────────────────────────────────────────────────────────

# ── Cameras ──────────────────────────────────────────────────
CAMERAS = {
    "CAM_01": {"name": "Check-In",       "video": "videos/cam_01_checkin.mp4"},
    "CAM_02": {"name": "Security",       "video": "videos/cam_02_security.mp4"},
    "CAM_03": {"name": "Lounge",         "video": "videos/cam_03_lounge.mp4"},
    "CAM_04": {"name": "Departure Gate", "video": "videos/cam_04_gate.mp4"},
}

# ── AI Pipeline ───────────────────────────────────────────────
FRAME_INTERVAL_SECONDS = 5
EMOTION_CLASSES = ["happy", "neutral", "sad"]
EMOTION_MAP = {
    "happy":    "happy",
    "neutral":  "neutral",
    "sad":      "sad",
    "angry":    "sad",
    "disgust":  "sad",
    "fear":     "sad",
    "surprise": "neutral",
}

# ── Backend ───────────────────────────────────────────────────
API_HOST = "0.0.0.0"
API_PORT = 8000
AGGREGATION_INTERVAL_MINUTES = 15
DATA_RETENTION_DAYS = 30

# ── Alert Logic ───────────────────────────────────────────────
ALERT_SAD_THRESHOLD = 50.0
ALERT_CONSECUTIVE_FRAMES = 3
ALERT_COOLDOWN_MINUTES = 10
NTFY_TOPIC = "airport-satisfaction-alerts"
NTFY_BASE_URL = "https://ntfy.sh/claude_code_ntfy"

# ── Database ──────────────────────────────────────────────────
DB_HOST = "localhost"
DB_PORT = 3306
DB_NAME = "airport_satisfaction"
DB_USER = "root"
DB_PASSWORD = "root"
DATABASE_URL = f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
