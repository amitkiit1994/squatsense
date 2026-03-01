"""Tests for the fatigue modelling engine."""
import pytest

from backend.services.fatigue import FatigueEngine


@pytest.fixture
def engine():
    return FatigueEngine()


class TestSetFatigue:
    def test_insufficient_reps(self, engine):
        """Fewer than 3 reps should return empty/neutral result."""
        reps = [
            {"speed_proxy": 0.5, "depth_score": 90, "stability_score": 85, "symmetry_score": 95},
            {"speed_proxy": 0.4, "depth_score": 85, "stability_score": 80, "symmetry_score": 90},
        ]
        result = engine.compute_set_fatigue(reps)
        assert result["fatigue_index"] == 0.0
        assert result["fatigue_risk"] == "low"

    def test_no_fatigue(self, engine):
        """Improving metrics should show no fatigue."""
        reps = [
            {"speed_proxy": 0.4, "depth_score": 80, "stability_score": 75, "symmetry_score": 85},
            {"speed_proxy": 0.45, "depth_score": 85, "stability_score": 80, "symmetry_score": 90},
            {"speed_proxy": 0.5, "depth_score": 90, "stability_score": 85, "symmetry_score": 95},
            {"speed_proxy": 0.55, "depth_score": 92, "stability_score": 88, "symmetry_score": 97},
        ]
        result = engine.compute_set_fatigue(reps)
        assert result["fatigue_index"] == 0.0
        assert result["fatigue_risk"] == "low"

    def test_clear_fatigue(self, engine):
        """Declining metrics should produce positive fatigue index."""
        reps = [
            {"speed_proxy": 0.6, "depth_score": 95, "stability_score": 90, "symmetry_score": 95},
            {"speed_proxy": 0.5, "depth_score": 85, "stability_score": 80, "symmetry_score": 88},
            {"speed_proxy": 0.4, "depth_score": 70, "stability_score": 65, "symmetry_score": 75},
            {"speed_proxy": 0.3, "depth_score": 55, "stability_score": 50, "symmetry_score": 60},
        ]
        result = engine.compute_set_fatigue(reps)
        assert result["fatigue_index"] > 0.0
        assert result["velocity_decay_pct"] > 0.0
        assert result["depth_degradation_pct"] > 0.0

    def test_risk_classification(self, engine):
        """High fatigue should classify as 'high' risk."""
        # Severe degradation
        reps = [
            {"speed_proxy": 1.0, "depth_score": 100, "stability_score": 100, "symmetry_score": 100},
            {"speed_proxy": 0.6, "depth_score": 60, "stability_score": 60, "symmetry_score": 60},
            {"speed_proxy": 0.3, "depth_score": 30, "stability_score": 30, "symmetry_score": 30},
            {"speed_proxy": 0.1, "depth_score": 10, "stability_score": 10, "symmetry_score": 10},
        ]
        result = engine.compute_set_fatigue(reps)
        assert result["fatigue_risk"] in ("moderate", "high")

    def test_missing_keys_handled(self, engine):
        """Missing metric keys should not crash."""
        reps = [
            {"speed_proxy": 0.5},
            {"speed_proxy": 0.4},
            {"speed_proxy": 0.3},
        ]
        result = engine.compute_set_fatigue(reps)
        assert "fatigue_index" in result
        assert "fatigue_risk" in result


class TestSessionFatigue:
    def test_session_fatigue_across_sets(self, engine):
        """Declining set-level averages should produce session fatigue."""
        sets = [
            {"speed_proxy": 0.5, "depth_score": 90, "stability_score": 85, "symmetry_score": 92},
            {"speed_proxy": 0.45, "depth_score": 82, "stability_score": 78, "symmetry_score": 85},
            {"speed_proxy": 0.38, "depth_score": 70, "stability_score": 65, "symmetry_score": 75},
        ]
        result = engine.compute_session_fatigue(sets)
        assert result["fatigue_index"] > 0.0

    def test_insufficient_sets(self, engine):
        sets = [
            {"speed_proxy": 0.5, "depth_score": 90, "stability_score": 85, "symmetry_score": 92},
        ]
        result = engine.compute_session_fatigue(sets)
        assert result["fatigue_index"] == 0.0


class TestResultSchema:
    def test_result_keys(self, engine):
        reps = [
            {"speed_proxy": 0.5, "depth_score": 90, "stability_score": 85, "symmetry_score": 92},
            {"speed_proxy": 0.45, "depth_score": 82, "stability_score": 78, "symmetry_score": 85},
            {"speed_proxy": 0.38, "depth_score": 70, "stability_score": 65, "symmetry_score": 75},
        ]
        result = engine.compute_set_fatigue(reps)
        expected_keys = {
            "fatigue_index", "fatigue_risk",
            "velocity_decay_pct", "depth_degradation_pct",
            "stability_drift_pct", "symmetry_increase_pct",
        }
        assert set(result.keys()) == expected_keys

    def test_fatigue_index_clamped(self, engine):
        reps = [
            {"speed_proxy": 0.5, "depth_score": 90, "stability_score": 85, "symmetry_score": 92},
            {"speed_proxy": 0.45, "depth_score": 82, "stability_score": 78, "symmetry_score": 85},
            {"speed_proxy": 0.38, "depth_score": 70, "stability_score": 65, "symmetry_score": 75},
        ]
        result = engine.compute_set_fatigue(reps)
        assert 0.0 <= result["fatigue_index"] <= 100.0
