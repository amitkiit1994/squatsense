from __future__ import annotations

from backend.core.exercises.base import ExerciseConfig, ExerciseType

ROW_CONFIG = ExerciseConfig(
    exercise_type=ExerciseType.ROW,
    display_name="Row",
    description=(
        "A compound upper-pull exercise performed from a bent-over position. "
        "The lifter pulls the barbell or dumbbells toward the torso by retracting "
        "the scapulae and flexing the elbows, targeting the lats, rhomboids, and "
        "rear deltoids."
    ),
    category="upper_pull",

    # Rep detection
    rep_signal="elbow_flexion",
    primary_landmarks=[
        11, 12,   # shoulders (left, right)
        13, 14,   # elbows (left, right)
        15, 16,   # wrists (left, right)
        23, 24,   # hips (left, right)
    ],
    standing_threshold=170.0,   # arms fully extended (hanging)
    bottom_threshold=50.0,      # elbows pulled in to torso

    # Form thresholds
    max_trunk_angle=60.0,       # bent-over position
    trunk_delta=20.0,
    balance_margin=0.05,
    standing_signal_max=35.0,

    # Risk markers
    risk_thresholds={
        "trunk_variation_limit": 10.0,       # max trunk angle change during rep
        "shoulder_imbalance_limit": 15.0,    # max left-right shoulder height diff (degrees)
    },

    # Scoring weights — symmetry more important for bilateral pull
    scoring_weights={
        "depth": 0.20,
        "stability": 0.20,
        "symmetry": 0.25,
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
    ideal_depth_range=(85.0, 120.0),
    ideal_tempo_ms=3000,
)
