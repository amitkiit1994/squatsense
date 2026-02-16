"""
Rep detection: batch (offline) and incremental (live).
Uses hip Y for phase and biomechanics-derived metrics (angles, COM proxy).
"""
from __future__ import annotations

import logging
import math
from typing import Any, Optional

import numpy as np

from .pose import LandmarkIdx

logger = logging.getLogger(__name__)

# Calibration frames before enabling rep detection (standing: knee_flex <= 35°).
# ~1 s at 10 fps; enough for a stable baseline (trunk, etc.).
CALIBRATION_FRAMES = 10
# Knee flexion (deg) for "Depth OK" / form quality: parallel or below (fitness standard).
# All reps are counted; depth_ok is True only when squat is at least this deep.
PARALLEL_KNEE_FLEXION_DEG = 90.0
# Legacy: used only if baseline-based threshold is needed elsewhere.
DEPTH_DELTA_DEG = 50.0
# Maximum forward trunk angle allowed from vertical (deg).
MAX_TRUNK_ANGLE_DEG = 50.0
# Additional trunk angle above baseline allowed (deg).
TRUNK_DELTA_DEG = 20.0
# Margin beyond foot base where COM is still considered "balanced"
BALANCE_MARGIN = 0.05
# Knee flexion upper bound (deg) used to identify standing frames for calibration.
STANDING_KNEE_FLEXION_MAX = 35.0
# Default prominence fraction for peak detection (fraction of robust signal range).
PEAK_PROMINENCE_FRAC = 0.10
# Median filter window for hip signal smoothing (odd number).
HIP_SMOOTH_WINDOW = 5


def _get_point(
    keypoints: list[tuple[float, float]] | None,
    idx: int,
) -> Optional[tuple[float, float]]:
    if not keypoints or idx >= len(keypoints):
        return None
    return keypoints[idx]


def _midpoint(
    a: Optional[tuple[float, float]],
    b: Optional[tuple[float, float]],
) -> Optional[tuple[float, float]]:
    if a is None or b is None:
        return None
    return ((a[0] + b[0]) / 2.0, (a[1] + b[1]) / 2.0)


def _angle_deg(
    a: Optional[tuple[float, float]],
    b: Optional[tuple[float, float]],
    c: Optional[tuple[float, float]],
) -> Optional[float]:
    """Angle at b for triangle a-b-c, in degrees."""
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


def _hip_y(keypoints: list[tuple[float, float]]) -> Optional[float]:
    """Average hip Y (higher = lower on screen in image coords)."""
    lh = _get_point(keypoints, LandmarkIdx.LEFT_HIP)
    rh = _get_point(keypoints, LandmarkIdx.RIGHT_HIP)
    if lh is None or rh is None:
        return None
    return (lh[1] + rh[1]) / 2.0


def _hip_y_norm(keypoints: list[tuple[float, float]]) -> Optional[float]:
    """Scale-robust hip Y using ankle reference and leg length when available."""
    hip_y = _hip_y(keypoints)
    la = _get_point(keypoints, LandmarkIdx.LEFT_ANKLE)
    ra = _get_point(keypoints, LandmarkIdx.RIGHT_ANKLE)
    lh = _get_point(keypoints, LandmarkIdx.LEFT_HIP)
    rh = _get_point(keypoints, LandmarkIdx.RIGHT_HIP)
    if hip_y is None:
        return None
    if la is None or ra is None or lh is None or rh is None:
        return hip_y
    ankle_y = (la[1] + ra[1]) / 2.0
    hip_mid = ((lh[0] + rh[0]) / 2.0, (lh[1] + rh[1]) / 2.0)
    ankle_mid = ((la[0] + ra[0]) / 2.0, (la[1] + ra[1]) / 2.0)
    leg_len = math.hypot(hip_mid[0] - ankle_mid[0], hip_mid[1] - ankle_mid[1])
    if leg_len < 1e-6:
        return hip_y
    return (hip_y - ankle_y) / leg_len


def _trunk_angle_deg(keypoints: list[tuple[float, float]]) -> Optional[float]:
    """Trunk angle from vertical. 0 = upright, larger = more forward lean."""
    ls = _get_point(keypoints, LandmarkIdx.LEFT_SHOULDER)
    rs = _get_point(keypoints, LandmarkIdx.RIGHT_SHOULDER)
    lh = _get_point(keypoints, LandmarkIdx.LEFT_HIP)
    rh = _get_point(keypoints, LandmarkIdx.RIGHT_HIP)
    shoulder_mid = _midpoint(ls, rs)
    hip_mid = _midpoint(lh, rh)
    if shoulder_mid is None or hip_mid is None:
        return None
    dx = shoulder_mid[0] - hip_mid[0]
    dy = shoulder_mid[1] - hip_mid[1]
    if abs(dx) + abs(dy) < 1e-6:
        return None
    return math.degrees(math.atan2(abs(dx), abs(dy)))


def _knee_angle_deg(keypoints: list[tuple[float, float]]) -> Optional[float]:
    lh = _get_point(keypoints, LandmarkIdx.LEFT_HIP)
    rh = _get_point(keypoints, LandmarkIdx.RIGHT_HIP)
    lk = _get_point(keypoints, LandmarkIdx.LEFT_KNEE)
    rk = _get_point(keypoints, LandmarkIdx.RIGHT_KNEE)
    la = _get_point(keypoints, LandmarkIdx.LEFT_ANKLE)
    ra = _get_point(keypoints, LandmarkIdx.RIGHT_ANKLE)
    left = _angle_deg(lh, lk, la)
    right = _angle_deg(rh, rk, ra)
    if left is None and right is None:
        return None
    if left is None:
        return right
    if right is None:
        return left
    return (left + right) / 2.0


def _hip_angle_deg(keypoints: list[tuple[float, float]]) -> Optional[float]:
    ls = _get_point(keypoints, LandmarkIdx.LEFT_SHOULDER)
    rs = _get_point(keypoints, LandmarkIdx.RIGHT_SHOULDER)
    lh = _get_point(keypoints, LandmarkIdx.LEFT_HIP)
    rh = _get_point(keypoints, LandmarkIdx.RIGHT_HIP)
    lk = _get_point(keypoints, LandmarkIdx.LEFT_KNEE)
    rk = _get_point(keypoints, LandmarkIdx.RIGHT_KNEE)
    shoulder_mid = _midpoint(ls, rs)
    hip_mid = _midpoint(lh, rh)
    knee_mid = _midpoint(lk, rk)
    return _angle_deg(shoulder_mid, hip_mid, knee_mid)


def _hip_below_knee(
    keypoints: list[tuple[float, float]],
) -> Optional[bool]:
    """Check if hip is below knee in image coords (side view proxy)."""
    lh = _get_point(keypoints, LandmarkIdx.LEFT_HIP)
    rh = _get_point(keypoints, LandmarkIdx.RIGHT_HIP)
    lk = _get_point(keypoints, LandmarkIdx.LEFT_KNEE)
    rk = _get_point(keypoints, LandmarkIdx.RIGHT_KNEE)
    la = _get_point(keypoints, LandmarkIdx.LEFT_ANKLE)
    ra = _get_point(keypoints, LandmarkIdx.RIGHT_ANKLE)
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


def _com_proxy(
    keypoints: list[tuple[float, float]],
) -> Optional[tuple[float, float]]:
    """Approximate COM from segment midpoints (2D projection)."""
    nose = _get_point(keypoints, LandmarkIdx.NOSE)
    ls = _get_point(keypoints, LandmarkIdx.LEFT_SHOULDER)
    rs = _get_point(keypoints, LandmarkIdx.RIGHT_SHOULDER)
    le = _get_point(keypoints, LandmarkIdx.LEFT_ELBOW)
    re = _get_point(keypoints, LandmarkIdx.RIGHT_ELBOW)
    lw = _get_point(keypoints, LandmarkIdx.LEFT_WRIST)
    rw = _get_point(keypoints, LandmarkIdx.RIGHT_WRIST)
    lh = _get_point(keypoints, LandmarkIdx.LEFT_HIP)
    rh = _get_point(keypoints, LandmarkIdx.RIGHT_HIP)
    lk = _get_point(keypoints, LandmarkIdx.LEFT_KNEE)
    rk = _get_point(keypoints, LandmarkIdx.RIGHT_KNEE)
    la = _get_point(keypoints, LandmarkIdx.LEFT_ANKLE)
    ra = _get_point(keypoints, LandmarkIdx.RIGHT_ANKLE)
    lheel = _get_point(keypoints, LandmarkIdx.LEFT_HEEL)
    rheel = _get_point(keypoints, LandmarkIdx.RIGHT_HEEL)
    lfoot = _get_point(keypoints, LandmarkIdx.LEFT_FOOT_INDEX)
    rfoot = _get_point(keypoints, LandmarkIdx.RIGHT_FOOT_INDEX)

    shoulder_mid = _midpoint(ls, rs)
    hip_mid = _midpoint(lh, rh)
    trunk_mid = _midpoint(shoulder_mid, hip_mid)
    head_mid = _midpoint(nose, shoulder_mid)

    left_upper_arm = _midpoint(ls, le)
    right_upper_arm = _midpoint(rs, re)
    left_forearm = _midpoint(le, lw)
    right_forearm = _midpoint(re, rw)
    left_hand = lw
    right_hand = rw

    left_thigh = _midpoint(lh, lk)
    right_thigh = _midpoint(rh, rk)
    left_shank = _midpoint(lk, la)
    right_shank = _midpoint(rk, ra)
    left_foot = _midpoint(lheel or la, lfoot or la)
    right_foot = _midpoint(rheel or ra, rfoot or ra)

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


def _balance_metrics(
    keypoints: list[tuple[float, float]],
    com: Optional[tuple[float, float]],
) -> tuple[Optional[float], Optional[bool]]:
    """Return (com_offset_norm, balance_ok)."""
    if com is None:
        return None, None
    lheel = _get_point(keypoints, LandmarkIdx.LEFT_HEEL)
    rheel = _get_point(keypoints, LandmarkIdx.RIGHT_HEEL)
    lfoot = _get_point(keypoints, LandmarkIdx.LEFT_FOOT_INDEX)
    rfoot = _get_point(keypoints, LandmarkIdx.RIGHT_FOOT_INDEX)
    la = _get_point(keypoints, LandmarkIdx.LEFT_ANKLE)
    ra = _get_point(keypoints, LandmarkIdx.RIGHT_ANKLE)

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


def _pose_valid(keypoints: Optional[list[tuple[float, float]]]) -> bool:
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
        if _get_point(keypoints, idx) is None:
            return False
    lh = _get_point(keypoints, LandmarkIdx.LEFT_HIP)
    rh = _get_point(keypoints, LandmarkIdx.RIGHT_HIP)
    la = _get_point(keypoints, LandmarkIdx.LEFT_ANKLE)
    ra = _get_point(keypoints, LandmarkIdx.RIGHT_ANKLE)
    if lh is None or rh is None or la is None or ra is None:
        return False
    left_leg = math.hypot(lh[0] - la[0], lh[1] - la[1])
    right_leg = math.hypot(rh[0] - ra[0], rh[1] - ra[1])
    if left_leg < 1e-3 or right_leg < 1e-3:
        return False
    ratio = left_leg / right_leg if right_leg > 1e-6 else 0.0
    return 0.5 <= ratio <= 2.0


def _median(values: list[float]) -> Optional[float]:
    if not values:
        return None
    return float(np.median(values))


def _median_filter(values: np.ndarray, window: int) -> np.ndarray:
    if window < 3 or window % 2 == 0:
        return values
    half = window // 2
    out = values.copy()
    n = len(values)
    for i in range(n):
        lo = max(0, i - half)
        hi = min(n, i + half + 1)
        out[i] = np.nanmedian(values[lo:hi])
    return out


def _pose_confidence(
    knee_angle: Optional[float],
    hip_angle: Optional[float],
    trunk_angle: Optional[float],
    com_offset_norm: Optional[float],
    hip_below_knee: Optional[bool],
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
    if hip_below_knee is None:
        score -= 0.15
    return max(0.0, min(1.0, score))


def _compute_baseline(samples: list[dict[str, Any]]) -> dict[str, Optional[float]]:
    """Compute baseline metrics from calibration samples."""
    knee_flexions = [s.get("knee_flexion_deg") for s in samples if s.get("knee_flexion_deg") is not None]
    trunk_angles = [s.get("trunk_angle_deg") for s in samples if s.get("trunk_angle_deg") is not None]
    hip_angles = [s.get("hip_angle_deg") for s in samples if s.get("hip_angle_deg") is not None]
    com_offsets = [s.get("com_offset_norm") for s in samples if s.get("com_offset_norm") is not None]
    return {
        "knee_flexion_deg": _median(knee_flexions),
        "trunk_angle_deg": _median(trunk_angles),
        "hip_angle_deg": _median(hip_angles),
        "com_offset_norm": _median(com_offsets),
    }

def compute_frame_metrics(
    keypoints: Optional[list[tuple[float, float]]],
    baseline: Optional[dict[str, Optional[float]]] = None,
) -> dict[str, Optional[float] | Optional[bool]]:
    """Compute per-frame biomechanics metrics from keypoints."""
    if not keypoints:
        return {
            "knee_angle_deg": None,
            "knee_flexion_deg": None,
            "depth_ok": None,
            "hip_angle_deg": None,
            "trunk_angle_deg": None,
            "trunk_ok": None,
            "com_offset_norm": None,
            "balance_ok": None,
            "form_ok": None,
            "pose_confidence": None,
        }
    knee_angle = _knee_angle_deg(keypoints)
    knee_flexion = (180.0 - knee_angle) if knee_angle is not None else None
    hip_angle = _hip_angle_deg(keypoints)
    trunk_angle = _trunk_angle_deg(keypoints)
    com = _com_proxy(keypoints)
    com_offset_norm, balance_ok = _balance_metrics(keypoints, com)
    hip_below_knee = _hip_below_knee(keypoints)
    pose_conf = _pose_confidence(knee_angle, hip_angle, trunk_angle, com_offset_norm, hip_below_knee)

    base_trunk = baseline.get("trunk_angle_deg") if baseline else None
    # Depth OK = parallel or below (user-dependent depth still counts as a rep; form quality only)
    depth_by_flexion = knee_flexion is not None and knee_flexion >= PARALLEL_KNEE_FLEXION_DEG
    trunk_threshold = min(
        MAX_TRUNK_ANGLE_DEG,
        (base_trunk + TRUNK_DELTA_DEG) if base_trunk is not None else MAX_TRUNK_ANGLE_DEG,
    )
    if hip_below_knee is None:
        depth_ok = depth_by_flexion
    else:
        depth_ok = depth_by_flexion and hip_below_knee
    trunk_ok = trunk_angle is not None and trunk_angle <= trunk_threshold
    form_ok = (
        depth_ok
        and (balance_ok is not False)
        and (trunk_ok is not False)
    )
    return {
        "knee_angle_deg": knee_angle,
        "knee_flexion_deg": knee_flexion,
        "depth_ok": depth_ok,
        "hip_angle_deg": hip_angle,
        "trunk_angle_deg": trunk_angle,
        "trunk_ok": trunk_ok,
        "com_offset_norm": com_offset_norm,
        "balance_ok": balance_ok,
        "form_ok": form_ok,
        "pose_confidence": pose_conf,
    }


def detect_reps_batch(
    keypoints_series: list[Optional[list[tuple[float, float]]]],
    fps: float,
    min_frames_between_peaks: int = 10,
) -> tuple[list[dict[str, Any]], list[float]]:
    """
    Offline: detect reps from full keypoints series.
    Returns (rep_annotations, hip_y_curve).
    """
    ys = []
    for kp in keypoints_series:
        y = _hip_y_norm(kp) if kp else np.nan
        ys.append(y)
    ys = np.array(ys, dtype=float)
    valid = np.isfinite(ys)
    if not np.any(valid):
        return [], ys.tolist()
    reps = []
    # Calibration baseline from early valid frames
    calib_samples: list[dict[str, Any]] = []
    for kp in keypoints_series[: max(10, CALIBRATION_FRAMES * 2)]:
        if not _pose_valid(kp):
            continue
        m = compute_frame_metrics(kp, baseline=None)
        kf = m.get("knee_flexion_deg")
        if kf is None or kf > STANDING_KNEE_FLEXION_MAX:
            continue
        calib_samples.append(m)
    baseline = _compute_baseline(calib_samples) if calib_samples else None
    n = len(ys)
    from scipy.signal import find_peaks
    ys_smooth = _median_filter(ys, HIP_SMOOTH_WINDOW)
    p05 = np.nanpercentile(ys_smooth, 5)
    p95 = np.nanpercentile(ys_smooth, 95)
    prom = PEAK_PROMINENCE_FRAC * max(1e-6, (p95 - p05))
    peaks, _ = find_peaks(ys_smooth, distance=min_frames_between_peaks, prominence=prom)
    troughs, _ = find_peaks(-ys_smooth, distance=min_frames_between_peaks, prominence=prom)
    for i in range(len(troughs) - 1):
        t1, t2 = troughs[i], troughs[i + 1]
        in_between = peaks[(peaks > t1) & (peaks < t2)]
        if len(in_between) == 0:
            continue
        # Hip Y: peaks = squat bottom, troughs = standing. Use peak for depth metrics.
        bottom_f = int(in_between[np.argmax(ys_smooth[in_between])])
        start_f, end_f = int(t1), int(t2)
        kp_bottom = keypoints_series[bottom_f] if bottom_f < n else None
        metrics = compute_frame_metrics(kp_bottom, baseline=baseline)
        duration_sec = (end_f - start_f) / fps if fps > 0 else None
        speed_proxy = 1.0 / duration_sec if duration_sec and duration_sec > 0 else None
        # Count every rep; depth_ok in metrics indicates form (parallel or below)
        pose_conf = metrics.get("pose_confidence")
        needs_review = pose_conf is None or pose_conf < 0.6
        rep = {
            "rep": len(reps) + 1,
            "start_frame": int(start_f),
            "end_frame": int(end_f),
            "bottom_frame": int(bottom_f),
            "duration_sec": duration_sec,
            "speed_proxy": speed_proxy,
            "pose_confidence": pose_conf,
            "needs_review": needs_review,
        }
        rep.update(metrics)
        reps.append(rep)
    return reps, ys.tolist()


class IncrementalRepDetector:
    """
    Sliding-window rep detection from rolling hip-y signal.
    Confirms rep on peak -> trough -> peak; computes metrics at bottom.
    Requires minimum frames between confirmed reps to avoid counting the same
    rep multiple times as the window slides.
    """

    def __init__(
        self,
        window_size: int = 60,
        min_frames_peak_to_trough: int = 5,
        min_frames_trough_to_peak: int = 5,
        min_frames_between_reps: int = 6,
    ):
        self.window_size = window_size
        self.min_pt = min_frames_peak_to_trough
        self.min_tp = min_frames_trough_to_peak
        self.min_frames_between_reps = min_frames_between_reps
        self.hip_y_buffer: list[float] = []
        self.keypoint_buffer: list[Optional[list[tuple[float, float]]]] = []
        self.rep_count = 0
        self.last_phase: str = "TOP_READY"
        self.confirmed_reps: list[dict[str, Any]] = []
        self._last_peak_idx: Optional[int] = -1
        self._last_trough_idx: Optional[int] = -1
        self._last_confirmed_end_frame: Optional[int] = None
        self._calib_samples: list[dict[str, Any]] = []
        self.baseline: Optional[dict[str, Optional[float]]] = None
        self.calibrated = False
        self._current_start_frame: Optional[int] = None
        self._current_bottom_frame: Optional[int] = None
        self._current_bottom_metrics: Optional[dict[str, Any]] = None
        self._current_bottom_y: Optional[float] = None

    def reset(self) -> None:
        self.hip_y_buffer.clear()
        self.keypoint_buffer.clear()
        self.rep_count = 0
        self.last_phase = "TOP_READY"
        self.confirmed_reps.clear()
        self._last_peak_idx = -1
        self._last_trough_idx = -1
        self._last_confirmed_end_frame = None
        self._calib_samples.clear()
        self.baseline = None
        self.calibrated = False
        self._current_start_frame = None
        self._current_bottom_frame = None
        self._current_bottom_metrics = None
        self._current_bottom_y = None

    def push(
        self,
        frame_idx: int,
        keypoints: Optional[list[tuple[float, float]]],
        fps: float,
    ) -> dict[str, Any]:
        """
        Push one frame. Returns current state for overlay:
        rep_count, knee_flexion_deg, trunk_angle_deg, com_offset_norm, speed_proxy, status.
        """
        valid_pose = _pose_valid(keypoints)
        y = _hip_y_norm(keypoints) if keypoints else np.nan
        self.hip_y_buffer.append(y if np.isfinite(y) else np.nan)
        self.keypoint_buffer.append(keypoints)

        if len(self.hip_y_buffer) > self.window_size:
            self.hip_y_buffer.pop(0)
            self.keypoint_buffer.pop(0)

        buf = np.array(self.hip_y_buffer, dtype=float)
        valid = np.isfinite(buf)
        n = len(buf)
        metrics = compute_frame_metrics(keypoints if valid_pose else None, baseline=self.baseline)
        speed = None
        status = "Tracking"

        if not self.calibrated and not valid_pose:
            return {
                "rep_count": self.rep_count,
                "knee_flexion_deg": metrics.get("knee_flexion_deg"),
                "trunk_angle_deg": metrics.get("trunk_angle_deg"),
                "com_offset_norm": metrics.get("com_offset_norm"),
                "speed_proxy": speed,
                "status": "Waiting for pose",
                "phase": self.last_phase,
            }

        if valid_pose and not self.calibrated:
            m = compute_frame_metrics(keypoints, baseline=None)
            kf = m.get("knee_flexion_deg")
            if kf is not None and kf <= STANDING_KNEE_FLEXION_MAX:
                self._calib_samples.append(m)
            if len(self._calib_samples) >= CALIBRATION_FRAMES:
                self.baseline = _compute_baseline(self._calib_samples)
                self.calibrated = True
                self.hip_y_buffer.clear()
                self.keypoint_buffer.clear()
                logger.info("live_rep: calibrated (baseline knee_flex=%s)", self.baseline.get("knee_flexion_deg"))
                return {
                    "rep_count": self.rep_count,
                    "knee_flexion_deg": metrics.get("knee_flexion_deg"),
                    "trunk_angle_deg": metrics.get("trunk_angle_deg"),
                    "com_offset_norm": metrics.get("com_offset_norm"),
                    "speed_proxy": speed,
                    "status": "Calibrated",
                    "phase": self.last_phase,
                }
            return {
                "rep_count": self.rep_count,
                "knee_flexion_deg": metrics.get("knee_flexion_deg"),
                "trunk_angle_deg": metrics.get("trunk_angle_deg"),
                "com_offset_norm": metrics.get("com_offset_norm"),
                "speed_proxy": speed,
                "status": f"Calibrating {len(self._calib_samples)}/{CALIBRATION_FRAMES}",
                "phase": self.last_phase,
            }

        if not valid_pose:
            return {
                "rep_count": self.rep_count,
                "knee_flexion_deg": metrics.get("knee_flexion_deg"),
                "trunk_angle_deg": metrics.get("trunk_angle_deg"),
                "com_offset_norm": metrics.get("com_offset_norm"),
                "speed_proxy": speed,
                "status": "No pose",
                "phase": self.last_phase,
            }

        if n < self.min_pt + self.min_tp + 5:
            return {
                "rep_count": self.rep_count,
                "knee_flexion_deg": metrics.get("knee_flexion_deg"),
                "trunk_angle_deg": metrics.get("trunk_angle_deg"),
                "com_offset_norm": metrics.get("com_offset_norm"),
                "speed_proxy": speed,
                "status": status,
                "phase": self.last_phase,
            }

        buf_fill = buf.copy()
        if np.any(valid):
            last_valid = np.where(valid)[0]
            for i in range(n):
                if not valid[i]:
                    idx = np.searchsorted(last_valid, i)
                    if idx == 0:
                        buf_fill[i] = buf[last_valid[0]]
                    elif idx >= len(last_valid):
                        buf_fill[i] = buf[last_valid[-1]]
                    else:
                        buf_fill[i] = buf[last_valid[idx - 1]]

        from scipy.signal import find_peaks
        buf_smooth = _median_filter(buf_fill, HIP_SMOOTH_WINDOW)
        p05 = np.nanpercentile(buf_smooth, 5)
        p95 = np.nanpercentile(buf_smooth, 95)
        prom = PEAK_PROMINENCE_FRAC * max(1e-6, (p95 - p05))
        peaks, _ = find_peaks(buf_smooth, distance=self.min_tp, prominence=prom)
        troughs, _ = find_peaks(-buf_smooth, distance=self.min_pt, prominence=prom)

        y_curr = buf_smooth[-1] if np.isfinite(buf_smooth[-1]) else None
        if y_curr is not None:
            low = np.nanpercentile(buf_smooth, 10)
            high = np.nanpercentile(buf_smooth, 90)
            span = max(0.12, high - low)
            # Relaxed so more reps register: top=38% (standing), bottom=58% (squat depth in signal)
            top_thresh = low + 0.38 * span
            bottom_thresh = low + 0.58 * span
            hysteresis = 0.06 * span

            if self.last_phase == "TOP_READY":
                status = "Standing"
                if y_curr > top_thresh:
                    self.last_phase = "DESCENT"
                    self._current_start_frame = frame_idx
                    self._current_bottom_frame = None
                    self._current_bottom_metrics = None
                    self._current_bottom_y = None
                    status = "Descending"
            elif self.last_phase == "DESCENT":
                status = "Descending"
                if y_curr > bottom_thresh:
                    self.last_phase = "BOTTOM"
                    self._current_bottom_frame = frame_idx
                    self._current_bottom_metrics = compute_frame_metrics(keypoints, baseline=self.baseline)
                    self._current_bottom_y = y_curr
                    status = "Bottom"
            elif self.last_phase == "BOTTOM":
                status = "Bottom"
                if self._current_bottom_y is None or y_curr > self._current_bottom_y:
                    self._current_bottom_y = y_curr
                    self._current_bottom_frame = frame_idx
                    self._current_bottom_metrics = compute_frame_metrics(keypoints, baseline=self.baseline)
                if y_curr < (bottom_thresh - hysteresis):
                    self.last_phase = "ASCENT"
                    status = "Ascending"
            elif self.last_phase == "ASCENT":
                status = "Ascending"
                if y_curr < top_thresh:
                    start_f = self._current_start_frame if self._current_start_frame is not None else frame_idx
                    end_f = frame_idx
                    gap_ok = (
                        self._last_confirmed_end_frame is None
                        or start_f >= self._last_confirmed_end_frame + self.min_frames_between_reps
                    )
                    if gap_ok and self._current_bottom_metrics:
                        self._last_confirmed_end_frame = end_f
                        duration_sec = (end_f - start_f) / fps if fps > 0 else None
                        speed = (1.0 / duration_sec) if duration_sec and duration_sec > 0 else None
                        # Count every rep; depth_ok in metrics is for form (parallel or below) only
                        pose_conf = self._current_bottom_metrics.get("pose_confidence")
                        needs_review = pose_conf is None or pose_conf < 0.6
                        self.rep_count += 1
                        rep = {
                            "rep": self.rep_count,
                            "start_frame": start_f,
                            "end_frame": end_f,
                            "bottom_frame": self._current_bottom_frame if self._current_bottom_frame is not None else end_f,
                            "duration_sec": duration_sec,
                            "speed_proxy": speed,
                            "pose_confidence": pose_conf,
                            "needs_review": needs_review,
                        }
                        rep.update(self._current_bottom_metrics)
                        self.confirmed_reps.append(rep)
                        status = "Rep confirmed" if self._current_bottom_metrics.get("depth_ok") else "Rep (shallow)"
                        logger.info(
                            "live_rep: rep %s (start_f=%s end_f=%s depth_ok=%s)",
                            self.rep_count, start_f, end_f, self._current_bottom_metrics.get("depth_ok"),
                        )
                    self.last_phase = "TOP_READY"

        if self.confirmed_reps:
            last_rep = self.confirmed_reps[-1]
            speed = last_rep.get("speed_proxy")

        return {
            "rep_count": self.rep_count,
            "knee_flexion_deg": metrics.get("knee_flexion_deg"),
            "trunk_angle_deg": metrics.get("trunk_angle_deg"),
            "com_offset_norm": metrics.get("com_offset_norm"),
            "speed_proxy": speed,
            "status": status,
            "phase": self.last_phase,
        }


def smooth_keypoints_ema(
    current: list[tuple[float, float]],
    previous: Optional[list[tuple[float, float]]],
    alpha: float = 0.4,
) -> list[tuple[float, float]]:
    """One-step EMA smoothing for keypoints."""
    if previous is None or len(previous) != len(current):
        return current
    return [
        (alpha * curr[0] + (1 - alpha) * prev[0], alpha * curr[1] + (1 - alpha) * prev[1])
        for curr, prev in zip(current, previous)
    ]
