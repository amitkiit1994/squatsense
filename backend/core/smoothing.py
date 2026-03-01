"""
EMA (Exponential Moving Average) smoothing for 2D and 3D keypoints.
Extracted from src/reps.py.
"""
from __future__ import annotations

from typing import Optional


def smooth_keypoints_ema(
    current: list[tuple[float, float]],
    previous: Optional[list[tuple[float, float]]],
    alpha: float = 0.4,
) -> list[tuple[float, float]]:
    """One-step EMA smoothing for 2D keypoints."""
    if previous is None or len(previous) != len(current):
        return current
    return [
        (alpha * curr[0] + (1 - alpha) * prev[0], alpha * curr[1] + (1 - alpha) * prev[1])
        for curr, prev in zip(current, previous)
    ]


def smooth_keypoints_ema_3d(
    current: list[tuple[float, float, float]],
    previous: Optional[list[tuple[float, float, float]]],
    alpha: float = 0.4,
) -> list[tuple[float, float, float]]:
    """One-step EMA smoothing for 3D keypoints."""
    if previous is None or len(previous) != len(current):
        return current
    return [
        (
            alpha * curr[0] + (1 - alpha) * prev[0],
            alpha * curr[1] + (1 - alpha) * prev[1],
            alpha * curr[2] + (1 - alpha) * prev[2],
        )
        for curr, prev in zip(current, previous)
    ]
