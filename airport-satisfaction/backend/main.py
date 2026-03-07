"""
main.py
───────
FastAPI application — REST API endpoints.

Endpoints:
  POST /api/update    ← AI Pipeline sends frame results here
  GET  /api/live      → Returns latest status per camera
  GET  /api/history   → Returns aggregated history (last 24h by default)
  GET  /api/cameras   → Returns camera list
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
from datetime import datetime, timedelta
from sqlalchemy import desc
import base64
import httpx
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from config import CAMERAS, NTFY_BASE_URL
from backend.database import init_db, get_db
from backend.models import LiveStatus, History
from backend.aggregator import start_scheduler, buffer_frame
from backend.alerts import check_and_alert

app = FastAPI(title="Airport Satisfaction API", version="1.0.0")

# In-memory store for latest annotated frame per camera
_latest_frames: dict[str, bytes] = {}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Startup ──────────────────────────────────────────────────
@app.on_event("startup")
def on_startup():
    init_db()
    start_scheduler()


# ── Schemas ──────────────────────────────────────────────────
_STAFF_TOPICS = {
    "checkin":  "airport-satisfaction-checkin",
    "security": "airport-satisfaction-security",
    "lounge":   "airport-satisfaction-lounge",
    "gate":     "airport-satisfaction-gate",
}


class FrameJpeg(BaseModel):
    frame_b64: str


class NotifyRequest(BaseModel):
    recipient: str   # checkin | security | lounge | gate
    message:   str


class FrameUpdate(BaseModel):
    camera_id:     str
    timestamp:     str
    total_persons: int
    happy:         float
    neutral:       float
    sad:           float


# ── Endpoints ────────────────────────────────────────────────
@app.post("/api/update")
def update_frame(data: FrameUpdate):
    """Receive frame analysis result from AI Pipeline."""
    camera_name = CAMERAS.get(data.camera_id, {}).get("name", data.camera_id)

    with get_db() as db:
        # Upsert live_status
        existing = db.query(LiveStatus).filter_by(camera_id=data.camera_id).first()
        if existing:
            existing.happy         = data.happy
            existing.neutral       = data.neutral
            existing.sad           = data.sad
            existing.total_persons = data.total_persons
            existing.updated_at    = datetime.utcnow()
        else:
            db.add(LiveStatus(
                camera_id=data.camera_id,
                camera_name=camera_name,
                happy=data.happy,
                neutral=data.neutral,
                sad=data.sad,
                total_persons=data.total_persons,
                updated_at=datetime.utcnow(),
            ))

    # Buffer for 15-min aggregation
    buffer_frame(data.camera_id, data.happy, data.neutral, data.sad, data.total_persons)

    # Check alert condition
    check_and_alert(data.camera_id, data.sad)

    return {"status": "ok"}


@app.get("/api/live")
def get_live():
    """Return the latest frame result for each camera."""
    with get_db() as db:
        rows = db.query(LiveStatus).all()
        return [
            {
                "camera_id":     r.camera_id,
                "camera_name":   r.camera_name,
                "happy":         r.happy,
                "neutral":       r.neutral,
                "sad":           r.sad,
                "total_persons": r.total_persons,
                "updated_at":    r.updated_at.isoformat() if r.updated_at else None,
            }
            for r in rows
        ]


@app.get("/api/history")
def get_history(camera_id: str = None, hours: int = 24):
    """Return aggregated history. Filter by camera_id and time range."""
    cutoff = datetime.utcnow() - timedelta(hours=hours)
    with get_db() as db:
        q = db.query(History).filter(History.recorded_at >= cutoff)
        if camera_id:
            q = q.filter(History.camera_id == camera_id)
        q = q.order_by(History.recorded_at)
        rows = q.all()
        return [
            {
                "camera_id":     r.camera_id,
                "happy":         r.happy,
                "neutral":       r.neutral,
                "sad":           r.sad,
                "total_persons": r.total_persons,
                "recorded_at":   r.recorded_at.isoformat(),
            }
            for r in rows
        ]


@app.get("/api/cameras")
def get_cameras():
    """Return list of configured cameras."""
    return [
        {"camera_id": cam_id, "camera_name": info["name"]}
        for cam_id, info in CAMERAS.items()
    ]


@app.post("/api/frame/{camera_id}")
def upload_frame(camera_id: str, data: FrameJpeg):
    """Receive latest annotated JPEG frame from AI Pipeline."""
    _latest_frames[camera_id] = base64.b64decode(data.frame_b64)
    return {"status": "ok"}


@app.get("/api/frame/{camera_id}")
def get_frame(camera_id: str):
    """Return latest annotated JPEG frame for a camera."""
    if camera_id not in _latest_frames:
        raise HTTPException(status_code=404, detail="No frame available yet")
    return Response(content=_latest_frames[camera_id], media_type="image/jpeg")


@app.post("/api/notify")
def send_staff_notification(data: NotifyRequest):
    """Send a custom message to a staff ntfy.sh topic."""
    topic = _STAFF_TOPICS.get(data.recipient)
    if not topic:
        raise HTTPException(status_code=400, detail="Invalid recipient")
    if not data.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    url = f"https://ntfy.sh/{topic}"
    try:
        with httpx.Client(timeout=5.0) as client:
            client.post(url, content=data.message.encode("utf-8"), headers={
                "Title": "Mesaj Supervisor",
                "Priority": "default",
                "Tags": "loudspeaker",
            })
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"ntfy.sh error: {e}")

    return {"status": "ok", "topic": topic}


if __name__ == "__main__":
    import uvicorn
    from config import API_HOST, API_PORT
    uvicorn.run("backend.main:app", host=API_HOST, port=API_PORT, reload=True)
