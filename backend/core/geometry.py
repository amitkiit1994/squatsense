from __future__ import annotations

"""
Geometry and biomechanics helper functions for squat analysis.

Provides 2D and 3D point/angle utilities, COM approximation, balance metrics,
and pose validation. Extracted from src/reps.py and made public.
"""
import math
from typing import Optional

from .pose import LandmarkIdx

# Margin beyond foot base where COM is still considered "balanced"
BALANCE_MARGIN = 0.05


# ---------------------------------------------------------------------------
# 2D geometry helpers (image / pixel coordinates)
# ---------------------------------------------------------------------------

def get_point(
    keypoints: list[tuple[float, float]] | None,
    idx: int,
) -> Optional[tuple[float, float]]:
    """Return the 2D keypoint at *idx*, or None if unavailable."""
    if not keypoints or idx >= len(keypoints):
        return None
    return keypoints[idx]


def midpoint(
    a: Optional[tuple[float, float]],
    b: Optional[tuple[float, float]],
) -> Optional[tuple[float, float]]:
    """Return the midpoint of two 2D points, or None if either is missing."""
    if a is None or b is None:
        return None
    return ((a[0] + b[0]) / 2.0, (a[1] + b[1]) / 2.0)


def angle_deg(
    a: Optional[tuple[float, float]],
    b: Optional[tuple[float, float]],
    c: Optional[tuple[float, float]],
) -> Optional[float]:
    """Angle at *b* for triangle a-b-c, in degrees."""
    if a is None or b is None or c is None:
        return None
    ba = (a[0] - b[0], a[1] - b[1])
    bc = (c[0] - b[0], c[1] - b[1])
    norm_ba = math.hypot(ba[0], ba[1])
    norm_bc = math.hypot(bc[0], bc[1])
    denom = norm_ba * norm_bc
    if denom < 1e-6:
        return None
    cos_val = (ba[0] * bc[0] + ba[1] * bc[1]) / denom
    cos_val = max(-1.0, min(1.0, cos_val))
    return math.degrees(math.acos(cos_val))


def hip_y(keypoints: list[tuple[float, float]]) -> Optional[float]:
    """Average hip Y (higher = lower on screen in image coords)."""
    lh = get_point(keypoints, LandmarkIdx.LEFT_HIP)
    rh = get_point(keypoints, LandmarkIdx.RIGHT_HIP)
    if lh is None or rh is None:
        return None
    return (lh[1] + rh[1]) / 2.0


def hip_y_norm(keypoints: list[tuple[float, float]]) -> Optional[float]:
    """Scale-robust hip Y using ankle reference and leg length when available."""
    hy = hip_y(keypoints)
    la = get_point(keypoints, LandmarkIdx.LEFT_ANKLE)
    ra = get_point(keypoints, LandmarkIdx.RIGHT_ANKLE)
    lh = get_point(keypoints, LandmarkIdx.LEFT_HIP)
    rh = get_point(keypoints, LandmarkIdx.RIGHT_HIP)
    if hy is None:
        return None
    if la is None or ra is None or lh is None or rh is None:
        return hy
    ankle_y = (la[1] + ra[1]) / 2.0
    hip_mid = ((lh[0] + rh[0]) / 2.0, (lh[1] + rh[1]) / 2.0)
    ankle_mid = ((la[0] + ra[0]) / 2.0, (la[1] + ra[1]) / 2.0)
    leg_len = math.hypot(hip_mid[0] - ankle_mid[0], hip_mid[1] - ankle_mid[1])
    if leg_len < 1e-6:
        return hy
    return (hy - ankle_y) / leg_len


def trunk_angle_deg(keypoints: list[tuple[float, float]]) -> Optional[float]:
    """Trunk angle from vertical. 0 = upright, larger = more forward lean."""
    ls = get_point(keypoints, LandmarkIdx.LEFT_SHOULDER)
    rs = get_point(keypoints, LandmarkIdx.RIGHT_SHOULDER)
    lh = get_point(keypoints, LandmarkIdx.LEFT_HIP)
    rh = get_point(keypoints, LandmarkIdx.RIGHT_HIP)
    shoulder_mid = midpoint(ls, rs)
    hip_mid = midpoint(lh, rh)
    if shoulder_mid is None or hip_mid is None:
        return None
    dx = shoulder_mid[0] - hip_mid[0]
    dy = shoulder_mid[1] - hip_mid[1]
    if abs(dx) + abs(dy) < 1e-6:
        return None
    return math.degrees(math.atan2(abs(dx), abs(dy)))


def knee_angle_deg(keypoints: list[tuple[float, float]]) -> Optional[float]:
    """Average knee angle from 2D keypoints (left/right)."""
    left, right = knee_angles_deg_separate(keypoints)
    if left is None and right is None:
        return None
    if left is None:
        return right
    if right is None:
        return left
    return (left + right) / 2.0


def knee_angles_deg_separate(
    keypoints: list[tuple[float, float]],
) -> tuple[Optional[float], Optional[float]]:
    """Return (left_knee_angle, right_knee_angle) individually from 2D keypoints."""
    lh = get_point(keypoints, LandmarkIdx.LEFT_HIP)
    rh = get_point(keypoints, LandmarkIdx.RIGHT_HIP)
    lk = get_point(keypoints, LandmarkIdx.LEFT_KNEE)
    rk = get_point(keypoints, LandmarkIdx.RIGHT_KNEE)
    la = get_point(keypoints, LandmarkIdx.LEFT_ANKLE)
    ra = get_point(keypoints, LandmarkIdx.RIGHT_ANKLE)
    left = angle_deg(lh, lk, la)
    right = angle_deg(rh, rk, ra)
    return left, right


def hip_angle_deg(keypoints: list[tuple[float, float]]) -> Optional[float]:
    """Hip angle (shoulder-hip-knee) from 2D keypoints."""
    ls = get_point(keypoints, LandmarkIdx.LEFT_SHOULDER)
    rs = get_point(keypoints, LandmarkIdx.RIGHT_SHOULDER)
    lh = get_point(keypoints, LandmarkIdx.LEFT_HIP)
    rh = get_point(keypoints, LandmarkIdx.RIGHT_HIP)
    lk = get_point(keypoints, LandmarkIdx.LEFT_KNEE)
    rk = get_point(keypoints, LandmarkIdx.RIGHT_KNEE)
    shoulder_mid = midpoint(ls, rs)
    hip_mid = midpoint(lh, rh)
    knee_mid = midpoint(lk, rk)
    return angle_deg(shoulder_mid, hip_mid, knee_mid)


def hip_below_knee(
    keypoints: list[tuple[float, float]],
) -> Optional[bool]:
    """Check if hip is below knee in image coords (side view proxy)."""
    lh = get_point(keypoints, LandmarkIdx.LEFT_HIP)
    rh = get_point(keypoints, LandmarkIdx.RIGHT_HIP)
    lk = get_point(keypoints, LandmarkIdx.LEFT_KNEE)
    rk = get_point(keypoints, LandmarkIdx.RIGHT_KNEE)
    la = get_point(keypoints, LandmarkIdx.LEFT_ANKLE)
    ra = get_point(keypoints, LandmarkIdx.RIGHT_ANKLE)
    if lh is None or rh is None or lk is None or rk is None:
        return None
    hip_mid = ((lh[0] + rh[0]) / 2.0, (lh[1] + rh[1]) / 2.0)
    knee_mid = ((lk[0] + rk[0]) / 2.0, (lk[1] + rk[1]) / 2.0)
    margin = 0.0
    if la is not None and ra is not None:
        ankle_mid = ((la[0] + ra[0]) / 2.0, (la[1] + ra[1]) / 2.0)
        leg_len = math.hypot(hip_mid[0] - ankle_mid[0], hip_mid[1] - ankle_mid[1])
        margin = 0.02 * leg_len
    return hip_mid[1] > (knee_mid[1] + margin)


def pose_valid(keypoints: Optional[list[tuple[float, float]]]) -> bool:
    """Basic validity check for required landmarks and reasonable limb lengths."""
    if not keypoints:
        return False
    required = [
        LandmarkIdx.LEFT_SHOULDER,
        LandmarkIdx.RIGHT_SHOULDER,
        LandmarkIdx.LEFT_HIP,
        LandmarkIdx.RIGHT_HIP,
        LandmarkIdx.LEFT_KNEE,
        LandmarkIdx.RIGHT_KNEE,
        LandmarkIdx.LEFT_ANKLE,
        LandmarkIdx.RIGHT_ANKLE,
    ]
    for idx in required:
        if get_point(keypoints, idx) is None:
            return False
    lh = get_point(keypoints, LandmarkIdx.LEFT_HIP)
    rh = get_point(keypoints, LandmarkIdx.RIGHT_HIP)
    la = get_point(keypoints, LandmarkIdx.LEFT_ANKLE)
    ra = get_point(keypoints, LandmarkIdx.RIGHT_ANKLE)
    if lh is None or rh is None or la is None or ra is None:
        return False
    left_leg = math.hypot(lh[0] - la[0], lh[1] - la[1])
    right_leg = math.hypot(rh[0] - ra[0], rh[1] - ra[1])
    if left_leg < 1e-3 or right_leg < 1e-3:
        return False
    ratio = left_leg / right_leg if right_leg > 1e-6 else 0.0
    return 0.5 <= ratio <= 2.0


# ---------------------------------------------------------------------------
# 3D geometry helpers (world landmarks in meters, hip-centered)
# ---------------------------------------------------------------------------

def get_point_3d(
    keypoints_3d: list[tuple[float, float, float]] | None,
    idx: int,
) -> Optional[tuple[float, float, float]]:
    """Return the 3D keypoint at *idx*, or None if unavailable."""
    if not keypoints_3d or idx >= len(keypoints_3d):
        return None
    return keypoints_3d[idx]


def midpoint_3d(
    a: Optional[tuple[float, float, float]],
    b: Optional[tuple[float, float, float]],
) -> Optional[tuple[float, float, float]]:
    """Return the midpoint of two 3D points, or None if either is missing."""
    if a is None or b is None:
        return None
    return ((a[0] + b[0]) / 2.0, (a[1] + b[1]) / 2.0, (a[2] + b[2]) / 2.0)


def angle_deg_3d(
    a: Optional[tuple[float, float, float]],
    b: Optional[tuple[float, float, float]],
    c: Optional[tuple[float, float, float]],
) -> Optional[float]:
    """Angle at *b* for triangle a-b-c in 3D, in degrees."""
    if a is None or b is None or c is None:
        return None
    ba = (a[0] - b[0], a[1] - b[1], a[2] - b[2])
    bc = (c[0] - b[0], c[1] - b[1], c[2] - b[2])
    norm_ba = math.sqrt(ba[0] ** 2 + ba[1] ** 2 + ba[2] ** 2)
    norm_bc = math.sqrt(bc[0] ** 2 + bc[1] ** 2 + bc[2] ** 2)
    denom = norm_ba * norm_bc
    if denom < 1e-6:
        return None
    cos_val = (ba[0] * bc[0] + ba[1] * bc[1] + ba[2] * bc[2]) / denom
    cos_val = max(-1.0, min(1.0, cos_val))
    return math.degrees(math.acos(cos_val))


def knee_angle_deg_3d(keypoints_3d: list[tuple[float, float, float]]) -> Optional[float]:
    """Average knee angle from 3D world landmarks (left/right)."""
    left, right = knee_angles_deg_3d_separate(keypoints_3d)
    if left is None and right is None:
        return None
    if left is None:
        return right
    if right is None:
        return left
    return (left + right) / 2.0


def knee_angles_deg_3d_separate(
    keypoints_3d: list[tuple[float, float, float]],
) -> tuple[Optional[float], Optional[float]]:
    """Return (left_knee_angle, right_knee_angle) individually from 3D landmarks."""
    lh = get_point_3d(keypoints_3d, LandmarkIdx.LEFT_HIP)
    rh = get_point_3d(keypoints_3d, LandmarkIdx.RIGHT_HIP)
    lk = get_point_3d(keypoints_3d, LandmarkIdx.LEFT_KNEE)
    rk = get_point_3d(keypoints_3d, LandmarkIdx.RIGHT_KNEE)
    la = get_point_3d(keypoints_3d, LandmarkIdx.LEFT_ANKLE)
    ra = get_point_3d(keypoints_3d, LandmarkIdx.RIGHT_ANKLE)
    left = angle_deg_3d(lh, lk, la)
    right = angle_deg_3d(rh, rk, ra)
    return left, right


def trunk_angle_deg_3d(
    keypoints_3d: list[tuple[float, float, float]],
    up_vector: tuple[float, float, float] = (0.0, -1.0, 0.0),
) -> Optional[float]:
    """
    Trunk angle from vertical in 3D world coords.
    Default up_vector assumes camera is roughly level (MediaPipe Y increases downward).
    """
    ls = get_point_3d(keypoints_3d, LandmarkIdx.LEFT_SHOULDER)
    rs = get_point_3d(keypoints_3d, LandmarkIdx.RIGHT_SHOULDER)
    lh = get_point_3d(keypoints_3d, LandmarkIdx.LEFT_HIP)
    rh = get_point_3d(keypoints_3d, LandmarkIdx.RIGHT_HIP)
    shoulder_mid = midpoint_3d(ls, rs)
    hip_mid = midpoint_3d(lh, rh)
    if shoulder_mid is None or hip_mid is None:
        return None
    trunk = (
        shoulder_mid[0] - hip_mid[0],
        shoulder_mid[1] - hip_mid[1],
        shoulder_mid[2] - hip_mid[2],
    )
    trunk_len = math.sqrt(trunk[0] ** 2 + trunk[1] ** 2 + trunk[2] ** 2)
    up_len = math.sqrt(up_vector[0] ** 2 + up_vector[1] ** 2 + up_vector[2] ** 2)
    denom = trunk_len * up_len
    if denom < 1e-6:
        return None
    cos_val = (trunk[0] * up_vector[0] + trunk[1] * up_vector[1] + trunk[2] * up_vector[2]) / denom
    cos_val = max(-1.0, min(1.0, cos_val))
    return math.degrees(math.acos(cos_val))


def hip_below_knee_3d(keypoints_3d: list[tuple[float, float, float]]) -> Optional[bool]:
    """
    Check if hip is below knee in 3D world coords.
    MediaPipe world: Y increases downward, so hip_y > knee_y means hip is lower.
    """
    lh = get_point_3d(keypoints_3d, LandmarkIdx.LEFT_HIP)
    rh = get_point_3d(keypoints_3d, LandmarkIdx.RIGHT_HIP)
    lk = get_point_3d(keypoints_3d, LandmarkIdx.LEFT_KNEE)
    rk = get_point_3d(keypoints_3d, LandmarkIdx.RIGHT_KNEE)
    if lh is None or rh is None or lk is None or rk is None:
        return None
    hip_y = (lh[1] + rh[1]) / 2.0
    knee_y = (lk[1] + rk[1]) / 2.0
    return hip_y > knee_y


def pose_valid_3d(keypoints_3d: Optional[list[tuple[float, float, float]]]) -> bool:
    """Validate 3D keypoints: required landmarks exist, reasonable limb lengths, no NaN."""
    if not keypoints_3d:
        return False
    required = [
        LandmarkIdx.LEFT_SHOULDER, LandmarkIdx.RIGHT_SHOULDER,
        LandmarkIdx.LEFT_HIP, LandmarkIdx.RIGHT_HIP,
        LandmarkIdx.LEFT_KNEE, LandmarkIdx.RIGHT_KNEE,
        LandmarkIdx.LEFT_ANKLE, LandmarkIdx.RIGHT_ANKLE,
    ]
    for idx in required:
        pt = get_point_3d(keypoints_3d, idx)
        if pt is None:
            return False
        if any(math.isnan(v) for v in pt):
            return False
    # Check limb lengths are in reasonable range (meters)
    lh = get_point_3d(keypoints_3d, LandmarkIdx.LEFT_HIP)
    la = get_point_3d(keypoints_3d, LandmarkIdx.LEFT_ANKLE)
    rh = get_point_3d(keypoints_3d, LandmarkIdx.RIGHT_HIP)
    ra = get_point_3d(keypoints_3d, LandmarkIdx.RIGHT_ANKLE)
    if lh is None or la is None or rh is None or ra is None:
        return False
    left_leg = math.sqrt(sum((a - b) ** 2 for a, b in zip(lh, la)))
    right_leg = math.sqrt(sum((a - b) ** 2 for a, b in zip(rh, ra)))
    if left_leg < 0.1 or left_leg > 2.0 or right_leg < 0.1 or right_leg > 2.0:
        return False
    ratio = left_leg / right_leg if right_leg > 1e-6 else 0.0
    return 0.5 <= ratio <= 2.0


# ---------------------------------------------------------------------------
# COM and balance (2D projection)
# ---------------------------------------------------------------------------

def com_proxy(
    keypoints: list[tuple[float, float]],
) -> Optional[tuple[float, float]]:
    """Approximate COM from segment midpoints (2D projection)."""
    nose = get_point(keypoints, LandmarkIdx.NOSE)
    ls = get_point(keypoints, LandmarkIdx.LEFT_SHOULDER)
    rs = get_point(keypoints, LandmarkIdx.RIGHT_SHOULDER)
    le = get_point(keypoints, LandmarkIdx.LEFT_ELBOW)
    re = get_point(keypoints, LandmarkIdx.RIGHT_ELBOW)
    lw = get_point(keypoints, LandmarkIdx.LEFT_WRIST)
    rw = get_point(keypoints, LandmarkIdx.RIGHT_WRIST)
    lh = get_point(keypoints, LandmarkIdx.LEFT_HIP)
    rh = get_point(keypoints, LandmarkIdx.RIGHT_HIP)
    lk = get_point(keypoints, LandmarkIdx.LEFT_KNEE)
    rk = get_point(keypoints, LandmarkIdx.RIGHT_KNEE)
    la = get_point(keypoints, LandmarkIdx.LEFT_ANKLE)
    ra = get_point(keypoints, LandmarkIdx.RIGHT_ANKLE)
    lheel = get_point(keypoints, LandmarkIdx.LEFT_HEEL)
    rheel = get_point(keypoints, LandmarkIdx.RIGHT_HEEL)
    lfoot = get_point(keypoints, LandmarkIdx.LEFT_FOOT_INDEX)
    rfoot = get_point(keypoints, LandmarkIdx.RIGHT_FOOT_INDEX)

    shoulder_mid = midpoint(ls, rs)
    hip_mid = midpoint(lh, rh)
    trunk_mid = midpoint(shoulder_mid, hip_mid)
    head_mid = midpoint(nose, shoulder_mid)

    left_upper_arm = midpoint(ls, le)
    right_upper_arm = midpoint(rs, re)
    left_forearm = midpoint(le, lw)
    right_forearm = midpoint(re, rw)
    left_hand = lw
    right_hand = rw

    left_thigh = midpoint(lh, lk)
    right_thigh = midpoint(rh, rk)
    left_shank = midpoint(lk, la)
    right_shank = midpoint(rk, ra)
    left_foot = midpoint(lheel or la, lfoot or la)
    right_foot = midpoint(rheel or ra, rfoot or ra)

    segments = [
        (0.08, head_mid),
        (0.50, trunk_mid),
        (0.027, left_upper_arm),
        (0.027, right_upper_arm),
        (0.016, left_forearm),
        (0.016, right_forearm),
        (0.006, left_hand),
        (0.006, right_hand),
        (0.10, left_thigh),
        (0.10, right_thigh),
        (0.046, left_shank),
        (0.046, right_shank),
        (0.014, left_foot),
        (0.014, right_foot),
    ]

    total_w = 0.0
    sum_x = 0.0
    sum_y = 0.0
    for w, pt in segments:
        if pt is None:
            continue
        total_w += w
        sum_x += w * pt[0]
        sum_y += w * pt[1]
    if total_w < 1e-6:
        return None
    return (sum_x / total_w, sum_y / total_w)


def balance_metrics(
    keypoints: list[tuple[float, float]],
    com: Optional[tuple[float, float]],
) -> tuple[Optional[float], Optional[bool]]:
    """Return (com_offset_norm, balance_ok)."""
    if com is None:
        return None, None
    lheel = get_point(keypoints, LandmarkIdx.LEFT_HEEL)
    rheel = get_point(keypoints, LandmarkIdx.RIGHT_HEEL)
    lfoot = get_point(keypoints, LandmarkIdx.LEFT_FOOT_INDEX)
    rfoot = get_point(keypoints, LandmarkIdx.RIGHT_FOOT_INDEX)
    la = get_point(keypoints, LandmarkIdx.LEFT_ANKLE)
    ra = get_point(keypoints, LandmarkIdx.RIGHT_ANKLE)

    base_pts = [p for p in (lheel, rheel, lfoot, rfoot) if p is not None]
    if len(base_pts) < 2:
        base_pts = [p for p in (la, ra) if p is not None]
    if len(base_pts) < 2:
        return None, None

    xs = [p[0] for p in base_pts]
    base_min = min(xs)
    base_max = max(xs)
    span = base_max - base_min
    if span < 1e-6:
        return None, None
    center = (base_min + base_max) / 2.0
    offset_norm = (com[0] - center) / span
    margin = BALANCE_MARGIN * span
    ok = (base_min - margin) <= com[0] <= (base_max + margin)
    return offset_norm, ok
