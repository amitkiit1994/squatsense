"""Tests for per-frame biomechanics metrics computation."""
import pytest

from backend.core.frame_metrics import compute_baseline, compute_frame_metrics


def _make_keypoints(
    shoulder_y=0.3,
    hip_y=0.5,
    knee_y=0.7,
    ankle_y=0.9,
    x_spread=0.1,
):
    """Create a minimal 33-point keypoint list for testing."""
    kp = [(0.5, 0.5)] * 33
    # Shoulders (11, 12)
    kp[11] = (0.5 - x_spread, shoulder_y)
    kp[12] = (0.5 + x_spread, shoulder_y)
    # Hips (23, 24)
    kp[23] = (0.5 - x_spread, hip_y)
    kp[24] = (0.5 + x_spread, hip_y)
    # Knees (25, 26)
    kp[25] = (0.5 - x_spread, knee_y)
    kp[26] = (0.5 + x_spread, knee_y)
    # Ankles (27, 28)
    kp[27] = (0.5 - x_spread, ankle_y)
    kp[28] = (0.5 + x_spread, ankle_y)
    # Heels (29, 30) and foot indices (31, 32) for balance
    kp[29] = (0.5 - x_spread - 0.02, ankle_y + 0.02)
    kp[30] = (0.5 + x_spread + 0.02, ankle_y + 0.02)
    kp[31] = (0.5 - x_spread + 0.02, ankle_y + 0.02)
    kp[32] = (0.5 + x_spread - 0.02, ankle_y + 0.02)
    return kp


class TestComputeFrameMetrics:
    def test_returns_all_keys(self):
        kp = _make_keypoints()
        result = compute_frame_metrics(kp)
        expected_keys = {
            "knee_angle_deg", "knee_flexion_deg", "depth_ok",
            "hip_angle_deg", "trunk_angle_deg", "trunk_ok",
            "com_offset_norm", "balance_ok", "form_ok", "pose_confidence",
        }
        assert set(result.keys()) == expected_keys

    def test_none_keypoints(self):
        result = compute_frame_metrics(None)
        assert result["knee_angle_deg"] is None
        assert result["pose_confidence"] is None

    def test_empty_keypoints(self):
        result = compute_frame_metrics([])
        assert result["knee_angle_deg"] is None

    def test_standing_pose(self):
        """Standing pose: legs straight, small knee flexion."""
        kp = _make_keypoints(shoulder_y=0.2, hip_y=0.5, knee_y=0.7, ankle_y=0.9)
        result = compute_frame_metrics(kp)
        assert result["knee_angle_deg"] is not None
        assert result["pose_confidence"] is not None
        assert result["pose_confidence"] > 0.5

    def test_trunk_ok_upright(self):
        """Upright trunk should be OK."""
        kp = _make_keypoints(shoulder_y=0.2, hip_y=0.5)
        result = compute_frame_metrics(kp)
        assert result["trunk_ok"] is True

    def test_balance_ok_centered(self):
        """COM centered over feet should be balanced."""
        kp = _make_keypoints()
        result = compute_frame_metrics(kp)
        # Balance should be True or None
        if result["balance_ok"] is not None:
            assert result["balance_ok"] is True


class TestComputeBaseline:
    def test_baseline_from_samples(self):
        samples = [
            {"knee_flexion_deg": 10.0, "trunk_angle_deg": 5.0, "hip_angle_deg": 170.0, "com_offset_norm": 0.02},
            {"knee_flexion_deg": 12.0, "trunk_angle_deg": 6.0, "hip_angle_deg": 168.0, "com_offset_norm": 0.01},
            {"knee_flexion_deg": 11.0, "trunk_angle_deg": 5.5, "hip_angle_deg": 169.0, "com_offset_norm": 0.015},
        ]
        baseline = compute_baseline(samples)
        assert baseline["knee_flexion_deg"] is not None
        assert abs(baseline["knee_flexion_deg"] - 11.0) < 0.1

    def test_baseline_empty_samples(self):
        baseline = compute_baseline([])
        assert baseline["knee_flexion_deg"] is None

    def test_baseline_partial_data(self):
        samples = [
            {"knee_flexion_deg": 10.0},
            {"knee_flexion_deg": 12.0},
        ]
        baseline = compute_baseline(samples)
        assert baseline["knee_flexion_deg"] is not None
        assert baseline["trunk_angle_deg"] is None
