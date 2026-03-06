"""
alerts.py
─────────
Alert logic: fires ntfy.sh notification when a camera
has >50% sad passengers for 3+ consecutive frames (~15 seconds).
Includes per-camera cooldown to prevent spam.
"""

import httpx
from datetime import datetime, timedelta
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from config import (
    ALERT_SAD_THRESHOLD, ALERT_CONSECUTIVE_FRAMES,
    ALERT_COOLDOWN_MINUTES, NTFY_BASE_URL, NTFY_TOPIC, CAMERAS
)

# In-memory state per camera
_consecutive_counts: dict[str, int] = {}
_last_alert_time: dict[str, datetime] = {}


def check_and_alert(camera_id: str, sad_pct: float):
    """
    Call this after every frame update.
    Increments counter if sad_pct > threshold, resets otherwise.
    Fires alert if consecutive frames threshold is reached and cooldown passed.
    """
    if sad_pct > ALERT_SAD_THRESHOLD:
        _consecutive_counts[camera_id] = _consecutive_counts.get(camera_id, 0) + 1
    else:
        _consecutive_counts[camera_id] = 0
        return  # Below threshold, nothing to do

    count = _consecutive_counts[camera_id]
    if count < ALERT_CONSECUTIVE_FRAMES:
        return  # Not enough consecutive frames yet

    # Check cooldown
    last = _last_alert_time.get(camera_id)
    if last and datetime.utcnow() - last < timedelta(minutes=ALERT_COOLDOWN_MINUTES):
        return  # Still in cooldown

    # Fire alert
    camera_name = CAMERAS.get(camera_id, {}).get("name", camera_id)
    message = (
        f"⚠️ {camera_name} ({camera_id}): "
        f"{sad_pct:.0f}% pasageri supărați timp de {ALERT_CONSECUTIVE_FRAMES * 5} secunde!"
    )
    _send_ntfy(message, camera_name)
    _last_alert_time[camera_id] = datetime.utcnow()
    _consecutive_counts[camera_id] = 0  # Reset after alert


def _send_ntfy(message: str, title: str = "Airport Alert"):
    """POST notification to ntfy.sh."""
    try:
        url = f"{NTFY_BASE_URL}/{NTFY_TOPIC}"
        with httpx.Client(timeout=5.0) as client:
            client.post(url, content=message.encode("utf-8"), headers={
                "Title": title,
                "Priority": "high",
                "Tags": "warning,airplane",
            })
        print(f"🔔 Alert sent: {message}")
    except Exception as e:
        print(f"[Alerts] Failed to send ntfy notification: {e}")
