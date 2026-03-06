"""
emotion_classifier.py
─────────────────────
Wraps DeepFace to classify each face crop into happy / neutral / sad.
The 7 raw DeepFace emotions are collapsed to 3 classes via EMOTION_MAP.
"""

import numpy as np
from deepface import DeepFace
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from config import EMOTION_MAP, EMOTION_CLASSES


def classify_emotion(face_img: np.ndarray) -> str:
    """
    Classify a single cropped face image.

    Returns:
        One of: 'happy', 'neutral', 'sad'
        Falls back to 'neutral' on error.
    """
    try:
        result = DeepFace.analyze(
            img_path=face_img,
            actions=["emotion"],
            enforce_detection=False,  # Don't raise if no face found in crop
            silent=True,
        )
        # result can be a list when multiple faces are found in crop — take first
        if isinstance(result, list):
            result = result[0]

        dominant = result["dominant_emotion"]
        return EMOTION_MAP.get(dominant, "neutral")

    except Exception as e:
        print(f"[EmotionClassifier] Error: {e}")
        return "neutral"


def classify_batch(faces: list[np.ndarray]) -> dict:
    """
    Classify a list of face crops and return aggregated percentages.

    Returns:
        {
            "total": int,
            "happy": float,   # percentage 0–100
            "neutral": float,
            "sad": float,
        }
    """
    if not faces:
        return {"total": 0, "happy": 0.0, "neutral": 0.0, "sad": 0.0}

    counts = {cls: 0 for cls in EMOTION_CLASSES}
    for face in faces:
        emotion = classify_emotion(face)
        counts[emotion] += 1

    total = len(faces)
    return {
        "total": total,
        "happy":   round(counts["happy"]   / total * 100, 1),
        "neutral": round(counts["neutral"] / total * 100, 1),
        "sad":     round(counts["sad"]     / total * 100, 1),
    }
