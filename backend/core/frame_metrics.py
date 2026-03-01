"""Per-frame biomechanics metrics computation.

Extracted from src/reps.py. Uses backend.core.geometry for all angle/pose
calculations. Produces a metrics dict consumed by the scoring engine and
rep detector.
"""
from __future__ import annotations

import math
from typing import Any, Optional

from .geometry import (
    com_proxy,
    balance_metrics,
    hip_angle_deg,
    hip_below_knee,
    hip_below_knee_3d,
    knee_angle_deg,
    knee_angle_deg_3d,
    knee_angles_deg_separate,
    knee_angles_deg_3d_separate,
    pose_valid_3d,
    trunk_angle_deg,
    trunk_angle_deg_3d,
)

# Knee flexion (deg) for "Depth OK" -- parallel or below.
PARALLEL_KNEE_FLEXION_DEG = 90.0
# Maximum forward trunk angle allowed from vertical (deg).
MAX_TRUNK_ANGLE_DEG = 50.0
# Additional trunk angle above baseline allowed (deg).
TRUNK_DELTA_DEG = 20.0


def _pose_confidence(
    knee_angle: Optional[float],
    hip_angle: Optional[float],
    trunk_angle: Optional[float],
    com_offset_norm: Optional[float],
    hip_below: Optional[bool],
) -> float:
    """Heuristic confidence based on metric availability (0..1)."""
    score = 1.0
    if knee_angle is None:
        score -= 0.40
    if hip_angle is None:
        score -= 0.15
    if trunk_angle is None:
        score -= 0.15
    if com_offset_norm is None:
        score -= 0.15
    if hip_below is None:
        score -= 0.15
    return max(0.0, min(1.0, score))


def _median(values: list[float]) -> Optional[float]:
    if not values:
        return None
    s = sorted(values)
    n = len(s)
    if n % 2 == 1:
        return s[n // 2]
    return (s[n // 2 - 1] + s[n // 2]) / 2.0


def compute_baseline(samples: list[dict[str, Any]]) -> dict[str, Optional[float]]:
    """Compute baseline metrics from calibration samples."""
    knee_flexions = [s["knee_flexion_deg"] for s in samples if s.get("knee_flexion_deg") is not None]
    trunk_angles = [s["trunk_angle_deg"] for s in samples if s.get("trunk_angle_deg") is not None]
    hip_angles = [s["hip_angle_deg"] for s in samples if s.get("hip_angle_deg") is not None]
    com_offsets = [s["com_offset_norm"] for s in samples if s.get("com_offset_norm") is not None]
    return {
        "knee_flexion_deg": _median(knee_flexions),
        "trunk_angle_deg": _median(trunk_angles),
        "hip_angle_deg": _median(hip_angles),
        "com_offset_norm": _median(com_offsets),
    }


def compute_frame_metrics(
    keypoints: Optional[list[tuple[float, float]]],
    baseline: Optional[dict[str, Optional[float]]] = None,
    keypoints_3d: Optional[list[tuple[float, float, float]]] = None,
) -> dict[str, Optional[float] | Optional[bool]]:
    """Compute per-frame biomechanics metrics from keypoints.

    When ``keypoints_3d`` is provided and valid, knee angle, trunk angle,
    hip-below-knee, and depth are computed from 3D world landmarks
    (view-invariant). COM/balance stays on 2D.
    """
    if not keypoints:
        return {
            "knee_angle_deg": None,
            "knee_flexion_deg": None,
            "left_knee_flexion_deg": None,
            "right_knee_flexion_deg": None,
            "depth_ok": None,
            "hip_angle_deg": None,
            "trunk_angle_deg": None,
            "trunk_ok": None,
            "com_offset_norm": None,
            "balance_ok": None,
            "form_ok": None,
            "pose_confidence": None,
        }

    use_3d = keypoints_3d is not None and pose_valid_3d(keypoints_3d)

    if use_3d:
        knee_angle = knee_angle_deg_3d(keypoints_3d)  # type: ignore[arg-type]
        trunk_angle = trunk_angle_deg_3d(keypoints_3d)  # type: ignore[arg-type]
        hip_below = hip_below_knee_3d(keypoints_3d)  # type: ignore[arg-type]
        left_ka, right_ka = knee_angles_deg_3d_separate(keypoints_3d)  # type: ignore[arg-type]
    else:
        knee_angle = knee_angle_deg(keypoints)
        trunk_angle = trunk_angle_deg(keypoints)
        hip_below = hip_below_knee(keypoints)
        left_ka, right_ka = knee_angles_deg_separate(keypoints)

    knee_flexion = (180.0 - knee_angle) if knee_angle is not None else None
    left_knee_flexion = (180.0 - left_ka) if left_ka is not None else None
    right_knee_flexion = (180.0 - right_ka) if right_ka is not None else None
    hip_angle = hip_angle_deg(keypoints)  # stays 2D (informational)

    # COM / balance always from 2D
    com = com_proxy(keypoints)
    com_offset_norm, balance_ok = balance_metrics(keypoints, com)
    pose_conf = _pose_confidence(knee_angle, hip_angle, trunk_angle, com_offset_norm, hip_below)

    base_trunk = baseline.get("trunk_angle_deg") if baseline else None
    depth_by_flexion = knee_flexion is not None and knee_flexion >= PARALLEL_KNEE_FLEXION_DEG
    trunk_threshold = min(
        MAX_TRUNK_ANGLE_DEG,
        (base_trunk + TRUNK_DELTA_DEG) if base_trunk is not None else MAX_TRUNK_ANGLE_DEG,
    )
    if hip_below is None:
        depth_ok = depth_by_flexion
    else:
        depth_ok = depth_by_flexion and hip_below
    trunk_ok = trunk_angle is not None and trunk_angle <= trunk_threshold
    form_ok = (
        depth_ok
        and (balance_ok is not False)
        and (trunk_ok is not False)
    )
    return {
        "knee_angle_deg": knee_angle,
        "knee_flexion_deg": knee_flexion,
        "left_knee_flexion_deg": left_knee_flexion,
        "right_knee_flexion_deg": right_knee_flexion,
        "depth_ok": depth_ok,
        "hip_angle_deg": hip_angle,
        "trunk_angle_deg": trunk_angle,
        "trunk_ok": trunk_ok,
        "com_offset_norm": com_offset_norm,
        "balance_ok": balance_ok,
        "form_ok": form_ok,
        "pose_confidence": pose_conf,
    }
