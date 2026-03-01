from backend.core.exercises.base import ExerciseConfig, ExerciseType

SQUAT_CONFIG = ExerciseConfig(
    exercise_type=ExerciseType.SQUAT,
    display_name="Back Squat",
    description=(
        "A compound lower-body exercise targeting the quadriceps, glutes, and "
        "hamstrings. The lifter descends by flexing the hips and knees while "
        "maintaining an upright trunk, then drives back up to a standing position."
    ),
    category="lower_push",

    # Rep detection
    rep_signal="knee_flexion",
    primary_landmarks=[
        23, 24,   # hips (left, right)
        25, 26,   # knees (left, right)
        27, 28,   # ankles (left, right)
        11, 12,   # shoulders (left, right)
    ],
    standing_threshold=170.0,
    bottom_threshold=90.0,

    # Form thresholds
    max_trunk_angle=50.0,
    trunk_delta=20.0,
    balance_margin=0.05,
    standing_signal_max=35.0,

    # Risk markers
    risk_thresholds={
        "valgus_limit": 15.0,    # maximum knee valgus in degrees
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
    primary_side="bilateral",

    # Goal rep ranges
    strength_reps=(1, 5),
    muscle_gain_reps=(8, 12),
    fat_loss_reps=(12, 20),
    athletic_reps=(3, 6),

    # Ideal ranges
    ideal_depth_range=(95.0, 115.0),
    ideal_tempo_ms=3000,
)
