"""
face_detector.py
────────────────
Wraps RetinaFace to detect all faces in a frame.
Returns a list of dicts with cropped face image and bounding box.
"""

import numpy as np
from deepface import DeepFace


def detect_faces(frame: np.ndarray) -> list[dict]:
    """
    Detect all faces in a BGR frame.

    Returns:
        List of dicts: {"crop": np.ndarray, "bbox": (x1, y1, x2, y2)}
        Empty list if no faces detected or on error.
    """
    try:
        detections = DeepFace.extract_faces(
            img_path=frame,
            detector_backend="opencv",
            enforce_detection=False,
            align=False,
        )

        faces = []
        for det in detections:
            if det.get("confidence", 1.0) < 0.5:
                continue
            fa = det["facial_area"]
            x1, y1 = fa["x"], fa["y"]
            x2, y2 = x1 + fa["w"], y1 + fa["h"]
            # Add small padding for better emotion recognition
            h, w = frame.shape[:2]
            pad = 10
            x1p = max(0, x1 - pad)
            y1p = max(0, y1 - pad)
            x2p = min(w, x2 + pad)
            y2p = min(h, y2 + pad)
            face_crop = frame[y1p:y2p, x1p:x2p]
            if face_crop.size > 0:
                faces.append({"crop": face_crop, "bbox": (x1, y1, x2, y2)})

        return faces

    except Exception as e:
        print(f"[FaceDetector] Error: {e}")
        return []
