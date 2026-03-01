from dataclasses import dataclass, field
from enum import Enum


class ExerciseType(str, Enum):
    SQUAT = "squat"
    DEADLIFT = "deadlift"
    LUNGE = "lunge"
    PUSHUP = "pushup"
    BENCH_PRESS = "bench_press"
    OVERHEAD_PRESS = "overhead_press"
    ROW = "row"
    PULLUP = "pullup"


@dataclass
class ExerciseConfig:
    exercise_type: ExerciseType
    display_name: str
    description: str
    category: str                        # 'lower_push', 'hip_hinge', 'lower_unilateral', 'upper_push', 'upper_pull'

    # Rep detection
    rep_signal: str                      # 'knee_flexion', 'hip_hinge', 'elbow_flexion', 'shoulder_angle'
    primary_landmarks: list[int] = field(default_factory=list)
    standing_threshold: float = 170.0    # degrees at top/start
    bottom_threshold: float = 90.0       # degrees at bottom/peak contraction

    # Form thresholds (exercise-specific)
    max_trunk_angle: float = 50.0
    trunk_delta: float = 20.0
    balance_margin: float = 0.05
    standing_signal_max: float = 35.0    # calibration: max signal value considered "standing"

    # Risk marker configs
    risk_thresholds: dict = field(default_factory=dict)

    # Scoring weights
    scoring_weights: dict = field(default_factory=lambda: {
        'depth': 0.25, 'stability': 0.20, 'symmetry': 0.20, 'tempo': 0.20, 'rom': 0.15
    })

    # Side
    primary_side: str = 'bilateral'      # 'bilateral', 'unilateral', 'alternating', 'upper_bilateral'

    # Goal rep ranges
    strength_reps: tuple = (1, 5)
    muscle_gain_reps: tuple = (8, 12)
    fat_loss_reps: tuple = (12, 20)
    athletic_reps: tuple = (3, 6)

    # Ideal ranges for scoring
    ideal_depth_range: tuple = (85.0, 120.0)  # knee flexion degrees for 100 score
    ideal_tempo_ms: int = 3000                 # target rep duration in ms
