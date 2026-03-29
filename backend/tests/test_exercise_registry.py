from __future__ import annotations

"""Tests for the exercise registry and all 8 exercise configs."""
import pytest

from backend.core.exercises.base import ExerciseConfig, ExerciseType
from backend.services.exercise_registry import (
    get_all_exercises,
    get_exercise_by_name,
    get_exercise_config,
    get_exercises_by_category,
)


class TestExerciseRegistry:
    def test_all_eight_exercises_registered(self):
        exercises = get_all_exercises()
        assert len(exercises) == 8

    def test_all_exercise_types_present(self):
        exercises = get_all_exercises()
        types = {e.exercise_type for e in exercises}
        expected = set(ExerciseType)
        assert types == expected

    def test_lookup_by_type(self):
        config = get_exercise_config(ExerciseType.SQUAT)
        assert isinstance(config, ExerciseConfig)
        assert config.exercise_type == ExerciseType.SQUAT

    def test_lookup_by_name(self):
        config = get_exercise_by_name("squat")
        assert config.exercise_type == ExerciseType.SQUAT

    def test_lookup_by_name_case_insensitive(self):
        config = get_exercise_by_name("SQUAT")
        assert config.exercise_type == ExerciseType.SQUAT

    def test_lookup_unknown_name(self):
        with pytest.raises(KeyError):
            get_exercise_by_name("butterfly_curl")

    def test_lookup_by_category(self):
        lower = get_exercises_by_category("lower_push")
        assert len(lower) >= 1
        assert all(e.category == "lower_push" for e in lower)


class TestExerciseConfigs:
    """Validate each exercise config has required fields and sane values."""

    @pytest.fixture(params=list(ExerciseType))
    def config(self, request):
        return get_exercise_config(request.param)

    def test_has_display_name(self, config):
        assert config.display_name
        assert len(config.display_name) > 0

    def test_has_description(self, config):
        assert config.description
        assert len(config.description) > 10

    def test_has_category(self, config):
        valid_categories = {
            "lower_push", "hip_hinge", "lower_unilateral",
            "upper_push", "upper_pull",
        }
        assert config.category in valid_categories

    def test_has_rep_signal(self, config):
        valid_signals = {"knee_flexion", "hip_hinge", "elbow_flexion", "shoulder_angle"}
        assert config.rep_signal in valid_signals

    def test_has_primary_landmarks(self, config):
        assert len(config.primary_landmarks) >= 4
        assert all(isinstance(lm, int) for lm in config.primary_landmarks)
        assert all(0 <= lm <= 32 for lm in config.primary_landmarks)

    def test_thresholds_valid(self, config):
        # For most exercises: bottom < standing (e.g. squat: deeper = smaller angle)
        # For overhead press / pull-up: bottom > standing (arm extends upward)
        assert 0 < config.bottom_threshold <= 180
        assert 0 < config.standing_threshold <= 180
        assert config.bottom_threshold != config.standing_threshold

    def test_scoring_weights_sum_to_one(self, config):
        weights = config.scoring_weights
        total = sum(weights.values())
        assert abs(total - 1.0) < 0.01, f"Weights sum to {total}, expected ~1.0"

    def test_rep_ranges_valid(self, config):
        for name in ("strength_reps", "muscle_gain_reps", "fat_loss_reps", "athletic_reps"):
            lo, hi = getattr(config, name)
            assert 1 <= lo <= hi <= 30, f"{name}=({lo},{hi}) out of range"

    def test_primary_side_valid(self, config):
        valid_sides = {"bilateral", "unilateral", "alternating", "upper_bilateral"}
        assert config.primary_side in valid_sides

    def test_ideal_depth_range(self, config):
        lo, hi = config.ideal_depth_range
        assert lo < hi
        assert lo > 0
        assert hi <= 180


class TestSpecificExercises:
    def test_squat_config(self):
        config = get_exercise_by_name("squat")
        assert config.category == "lower_push"
        assert config.rep_signal == "knee_flexion"
        assert config.primary_side == "bilateral"

    def test_deadlift_config(self):
        config = get_exercise_by_name("deadlift")
        assert config.category == "hip_hinge"
        assert config.rep_signal == "hip_hinge"

    def test_lunge_config(self):
        config = get_exercise_by_name("lunge")
        assert config.category == "lower_unilateral"

    def test_pushup_config(self):
        config = get_exercise_by_name("pushup")
        assert config.category == "upper_push"
        assert config.rep_signal == "elbow_flexion"

    def test_bench_press_config(self):
        config = get_exercise_by_name("bench_press")
        assert config.category == "upper_push"

    def test_overhead_press_config(self):
        config = get_exercise_by_name("overhead_press")
        assert config.category == "upper_push"
        assert config.rep_signal == "shoulder_angle"

    def test_row_config(self):
        config = get_exercise_by_name("row")
        assert config.category == "upper_pull"

    def test_pullup_config(self):
        config = get_exercise_by_name("pullup")
        assert config.category == "upper_pull"
