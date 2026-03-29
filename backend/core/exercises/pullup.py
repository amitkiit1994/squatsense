from __future__ import annotations

from backend.core.exercises.base import ExerciseConfig, ExerciseType

PULLUP_CONFIG = ExerciseConfig(
    exercise_type=ExerciseType.PULLUP,
    display_name="Pull-up",
    description=(
        "A bodyweight upper-pull exercise where the athlete hangs from a bar and "
        "pulls the body upward until the chin clears the bar. Primarily targets "
        "the latissimus dorsi, biceps, and forearm flexors while demanding grip "
        "strength and scapular control."
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
    standing_threshold=170.0,   # dead hang (arms fully extended)
    bottom_threshold=50.0,      # chin over bar (elbows deeply flexed)

    # Form thresholds
    max_trunk_angle=50.0,
    trunk_delta=20.0,
    balance_margin=0.05,
    standing_signal_max=35.0,

    # Risk markers
    risk_thresholds={
        "kipping_hip_oscillation": 20.0,   # max hip swing amplitude in degrees
        "incomplete_lockout": 160.0,       # min elbow angle to count as full lockout
    },

    # Scoring weights — ROM heavily weighted for full range pull-ups
    scoring_weights={
        "depth": 0.15,
        "stability": 0.20,
        "symmetry": 0.20,
        "tempo": 0.20,
        "rom": 0.25,
    },

    # Side
    primary_side="upper_bilateral",

    # Goal rep ranges — bodyweight pulling
    strength_reps=(1, 5),
    muscle_gain_reps=(6, 12),
    fat_loss_reps=(10, 20),
    athletic_reps=(3, 8),

    # Ideal ranges — elbow flexion degrees
    ideal_depth_range=(85.0, 120.0),
    ideal_tempo_ms=3000,
)
