from __future__ import annotations

from backend.core.exercises.base import ExerciseConfig, ExerciseType

DEADLIFT_CONFIG = ExerciseConfig(
    exercise_type=ExerciseType.DEADLIFT,
    display_name="Deadlift",
    description=(
        "A hip-hinge movement that targets the posterior chain including the "
        "hamstrings, glutes, and erector spinae. The lifter drives the hips "
        "forward while maintaining a neutral spine to lift the weight from the floor."
    ),
    category="hip_hinge",

    # Rep detection
    rep_signal="hip_hinge",
    primary_landmarks=[
        23, 24,   # hips (left, right)
        25, 26,   # knees (left, right)
        11, 12,   # shoulders (left, right)
        15, 16,   # wrists (left, right)
    ],
    standing_threshold=170.0,
    bottom_threshold=70.0,     # hip hinge angle at the bottom

    # Form thresholds
    max_trunk_angle=70.0,      # more forward lean allowed than squat
    trunk_delta=20.0,
    balance_margin=0.05,
    standing_signal_max=35.0,

    # Risk markers
    risk_thresholds={
        "lumbar_rounding_rate": 5.0,    # max rate of lumbar angle change per frame
        "max_forward_lean": 80.0,       # max trunk forward lean in degrees
    },

    # Scoring weights — ROM is equally weighted for hinge movements
    scoring_weights={
        "depth": 0.20,
        "stability": 0.20,
        "symmetry": 0.20,
        "tempo": 0.20,
        "rom": 0.20,
    },

    # Side
    primary_side="bilateral",

    # Goal rep ranges
    strength_reps=(1, 5),
    muscle_gain_reps=(8, 12),
    fat_loss_reps=(12, 20),
    athletic_reps=(3, 6),

    # Ideal ranges — hip hinge angle
    ideal_depth_range=(60.0, 90.0),
    ideal_tempo_ms=3500,
)
