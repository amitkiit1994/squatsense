from __future__ import annotations

"""Fatigue modelling engine.

Quantifies fatigue within a single set (rep-over-rep trends) and across
sets within a session.  The engine fits a linear regression to four key
metric time-series and combines the resulting slopes into a single
*fatigue index* (0-100) with a risk classification.
"""

import numpy as np


# Weights for the four decay dimensions when computing fatigue_index.
_WEIGHTS = {
    "velocity_decay": 0.35,
    "depth_degradation": 0.25,
    "stability_drift": 0.20,
    "symmetry_increase": 0.20,
}

# Risk thresholds applied to the clamped fatigue_index.
_RISK_LOW = 30.0
_RISK_HIGH = 60.0

# Minimum number of data points required for meaningful regression.
_MIN_DATA_POINTS = 3


def _clamp(value: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, value))


def _pct_change_from_slope(
    values: list[float],
) -> float:
    """Fit a degree-1 polynomial to *values* and return the percentage
    change from the first fitted value to the last.

    A positive return value means the metric *increased* over the
    series; negative means it *decreased*.
    """
    n = len(values)
    if n < 2:
        return 0.0

    x = np.arange(n, dtype=np.float64)
    y = np.array(values, dtype=np.float64)

    # np.polyfit returns [slope, intercept]
    coeffs = np.polyfit(x, y, deg=1)
    slope = coeffs[0]

    fitted_start = coeffs[1]  # intercept (value at x=0)
    if abs(fitted_start) < 1e-9:
        # Avoid division by zero; use absolute slope instead
        return slope * n * 100.0
    return (slope * (n - 1)) / abs(fitted_start) * 100.0


def _empty_result() -> dict:
    """Return the default "no fatigue data" result."""
    return {
        "fatigue_index": 0.0,
        "fatigue_risk": "low",
        "velocity_decay_pct": 0.0,
        "depth_degradation_pct": 0.0,
        "stability_drift_pct": 0.0,
        "symmetry_increase_pct": 0.0,
    }


class FatigueEngine:
    """Computes fatigue index and risk classification."""

    # ------------------------------------------------------------------ #
    # Public API                                                         #
    # ------------------------------------------------------------------ #

    def compute_set_fatigue(self, reps: list[dict]) -> dict:
        """Analyse fatigue within a single set.

        Each element of *reps* is expected to carry (at minimum):

        * ``speed_proxy`` -- rep velocity proxy (higher = faster)
        * ``depth_score`` -- scored depth for the rep (0-100)
        * ``stability_score`` -- scored stability (0-100)
        * ``symmetry_score`` -- scored symmetry (0-100)

        Missing keys are treated as neutral (no contribution to fatigue).

        Returns:
            dict with ``fatigue_index``, ``fatigue_risk``, and
            per-dimension percentage-change values.
        """
        if len(reps) < _MIN_DATA_POINTS:
            return _empty_result()

        return self._analyse(reps)

    def compute_session_fatigue(self, sets: list[dict]) -> dict:
        """Analyse fatigue across sets in a session.

        Each element of *sets* should carry set-level averages with the
        same keys used for rep-level analysis:

        * ``speed_proxy`` -- average rep velocity in the set
        * ``depth_score`` -- average depth score in the set
        * ``stability_score`` -- average stability score
        * ``symmetry_score`` -- average symmetry score

        Returns:
            dict (same schema as :meth:`compute_set_fatigue`).
        """
        if len(sets) < _MIN_DATA_POINTS:
            return _empty_result()

        return self._analyse(sets)

    # ------------------------------------------------------------------ #
    # Internal                                                           #
    # ------------------------------------------------------------------ #

    @staticmethod
    def _extract_series(data: list[dict], key: str) -> list[float]:
        """Pull a list of floats for *key* from *data*, skipping Nones."""
        values: list[float] = []
        for item in data:
            v = item.get(key)
            if v is not None:
                values.append(float(v))
        return values

    def _analyse(self, data: list[dict]) -> dict:
        """Core analysis shared by set- and session-level fatigue."""

        # --- Extract time-series for each dimension ---
        velocity_series = self._extract_series(data, "speed_proxy")
        depth_series = self._extract_series(data, "depth_score")
        stability_series = self._extract_series(data, "stability_score")
        symmetry_series = self._extract_series(data, "symmetry_score")

        # --- Compute percentage change via linear regression ---
        # Velocity decay: negative change (slowing down) = fatiguing
        # We negate so that a *decrease* in velocity becomes a positive
        # fatigue contribution.
        velocity_pct = _pct_change_from_slope(velocity_series)
        velocity_decay_pct = max(-velocity_pct, 0.0)

        # Depth degradation: negative change (getting shallower) = fatiguing
        depth_pct = _pct_change_from_slope(depth_series)
        depth_degradation_pct = max(-depth_pct, 0.0)

        # Stability drift: negative change (less stable) = fatiguing
        stability_pct = _pct_change_from_slope(stability_series)
        stability_drift_pct = max(-stability_pct, 0.0)

        # Symmetry increase: negative change (more asymmetric => lower
        # symmetry score) = fatiguing
        symmetry_pct = _pct_change_from_slope(symmetry_series)
        symmetry_increase_pct = max(-symmetry_pct, 0.0)

        # --- Weighted combination ---
        fatigue_index = (
            _WEIGHTS["velocity_decay"] * velocity_decay_pct
            + _WEIGHTS["depth_degradation"] * depth_degradation_pct
            + _WEIGHTS["stability_drift"] * stability_drift_pct
            + _WEIGHTS["symmetry_increase"] * symmetry_increase_pct
        )
        fatigue_index = _clamp(fatigue_index)

        # --- Risk classification ---
        if fatigue_index < _RISK_LOW:
            risk = "low"
        elif fatigue_index <= _RISK_HIGH:
            risk = "moderate"
        else:
            risk = "high"

        return {
            "fatigue_index": round(fatigue_index, 1),
            "fatigue_risk": risk,
            "velocity_decay_pct": round(velocity_decay_pct, 2),
            "depth_degradation_pct": round(depth_degradation_pct, 2),
            "stability_drift_pct": round(stability_drift_pct, 2),
            "symmetry_increase_pct": round(symmetry_increase_pct, 2),
        }
