from backend.core.exercises.base import ExerciseConfig, ExerciseType

PUSHUP_CONFIG = ExerciseConfig(
    exercise_type=ExerciseType.PUSHUP,
    display_name="Push-up",
    description=(
        "A bodyweight upper-push exercise targeting the chest, anterior deltoids, "
        "and triceps. The athlete maintains a rigid plank position while lowering "
        "the body by flexing the elbows, then pressing back up to full extension."
    ),
    category="upper_push",

    # Rep detection
    rep_signal="elbow_flexion",
    primary_landmarks=[
        11, 12,   # shoulders (left, right)
        13, 14,   # elbows (left, right)
        15, 16,   # wrists (left, right)
        23, 24,   # hips (left, right)
        27, 28,   # ankles (left, right)
    ],
    standing_threshold=170.0,   # arms fully extended at top
    bottom_threshold=70.0,      # elbows deeply flexed at bottom

    # Form thresholds
    max_trunk_angle=10.0,       # minimal hip sag or pike allowed
    trunk_delta=20.0,
    balance_margin=0.05,
    standing_signal_max=35.0,

    # Risk markers
    risk_thresholds={
        "hip_sag_angle": 160.0,        # min shoulder-hip-ankle angle (below = sag)
        "elbow_flare_limit": 60.0,     # max elbow flare angle from torso
    },

    # Scoring weights — stability more important for bodyweight plank position
    scoring_weights={
        "depth": 0.25,
        "stability": 0.25,
        "symmetry": 0.15,
        "tempo": 0.20,
        "rom": 0.15,
    },

    # Side
    primary_side="upper_bilateral",

    # Goal rep ranges — higher for bodyweight exercise
    strength_reps=(1, 10),
    muscle_gain_reps=(10, 20),
    fat_loss_reps=(15, 30),
    athletic_reps=(5, 15),

    # Ideal ranges — elbow flexion degrees
    ideal_depth_range=(65.0, 95.0),
    ideal_tempo_ms=3000,
)
