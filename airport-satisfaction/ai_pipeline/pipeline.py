"""
pipeline.py
───────────
Main orchestrator for the AI pipeline.
Connects frame extraction → face detection → emotion classification → API POST.
"""

import httpx
import numpy as np
from datetime import datetime, timezone
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from config import API_HOST, API_PORT
from ai_pipeline.frame_extractor import start_all_cameras
from ai_pipeline.face_detector import detect_faces
from ai_pipeline.emotion_classifier import classify_batch

_host = "127.0.0.1" if API_HOST == "0.0.0.0" else API_HOST
API_URL = f"http://{_host}:{API_PORT}/api/update"


def process_frame(camera_id: str, frame: np.ndarray):
    """Called by each CameraSimulator whenever a new frame is ready."""
    # Step 1: Detect all faces
    faces = detect_faces(frame)

    # Step 2: Skip frame if no faces found (empty area / camera blocked)
    if not faces:
        print(f"[{camera_id}] No faces detected, skipping frame.")
        return

    # Step 3: Classify emotions
    result = classify_batch(faces)

    # Step 4: Build payload
    payload = {
        "camera_id": camera_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "total_persons": result["total"],
        "happy":   result["happy"],
        "neutral": result["neutral"],
        "sad":     result["sad"],
    }

    print(
        f"[{camera_id}] 👥 {result['total']} persons | "
        f"😊 {result['happy']}% | 😐 {result['neutral']}% | 😠 {result['sad']}%"
    )

    # Step 5: POST to backend
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
