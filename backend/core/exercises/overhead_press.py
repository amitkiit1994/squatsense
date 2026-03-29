from __future__ import annotations

from backend.core.exercises.base import ExerciseConfig, ExerciseType

OVERHEAD_PRESS_CONFIG = ExerciseConfig(
    exercise_type=ExerciseType.OVERHEAD_PRESS,
    display_name="Overhead Press",
    description=(
        "A strict standing shoulder press where the barbell is pressed from the "
        "front-rack position to full overhead lockout. Primarily targets the "
        "deltoids and triceps while demanding strong core stability to prevent "
        "excessive trunk lean."
    ),
    category="upper_push",

    # Rep detection
    # NOTE: For OHP the signal INCREASES as you press up (opposite of squat).
    # standing_threshold is the LOWER angle (arms at rack position),
    # bottom_threshold is the HIGHER angle (arms overhead at lockout).
    rep_signal="shoulder_angle",
    primary_landmarks=[
        11, 12,   # shoulders (left, right)
        13, 14,   # elbows (left, right)
        15, 16,   # wrists (left, right)
        23, 24,   # hips (left, right)
    ],
    standing_threshold=60.0,    # arms at rack position (start)
    bottom_threshold=170.0,     # arms overhead at full lockout (top)

    # Form thresholds
    max_trunk_angle=15.0,       # very strict — no excessive lean back
    trunk_delta=20.0,
    balance_margin=0.05,
    standing_signal_max=35.0,

    # Risk markers
    risk_thresholds={
        "trunk_lean_back_limit": 20.0,   # max backward trunk lean in degrees
    },

    # Scoring weights — stability heavily weighted for strict press form
    scoring_weights={
        "depth": 0.15,
        "stability": 0.30,
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

    # Ideal ranges — shoulder angle degrees
    ideal_depth_range=(85.0, 120.0),
    ideal_tempo_ms=3000,
)
