"""
face_detector.py
────────────────
Wraps RetinaFace to detect all faces in a frame.
Returns a list of cropped face images ready for emotion classification.
"""

import numpy as np
from deepface import DeepFace


def detect_faces(frame: np.ndarray) -> list[np.ndarray]:
    """
    Detect all faces in a BGR frame.

    Returns:
        List of cropped face images (numpy arrays, BGR).
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
            x1 = max(0, x1 - pad)
            y1 = max(0, y1 - pad)
            x2 = min(w, x2 + pad)
            y2 = min(h, y2 + pad)
            face_crop = frame[y1:y2, x1:x2]
            if face_crop.size > 0:
                faces.append(face_crop)

        return faces

    except Exception as e:
        print(f"[FaceDetector] Error: {e}")
        return []
