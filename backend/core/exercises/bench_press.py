from __future__ import annotations

from backend.core.exercises.base import ExerciseConfig, ExerciseType

BENCH_PRESS_CONFIG = ExerciseConfig(
    exercise_type=ExerciseType.BENCH_PRESS,
    display_name="Bench Press",
    description=(
        "A compound upper-push exercise performed lying supine on a bench. The "
        "lifter lowers a barbell to the chest by flexing the elbows, then presses "
        "it back to full lockout, primarily targeting the pectorals and triceps."
    ),
    category="upper_push",

    # Rep detection
    rep_signal="elbow_flexion",
    primary_landmarks=[
        11, 12,   # shoulders (left, right)
        13, 14,   # elbows (left, right)
        15, 16,   # wrists (left, right)
    ],
    standing_threshold=170.0,   # arms fully extended at lockout
    bottom_threshold=70.0,      # elbows deeply flexed at chest

    # Form thresholds
    max_trunk_angle=50.0,
    trunk_delta=20.0,
    balance_margin=0.05,
    standing_signal_max=35.0,

    # Risk markers
    risk_thresholds={
        "asymmetry_limit": 10.0,   # max left-right elbow angle difference in degrees
    },

    # Scoring weights
    scoring_weights={
        "depth": 0.25,
        "stability": 0.20,
        "symmetry": 0.20,
        "tempo": 0.20,
        "rom": 0.15,
    },

    # Side
    primary_side="upper_bilateral",

    # Goal rep ranges
    strength_reps=(1, 5),
    muscle_gain_reps=(8, 12),
    fat_loss_reps=(12, 20),
    athletic_reps=(3, 6),

    # Ideal ranges — elbow flexion degrees
    ideal_depth_range=(65.0, 95.0),
    ideal_tempo_ms=3000,
)
