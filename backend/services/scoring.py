from __future__ import annotations

"""Composite form scorer for per-rep analysis.

Produces five sub-scores (depth, stability, symmetry, tempo, ROM) each in
the range 0-100, then combines them into a single weighted composite score
using the weights defined in the exercise configuration.
"""

import logging

from backend.core.exercises.base import ExerciseConfig, ExerciseType

logger = logging.getLogger("squatsense.scoring")


def _clamp(value: float, lo: float = 0.0, hi: float = 100.0) -> float:
    """Clamp *value* to the closed interval [lo, hi]."""
    return max(lo, min(hi, value))


def _linear_falloff(
    value: float,
    ideal_lo: float,
    ideal_hi: float,
    falloff: float,
) -> float:
    """Return 100 when *value* is within [ideal_lo, ideal_hi], falling
    linearly to 0 at distance *falloff* outside that range."""
    if ideal_lo <= value <= ideal_hi:
        return 100.0
    if value < ideal_lo:
        distance = ideal_lo - value
    else:
        distance = value - ideal_hi
    if falloff <= 0:
        return 0.0
    return _clamp(100.0 * (1.0 - distance / falloff))


class CompositeScorer:
    """Scores a single rep based on raw metrics and exercise config."""

    # ------------------------------------------------------------------ #
    # Public API                                                         #
    # ------------------------------------------------------------------ #

    def score_rep(
        self,
        metrics: dict,
        exercise_config: ExerciseConfig,
        session_avg_tempo_ms: float | None = None,
    ) -> dict:
        """Compute all sub-scores and the weighted composite for one rep.

        Args:
            metrics: dict with keys like ``primary_angle_deg``,
                ``secondary_angle_deg``, ``trunk_angle_deg``,
                ``ankle_angle_deg``, ``com_offset_norm``, ``speed_proxy``,
                ``duration_ms``, ``left_primary_angle``,
                ``right_primary_angle``, ``balance_ok_pct``,
                ``com_variance``.
            exercise_config: :class:`ExerciseConfig` dataclass for the
                exercise being scored.
            session_avg_tempo_ms: Running average rep duration (ms) used
                for tempo scoring.  ``None`` for the first rep.

        Returns:
            dict with keys ``composite_score``, ``depth_score``,
            ``stability_score``, ``symmetry_score``, ``tempo_score``,
            ``rom_score``.
        """
        depth = self._depth_score(metrics, exercise_config)
        stability = self._stability_score(metrics)
        symmetry = self._symmetry_score(metrics, exercise_config)
        tempo = self._tempo_score(metrics, session_avg_tempo_ms)
        rom = self._rom_score(metrics, exercise_config)

        weights = exercise_config.scoring_weights
        composite = (
            weights.get("depth", 0.25) * depth
            + weights.get("stability", 0.20) * stability
            + weights.get("symmetry", 0.20) * symmetry
            + weights.get("tempo", 0.20) * tempo
            + weights.get("rom", 0.15) * rom
        )

        result = {
            "composite_score": round(_clamp(composite), 1),
            "depth_score": round(depth, 1),
            "stability_score": round(stability, 1),
            "symmetry_score": round(symmetry, 1),
            "tempo_score": round(tempo, 1),
            "rom_score": round(rom, 1),
        }
        logger.info(
            "score_rep: input={primary_angle=%.1f, trunk=%.1f, com_offset=%.4f, "
            "speed=%.4f, dur_ms=%s, bal_pct=%.2f, com_var=%.4f, "
            "L_angle=%s, R_angle=%s, depth_ok=%s} "
            "→ depth=%.1f, stability=%.1f, symmetry=%.1f, tempo=%.1f, "
            "rom=%.1f → composite=%.1f  (weights=%s, ideal_range=%s)",
            metrics.get("primary_angle_deg") or 0,
            metrics.get("trunk_angle_deg") or 0,
            metrics.get("com_offset_norm") or 0,
            metrics.get("speed_proxy") or 0,
            metrics.get("duration_ms"),
            metrics.get("balance_ok_pct") or 0,
            metrics.get("com_variance") or 0,
            metrics.get("left_primary_angle"),
            metrics.get("right_primary_angle"),
            metrics.get("depth_ok"),
            depth, stability, symmetry, tempo, rom,
            result["composite_score"],
            weights,
            exercise_config.ideal_depth_range,
        )
        return result

    # ------------------------------------------------------------------ #
    # Sub-score helpers                                                   #
    # ------------------------------------------------------------------ #

    @staticmethod
    def _depth_score(metrics: dict, config: ExerciseConfig) -> float:
        """Score depth based on primary angle vs. ideal range.

        For overhead press the "depth" concept maps to lockout
        completeness -- how far above the shoulder the bar travels.
        The scoring maths remain the same (linear falloff around the
        ideal range) but the semantic meaning differs.

        Returns 0-100.
        """
        angle = metrics.get("primary_angle_deg")
        if angle is None:
            return 50.0  # neutral when data unavailable

        ideal_lo, ideal_hi = config.ideal_depth_range
        # 40-degree falloff band on each side
        score = _linear_falloff(angle, ideal_lo, ideal_hi, falloff=40.0)

        # When the geometric depth check fails (hip not below knee),
        # apply a graduated penalty.  The geometric check is unreliable
        # from non-side camera angles, so we soften the penalty when the
        # knee-flexion angle strongly indicates good depth.
        #
        #   angle < ideal_lo           → cap at 40  (angle agrees: shallow)
        #   angle within ideal range   → cap at 70  (angle disagrees: likely camera issue)
        #   angle > ideal_hi           → cap at 70  (clearly deep, camera issue)
        if metrics.get("depth_ok") is False:
            if angle < ideal_lo:
                score = min(score, 40.0)
            else:
                score = min(score, 70.0)

        return score

    @staticmethod
    def _stability_score(metrics: dict) -> float:
        """Score stability from centre-of-mass variance and balance %.

        * ``com_variance`` -- lower is better.  Perfect at < 0.01.
        * ``balance_ok_pct`` -- fraction of frames in balance.  1.0 is
          perfect.

        Returns 0-100.
        """
        com_var = metrics.get("com_variance", 0.0)
        balance_pct = metrics.get("balance_ok_pct", 1.0)

        # --- CoM variance component (50 % of stability score) ---
        # Perfect (100 pts) at com_var <= 0.01
        # Falls linearly to 0 pts at com_var >= 0.10
        if com_var is None:
            com_var = 0.0
        variance_threshold_lo = 0.01
        variance_threshold_hi = 0.10
        if com_var <= variance_threshold_lo:
            var_component = 100.0
        elif com_var >= variance_threshold_hi:
            var_component = 0.0
        else:
            var_component = 100.0 * (
                1.0
                - (com_var - variance_threshold_lo)
                / (variance_threshold_hi - variance_threshold_lo)
            )

        # --- Balance component (50 % of stability score) ---
        if balance_pct is None:
            balance_pct = 1.0
        bal_component = _clamp(balance_pct * 100.0)

        return _clamp(0.5 * var_component + 0.5 * bal_component)

    @staticmethod
    def _symmetry_score(metrics: dict, config: ExerciseConfig) -> float:
        """Score left-right symmetry.

        For unilateral exercises (pistol squat, Bulgarian split squat,
        etc.) symmetry is not applicable and returns 100.

        Otherwise, based on
        ``|left_primary_angle - right_primary_angle| / avg``.
        """
        # Unilateral exercises skip symmetry scoring
        if config.primary_side in ("unilateral", "unilateral_left", "unilateral_right"):
            return 100.0

        left = metrics.get("left_primary_angle")
        right = metrics.get("right_primary_angle")
        if left is None or right is None:
            return 100.0  # data unavailable -- assume symmetric

        avg = (left + right) / 2.0
        if avg == 0:
            return 100.0

        asymmetry_pct = abs(left - right) / avg * 100.0

        # Ignore < 8 % asymmetry as pose-estimation noise (camera angle,
        # landmark jitter).  Score linearly from 100 at 8 % to 0 at 35 %.
        noise_floor = 8.0
        zero_threshold = 35.0
        if asymmetry_pct <= noise_floor:
            return 100.0
        if asymmetry_pct >= zero_threshold:
            return 0.0
        return _clamp(
            100.0 * (1.0 - (asymmetry_pct - noise_floor) / (zero_threshold - noise_floor))
        )

    @staticmethod
    def _tempo_score(
        metrics: dict, session_avg_tempo_ms: float | None
    ) -> float:
        """Score tempo consistency vs. session running average.

        * Within 10 % of the average  -> 100
        * Linear falloff to 0 at 50 % deviation
        * First rep (no average yet) -> 80 (neutral)
        """
        duration = metrics.get("duration_ms")
        if duration is None:
            return 80.0

        if session_avg_tempo_ms is None or session_avg_tempo_ms <= 0:
            return 80.0

        deviation_pct = abs(duration - session_avg_tempo_ms) / session_avg_tempo_ms

        if deviation_pct <= 0.10:
            return 100.0
        if deviation_pct >= 0.50:
            return 0.0
        # Linear between 10 % and 50 %
        return _clamp(100.0 * (1.0 - (deviation_pct - 0.10) / 0.40))

    @staticmethod
    def _rom_score(metrics: dict, config: ExerciseConfig) -> float:
        """Score range of motion (ROM).

        Based on the total angle traversed during the rep:
        ``standing_angle - bottom_angle``.  100 if full ROM achieved
        (>= 90 % of ideal range span); linear falloff below.
        """
        primary_angle = metrics.get("primary_angle_deg")
        if primary_angle is None:
            return 50.0  # neutral when data unavailable

        ideal_lo, ideal_hi = config.ideal_depth_range
        ideal_rom = abs(config.standing_threshold - ideal_lo)

        if ideal_rom <= 0:
            return 100.0

        # Estimate actual ROM from standing down to the measured bottom
        actual_rom = abs(config.standing_threshold - primary_angle)

        rom_ratio = actual_rom / ideal_rom

        if rom_ratio >= 0.90:
            return 100.0
        if rom_ratio <= 0.0:
            return 0.0
        # Linear from 0 at 0 % to 100 at 90 %
        return _clamp(100.0 * rom_ratio / 0.90)
