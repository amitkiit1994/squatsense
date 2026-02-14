"""
MediaPipe Pose estimation. Returns keypoints in image coordinates (pixel).
Uses Pose Landmarker task (MediaPipe 0.10+). CPU-only, suitable for macOS.
"""
from __future__ import annotations

import os
import urllib.request
from typing import Optional

import cv2
import numpy as np

# MediaPipe Pose landmark indices (same as PoseLandmark)
class LandmarkIdx:
    NOSE = 0
    LEFT_SHOULDER = 11
    RIGHT_SHOULDER = 12
    LEFT_ELBOW = 13
    RIGHT_ELBOW = 14
    LEFT_WRIST = 15
    RIGHT_WRIST = 16
    LEFT_HIP = 23
    RIGHT_HIP = 24
    LEFT_KNEE = 25
    RIGHT_KNEE = 26
    LEFT_ANKLE = 27
    RIGHT_ANKLE = 28
    LEFT_HEEL = 29
    RIGHT_HEEL = 30
    LEFT_FOOT_INDEX = 31
    RIGHT_FOOT_INDEX = 32


# Pose Landmarker model URL (lite = faster, CPU-friendly)
_POSE_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task"
_POSE_MODEL_FILENAME = "pose_landmarker_lite.task"


def _get_model_path(cache_dir: Optional[str] = None) -> str:
    """Return path to pose landmarker model, downloading if needed."""
    if cache_dir is None:
        cache_dir = os.path.join(os.path.dirname(__file__), "..", "outputs")
    os.makedirs(cache_dir, exist_ok=True)
    path = os.path.join(cache_dir, _POSE_MODEL_FILENAME)
    if not os.path.isfile(path):
        urllib.request.urlretrieve(_POSE_MODEL_URL, path)
    return path


def _create_landmarker(cache_dir: Optional[str] = None):
    """Create PoseLandmarker instance (MediaPipe 0.10+ tasks API)."""
    from mediapipe.tasks.python.core import base_options
    from mediapipe.tasks.python.vision import PoseLandmarker, PoseLandmarkerOptions
    from mediapipe.tasks.python.vision.core import vision_task_running_mode

    model_path = _get_model_path(cache_dir)
    base = base_options.BaseOptions(model_asset_path=model_path)
    options = PoseLandmarkerOptions(
        base_options=base,
        running_mode=vision_task_running_mode.VisionTaskRunningMode.IMAGE,
        num_poses=1,
        min_pose_detection_confidence=0.5,
        min_pose_presence_confidence=0.5,
        min_tracking_confidence=0.5,
    )
    return PoseLandmarker.create_from_options(options)


def process_frame(
    frame_bgr: np.ndarray,
    pose,  # PoseLandmarker or legacy mp.solutions.pose.Pose
) -> Optional[list[tuple[float, float]]]:
    """
    Run pose estimation on one BGR frame.
    Returns list of (x, y) in pixel coords for 33 landmarks, or None if no pose.
    """
    h, w = frame_bgr.shape[:2]
    rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)

    # MediaPipe 0.10+ PoseLandmarker
    if hasattr(pose, "detect"):
        from mediapipe.tasks.python.vision.core import image as mp_image
        mp_img = mp_image.Image(image_format=mp_image.ImageFormat.SRGB, data=rgb)
        result = pose.detect(mp_img)
        if not result.pose_landmarks or len(result.pose_landmarks) == 0:
            return None
        landmarks = result.pose_landmarks[0]
        return [(lm.x * w, lm.y * h) for lm in landmarks]
    # Legacy mp.solutions.pose.Pose (MediaPipe < 0.10)
    results = pose.process(rgb)
    if not results.pose_landmarks:
        return None
    return [(lm.x * w, lm.y * h) for lm in results.pose_landmarks.landmark]


def create_pose_detector(
    min_detection_confidence: float = 0.5,
    min_tracking_confidence: float = 0.5,
    model_complexity: int = 1,
    cache_dir: Optional[str] = None,
):
    """
    Create pose detector. Uses MediaPipe 0.10+ PoseLandmarker (CPU-friendly).
    Legacy model_complexity is ignored with the new API (we use lite model).
    """
    try:
        return _create_landmarker(cache_dir)
    except Exception:
        # Fallback: try legacy API (MediaPipe < 0.10)
        import mediapipe as mp
        return mp.solutions.pose.Pose(
            static_image_mode=False,
            model_complexity=min(model_complexity, 2),
            min_detection_confidence=min_detection_confidence,
            min_tracking_confidence=min_tracking_confidence,
        )
