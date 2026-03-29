from __future__ import annotations

"""Tests for the adaptive programming engine."""
import pytest

from backend.services.programming import ProgrammingEngine


@pytest.fixture
def engine():
    return ProgrammingEngine()


class TestWorkoutGeneration:
    def test_generates_workout(self, engine):
        result = engine.generate_workout(
            goal="strength",
            experience_level="intermediate",
            exercise_type="squat",
            training_max={"squat": 100.0},
            recent_sessions=[],
        )
        assert "exercise_type" in result
        assert "sets" in result
        assert "target_reps" in result
        assert "periodization_phase" in result
        assert result["exercise_type"] == "squat"

    def test_deload_phase(self, engine):
        """Force deload by providing declining form scores."""
        sessions = [
            {"avg_form_score": 90, "fatigue_risk": "low", "fatigue_index": 10},
            {"avg_form_score": 70, "fatigue_risk": "moderate", "fatigue_index": 40},
            {"avg_form_score": 50, "fatigue_risk": "high", "fatigue_index": 70},
        ]
        result = engine.generate_workout(
            goal="strength",
            experience_level="intermediate",
            exercise_type="squat",
            training_max={"squat": 100.0},
            recent_sessions=sessions,
        )
        assert result["periodization_phase"] == "deload"

    def test_progressive_overload(self, engine):
        """Good form across sessions should trigger load increase."""
        sessions = [
            {"avg_form_score": 92, "fatigue_risk": "low", "fatigue_index": 10},
            {"avg_form_score": 95, "fatigue_risk": "low", "fatigue_index": 8},
        ]
        result = engine.generate_workout(
            goal="strength",
            experience_level="intermediate",
            exercise_type="squat",
            training_max={"squat": 100.0},
            recent_sessions=sessions,
        )
        # Should be in accumulation or intensification phase
        assert result["periodization_phase"] != "deload"


class TestDeloadDetection:
    def test_no_deload_insufficient_data(self, engine):
        assert engine.detect_deload_needed([]) is False
        assert engine.detect_deload_needed([{"avg_form_score": 50}]) is False

    def test_deload_declining_form(self, engine):
        sessions = [
            {"avg_form_score": 90, "fatigue_risk": "low"},
            {"avg_form_score": 75, "fatigue_risk": "moderate"},
            {"avg_form_score": 60, "fatigue_risk": "moderate"},
        ]
        assert engine.detect_deload_needed(sessions) is True

    def test_deload_high_fatigue_streak(self, engine):
        sessions = [
            {"avg_form_score": 80, "fatigue_risk": "low"},
            {"avg_form_score": 75, "fatigue_risk": "high"},
            {"avg_form_score": 70, "fatigue_risk": "high"},
        ]
        assert engine.detect_deload_needed(sessions) is True

    def test_no_deload_stable_form(self, engine):
        sessions = [
            {"avg_form_score": 85, "fatigue_risk": "low"},
            {"avg_form_score": 87, "fatigue_risk": "low"},
            {"avg_form_score": 86, "fatigue_risk": "low"},
        ]
        assert engine.detect_deload_needed(sessions) is False


class TestRecoveryPrompts:
    def test_no_prompt_low_fatigue(self):
        result = ProgrammingEngine.get_recovery_prompt("low", 3)
        assert result is None

    def test_prompt_moderate_fatigue(self):
        result = ProgrammingEngine.get_recovery_prompt("moderate", 3)
        assert result is not None
        assert "fatigue" in result.lower() or "rest" in result.lower()

    def test_prompt_high_fatigue(self):
        result = ProgrammingEngine.get_recovery_prompt("high", 3)
        assert result is not None

    def test_prompt_overtraining(self):
        result = ProgrammingEngine.get_recovery_prompt("low", 5)
        assert result is not None
        assert "5" in result
