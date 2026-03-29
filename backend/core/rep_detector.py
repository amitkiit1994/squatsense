from __future__ import annotations

"""Rep detection: batch (offline) and incremental (live).

Extracted from src/reps.py. Uses backend.core.geometry for pose validation
and angle computation, backend.core.frame_metrics for per-frame metrics,
and backend.core.signal for median filtering.
"""
import logging
from typing import Any, Optional

import numpy as np

from .geometry import (
    hip_y_norm,
    knee_angle_deg_3d,
    pose_valid,
    pose_valid_3d,
)
from .frame_metrics import compute_baseline, compute_frame_metrics
from .signal import median_filter

logger = logging.getLogger(__name__)

# Calibration frames before enabling rep detection.
CALIBRATION_FRAMES = 10
# Knee flexion upper bound (deg) for standing frames during calibration.
STANDING_KNEE_FLEXION_MAX = 35.0
# Default prominence fraction for peak detection.
PEAK_PROMINENCE_FRAC = 0.10
# Median filter window for signal smoothing (odd number).
SIGNAL_SMOOTH_WINDOW = 5


def detect_reps_batch(
    keypoints_series: list[Optional[list[tuple[float, float]]]],
    fps: float,
    min_frames_between_peaks: int = 10,
    keypoints_3d_series: Optional[list[Optional[list[tuple[float, float, float]]]]] = None,
) -> tuple[list[dict[str, Any]], list[float]]:
    """Offline: detect reps from full keypoints series.

    When ``keypoints_3d_series`` is provided, uses 3D knee flexion as the
    rep signal (view-invariant) and passes 3D to metrics.
    Returns (rep_annotations, signal_curve).
    """
    have_3d = (
        keypoints_3d_series is not None
        and len(keypoints_3d_series) == len(keypoints_series)
    )

    # Decide signal mode: 3D knee flexion vs 2D hip-Y-norm
    use_3d_signal = False
    if have_3d:
        n_valid_3d = sum(
            1 for kp3 in keypoints_3d_series  # type: ignore[union-attr]
            if kp3 is not None and pose_valid_3d(kp3)
        )
        n_total = len(keypoints_series)
        use_3d_signal = n_valid_3d > n_total * 0.3 and n_valid_3d >= 5

    ys = []
    for i, kp in enumerate(keypoints_series):
        if use_3d_signal:
            kp3 = keypoints_3d_series[i] if keypoints_3d_series else None  # type: ignore[index]
            if kp3 is not None and pose_valid_3d(kp3):
                ka = knee_angle_deg_3d(kp3)
                flex = (180.0 - ka) if ka is not None else np.nan
                ys.append(flex)
            else:
                ys.append(np.nan)
        else:
            y = hip_y_norm(kp) if kp else np.nan
            ys.append(y)
    ys_arr = np.array(ys, dtype=float)
    valid = np.isfinite(ys_arr)
    if not np.any(valid):
        return [], ys_arr.tolist()

    # Calibration baseline from early valid frames
    calib_samples: list[dict[str, Any]] = []
    for idx in range(min(len(keypoints_series), max(10, CALIBRATION_FRAMES * 2))):
        kp = keypoints_series[idx]
        if not pose_valid(kp):
            continue
        kp3 = keypoints_3d_series[idx] if have_3d and keypoints_3d_series else None  # type: ignore[index]
        m = compute_frame_metrics(kp, baseline=None, keypoints_3d=kp3)
        kf = m.get("knee_flexion_deg")
        if kf is None or kf > STANDING_KNEE_FLEXION_MAX:
            continue
        calib_samples.append(m)
    baseline = compute_baseline(calib_samples) if calib_samples else None

    reps: list[dict[str, Any]] = []
    n = len(ys_arr)
    from scipy.signal import find_peaks

    ys_smooth = median_filter(ys_arr, SIGNAL_SMOOTH_WINDOW)
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
        bottom_f = int(in_between[np.argmax(ys_smooth[in_between])])
        start_f, end_f = int(t1), int(t2)
        kp_bottom = keypoints_series[bottom_f] if bottom_f < n else None
        kp3_bottom = (
            keypoints_3d_series[bottom_f]  # type: ignore[index]
            if have_3d and keypoints_3d_series and bottom_f < n
            else None
        )
        metrics = compute_frame_metrics(kp_bottom, baseline=baseline, keypoints_3d=kp3_bottom)
        duration_sec = (end_f - start_f) / fps if fps > 0 else None
        speed_proxy = 1.0 / duration_sec if duration_sec and duration_sec > 0 else None
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
    return reps, ys_arr.tolist()


class IncrementalRepDetector:
    """Sliding-window rep detection for live analysis.

    When 3D world landmarks are available, uses knee flexion (degrees) as
    the rep signal -- view-invariant. Falls back to hip-Y (2D) otherwise.

    The signal mode is decided once during calibration and stays fixed for
    the session.
    """

    def __init__(
        self,
        window_size: int = 60,
        min_frames_peak_to_trough: int = 5,
        min_frames_trough_to_peak: int = 5,
        min_frames_between_reps: int = 6,
        min_knee_flexion_deg: float = 45.0,
    ):
        self.window_size = window_size
        self.min_pt = min_frames_peak_to_trough
        self.min_tp = min_frames_trough_to_peak
        self.min_frames_between_reps = min_frames_between_reps
        self.min_knee_flexion_deg = min_knee_flexion_deg
        self.signal_buffer: list[float] = []
        self.keypoint_buffer: list[Optional[list[tuple[float, float]]]] = []
        self.keypoint_3d_buffer: list[Optional[list[tuple[float, float, float]]]] = []
        self.rep_count = 0
        self.last_phase: str = "TOP_READY"
        self.confirmed_reps: list[dict[str, Any]] = []
        self._last_peak_idx: Optional[int] = -1
        self._last_trough_idx: Optional[int] = -1
        self._last_confirmed_end_frame: Optional[int] = None
        self._calib_samples: list[dict[str, Any]] = []
        self.baseline: Optional[dict[str, Optional[float]]] = None
        self.calibrated = False
        self._use_3d_signal: bool = False
        self._calib_3d_count: int = 0
        self._current_start_frame: Optional[int] = None
        self._current_bottom_frame: Optional[int] = None
        self._current_bottom_metrics: Optional[dict[str, Any]] = None
        self._current_bottom_y: Optional[float] = None
        self._rep_com_offsets: list[float] = []
        self._rep_balance_oks: list[bool] = []
        # Phase timing: track frame indices at phase transitions
        self._bottom_entry_frame: Optional[int] = None
        self._ascent_start_frame: Optional[int] = None

    def reset(self) -> None:
        self.signal_buffer.clear()
        self.keypoint_buffer.clear()
        self.keypoint_3d_buffer.clear()
        self.rep_count = 0
        self.last_phase = "TOP_READY"
        self.confirmed_reps.clear()
        self._last_peak_idx = -1
        self._last_trough_idx = -1
        self._last_confirmed_end_frame = None
        self._calib_samples.clear()
        self.baseline = None
        self.calibrated = False
        self._use_3d_signal = False
        self._calib_3d_count = 0
        self._current_start_frame = None
        self._current_bottom_frame = None
        self._current_bottom_metrics = None
        self._current_bottom_y = None
        self._rep_com_offsets = []
        self._rep_balance_oks = []
        self._bottom_entry_frame = None
        self._ascent_start_frame = None

    def _signal_value(
        self,
        keypoints: Optional[list[tuple[float, float]]],
        keypoints_3d: Optional[list[tuple[float, float, float]]],
    ) -> float:
        """Compute the rep-phase signal value using the locked signal mode."""
        if self._use_3d_signal and keypoints_3d is not None and pose_valid_3d(keypoints_3d):
            ka = knee_angle_deg_3d(keypoints_3d)
            return (180.0 - ka) if ka is not None else np.nan
        return hip_y_norm(keypoints) if keypoints else np.nan

    def push(
        self,
        frame_idx: int,
        keypoints: Optional[list[tuple[float, float]]],
        fps: float,
        keypoints_3d: Optional[list[tuple[float, float, float]]] = None,
    ) -> dict[str, Any]:
        """Push one frame. Returns current state for overlay."""
        valid_pose = pose_valid(keypoints)
        valid_3d = keypoints_3d is not None and pose_valid_3d(keypoints_3d)

        y = self._signal_value(keypoints, keypoints_3d)

        self.signal_buffer.append(y if np.isfinite(y) else np.nan)
        self.keypoint_buffer.append(keypoints)
        self.keypoint_3d_buffer.append(keypoints_3d)

        if len(self.signal_buffer) > self.window_size:
            self.signal_buffer.pop(0)
            self.keypoint_buffer.pop(0)
            self.keypoint_3d_buffer.pop(0)

        buf = np.array(self.signal_buffer, dtype=float)
        n = len(buf)
        metrics = compute_frame_metrics(
            keypoints if valid_pose else None,
            baseline=self.baseline,
            keypoints_3d=keypoints_3d if valid_3d else None,
        )
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
            m = compute_frame_metrics(
                keypoints, baseline=None,
                keypoints_3d=keypoints_3d if valid_3d else None,
            )
            kf = m.get("knee_flexion_deg")
            if kf is not None and kf <= STANDING_KNEE_FLEXION_MAX:
                self._calib_samples.append(m)
                if valid_3d:
                    self._calib_3d_count += 1
            if len(self._calib_samples) >= CALIBRATION_FRAMES:
                self.baseline = compute_baseline(self._calib_samples)
                self.calibrated = True
                self._use_3d_signal = self._calib_3d_count > len(self._calib_samples) // 2
                self.signal_buffer.clear()
                self.keypoint_buffer.clear()
                self.keypoint_3d_buffer.clear()
                logger.info(
                    "live_rep: calibrated (baseline knee_flex=%s, use_3d_signal=%s)",
                    self.baseline.get("knee_flexion_deg"),
                    self._use_3d_signal,
                )
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

        valid_mask = np.isfinite(buf)
        buf_fill = buf.copy()
        if np.any(valid_mask):
            last_valid = np.where(valid_mask)[0]
            for i in range(n):
                if not valid_mask[i]:
                    idx = np.searchsorted(last_valid, i)
                    if idx == 0:
                        buf_fill[i] = buf[last_valid[0]]
                    elif idx >= len(last_valid):
                        buf_fill[i] = buf[last_valid[-1]]
                    else:
                        buf_fill[i] = buf[last_valid[idx - 1]]

        from scipy.signal import find_peaks

        buf_smooth = median_filter(buf_fill, SIGNAL_SMOOTH_WINDOW)
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
            top_thresh = low + 0.38 * span
            bottom_thresh = low + 0.58 * span
            hysteresis = 0.06 * span

            # Accumulate stability data during active rep phases
            if self.last_phase in ("DESCENT", "BOTTOM", "ASCENT"):
                com_off = metrics.get("com_offset_norm")
                bal_ok = metrics.get("balance_ok")
                if com_off is not None:
                    self._rep_com_offsets.append(com_off)
                if bal_ok is not None:
                    self._rep_balance_oks.append(bal_ok)

            if self.last_phase == "TOP_READY":
                status = "Standing"
                if y_curr > top_thresh:
                    self.last_phase = "DESCENT"
                    self._current_start_frame = frame_idx
                    self._current_bottom_frame = None
                    self._current_bottom_metrics = None
                    self._current_bottom_y = None
                    self._rep_com_offsets = []
                    self._rep_balance_oks = []
                    self._bottom_entry_frame = None
                    self._ascent_start_frame = None
                    status = "Descending"
            elif self.last_phase == "DESCENT":
                status = "Descending"
                if y_curr > bottom_thresh:
                    self.last_phase = "BOTTOM"
                    self._bottom_entry_frame = frame_idx
                    self._current_bottom_frame = frame_idx
                    self._current_bottom_metrics = compute_frame_metrics(
                        keypoints, baseline=self.baseline,
                        keypoints_3d=keypoints_3d if valid_3d else None,
                    )
                    self._current_bottom_y = y_curr
                    status = "Bottom"
            elif self.last_phase == "BOTTOM":
                status = "Bottom"
                if self._current_bottom_y is None or y_curr > self._current_bottom_y:
                    self._current_bottom_y = y_curr
                    self._current_bottom_frame = frame_idx
                    self._current_bottom_metrics = compute_frame_metrics(
                        keypoints, baseline=self.baseline,
                        keypoints_3d=keypoints_3d if valid_3d else None,
                    )
                if y_curr < (bottom_thresh - hysteresis):
                    self.last_phase = "ASCENT"
                    self._ascent_start_frame = frame_idx
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
                    # Minimum ROM check: bottom signal must be at least 40%
                    # into the descent-to-bottom range (prevents micro-movements
                    # from counting as reps)
                    min_rom_ok = True
                    if self._current_bottom_y is not None:
                        rom_range = bottom_thresh - top_thresh
                        achieved_rom = (self._current_bottom_y or 0) - top_thresh
                        if rom_range > 0 and achieved_rom / rom_range < 0.4:
                            min_rom_ok = False
                            logger.debug(
                                "Rep rejected: ROM %.0f%% < 40%% minimum",
                                (achieved_rom / rom_range * 100) if rom_range > 0 else 0,
                            )

                    # Minimum duration check: reject reps < 0.4s (likely noise)
                    min_dur_ok = True
                    if fps > 0 and (end_f - start_f) / fps < 0.4:
                        min_dur_ok = False
                        logger.debug(
                            "Rep rejected: duration %.2fs < 0.4s minimum",
                            (end_f - start_f) / fps,
                        )

                    # Minimum knee flexion check: reject shallow movements
                    # like unracking the bar (typically ~30° vs 80°+ for real reps)
                    min_flex_ok = True
                    if self._current_bottom_metrics and self.min_knee_flexion_deg > 0:
                        bottom_flex = self._current_bottom_metrics.get("knee_flexion_deg")
                        if bottom_flex is not None and bottom_flex < self.min_knee_flexion_deg:
                            min_flex_ok = False
                            logger.info(
                                "Rep rejected: knee flexion %.1f° < %.1f° minimum (likely unrack/setup)",
                                bottom_flex, self.min_knee_flexion_deg,
                            )

                    if gap_ok and self._current_bottom_metrics and min_rom_ok and min_dur_ok and min_flex_ok:
                        self._last_confirmed_end_frame = end_f
                        duration_sec = (end_f - start_f) / fps if fps > 0 else None
                        speed = (1.0 / duration_sec) if duration_sec and duration_sec > 0 else None
                        pose_conf = self._current_bottom_metrics.get("pose_confidence")
                        needs_review = pose_conf is None or pose_conf < 0.6
                        self.rep_count += 1

                        # Compute phase durations (eccentric / pause / concentric)
                        eccentric_ms: float | None = None
                        pause_ms: float | None = None
                        concentric_ms: float | None = None
                        if fps > 0:
                            bottom_entry = self._bottom_entry_frame or start_f
                            ascent_start = self._ascent_start_frame or bottom_entry
                            eccentric_ms = round((bottom_entry - start_f) / fps * 1000.0)
                            pause_ms = round((ascent_start - bottom_entry) / fps * 1000.0)
                            concentric_ms = round((end_f - ascent_start) / fps * 1000.0)

                        rep = {
                            "rep": self.rep_count,
                            "start_frame": start_f,
                            "end_frame": end_f,
                            "bottom_frame": self._current_bottom_frame if self._current_bottom_frame is not None else end_f,
                            "duration_sec": duration_sec,
                            "speed_proxy": speed,
                            "pose_confidence": pose_conf,
                            "needs_review": needs_review,
                            "eccentric_ms": eccentric_ms,
                            "pause_ms": pause_ms,
                            "concentric_ms": concentric_ms,
                        }
                        rep.update(self._current_bottom_metrics)
                        # Compute actual stability metrics from accumulated frames
                        if self._rep_com_offsets:
                            rep["com_variance"] = float(np.var(self._rep_com_offsets))
                        else:
                            rep["com_variance"] = 0.02  # fallback
                        if self._rep_balance_oks:
                            rep["balance_ok_pct"] = sum(self._rep_balance_oks) / len(self._rep_balance_oks)
                        else:
                            rep["balance_ok_pct"] = 0.5  # fallback
                        self.confirmed_reps.append(rep)
                        status = "Rep confirmed" if self._current_bottom_metrics.get("depth_ok") else "Rep (shallow)"
                        logger.info(
                            "live_rep: rep %s (start_f=%s end_f=%s depth_ok=%s "
                            "ecc=%sms pause=%sms con=%sms)",
                            self.rep_count, start_f, end_f,
                            self._current_bottom_metrics.get("depth_ok"),
                            eccentric_ms, pause_ms, concentric_ms,
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

    def flush_pending_rep(self, frame_idx: int, fps: float) -> bool:
        """Force-confirm a rep that is in progress (DESCENT/BOTTOM/ASCENT).

        Called when ``end_set`` or ``stop`` arrives so that reps still
        mid-movement are not silently dropped.  Returns ``True`` if a rep
        was force-confirmed.
        """
        if self.last_phase not in ("DESCENT", "BOTTOM", "ASCENT"):
            return False
        if not self._current_bottom_metrics:
            # Haven't reached the bottom yet — not enough data to count
            return False

        start_f = self._current_start_frame if self._current_start_frame is not None else frame_idx
        end_f = frame_idx
        duration_sec = (end_f - start_f) / fps if fps > 0 else None

        # Reject extremely short movements (< 0.3s) even in flush
        if duration_sec is not None and duration_sec < 0.3:
            logger.info("flush_pending_rep: rejected, duration %.2fs < 0.3s", duration_sec)
            return False

        # Reject shallow movements (e.g. unracking)
        if self.min_knee_flexion_deg > 0:
            bottom_flex = self._current_bottom_metrics.get("knee_flexion_deg")
            if bottom_flex is not None and bottom_flex < self.min_knee_flexion_deg:
                logger.info(
                    "flush_pending_rep: rejected, knee flexion %.1f° < %.1f° minimum",
                    bottom_flex, self.min_knee_flexion_deg,
                )
                return False

        speed = (1.0 / duration_sec) if duration_sec and duration_sec > 0 else None
        pose_conf = self._current_bottom_metrics.get("pose_confidence")
        needs_review = pose_conf is None or pose_conf < 0.6
        self.rep_count += 1

        # Phase timing
        eccentric_ms: float | None = None
        pause_ms: float | None = None
        concentric_ms: float | None = None
        if fps > 0:
            bottom_entry = self._bottom_entry_frame or start_f
            ascent_start = self._ascent_start_frame or bottom_entry
            eccentric_ms = round((bottom_entry - start_f) / fps * 1000.0)
            pause_ms = round((ascent_start - bottom_entry) / fps * 1000.0)
            concentric_ms = round((end_f - ascent_start) / fps * 1000.0)

        rep: dict[str, Any] = {
            "rep": self.rep_count,
            "start_frame": start_f,
            "end_frame": end_f,
            "bottom_frame": self._current_bottom_frame if self._current_bottom_frame is not None else end_f,
            "duration_sec": duration_sec,
            "speed_proxy": speed,
            "pose_confidence": pose_conf,
            "needs_review": needs_review,
            "eccentric_ms": eccentric_ms,
            "pause_ms": pause_ms,
            "concentric_ms": concentric_ms,
        }
        rep.update(self._current_bottom_metrics)
        if self._rep_com_offsets:
            rep["com_variance"] = float(np.var(self._rep_com_offsets))
        else:
            rep["com_variance"] = 0.02
        if self._rep_balance_oks:
            rep["balance_ok_pct"] = sum(self._rep_balance_oks) / len(self._rep_balance_oks)
        else:
            rep["balance_ok_pct"] = 0.5
        self.confirmed_reps.append(rep)
        self.last_phase = "TOP_READY"
        self._current_start_frame = None
        self._current_bottom_metrics = None
        self._current_bottom_y = None
        self._rep_com_offsets = []
        self._rep_balance_oks = []
        logger.info(
            "flush_pending_rep: force-confirmed rep %d (start_f=%d end_f=%d "
            "duration=%.2fs depth_ok=%s)",
            self.rep_count, start_f, end_f,
            duration_sec or 0,
            rep.get("depth_ok"),
        )
        return True
