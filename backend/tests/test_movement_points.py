from __future__ import annotations

"""Tests for the Movement Points calculation engine.

Covers: calculate_session_points, check_daily_caps, update_streak,
compute_rank, get_streak_multiplier.
"""

from datetime import date, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.league import LeaguePlayer
from backend.services.movement_points import (
    MAX_REPS_PER_DAY,
    MAX_SESSIONS_PER_DAY,
    MIN_FORM_THRESHOLD,
    calculate_session_points,
    check_daily_caps,
    compute_rank,
    get_or_create_daily_log,
    get_streak_multiplier,
    update_streak,
)


# ── calculate_session_points ────────────────────────────────────────────────


def test_basic_scoring() -> None:
    """Rep scores above threshold earn points; below threshold are skipped."""
    result = calculate_session_points([85.0, 72.0, 20.0, 90.0])
    assert result["reps_total"] == 4
    assert result["reps_counted"] == 3  # 20.0 is below MIN_FORM_THRESHOLD
    assert result["points_earned"] > 0


def test_empty_rep_scores() -> None:
    """Empty list returns zero everything."""
    result = calculate_session_points([])
    assert result["reps_counted"] == 0
    assert result["reps_total"] == 0
    assert result["points_earned"] == 0.0
    assert result["avg_quality"] == 0.0
    assert result["max_combo"] == 0
    assert result["perfect_reps"] == 0


def test_all_below_threshold() -> None:
    """All scores below MIN_FORM_THRESHOLD results in zero counted reps."""
    result = calculate_session_points([10.0, 15.0, 29.0])
    assert result["reps_counted"] == 0
    assert result["points_earned"] == 0.0
    assert result["avg_quality"] == 0.0


def test_perfect_reps_counted() -> None:
    """Scores >= 90 are counted as perfect reps."""
    result = calculate_session_points([95.0, 90.0, 50.0, 91.0])
    assert result["perfect_reps"] == 3  # 95, 90, 91


def test_combo_tracking() -> None:
    """Consecutive scores >= 70 build combo; below 70 resets it."""
    result = calculate_session_points([75.0, 80.0, 90.0, 50.0, 85.0])
    assert result["max_combo"] == 3  # 75, 80, 90 consecutive


def test_combo_broken_by_low_score() -> None:
    """Combo resets when a score is below COMBO_THRESHOLD but above MIN_FORM_THRESHOLD."""
    result = calculate_session_points([75.0, 80.0, 35.0, 85.0, 90.0])
    assert result["max_combo"] == 2  # first 75+80, then 85+90


def test_multiplier_range() -> None:
    """Rep multipliers should be between 0.6 and 1.0."""
    result = calculate_session_points([30.0, 50.0, 100.0])
    for m in result["rep_multipliers"]:
        assert 0.6 <= m <= 1.0


def test_points_deterministic() -> None:
    """Same inputs always produce same outputs."""
    scores = [85.0, 72.0, 90.0, 65.0, 45.0]
    r1 = calculate_session_points(scores)
    r2 = calculate_session_points(scores)
    assert r1 == r2


# ── compute_rank ────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "points, expected_rank",
    [
        (0, "bronze"),
        (499, "bronze"),
        (500, "silver"),
        (1999, "silver"),
        (2000, "gold"),
        (4999, "gold"),
        (5000, "elite"),
        (99999, "elite"),
    ],
)
def test_compute_rank(points: float, expected_rank: str) -> None:
    assert compute_rank(points) == expected_rank


# ── get_streak_multiplier ──────────────────────────────────────────────────


@pytest.mark.parametrize(
    "streak, expected",
    [
        (0, 1.0),
        (1, 1.0),
        (2, 1.0),
        (3, 1.1),
        (6, 1.1),
        (7, 1.2),
        (13, 1.2),
        (14, 1.3),
        (100, 1.3),
    ],
)
def test_streak_multiplier(streak: int, expected: float) -> None:
    assert get_streak_multiplier(streak) == expected


# ── update_streak ───────────────────────────────────────────────────────────


def test_streak_first_session() -> None:
    """First session ever sets streak to 1."""
    player = LeaguePlayer(nickname="test")
    player.current_streak = 0
    player.longest_streak = 0
    player.last_active_date = None

    today = date(2026, 3, 26)
    update_streak(player, today)

    assert player.current_streak == 1
    assert player.longest_streak == 1
    assert player.last_active_date == today


def test_streak_consecutive_day() -> None:
    """Playing on consecutive days increments streak."""
    player = LeaguePlayer(nickname="test")
    player.current_streak = 3
    player.longest_streak = 5
    player.last_active_date = date(2026, 3, 25)

    update_streak(player, date(2026, 3, 26))

    assert player.current_streak == 4
    assert player.longest_streak == 5  # not beaten


def test_streak_gap_resets() -> None:
    """Missing a day resets streak to 1."""
    player = LeaguePlayer(nickname="test")
    player.current_streak = 5
    player.longest_streak = 5
    player.last_active_date = date(2026, 3, 24)

    update_streak(player, date(2026, 3, 26))  # skipped 3/25

    assert player.current_streak == 1


def test_streak_same_day_no_change() -> None:
    """Multiple sessions on same day don't change streak."""
    player = LeaguePlayer(nickname="test")
    player.current_streak = 3
    player.longest_streak = 3
    player.last_active_date = date(2026, 3, 26)

    update_streak(player, date(2026, 3, 26))

    assert player.current_streak == 3  # unchanged


def test_streak_beats_longest() -> None:
    """Streak updates longest_streak when exceeded."""
    player = LeaguePlayer(nickname="test")
    player.current_streak = 5
    player.longest_streak = 5
    player.last_active_date = date(2026, 3, 25)

    update_streak(player, date(2026, 3, 26))

    assert player.current_streak == 6
    assert player.longest_streak == 6


# ── check_daily_caps ────────────────────────────────────────────────────────


async def test_daily_caps_fresh_player(db: AsyncSession, create_player) -> None:
    """Fresh player can play with full sessions and reps remaining."""
    player, _ = await create_player("CapsFresh")
    caps = await check_daily_caps(db, player.id)

    assert caps["can_play"] is True
    assert caps["sessions_remaining"] == MAX_SESSIONS_PER_DAY
    assert caps["reps_remaining"] == MAX_REPS_PER_DAY


async def test_daily_caps_session_limit(db: AsyncSession, create_player) -> None:
    """Player is blocked after MAX_SESSIONS_PER_DAY sessions."""
    player, _ = await create_player("CapsSession")
    log = await get_or_create_daily_log(db, player.id)
    log.sessions_today = MAX_SESSIONS_PER_DAY
    await db.flush()

    caps = await check_daily_caps(db, player.id)
    assert caps["can_play"] is False
    assert caps["sessions_remaining"] == 0
    assert "session limit" in caps["reason"].lower()


async def test_daily_caps_rep_limit(db: AsyncSession, create_player) -> None:
    """Player is blocked after MAX_REPS_PER_DAY reps."""
    player, _ = await create_player("CapsReps")
    log = await get_or_create_daily_log(db, player.id)
    log.reps_today = MAX_REPS_PER_DAY
    await db.flush()

    caps = await check_daily_caps(db, player.id)
    assert caps["can_play"] is False
    assert caps["reps_remaining"] == 0
    assert "rep limit" in caps["reason"].lower()
