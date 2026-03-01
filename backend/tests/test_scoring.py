"""Tests for the composite scoring engine."""
import pytest

from backend.core.exercises.base import ExerciseConfig, ExerciseType
from backend.services.scoring import CompositeScorer


@pytest.fixture
def scorer():
    return CompositeScorer()


@pytest.fixture
def squat_config():
    from backend.core.exercises.squat import SQUAT_CONFIG
    return SQUAT_CONFIG


class TestDepthScore:
    def test_perfect_depth(self, scorer, squat_config):
        metrics = {"primary_angle_deg": 100.0}
        result = scorer.score_rep(metrics, squat_config)
        assert result["depth_score"] == 100.0

    def test_shallow_depth(self, scorer, squat_config):
        metrics = {"primary_angle_deg": 50.0}
        result = scorer.score_rep(metrics, squat_config)
        assert result["depth_score"] < 100.0

    def test_missing_angle(self, scorer, squat_config):
        metrics = {}
        result = scorer.score_rep(metrics, squat_config)
        assert result["depth_score"] == 50.0  # neutral

    def test_ideal_range_boundaries(self, scorer, squat_config):
        # At bottom of ideal range
        metrics = {"primary_angle_deg": 85.0}
        result = scorer.score_rep(metrics, squat_config)
        assert result["depth_score"] == 100.0
        # At top of ideal range
        metrics = {"primary_angle_deg": 120.0}
        result = scorer.score_rep(metrics, squat_config)
        assert result["depth_score"] == 100.0


class TestStabilityScore:
    def test_perfect_stability(self, scorer, squat_config):
        metrics = {"com_variance": 0.005, "balance_ok_pct": 1.0}
        result = scorer.score_rep(metrics, squat_config)
        assert result["stability_score"] == 100.0

    def test_poor_stability(self, scorer, squat_config):
        metrics = {"com_variance": 0.10, "balance_ok_pct": 0.0}
        result = scorer.score_rep(metrics, squat_config)
        assert result["stability_score"] == 0.0

    def test_moderate_stability(self, scorer, squat_config):
        metrics = {"com_variance": 0.05, "balance_ok_pct": 0.8}
        result = scorer.score_rep(metrics, squat_config)
        assert 30 < result["stability_score"] < 90


class TestSymmetryScore:
    def test_perfect_symmetry(self, scorer, squat_config):
        metrics = {"left_primary_angle": 90.0, "right_primary_angle": 90.0}
        result = scorer.score_rep(metrics, squat_config)
        assert result["symmetry_score"] == 100.0

    def test_large_asymmetry(self, scorer, squat_config):
        metrics = {"left_primary_angle": 90.0, "right_primary_angle": 60.0}
        result = scorer.score_rep(metrics, squat_config)
        assert result["symmetry_score"] < 50.0

    def test_unilateral_exercise(self, scorer):
        config = ExerciseConfig(
            exercise_type=ExerciseType.LUNGE,
            display_name="Lunge",
            description="Lunge",
            category="lower_unilateral",
            rep_signal="knee_flexion",
            primary_side="unilateral",
        )
        metrics = {"left_primary_angle": 90.0, "right_primary_angle": 60.0}
        result = scorer.score_rep(metrics, config)
        assert result["symmetry_score"] == 100.0  # skipped for unilateral


class TestTempoScore:
    def test_first_rep_no_average(self, scorer, squat_config):
        metrics = {"duration_ms": 3000}
        result = scorer.score_rep(metrics, squat_config, session_avg_tempo_ms=None)
        assert result["tempo_score"] == 80.0  # neutral for first rep

    def test_consistent_tempo(self, scorer, squat_config):
        metrics = {"duration_ms": 3000}
        result = scorer.score_rep(metrics, squat_config, session_avg_tempo_ms=3000.0)
        assert result["tempo_score"] == 100.0

    def test_inconsistent_tempo(self, scorer, squat_config):
        metrics = {"duration_ms": 5000}
        result = scorer.score_rep(metrics, squat_config, session_avg_tempo_ms=3000.0)
        assert result["tempo_score"] < 50.0


class TestROMScore:
    def test_full_rom(self, scorer, squat_config):
        # Standing threshold ~170, ideal_lo 85 => ideal ROM = |170-85| = 85
        # actual ROM = |170-85| = 85 => ratio = 1.0 => 100
        metrics = {"primary_angle_deg": 85.0}
        result = scorer.score_rep(metrics, squat_config)
        assert result["rom_score"] == 100.0

    def test_partial_rom(self, scorer, squat_config):
        # actual ROM = |170-140| = 30, ideal = 85 => ratio ~ 0.35
        metrics = {"primary_angle_deg": 140.0}
        result = scorer.score_rep(metrics, squat_config)
        assert result["rom_score"] < 50.0


class TestCompositeScore:
    def test_composite_is_weighted_average(self, scorer, squat_config):
        metrics = {
            "primary_angle_deg": 100.0,
            "com_variance": 0.005,
            "balance_ok_pct": 1.0,
            "left_primary_angle": 90.0,
            "right_primary_angle": 90.0,
            "duration_ms": 3000,
        }
        result = scorer.score_rep(metrics, squat_config, session_avg_tempo_ms=3000.0)
        # All sub-scores should be high
        assert result["composite_score"] > 80.0

    def test_all_scores_have_keys(self, scorer, squat_config):
        result = scorer.score_rep({}, squat_config)
        expected_keys = {
            "composite_score", "depth_score", "stability_score",
            "symmetry_score", "tempo_score", "rom_score",
        }
        assert set(result.keys()) == expected_keys

    def test_scores_are_clamped(self, scorer, squat_config):
        metrics = {"primary_angle_deg": 100.0}
        result = scorer.score_rep(metrics, squat_config)
        for key, value in result.items():
            assert 0.0 <= value <= 100.0
