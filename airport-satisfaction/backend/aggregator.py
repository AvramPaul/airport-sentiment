"""
aggregator.py
─────────────
Background scheduler: every 15 minutes, computes a weighted average
of all frames received since the last snapshot and writes to history table.
Also handles daily purge of old data.
"""

from apscheduler.schedulers.background import BackgroundScheduler
from datetime import datetime, timedelta
from collections import defaultdict
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from config import AGGREGATION_INTERVAL_MINUTES, DATA_RETENTION_DAYS, CAMERAS
from backend.database import get_db
from backend.models import History, LiveStatus

# In-memory buffer: { camera_id: [ {happy, neutral, sad, total}, ... ] }
_frame_buffer: dict[str, list] = defaultdict(list)


def buffer_frame(camera_id: str, happy: float, neutral: float, sad: float, total: int):
    """Called by main.py after every successful /api/update."""
    _frame_buffer[camera_id].append({
        "happy": happy, "neutral": neutral, "sad": sad, "total": total
    })


def _aggregate_and_store():
    """Compute weighted average for each camera and persist to history."""
    print(f"[Aggregator] Running snapshot at {datetime.utcnow().isoformat()}")

    for camera_id, frames in list(_frame_buffer.items()):
        if not frames:
            continue

        total_persons = sum(f["total"] for f in frames)
        if total_persons == 0:
            continue

        # Weighted average (frames with more people count more)
        w_happy   = sum(f["happy"]   * f["total"] for f in frames) / total_persons
        w_neutral = sum(f["neutral"] * f["total"] for f in frames) / total_persons
        w_sad     = sum(f["sad"]     * f["total"] for f in frames) / total_persons
        avg_total = total_persons // len(frames)

        with get_db() as db:
            db.add(History(
                camera_id=camera_id,
                happy=round(w_happy, 1),
                neutral=round(w_neutral, 1),
                sad=round(w_sad, 1),
                total_persons=avg_total,
                recorded_at=datetime.utcnow(),
            ))

        print(f"  [{camera_id}] Saved: 😊{w_happy:.1f}% 😐{w_neutral:.1f}% 😠{w_sad:.1f}% ({len(frames)} frames)")
        _frame_buffer[camera_id].clear()


def _purge_old_data():
    """Delete history rows older than DATA_RETENTION_DAYS."""
    cutoff = datetime.utcnow() - timedelta(days=DATA_RETENTION_DAYS)
    with get_db() as db:
        deleted = db.query(History).filter(History.recorded_at < cutoff).delete()
    print(f"[Aggregator] Purged {deleted} old history rows.")


def start_scheduler():
    scheduler = BackgroundScheduler()
    scheduler.add_job(_aggregate_and_store, "interval", minutes=AGGREGATION_INTERVAL_MINUTES)
    scheduler.add_job(_purge_old_data, "cron", hour=3, minute=0)  # Daily at 03:00
    scheduler.start()
    print(f"✅ Aggregator scheduler started (every {AGGREGATION_INTERVAL_MINUTES} min).")
    return scheduler
