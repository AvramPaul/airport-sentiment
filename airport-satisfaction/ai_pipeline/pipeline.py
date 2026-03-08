"""
pipeline.py
───────────
Main orchestrator for the AI pipeline.
Connects frame extraction → face detection → emotion classification → API POST.
"""

import httpx
import numpy as np
import cv2
import base64
from datetime import datetime, timezone
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from config import API_HOST, API_PORT
from ai_pipeline.frame_extractor import start_all_cameras
from ai_pipeline.face_detector import detect_faces
from ai_pipeline.emotion_classifier import classify_emotion

_host = "127.0.0.1" if API_HOST == "0.0.0.0" else API_HOST
API_URL       = f"http://{_host}:{API_PORT}/api/update"
FRAME_API_URL = f"http://{_host}:{API_PORT}/api/frame"

# BGR colors per emotion (OpenCV uses BGR)
_EMOTION_COLOR = {
    "happy":   (34, 197, 34),    # green
    "neutral": (11, 158, 245),   # amber
    "sad":     (68,  68, 239),   # red
}
_EMOTION_LABEL = {"happy": "Happy", "neutral": "Neutral", "sad": "Suparat"}


def process_frame(camera_id: str, frame: np.ndarray):
    """Called by each CameraSimulator whenever a new frame is ready."""
    # Step 1: Detect all faces (returns list of {"crop", "bbox"})
    face_data = detect_faces(frame)

    # Step 2: Skip frame if no faces found
    if not face_data:
        print(f"[{camera_id}] No faces detected, skipping frame.")
        return

    # Step 3: Classify emotion per face
    emotions = [classify_emotion(fd["crop"]) for fd in face_data]

    # Step 4: Compute aggregate percentages
    total = len(emotions)
    counts = {"happy": 0, "neutral": 0, "sad": 0}
    for e in emotions:
        counts[e] += 1
    happy_pct   = round(counts["happy"]   / total * 100, 1)
    neutral_pct = round(counts["neutral"] / total * 100, 1)
    sad_pct     = round(counts["sad"]     / total * 100, 1)

    print(
        f"[{camera_id}] 👥 {total} persons | "
        f"😊 {happy_pct}% | 😐 {neutral_pct}% | 😠 {sad_pct}%"
    )

    # Step 5: Draw bounding boxes + labels on annotated frame
    annotated = frame.copy()
    for fd, emotion in zip(face_data, emotions):
        x1, y1, x2, y2 = fd["bbox"]
        color = _EMOTION_COLOR[emotion]
        label = _EMOTION_LABEL[emotion]
        cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
        # Label background
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 1)
        cv2.rectangle(annotated, (x1, y1 - th - 8), (x1 + tw + 6, y1), color, -1)
        cv2.putText(annotated, label, (x1 + 3, y1 - 4),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1, cv2.LINE_AA)

    # Step 6: Encode annotated frame as JPEG and POST to /api/frame/{camera_id}
    _, jpeg = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 75])
    frame_b64 = base64.b64encode(jpeg.tobytes()).decode()
    try:
        with httpx.Client(timeout=3.0) as client:
            client.post(f"{FRAME_API_URL}/{camera_id}", json={"frame_b64": frame_b64})
    except Exception as e:
        print(f"[{camera_id}] ❌ Failed to POST frame: {e}")

    # Step 7: POST analytics to /api/update
    payload = {
        "camera_id": camera_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "total_persons": total,
        "happy":   happy_pct,
        "neutral": neutral_pct,
        "sad":     sad_pct,
    }
    try:
        with httpx.Client(timeout=3.0) as client:
            response = client.post(API_URL, json=payload)
            if response.status_code != 200:
                print(f"[{camera_id}] ⚠️ API responded {response.status_code}")
    except Exception as e:
        print(f"[{camera_id}] ❌ Failed to POST to API: {e}")


def run():
    """Start all camera simulators and block until interrupted."""
    print("🚀 Starting AI Pipeline...")
    simulators = start_all_cameras(on_frame=process_frame)
    print(f"✅ {len(simulators)} cameras running. Press Ctrl+C to stop.\n")

    try:
        import time
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n🛑 Stopping all cameras...")
        for sim in simulators:
            sim.stop()


if __name__ == "__main__":
    run()
