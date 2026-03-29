from __future__ import annotations

"""Adaptive programming engine.

Generates periodised workout plans that respond to the athlete's
real-time performance data -- form scores, fatigue indices, and
historical trends.  The engine implements a simple linear periodisation
model with automatic deload detection.
"""

from backend.services.load_recommender import LoadRecommender


# ── Intensity-wave pattern (1-indexed week within a mesocycle) ──────────
# week 1: moderate, week 2: heavy, week 3: heavy, week 4: deload
_INTENSITY_WAVE: dict[int, str] = {
    1: "moderate",
    2: "heavy",
    3: "heavy",
    4: "deload",
}

# Volume / intensity multipliers by phase
_PHASE_MULTIPLIERS: dict[str, dict[str, float]] = {
    "accumulation": {"volume_mult": 1.0, "intensity_mult": 0.80},
    "intensification": {"volume_mult": 0.85, "intensity_mult": 0.90},
    "peak": {"volume_mult": 0.70, "intensity_mult": 1.0},
    "deload": {"volume_mult": 0.60, "intensity_mult": 0.60},
}

# Recovery suggestions keyed on fatigue_risk level.
_RECOVERY_PROMPTS: dict[str, str] = {
    "moderate": (
        "Your recent sessions show moderate fatigue accumulation. "
        "Consider adding an extra rest day this week, prioritise sleep "
        "(7-9 hours), and ensure adequate protein intake (1.6-2.2 g/kg)."
    ),
    "high": (
        "Fatigue levels are high -- your body needs recovery. Take at "
        "least one full rest day before your next session. Focus on "
        "light mobility work, hydration, and nutrition. If high fatigue "
        "persists for two or more sessions a deload week is strongly "
        "recommended."
    ),
}


class ProgrammingEngine:
    """Generates workout plans based on user goals, experience, and history."""

    def __init__(self) -> None:
        self._load_recommender = LoadRecommender()

    # ------------------------------------------------------------------ #
    # Public API                                                         #
    # ------------------------------------------------------------------ #

    def generate_workout(
        self,
        goal: str,
        experience_level: str,
        exercise_type: str,
        training_max: dict,
        recent_sessions: list[dict],
    ) -> dict:
        """Return today's workout plan.

        Args:
            goal: ``'strength'``, ``'muscle_gain'``, ``'fat_loss'``, or
                ``'athletic'``.
            experience_level: ``'beginner'``, ``'intermediate'``, or
                ``'advanced'``.
            exercise_type: Exercise key (e.g. ``'squat'``).
            training_max: Mapping of ``{exercise_type: kg}``.
            recent_sessions: The last 5 (or fewer) session summaries for
                this exercise, each a dict containing at least
                ``avg_form_score``, ``fatigue_risk``, ``fatigue_index``.

        Returns:
            dict with ``exercise_type``, ``sets``, ``target_reps``,
            ``suggested_load_kg``, ``rest_seconds``, ``intensity_note``,
            ``periodization_phase``.
        """
        session_count = len(recent_sessions)
        deload_needed = self.detect_deload_needed(recent_sessions)

        # --- Determine periodization phase ---
        phase, intensity_note = self._determine_phase(
            session_count, deload_needed, recent_sessions
        )

        # --- Base prescription from LoadRecommender ---
        tm_kg = training_max.get(exercise_type)
        base_program = self._load_recommender.get_program(
            exercise_type=exercise_type,
            goal=goal,
            experience_level=experience_level,
            training_max_kg=tm_kg,
        )

        # --- Apply phase multipliers ---
        mult = _PHASE_MULTIPLIERS.get(phase, _PHASE_MULTIPLIERS["accumulation"])
        adjusted_sets = max(1, round(base_program["sets"] * mult["volume_mult"]))
        adjusted_reps = base_program["reps"]  # reps stay the same

        suggested_load: float | None = None
        if base_program["load_kg"] is not None:
            suggested_load = round(
                base_program["load_kg"] * mult["intensity_mult"], 1
            )

        # --- Progressive overload check ---
        if (
            suggested_load is not None
            and not deload_needed
            and self._should_progress(recent_sessions)
        ):
            suggested_load = round(suggested_load * 1.025, 1)

        return {
            "exercise_type": exercise_type,
            "sets": adjusted_sets,
            "target_reps": adjusted_reps,
            "suggested_load_kg": suggested_load,
            "rest_seconds": base_program["rest_seconds"],
            "intensity_note": intensity_note,
            "periodization_phase": phase,
        }

    def detect_deload_needed(self, recent_sessions: list[dict]) -> bool:
        """Check whether a deload is warranted.

        A deload is triggered when:

        1. The ``avg_form_score`` has been declining for 3+ consecutive
           sessions, **or**
        2. ``fatigue_risk`` has been ``'high'`` for 2+ consecutive
           sessions.
        """
        if len(recent_sessions) < 2:
            return False

        # --- Condition 1: form-score decline over 3+ sessions ---
        if len(recent_sessions) >= 3:
            form_scores = [
                s.get("avg_form_score") for s in recent_sessions[-3:]
            ]
            # Only evaluate if all scores are present
            if all(f is not None for f in form_scores):
                # Strictly declining
                if form_scores[0] > form_scores[1] > form_scores[2]:
                    return True

        # --- Condition 2: high fatigue for 2+ consecutive sessions ---
        high_streak = 0
        for session in reversed(recent_sessions):
            if session.get("fatigue_risk") == "high":
                high_streak += 1
                if high_streak >= 2:
                    return True
            else:
                break

        return False

    @staticmethod
    def get_recovery_prompt(
        fatigue_risk: str, session_count_this_week: int
    ) -> str | None:
        """Return a recovery suggestion if warranted.

        Recovery prompts are issued when:

        * fatigue_risk is ``'moderate'`` or ``'high'``, **or**
        * the athlete has trained 5+ sessions this week regardless of
          fatigue level.
        """
        prompt = _RECOVERY_PROMPTS.get(fatigue_risk)

        if session_count_this_week >= 5:
            overtraining_note = (
                f"You have already completed {session_count_this_week} "
                f"sessions this week. Consider taking a rest day to "
                f"allow for adequate recovery and adaptation."
            )
            if prompt is not None:
                return f"{prompt} {overtraining_note}"
            return overtraining_note

        return prompt

    # ------------------------------------------------------------------ #
    # Internal helpers                                                   #
    # ------------------------------------------------------------------ #

    @staticmethod
    def _determine_phase(
        session_count: int,
        deload_needed: bool,
        recent_sessions: list[dict],
    ) -> tuple[str, str]:
        """Map the current session number into a periodisation phase
        and intensity note.

        Returns:
            (phase, intensity_note) tuple.
        """
        if deload_needed:
            return "deload", "deload"

        # Use a 4-week mesocycle: sessions are numbered 1-based within
        # the cycle.  We infer the "week" from the total session count
        # (session_count is the number of *past* sessions, so the
        # current session is session_count + 1).
        current = session_count + 1
        week_in_cycle = ((current - 1) % 4) + 1  # 1, 2, 3, 4

        intensity_note = _INTENSITY_WAVE.get(week_in_cycle, "moderate")

        # Map intensity to phase name
        phase_map = {
            "moderate": "accumulation",
            "heavy": "intensification",
            "deload": "deload",
        }
        phase = phase_map.get(intensity_note, "accumulation")

        return phase, intensity_note

    @staticmethod
    def _should_progress(recent_sessions: list[dict]) -> bool:
        """Return ``True`` if form score has averaged above 85 for the
        last 2+ sessions -- the trigger for progressive overload."""
        if len(recent_sessions) < 2:
            return False

        last_two = recent_sessions[-2:]
        scores = [s.get("avg_form_score") for s in last_two]
        if any(s is None for s in scores):
            return False

        return all(s > 85 for s in scores)  # type: ignore[operator]
