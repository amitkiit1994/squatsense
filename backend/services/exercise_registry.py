"""
Exercise Registry Service

Provides lookup functions for exercise configurations. Acts as the single
entry point for the rest of the application to retrieve exercise-specific
parameters such as rep detection thresholds, risk markers, and scoring weights.
"""

from backend.core.exercises.base import ExerciseConfig, ExerciseType
from backend.core.exercises import (
    ALL_EXERCISES,
    SQUAT_CONFIG,
    DEADLIFT_CONFIG,
    LUNGE_CONFIG,
    PUSHUP_CONFIG,
    BENCH_PRESS_CONFIG,
    OVERHEAD_PRESS_CONFIG,
    ROW_CONFIG,
    PULLUP_CONFIG,
)

_EXERCISE_MAP: dict[ExerciseType, ExerciseConfig] = {
    cfg.exercise_type: cfg for cfg in ALL_EXERCISES
}


def get_exercise_config(exercise_type: ExerciseType) -> ExerciseConfig:
    """Return the configuration for the given exercise type.

    Args:
        exercise_type: An ``ExerciseType`` enum member identifying the exercise.

    Returns:
        The corresponding ``ExerciseConfig`` instance.

    Raises:
        KeyError: If no configuration is registered for the given type.
    """
    try:
        return _EXERCISE_MAP[exercise_type]
    except KeyError:
        raise KeyError(
            f"No exercise config registered for {exercise_type!r}. "
            f"Available types: {[e.value for e in _EXERCISE_MAP]}"
        )


def get_all_exercises() -> list[ExerciseConfig]:
    """Return a list of all registered exercise configurations.

    Returns:
        A new list containing every ``ExerciseConfig`` in the registry.
    """
    return list(ALL_EXERCISES)


def get_exercise_by_name(name: str) -> ExerciseConfig:
    """Look up an exercise config by its string name (case-insensitive).

    Accepts the ``ExerciseType`` value string (e.g. ``'squat'``,
    ``'bench_press'``).

    Args:
        name: The exercise type name as a plain string.

    Returns:
        The corresponding ``ExerciseConfig`` instance.

    Raises:
        KeyError: If the name does not match any registered exercise type.
    """
    normalised = name.strip().lower()
    try:
        exercise_type = ExerciseType(normalised)
    except ValueError:
        available = [e.value for e in ExerciseType]
        raise KeyError(
            f"Unknown exercise name {name!r}. Available: {available}"
        )
    return get_exercise_config(exercise_type)


def get_exercises_by_category(category: str) -> list[ExerciseConfig]:
    """Return all exercises belonging to the given category.

    Args:
        category: One of ``'lower_push'``, ``'hip_hinge'``,
            ``'lower_unilateral'``, ``'upper_push'``, ``'upper_pull'``.

    Returns:
        A list of matching ``ExerciseConfig`` instances (may be empty).
    """
    return [cfg for cfg in ALL_EXERCISES if cfg.category == category]
