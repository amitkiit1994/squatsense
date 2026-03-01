"""
Signal processing utilities for rep detection.
Extracted from src/reps.py.
"""
from __future__ import annotations

import numpy as np


def median_filter(values: np.ndarray, window: int) -> np.ndarray:
    """
    Apply a sliding-window median filter to a 1-D signal.

    Parameters
    ----------
    values : np.ndarray
        Input 1-D array (may contain NaN values).
    window : int
        Filter window size (must be odd and >= 3, otherwise the input
        is returned unchanged).

    Returns
    -------
    np.ndarray
        Filtered array of the same shape as *values*.
    """
    if window < 3 or window % 2 == 0:
        return values
    half = window // 2
    out = values.copy()
    n = len(values)
    for i in range(n):
        lo = max(0, i - half)
        hi = min(n, i + half + 1)
        out[i] = np.nanmedian(values[lo:hi])
    return out
