from backend.core.exercises.base import ExerciseConfig, ExerciseType

LUNGE_CONFIG = ExerciseConfig(
    exercise_type=ExerciseType.LUNGE,
    display_name="Lunge",
    description=(
        "A unilateral lower-body exercise that develops single-leg strength, "
        "balance, and coordination. The lifter steps forward (or backward) and "
        "lowers the hips until both knees reach approximately 90 degrees of flexion."
    ),
    category="lower_unilateral",

    # Rep detection
    rep_signal="knee_flexion",
    primary_landmarks=[
        23, 24,   # hips (left, right)
        25, 26,   # knees (left, right)
        27, 28,   # ankles (left, right)
        31, 32,   # feet (left, right)
    ],
    standing_threshold=170.0,
    bottom_threshold=85.0,

    # Form thresholds
    max_trunk_angle=40.0,      # stricter upright torso than squat
    trunk_delta=20.0,
    balance_margin=0.05,
    standing_signal_max=35.0,

    # Risk markers
    risk_thresholds={
        "knee_over_toes_limit": 5.0,   # max cm knee can travel past toes
    },

    # Scoring weights
    scoring_weights={
        "depth": 0.25,
        "stability": 0.20,
        "symmetry": 0.20,
        "tempo": 0.20,
        "rom": 0.15,
    },

    # Side — alternating legs
    primary_side="alternating",

    # Goal rep ranges
    strength_reps=(1, 5),
    muscle_gain_reps=(8, 12),
    fat_loss_reps=(12, 20),
    athletic_reps=(3, 6),

    # Ideal ranges
    ideal_depth_range=(80.0, 100.0),
    ideal_tempo_ms=3000,
)
