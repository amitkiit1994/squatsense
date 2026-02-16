"""
Draw skeleton and metrics on frames. Supports batch (offline) and realtime overlay.
"""
from __future__ import annotations

from typing import Any, Optional

import cv2
import numpy as np

from .pose import LandmarkIdx

# Pose skeleton connections (33 landmarks); compatible with any MediaPipe version
_POSE_CONNECTIONS = frozenset([
    (0, 1), (1, 2), (2, 3), (3, 7), (0, 4), (4, 5), (5, 6), (6, 8), (9, 10),
    (11, 12), (11, 13), (13, 15), (15, 17), (15, 19), (15, 21), (17, 19),
    (12, 14), (14, 16), (16, 18), (16, 20), (16, 22), (18, 20),
    (11, 23), (12, 24), (23, 24), (23, 25), (24, 26), (25, 27), (26, 28),
    (27, 29), (28, 30), (29, 31), (30, 32), (27, 31), (28, 32),
])


def _pt(p: tuple[float, float]) -> tuple[int, int]:
    return (int(round(p[0])), int(round(p[1])))


def draw_skeleton(
    frame: np.ndarray,
    keypoints: list[tuple[float, float]],
    color: tuple[int, int, int] = (0, 255, 0),
    thickness: int = 2,
) -> None:
    """Draw pose skeleton on frame (in-place). keypoints: list of (x,y) for 33 landmarks."""
    if not keypoints or len(keypoints) < 33:
        return
    for (i, j) in _POSE_CONNECTIONS:
        if i < len(keypoints) and j < len(keypoints):
            cv2.line(frame, _pt(keypoints[i]), _pt(keypoints[j]), color, thickness)
    for p in keypoints:
        cv2.circle(frame, _pt(p), 3, color, -1)


def draw_realtime_overlay(
    frame: np.ndarray,
    keypoints: Optional[list[tuple[float, float]]],
    rep_count: int,
    knee_flexion_deg: Optional[float],
    trunk_angle_deg: Optional[float],
    com_offset_norm: Optional[float],
    speed_proxy: Optional[float],
    status: str,
    message: Optional[str] = None,
    ai_message: Optional[str] = None,
) -> None:
    """
    Draw realtime overlay on frame (in-place):
    - Skeleton if keypoints present
    - Rep: N, Knee flexion, Trunk angle, COM offset, Speed, Status
    - Optional message (e.g. "Move into frame")
    """
    h, w = frame.shape[:2]
    if keypoints:
        draw_skeleton(frame, keypoints, color=(0, 255, 0), thickness=2)

    # Semi-transparent panel for text
    panel_h = 200 if ai_message else 170
    overlay = frame.copy()
    cv2.rectangle(overlay, (0, 0), (w, panel_h), (40, 40, 40), -1)
    cv2.addWeighted(overlay, 0.6, frame, 0.4, 0, frame)

    font = cv2.FONT_HERSHEY_SIMPLEX
    scale = 0.6
    thick = 2
    y0, dy = 28, 28
    color = (255, 255, 255)

    def put(line: str, y: int) -> None:
        cv2.putText(frame, line, (12, y), font, scale, color, thick, cv2.LINE_AA)

    def fmt(val: Optional[float]) -> str:
        return f"{val:.2f}" if val is not None else "--"

    put(f"Rep: {rep_count}", y0)
    put(f"Knee flex: {fmt(knee_flexion_deg)} deg", y0 + dy)
    put(f"Trunk: {fmt(trunk_angle_deg)} deg", y0 + 2 * dy)
    put(f"COM off: {fmt(com_offset_norm)}", y0 + 3 * dy)
    put(f"Speed: {fmt(speed_proxy)}", y0 + 4 * dy)
    put(f"Status: {status}", y0 + 5 * dy)
    if ai_message:
        msg = ai_message.replace("\n", " ").strip()
        if len(msg) > 64:
            msg = msg[:61] + "..."
        put(f"AI: {msg}", y0 + 6 * dy)

    if message:
        # Message at bottom or center
        cv2.putText(
            frame, message, (w // 2 - 120, h // 2),
            font, 0.8, (0, 200, 255), 2, cv2.LINE_AA
        )


def draw_overlay_batch(
    frame: np.ndarray,
    keypoints: Optional[list[tuple[float, float]]],
    frame_idx: int,
    rep_annotations: Optional[list[dict[str, Any]]] = None,
) -> None:
    """Batch/offline overlay: skeleton + optional rep annotations (e.g. rep number at bottom)."""
    if keypoints:
        draw_skeleton(frame, keypoints, color=(0, 255, 0), thickness=2)
    if rep_annotations:
        for ann in rep_annotations:
            start, end = ann.get("start_frame"), ann.get("end_frame")
            if start is not None and end is not None and start <= frame_idx <= end:
                rep_num = ann.get("rep", 0)
                cv2.putText(
                    frame, f"Rep {rep_num}",
                    (20, frame.shape[0] - 20),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2, cv2.LINE_AA
                )
                break
