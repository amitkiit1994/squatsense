from __future__ import annotations

"""Load recommendation engine.

Estimates a training max (1RM) from submaximal performance using the
Epley formula, recommends load adjustments based on form quality and
fatigue, and generates goal-based programming prescriptions.
"""

import math


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


# ── Goal-based programming templates ────────────────────────────────────
# Each entry: (sets_lo, sets_hi, reps_lo, reps_hi, pct_1rm_lo,
#               pct_1rm_hi, rest_lo_s, rest_hi_s, notes)
_GOAL_TEMPLATES: dict[str, tuple] = {
    "strength": (4, 5, 1, 5, 0.85, 0.95, 180, 300,
                 "Focus on maximal force production with full recovery "
                 "between sets."),
    "muscle_gain": (3, 4, 8, 12, 0.65, 0.80, 60, 90,
                    "Moderate load with controlled tempo to maximise "
                    "time under tension."),
    "fat_loss": (3, 4, 12, 20, 0.40, 0.60, 30, 60,
                 "Lighter load with short rest to keep heart-rate "
                 "elevated throughout the session."),
    "athletic": (4, 5, 3, 6, 0.70, 0.85, 120, 180,
                 "Explosive concentric, controlled eccentric. "
                 "Prioritise movement quality and bar speed."),
}


class LoadRecommender:
    """Recommends load adjustments based on performance."""

    # ------------------------------------------------------------------ #
    # 1RM estimation                                                     #
    # ------------------------------------------------------------------ #

    @staticmethod
    def compute_training_max(
        exercise_type: str,
        reps_completed: int,
        load_used_kg: float,
    ) -> float:
        """Estimate 1-rep max using the Epley formula.

        ``1RM = load * (1 + reps / 30)``

        For single-rep efforts (reps == 1) the load itself is returned.
        """
        if reps_completed <= 0 or load_used_kg <= 0:
            return 0.0
        if reps_completed == 1:
            return load_used_kg
        return round(load_used_kg * (1.0 + reps_completed / 30.0), 2)

    # ------------------------------------------------------------------ #
    # Next-load recommendation                                           #
    # ------------------------------------------------------------------ #

    def recommend_next_load(
        self,
        current_load_kg: float,
        avg_form_score: float,
        fatigue_index: float,
        fatigue_risk: str,
        reps_completed: int,
        target_reps: int,
        goal: str,
    ) -> dict:
        """Recommend the load for the next set or session.

        Decision matrix (from the PRD):

        * **Increase 2.5-5 %** -- reps completed with good form
          (``form_score > 85``) *and* low fatigue.
        * **Maintain** -- reps completed but fatigue is moderate, or
          form is in the 60-85 band.
        * **Decrease 5-10 %** -- form breakdown (``form_score < 60``)
          *or* high fatigue.

        Returns:
            dict with ``recommended_load_kg``, ``change_pct``,
            ``reason`` (``'increase'`` / ``'maintain'`` / ``'decrease'``),
            and ``explanation`` (human-readable string).
        """
        if current_load_kg <= 0:
            return {
                "recommended_load_kg": 0.0,
                "change_pct": 0.0,
                "reason": "maintain",
                "explanation": "No load data available to base a recommendation on.",
            }

        # --- Decrease ---
        if avg_form_score < 60 or fatigue_risk == "high":
            # Scale the decrease between 5 % and 10 % depending on
            # severity.  Worse form / higher fatigue => bigger cut.
            severity = 1.0 - avg_form_score / 60.0 if avg_form_score < 60 else 0.0
            fatigue_severity = (
                (fatigue_index - 60.0) / 40.0 if fatigue_index > 60 else 0.0
            )
            combined = _clamp(max(severity, fatigue_severity), 0.0, 1.0)
            decrease_pct = 5.0 + combined * 5.0  # 5 % to 10 %
            change_pct = -round(decrease_pct, 1)
            new_load = round(current_load_kg * (1.0 + change_pct / 100.0), 2)

            reasons: list[str] = []
            if avg_form_score < 60:
                reasons.append(
                    f"form score is low ({avg_form_score:.0f}/100)"
                )
            if fatigue_risk == "high":
                reasons.append(
                    f"fatigue risk is high (index {fatigue_index:.0f})"
                )
            explanation = (
                f"Decrease load by {abs(change_pct):.1f}% because "
                + " and ".join(reasons)
                + ". Prioritise movement quality before adding weight."
            )
            return {
                "recommended_load_kg": max(new_load, 0.0),
                "change_pct": change_pct,
                "reason": "decrease",
                "explanation": explanation,
            }

        # --- Increase ---
        reps_met = reps_completed >= target_reps
        form_good = avg_form_score > 85
        fatigue_low = fatigue_risk == "low"

        if reps_met and form_good and fatigue_low:
            # Scale increase: stronger form => closer to 5 %, marginal
            # form => closer to 2.5 %.
            form_factor = _clamp(
                (avg_form_score - 85.0) / 15.0, 0.0, 1.0
            )
            increase_pct = 2.5 + form_factor * 2.5  # 2.5 % to 5 %
            change_pct = round(increase_pct, 1)
            new_load = round(
                current_load_kg * (1.0 + change_pct / 100.0), 2
            )
            explanation = (
                f"Increase load by {change_pct:.1f}% -- all {reps_completed} "
                f"reps completed with excellent form "
                f"({avg_form_score:.0f}/100) and low fatigue."
            )
            return {
                "recommended_load_kg": new_load,
                "change_pct": change_pct,
                "reason": "increase",
                "explanation": explanation,
            }

        # --- Maintain ---
        explanation_parts: list[str] = ["Maintain current load."]
        if not reps_met:
            explanation_parts.append(
                f"Only {reps_completed}/{target_reps} reps completed."
            )
        if not form_good:
            explanation_parts.append(
                f"Form score ({avg_form_score:.0f}/100) is adequate but "
                f"not yet above 85 -- keep practising at this weight."
            )
        if not fatigue_low:
            explanation_parts.append(
                f"Fatigue is {fatigue_risk} (index {fatigue_index:.0f}) "
                f"-- allow more recovery before progressing."
            )

        return {
            "recommended_load_kg": current_load_kg,
            "change_pct": 0.0,
            "reason": "maintain",
            "explanation": " ".join(explanation_parts),
        }

    # ------------------------------------------------------------------ #
    # Goal-based programming                                             #
    # ------------------------------------------------------------------ #

    @staticmethod
    def get_program(
        exercise_type: str,
        goal: str,
        experience_level: str,
        training_max_kg: float | None,
    ) -> dict:
        """Return a goal-based training prescription.

        Programming templates:

        * **Strength:** 4-5 sets x 1-5 reps @ 85-95 % 1RM, 3-5 min rest
        * **Muscle gain:** 3-4 sets x 8-12 reps @ 65-80 % 1RM, 60-90 s
        * **Fat loss:** 3-4 sets x 12-20 reps @ 40-60 % 1RM, 30-60 s
        * **Athletic:** 4-5 sets x 3-6 reps @ 70-85 % 1RM, 2-3 min rest

        Returns:
            dict with ``sets``, ``reps``, ``load_kg``, ``load_pct_1rm``,
            ``rest_seconds``, ``notes``.
        """
        template = _GOAL_TEMPLATES.get(goal)
        if template is None:
            # Fall back to muscle_gain as a sensible default
            template = _GOAL_TEMPLATES["muscle_gain"]

        (
            sets_lo, sets_hi,
            reps_lo, reps_hi,
            pct_lo, pct_hi,
            rest_lo, rest_hi,
            notes,
        ) = template

        # Experience adjustments:
        # - Beginners use fewer sets, mid-range intensity, longer rest
        # - Advanced athletes use the full range
        if experience_level == "beginner":
            sets = sets_lo
            reps = reps_hi  # higher rep end for motor-learning
            load_pct = pct_lo  # conservative intensity
            rest = rest_hi  # longer rest
        elif experience_level == "advanced":
            sets = sets_hi
            reps = reps_lo  # heavier, fewer reps
            load_pct = pct_hi
            rest = rest_lo  # shorter rest (better conditioning)
        else:
            # Intermediate -- midpoint
            sets = math.ceil((sets_lo + sets_hi) / 2)
            reps = math.ceil((reps_lo + reps_hi) / 2)
            load_pct = round((pct_lo + pct_hi) / 2, 2)
            rest = (rest_lo + rest_hi) // 2

        load_kg: float | None = None
        if training_max_kg is not None and training_max_kg > 0:
            load_kg = round(training_max_kg * load_pct, 1)

        return {
            "sets": sets,
            "reps": reps,
            "load_kg": load_kg,
            "load_pct_1rm": round(load_pct * 100, 1),
            "rest_seconds": rest,
            "notes": notes,
        }
