"""Unit tests for 3D geometry helpers and 3D metric functions in reps.py."""
from __future__ import annotations

import math
import pytest

from src.reps import (
    _angle_deg_3d,
    _get_point_3d,
    _midpoint_3d,
    _knee_angle_deg_3d,
    _trunk_angle_deg_3d,
    _hip_below_knee_3d,
    _pose_valid_3d,
    smooth_keypoints_ema_3d,
    compute_frame_metrics,
    detect_reps_batch,
    IncrementalRepDetector,
)
from src.pose import LandmarkIdx


# ---------------------------------------------------------------------------
# Helpers: build synthetic 3D keypoint arrays (33 landmarks)
# ---------------------------------------------------------------------------

def _make_kp3d(**overrides: tuple[float, float, float]) -> list[tuple[float, float, float]]:
    """Build a 33-element list of (0,0,0) with specific landmarks overridden."""
    kp = [(0.0, 0.0, 0.0)] * 33
    for name, val in overrides.items():
        idx = getattr(LandmarkIdx, name.upper())
        kp[idx] = val
    return kp


def _standing_kp3d() -> list[tuple[float, float, float]]:
    """Roughly standing pose: shoulders above hips above knees above ankles.
    Y increases downward (MediaPipe convention).
    """
    return _make_kp3d(
        left_shoulder=(-0.15, -0.40, 0.0),
        right_shoulder=(0.15, -0.40, 0.0),
        left_hip=(-0.10, 0.0, 0.0),
        right_hip=(0.10, 0.0, 0.0),
        left_knee=(-0.10, 0.40, 0.0),
        right_knee=(0.10, 0.40, 0.0),
        left_ankle=(-0.10, 0.80, 0.0),
        right_ankle=(0.10, 0.80, 0.0),
    )


def _squat_kp3d() -> list[tuple[float, float, float]]:
    """Deep squat: hip drops to knee level, knee flexion ~90 deg."""
    return _make_kp3d(
        left_shoulder=(-0.15, -0.10, 0.0),
        right_shoulder=(0.15, -0.10, 0.0),
        left_hip=(-0.10, 0.30, 0.0),
        right_hip=(0.10, 0.30, 0.0),
        left_knee=(-0.10, 0.30, 0.30),
        right_knee=(0.10, 0.30, 0.30),
        left_ankle=(-0.10, 0.80, 0.30),
        right_ankle=(0.10, 0.80, 0.30),
    )


# ---------------------------------------------------------------------------
# _angle_deg_3d
# ---------------------------------------------------------------------------

class TestAngleDeg3D:
    def test_right_angle(self):
        a = (1.0, 0.0, 0.0)
        b = (0.0, 0.0, 0.0)
        c = (0.0, 1.0, 0.0)
        assert _angle_deg_3d(a, b, c) == pytest.approx(90.0, abs=0.01)

    def test_straight_line(self):
        a = (-1.0, 0.0, 0.0)
        b = (0.0, 0.0, 0.0)
        c = (1.0, 0.0, 0.0)
        assert _angle_deg_3d(a, b, c) == pytest.approx(180.0, abs=0.01)

    def test_acute_angle(self):
        a = (1.0, 1.0, 0.0)
        b = (0.0, 0.0, 0.0)
        c = (1.0, 0.0, 0.0)
        assert _angle_deg_3d(a, b, c) == pytest.approx(45.0, abs=0.01)

    def test_3d_angle(self):
        a = (1.0, 0.0, 0.0)
        b = (0.0, 0.0, 0.0)
        c = (0.0, 0.0, 1.0)
        assert _angle_deg_3d(a, b, c) == pytest.approx(90.0, abs=0.01)

    def test_none_input(self):
        assert _angle_deg_3d(None, (0, 0, 0), (1, 0, 0)) is None
        assert _angle_deg_3d((0, 0, 0), None, (1, 0, 0)) is None
        assert _angle_deg_3d((0, 0, 0), (1, 0, 0), None) is None

    def test_zero_vector(self):
        """Same points -> zero vector -> should return None."""
        assert _angle_deg_3d((0, 0, 0), (0, 0, 0), (1, 0, 0)) is None


# ---------------------------------------------------------------------------
# _get_point_3d / _midpoint_3d
# ---------------------------------------------------------------------------

class TestGetPointAndMidpoint3D:
    def test_get_valid(self):
        kp = [(1.0, 2.0, 3.0), (4.0, 5.0, 6.0)]
        assert _get_point_3d(kp, 0) == (1.0, 2.0, 3.0)
        assert _get_point_3d(kp, 1) == (4.0, 5.0, 6.0)

    def test_get_out_of_range(self):
        assert _get_point_3d([(0, 0, 0)], 5) is None

    def test_get_none_input(self):
        assert _get_point_3d(None, 0) is None

    def test_midpoint(self):
        a = (0.0, 0.0, 0.0)
        b = (2.0, 4.0, 6.0)
        assert _midpoint_3d(a, b) == (1.0, 2.0, 3.0)

    def test_midpoint_none(self):
        assert _midpoint_3d(None, (1, 2, 3)) is None
        assert _midpoint_3d((1, 2, 3), None) is None


# ---------------------------------------------------------------------------
# _knee_angle_deg_3d
# ---------------------------------------------------------------------------

class TestKneeAngle3D:
    def test_standing_straight_legs(self):
        kp = _standing_kp3d()
        angle = _knee_angle_deg_3d(kp)
        assert angle is not None
        # Standing: hip-knee-ankle nearly straight -> angle near 180
        assert angle > 160.0

    def test_squat_bent_knees(self):
        # 90-degree knee bend
        kp = _make_kp3d(
            left_hip=(-0.1, 0.0, 0.0),
            right_hip=(0.1, 0.0, 0.0),
            left_knee=(-0.1, 0.4, 0.0),
            right_knee=(0.1, 0.4, 0.0),
            left_ankle=(-0.1, 0.4, 0.4),
            right_ankle=(0.1, 0.4, 0.4),
        )
        angle = _knee_angle_deg_3d(kp)
        assert angle is not None
        assert angle == pytest.approx(90.0, abs=1.0)


# ---------------------------------------------------------------------------
# _trunk_angle_deg_3d
# ---------------------------------------------------------------------------

class TestTrunkAngle3D:
    def test_upright(self):
        kp = _standing_kp3d()
        # Trunk vector: shoulder_mid - hip_mid goes upward (negative Y)
        angle = _trunk_angle_deg_3d(kp, up_vector=(0.0, -1.0, 0.0))
        assert angle is not None
        assert angle < 5.0  # nearly upright

    def test_forward_lean(self):
        kp = _make_kp3d(
            left_shoulder=(-0.15, -0.20, -0.30),
            right_shoulder=(0.15, -0.20, -0.30),
            left_hip=(-0.10, 0.0, 0.0),
            right_hip=(0.10, 0.0, 0.0),
            left_knee=(-0.10, 0.40, 0.0),
            right_knee=(0.10, 0.40, 0.0),
            left_ankle=(-0.10, 0.80, 0.0),
            right_ankle=(0.10, 0.80, 0.0),
        )
        angle = _trunk_angle_deg_3d(kp, up_vector=(0.0, -1.0, 0.0))
        assert angle is not None
        assert angle > 20.0  # significant forward lean


# ---------------------------------------------------------------------------
# _hip_below_knee_3d
# ---------------------------------------------------------------------------

class TestHipBelowKnee3D:
    def test_standing(self):
        kp = _standing_kp3d()
        # Hip Y (0.0) < Knee Y (0.4) in downward-positive coords -> hip is above knee
        assert _hip_below_knee_3d(kp) is False

    def test_deep_squat(self):
        kp = _make_kp3d(
            left_hip=(-0.10, 0.50, 0.0),
            right_hip=(0.10, 0.50, 0.0),
            left_knee=(-0.10, 0.40, 0.0),
            right_knee=(0.10, 0.40, 0.0),
            left_ankle=(-0.10, 0.80, 0.0),
            right_ankle=(0.10, 0.80, 0.0),
        )
        assert _hip_below_knee_3d(kp) is True


# ---------------------------------------------------------------------------
# _pose_valid_3d
# ---------------------------------------------------------------------------

class TestPoseValid3D:
    def test_valid_standing(self):
        assert _pose_valid_3d(_standing_kp3d()) is True

    def test_none_input(self):
        assert _pose_valid_3d(None) is False

    def test_empty_list(self):
        assert _pose_valid_3d([]) is False

    def test_nan_values(self):
        kp = _standing_kp3d()
        kp[LandmarkIdx.LEFT_HIP] = (float("nan"), 0.0, 0.0)
        assert _pose_valid_3d(kp) is False

    def test_unreasonable_limb_length(self):
        kp = _standing_kp3d()
        # Move ankle far away -> limb length > 2m
        kp[LandmarkIdx.LEFT_ANKLE] = (-0.10, 5.0, 0.0)
        assert _pose_valid_3d(kp) is False

    def test_very_short_limb(self):
        kp = _standing_kp3d()
        # Put ankle at same position as hip -> limb length < 0.1m
        kp[LandmarkIdx.LEFT_ANKLE] = kp[LandmarkIdx.LEFT_HIP]
        assert _pose_valid_3d(kp) is False


# ---------------------------------------------------------------------------
# smooth_keypoints_ema_3d
# ---------------------------------------------------------------------------

class TestSmoothKeypointsEma3D:
    def test_first_frame(self):
        current = [(1.0, 2.0, 3.0), (4.0, 5.0, 6.0)]
        result = smooth_keypoints_ema_3d(current, None)
        assert result == current

    def test_smoothing(self):
        prev = [(0.0, 0.0, 0.0), (0.0, 0.0, 0.0)]
        curr = [(1.0, 1.0, 1.0), (2.0, 2.0, 2.0)]
        result = smooth_keypoints_ema_3d(curr, prev, alpha=0.5)
        assert result[0] == pytest.approx((0.5, 0.5, 0.5))
        assert result[1] == pytest.approx((1.0, 1.0, 1.0))


# ---------------------------------------------------------------------------
# compute_frame_metrics with 3D
# ---------------------------------------------------------------------------

class TestComputeFrameMetrics3D:
    def test_3d_metrics_used_when_available(self):
        """When valid 3D keypoints are provided, metrics should come from 3D."""
        kp_2d = [(0.0, 0.0)] * 33
        # Provide plausible 2D values so _pose_valid passes
        kp_2d[LandmarkIdx.LEFT_SHOULDER] = (100.0, 100.0)
        kp_2d[LandmarkIdx.RIGHT_SHOULDER] = (200.0, 100.0)
        kp_2d[LandmarkIdx.LEFT_HIP] = (120.0, 300.0)
        kp_2d[LandmarkIdx.RIGHT_HIP] = (180.0, 300.0)
        kp_2d[LandmarkIdx.LEFT_KNEE] = (120.0, 500.0)
        kp_2d[LandmarkIdx.RIGHT_KNEE] = (180.0, 500.0)
        kp_2d[LandmarkIdx.LEFT_ANKLE] = (120.0, 700.0)
        kp_2d[LandmarkIdx.RIGHT_ANKLE] = (180.0, 700.0)

        kp_3d = _standing_kp3d()
        metrics = compute_frame_metrics(kp_2d, keypoints_3d=kp_3d)
        # With 3D standing pose, knee flexion should be low (< 35 deg)
        assert metrics["knee_flexion_deg"] is not None
        assert metrics["knee_flexion_deg"] < 35.0

    def test_fallback_to_2d_when_3d_none(self):
        kp_2d = [(0.0, 0.0)] * 33
        kp_2d[LandmarkIdx.LEFT_SHOULDER] = (100.0, 100.0)
        kp_2d[LandmarkIdx.RIGHT_SHOULDER] = (200.0, 100.0)
        kp_2d[LandmarkIdx.LEFT_HIP] = (120.0, 300.0)
        kp_2d[LandmarkIdx.RIGHT_HIP] = (180.0, 300.0)
        kp_2d[LandmarkIdx.LEFT_KNEE] = (120.0, 500.0)
        kp_2d[LandmarkIdx.RIGHT_KNEE] = (180.0, 500.0)
        kp_2d[LandmarkIdx.LEFT_ANKLE] = (120.0, 700.0)
        kp_2d[LandmarkIdx.RIGHT_ANKLE] = (180.0, 700.0)

        metrics_no_3d = compute_frame_metrics(kp_2d, keypoints_3d=None)
        assert metrics_no_3d["knee_flexion_deg"] is not None


# ---------------------------------------------------------------------------
# detect_reps_batch: 3D fallback
# ---------------------------------------------------------------------------

class TestDetectRepsBatchFallback:
    def _make_2d_kp(self) -> list[tuple[float, float]]:
        kp = [(0.0, 0.0)] * 33
        kp[LandmarkIdx.LEFT_SHOULDER] = (100.0, 100.0)
        kp[LandmarkIdx.RIGHT_SHOULDER] = (200.0, 100.0)
        kp[LandmarkIdx.LEFT_HIP] = (120.0, 300.0)
        kp[LandmarkIdx.RIGHT_HIP] = (180.0, 300.0)
        kp[LandmarkIdx.LEFT_KNEE] = (120.0, 500.0)
        kp[LandmarkIdx.RIGHT_KNEE] = (180.0, 500.0)
        kp[LandmarkIdx.LEFT_ANKLE] = (120.0, 700.0)
        kp[LandmarkIdx.RIGHT_ANKLE] = (180.0, 700.0)
        return kp

    def test_all_invalid_3d_falls_back_to_2d(self):
        """When 3D series exists but all frames are invalid, should use 2D signal."""
        kp_2d = self._make_2d_kp()
        n = 30
        kp_series = [kp_2d] * n
        # All-None 3D series -> should fall back to 2D and still produce a signal
        kp3_series = [None] * n
        _, signal = detect_reps_batch(kp_series, fps=30.0, keypoints_3d_series=kp3_series)
        # Signal should have valid (non-NaN) values from 2D hip-Y
        import numpy as np
        valid_count = sum(1 for v in signal if np.isfinite(v))
        assert valid_count == n  # all frames should have valid 2D signal


# ---------------------------------------------------------------------------
# IncrementalRepDetector: signal mode locking
# ---------------------------------------------------------------------------

class TestIncrementalRepDetectorSignalMode:
    def _make_2d_kp(self) -> list[tuple[float, float]]:
        kp = [(0.0, 0.0)] * 33
        kp[LandmarkIdx.LEFT_SHOULDER] = (100.0, 100.0)
        kp[LandmarkIdx.RIGHT_SHOULDER] = (200.0, 100.0)
        kp[LandmarkIdx.LEFT_HIP] = (120.0, 300.0)
        kp[LandmarkIdx.RIGHT_HIP] = (180.0, 300.0)
        kp[LandmarkIdx.LEFT_KNEE] = (120.0, 500.0)
        kp[LandmarkIdx.RIGHT_KNEE] = (180.0, 500.0)
        kp[LandmarkIdx.LEFT_ANKLE] = (120.0, 700.0)
        kp[LandmarkIdx.RIGHT_ANKLE] = (180.0, 700.0)
        return kp

    def test_locks_to_3d_when_3d_available_during_calibration(self):
        det = IncrementalRepDetector()
        kp_2d = self._make_2d_kp()
        kp_3d = _standing_kp3d()
        # Push calibration frames with valid 3D
        for i in range(15):
            det.push(i, kp_2d, 30.0, keypoints_3d=kp_3d)
        assert det.calibrated is True
        assert det._use_3d_signal is True

    def test_locks_to_2d_when_no_3d_during_calibration(self):
        det = IncrementalRepDetector()
        kp_2d = self._make_2d_kp()
        for i in range(15):
            det.push(i, kp_2d, 30.0, keypoints_3d=None)
        assert det.calibrated is True
        assert det._use_3d_signal is False

    def test_reset_clears_signal_mode(self):
        det = IncrementalRepDetector()
        kp_2d = self._make_2d_kp()
        kp_3d = _standing_kp3d()
        for i in range(15):
            det.push(i, kp_2d, 30.0, keypoints_3d=kp_3d)
        assert det._use_3d_signal is True
        det.reset()
        assert det._use_3d_signal is False
        assert det.calibrated is False
