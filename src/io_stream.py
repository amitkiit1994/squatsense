"""
Unified frame generator for video file or webcam.
Yields (frame_bgr, frame_idx, fps) with graceful shutdown.
"""
from __future__ import annotations

import time
from typing import Generator

import cv2
import numpy as np


def video_frames(video_path: str) -> Generator[tuple[np.ndarray, int, float], None, None]:
    """
    Yield frames from a video file.
    Yields: (frame_bgr, frame_idx, fps).
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise FileNotFoundError(f"Cannot open video: {video_path}")
    try:
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        idx = 0
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            yield (frame, idx, fps)
            idx += 1
    finally:
        cap.release()


def webcam_frames(
    camera_id: int = 0,
    target_fps: float = 20,
) -> Generator[tuple[np.ndarray, int, float], None, None]:
    """
    Yield frames from webcam with graceful shutdown.
    Yields: (frame_bgr, frame_idx, fps_est).
    fps_est is estimated from actual frame timings.
    """
    cap = cv2.VideoCapture(camera_id)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open camera {camera_id}. Check permissions and that no other app is using it.")
    try:
        # Prefer a reasonable resolution for speed
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
        cap.set(cv2.CAP_PROP_FPS, target_fps)
        idx = 0
        t_prev = time.perf_counter()
        fps_est = float(target_fps)
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            t_now = time.perf_counter()
            dt = t_now - t_prev
            if dt > 0:
                fps_est = 0.9 * fps_est + 0.1 * (1.0 / dt)
            t_prev = t_now
            yield (frame, idx, fps_est)
            idx += 1
    finally:
        cap.release()
