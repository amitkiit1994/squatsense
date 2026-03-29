from __future__ import annotations

"""Tests for the load recommendation engine."""
import pytest

from backend.services.load_recommender import LoadRecommender


@pytest.fixture
def recommender():
    return LoadRecommender()


class TestTrainingMax:
    def test_single_rep(self, recommender):
        """1RM is the load itself."""
        assert recommender.compute_training_max("squat", 1, 100.0) == 100.0

    def test_epley_formula(self, recommender):
        """5 reps @ 100kg -> 1RM = 100 * (1 + 5/30) = ~116.67."""
        result = recommender.compute_training_max("squat", 5, 100.0)
        assert abs(result - 116.67) < 0.1

    def test_zero_reps(self, recommender):
        assert recommender.compute_training_max("squat", 0, 100.0) == 0.0

    def test_zero_load(self, recommender):
        assert recommender.compute_training_max("squat", 5, 0.0) == 0.0


class TestNextLoadRecommendation:
    def test_increase_load(self, recommender):
        result = recommender.recommend_next_load(
            current_load_kg=100.0,
            avg_form_score=92.0,
            fatigue_index=15.0,
            fatigue_risk="low",
            reps_completed=5,
            target_reps=5,
            goal="strength",
        )
        assert result["reason"] == "increase"
        assert result["recommended_load_kg"] > 100.0
        assert result["change_pct"] > 0

    def test_maintain_load_moderate_form(self, recommender):
        result = recommender.recommend_next_load(
            current_load_kg=100.0,
            avg_form_score=75.0,
            fatigue_index=25.0,
            fatigue_risk="low",
            reps_completed=5,
            target_reps=5,
            goal="strength",
        )
        assert result["reason"] == "maintain"
        assert result["recommended_load_kg"] == 100.0

    def test_decrease_load_poor_form(self, recommender):
        result = recommender.recommend_next_load(
            current_load_kg=100.0,
            avg_form_score=45.0,
            fatigue_index=20.0,
            fatigue_risk="low",
            reps_completed=3,
            target_reps=5,
            goal="strength",
        )
        assert result["reason"] == "decrease"
        assert result["recommended_load_kg"] < 100.0

    def test_decrease_load_high_fatigue(self, recommender):
        result = recommender.recommend_next_load(
            current_load_kg=100.0,
            avg_form_score=80.0,
            fatigue_index=75.0,
            fatigue_risk="high",
            reps_completed=5,
            target_reps=5,
            goal="strength",
        )
        assert result["reason"] == "decrease"

    def test_zero_load(self, recommender):
        result = recommender.recommend_next_load(
            current_load_kg=0.0,
            avg_form_score=80.0,
            fatigue_index=10.0,
            fatigue_risk="low",
            reps_completed=5,
            target_reps=5,
            goal="strength",
        )
        assert result["reason"] == "maintain"


class TestGoalProgram:
    @pytest.mark.parametrize("goal", ["strength", "muscle_gain", "fat_loss", "athletic"])
    def test_valid_goals(self, recommender, goal):
        result = recommender.get_program(
            exercise_type="squat",
            goal=goal,
            experience_level="intermediate",
            training_max_kg=100.0,
        )
        assert "sets" in result
        assert "reps" in result
        assert "load_kg" in result
        assert "rest_seconds" in result

    def test_strength_program(self, recommender):
        result = recommender.get_program("squat", "strength", "intermediate", 100.0)
        assert result["reps"] <= 5
        assert result["load_pct_1rm"] >= 85.0

    def test_fat_loss_program(self, recommender):
        result = recommender.get_program("squat", "fat_loss", "intermediate", 100.0)
        assert result["reps"] >= 12
        assert result["rest_seconds"] <= 90

    @pytest.mark.parametrize("level", ["beginner", "intermediate", "advanced"])
    def test_experience_levels(self, recommender, level):
        result = recommender.get_program("squat", "strength", level, 100.0)
        assert result["sets"] >= 1
        assert result["reps"] >= 1

    def test_no_training_max(self, recommender):
        result = recommender.get_program("squat", "strength", "intermediate", None)
        assert result["load_kg"] is None

    def test_unknown_goal_falls_back(self, recommender):
        result = recommender.get_program("squat", "unknown", "intermediate", 100.0)
        assert "sets" in result  # should use muscle_gain default
