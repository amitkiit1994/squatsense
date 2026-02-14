"""
Rep detection: batch (offline) and incremental (live).
Uses hip Y for phase and biomechanics-derived metrics (angles, COM proxy).
"""
from __future__ import annotations

from typing import Any, Optional

import math
import numpy as np

from .pose import LandmarkIdx

# Calibration frames before enabling rep detection.
CALIBRATION_FRAMES = 40
# Minimum knee flexion (deg) for a rep to be considered sufficiently deep.
MIN_KNEE_FLEXION_DEG = 60.0
# Additional flexion above baseline required for depth (deg).
DEPTH_DELTA_DEG = 50.0
# Maximum forward trunk angle allowed from vertical (deg).
MAX_TRUNK_ANGLE_DEG = 50.0
# Additional trunk angle above baseline allowed (deg).
TRUNK_DELTA_DEG = 20.0
# Margin beyond foot base where COM is still considered "balanced"
BALANCE_MARGIN = 0.05


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
        }
    knee_angle = _knee_angle_deg(keypoints)
    knee_flexion = (180.0 - knee_angle) if knee_angle is not None else None
    hip_angle = _hip_angle_deg(keypoints)
    trunk_angle = _trunk_angle_deg(keypoints)
    com = _com_proxy(keypoints)
    com_offset_norm, balance_ok = _balance_metrics(keypoints, com)

    base_knee = baseline.get("knee_flexion_deg") if baseline else None
    base_trunk = baseline.get("trunk_angle_deg") if baseline else None
    depth_threshold = max(
        MIN_KNEE_FLEXION_DEG,
        (base_knee + DEPTH_DELTA_DEG) if base_knee is not None else MIN_KNEE_FLEXION_DEG,
    )
    trunk_threshold = min(
        MAX_TRUNK_ANGLE_DEG,
        (base_trunk + TRUNK_DELTA_DEG) if base_trunk is not None else MAX_TRUNK_ANGLE_DEG,
    )
    depth_ok = knee_flexion is not None and knee_flexion >= depth_threshold
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
        y = _hip_y(kp) if kp else np.nan
        ys.append(y)
    ys = np.array(ys, dtype=float)
    valid = np.isfinite(ys)
    if not np.any(valid):
        return [], ys.tolist()
    reps = []
    # Calibration baseline from early valid frames
    calib_samples: list[dict[str, Any]] = []
    for kp in keypoints_series[: max(10, CALIBRATION_FRAMES)]:
        if not _pose_valid(kp):
            continue
        calib_samples.append(compute_frame_metrics(kp, baseline=None))
    baseline = _compute_baseline(calib_samples) if calib_samples else None
    n = len(ys)
    from scipy.signal import find_peaks
    peaks, _ = find_peaks(ys, distance=min_frames_between_peaks)
    troughs, _ = find_peaks(-ys, distance=min_frames_between_peaks)
    for i in range(len(peaks) - 1):
        p1, p2 = peaks[i], peaks[i + 1]
        in_between = troughs[(troughs > p1) & (troughs < p2)]
        if len(in_between) == 0:
            continue
        trough = int(in_between[0])
        start_f, end_f, bottom_f = p1, p2, trough
        kp_bottom = keypoints_series[bottom_f] if bottom_f < n else None
        metrics = compute_frame_metrics(kp_bottom, baseline=baseline)
        duration_sec = (end_f - start_f) / fps if fps > 0 else None
        speed_proxy = 1.0 / duration_sec if duration_sec and duration_sec > 0 else None
        if metrics.get("depth_ok") is False:
            continue
        rep = {
            "rep": len(reps) + 1,
            "start_frame": int(start_f),
            "end_frame": int(end_f),
            "bottom_frame": int(bottom_f),
            "duration_sec": duration_sec,
            "speed_proxy": speed_proxy,
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
        min_frames_between_reps: int = 20,
    ):
        self.window_size = window_size
        self.min_pt = min_frames_peak_to_trough
        self.min_tp = min_frames_trough_to_peak
        self.min_frames_between_reps = min_frames_between_reps
        self.hip_y_buffer: list[float] = []
        self.keypoint_buffer: list[Optional[list[tuple[float, float]]]] = []
        self.rep_count = 0
        self.last_phase: str = "standing"
        self.confirmed_reps: list[dict[str, Any]] = []
        self._last_peak_idx: Optional[int] = -1
        self._last_trough_idx: Optional[int] = -1
        self._last_confirmed_end_frame: Optional[int] = None
        self._calib_samples: list[dict[str, Any]] = []
        self.baseline: Optional[dict[str, Optional[float]]] = None
        self.calibrated = False

    def reset(self) -> None:
        self.hip_y_buffer.clear()
        self.keypoint_buffer.clear()
        self.rep_count = 0
        self.last_phase = "standing"
        self.confirmed_reps.clear()
        self._last_peak_idx = -1
        self._last_trough_idx = -1
        self._last_confirmed_end_frame = None
        self._calib_samples.clear()
        self.baseline = None
        self.calibrated = False

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
        y = _hip_y(keypoints) if keypoints else np.nan
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
            self._calib_samples.append(compute_frame_metrics(keypoints, baseline=None))
            if len(self._calib_samples) >= CALIBRATION_FRAMES:
                self.baseline = _compute_baseline(self._calib_samples)
                self.calibrated = True
                self.hip_y_buffer.clear()
                self.keypoint_buffer.clear()
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
        peaks, _ = find_peaks(buf_fill, distance=self.min_tp)
        troughs, _ = find_peaks(-buf_fill, distance=self.min_pt)

        if len(peaks) >= 2 and len(troughs) >= 1:
            last_peak = peaks[-1]
            prev_peak = peaks[-2]
            bet = troughs[(troughs > prev_peak) & (troughs < last_peak)]
            if len(bet) > 0:
                trough_idx = int(bet[-1])
                start_f = frame_idx - (n - 1 - prev_peak)
                end_f = frame_idx
                # Only confirm if this is a new (peak,trough) pair AND enough frames
                # have passed since the last confirmed rep (avoids counting same rep every frame)
                peak_trough_changed = (
                    self._last_peak_idx != last_peak or self._last_trough_idx != trough_idx
                )
                gap_ok = (
                    self._last_confirmed_end_frame is None
                    or start_f >= self._last_confirmed_end_frame + self.min_frames_between_reps
                )
                if peak_trough_changed and gap_ok:
                    self._last_peak_idx = last_peak
                    self._last_trough_idx = trough_idx
                    self._last_confirmed_end_frame = end_f
                    global_trough = frame_idx - (n - 1 - trough_idx)
                    kp_bottom = self.keypoint_buffer[trough_idx] if trough_idx < len(self.keypoint_buffer) else None
                    bottom_metrics = compute_frame_metrics(kp_bottom, baseline=self.baseline)
                    duration_sec = (end_f - start_f) / fps if fps > 0 else None
                    speed = (1.0 / duration_sec) if duration_sec and duration_sec > 0 else None
                    if bottom_metrics.get("depth_ok") is False:
                        status = "Shallow rep"
                    else:
                        self.rep_count += 1
                        rep = {
                            "rep": self.rep_count,
                            "start_frame": start_f,
                            "end_frame": end_f,
                            "bottom_frame": global_trough,
                            "duration_sec": duration_sec,
                            "speed_proxy": speed,
                        }
                        rep.update(bottom_metrics)
                        self.confirmed_reps.append(rep)
                        status = "Rep confirmed"
            else:
                status = "Descending" if len(troughs) > 0 and troughs[-1] > peaks[-1] else "Ascending"
        else:
            if len(troughs) > 0 and (len(peaks) == 0 or troughs[-1] > peaks[-1]):
                status = "Descending"
            elif len(peaks) > 0:
                status = "Ascending"

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
