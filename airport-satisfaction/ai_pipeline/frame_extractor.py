"""
frame_extractor.py
──────────────────
Simulates 4 surveillance cameras by reading pre-recorded MP4 files.
Each camera runs in its own thread and yields one frame every N seconds.
"""

import cv2
import time
import threading
from typing import Callable
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from config import CAMERAS, FRAME_INTERVAL_SECONDS


class CameraSimulator:
    """Reads an MP4 file in a loop and calls `on_frame` every FRAME_INTERVAL_SECONDS."""

    def __init__(self, camera_id: str, video_path: str, on_frame: Callable):
        self.camera_id = camera_id
        self.video_path = video_path
        self.on_frame = on_frame
        self._stop_event = threading.Event()

    def start(self):
        t = threading.Thread(target=self._run, daemon=True)
        t.start()
        return t

    def stop(self):
        self._stop_event.set()

    def _run(self):
        cap = cv2.VideoCapture(self.video_path)
        if not cap.isOpened():
            print(f"[{self.camera_id}] ❌ Cannot open video: {self.video_path}")
            return

        fps = cap.get(cv2.CAP_PROP_FPS) or 25
        frames_to_skip = int(fps * FRAME_INTERVAL_SECONDS)
        frame_count = 0

        while not self._stop_event.is_set():
            ret, frame = cap.read()
            if not ret:
                # End of video → seek back to start and loop
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                frame_count = 0
                continue

            frame_count += 1
            if frame_count % frames_to_skip == 0:
                self.on_frame(self.camera_id, frame)

        cap.release()
        print(f"[{self.camera_id}] Simulator stopped.")


def start_all_cameras(on_frame: Callable) -> list[CameraSimulator]:
    """Launch all cameras defined in config. Returns list of simulators."""
    simulators = []
    for cam_id, cam_info in CAMERAS.items():
        sim = CameraSimulator(cam_id, cam_info["video"], on_frame)
        sim.start()
        simulators.append(sim)
        print(f"[{cam_id}] ▶ Started simulator → {cam_info['video']}")
    return simulators
