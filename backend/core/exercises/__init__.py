from backend.core.exercises.base import ExerciseConfig, ExerciseType
from backend.core.exercises.squat import SQUAT_CONFIG
from backend.core.exercises.deadlift import DEADLIFT_CONFIG
from backend.core.exercises.lunge import LUNGE_CONFIG
from backend.core.exercises.pushup import PUSHUP_CONFIG
from backend.core.exercises.bench_press import BENCH_PRESS_CONFIG
from backend.core.exercises.overhead_press import OVERHEAD_PRESS_CONFIG
from backend.core.exercises.row import ROW_CONFIG
from backend.core.exercises.pullup import PULLUP_CONFIG

ALL_EXERCISES: list[ExerciseConfig] = [
    SQUAT_CONFIG,
    DEADLIFT_CONFIG,
    LUNGE_CONFIG,
    PUSHUP_CONFIG,
    BENCH_PRESS_CONFIG,
    OVERHEAD_PRESS_CONFIG,
    ROW_CONFIG,
    PULLUP_CONFIG,
]

_EXERCISE_MAP: dict[ExerciseType, ExerciseConfig] = {
    cfg.exercise_type: cfg for cfg in ALL_EXERCISES
}


def get_exercise_config(exercise_type: ExerciseType) -> ExerciseConfig:
    """Return the config for a given exercise type.

    Raises:
        KeyError: If the exercise type is not registered.
    """
    try:
        return _EXERCISE_MAP[exercise_type]
    except KeyError:
        raise KeyError(
            f"No exercise config registered for {exercise_type!r}. "
            f"Available types: {[e.value for e in _EXERCISE_MAP]}"
        )


def get_all_exercises() -> list[ExerciseConfig]:
    """Return a list of all registered exercise configs."""
    return list(ALL_EXERCISES)


__all__ = [
    "ExerciseConfig",
    "ExerciseType",
    "SQUAT_CONFIG",
    "DEADLIFT_CONFIG",
    "LUNGE_CONFIG",
    "PUSHUP_CONFIG",
    "BENCH_PRESS_CONFIG",
    "OVERHEAD_PRESS_CONFIG",
    "ROW_CONFIG",
    "PULLUP_CONFIG",
    "ALL_EXERCISES",
    "get_exercise_config",
    "get_all_exercises",
]
