from __future__ import annotations

"""Movement Points calculation engine for the SquatSense league.

Core formula:
    Quality Multiplier = 0.6 + (composite_score / 100) * 0.4
    Movement Points = sum(quality_multiplier for each counted rep)

Only reps with composite_score >= MIN_FORM_THRESHOLD count.
Combo = consecutive counted reps with composite_score >= COMBO_THRESHOLD.
"""

from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.league import DailyLog, LeaguePlayer

# ── Constants ────────────────────────────────────────────────────────────────

MIN_FORM_THRESHOLD = 30  # composite_score below this → rep doesn't count
COMBO_THRESHOLD = 70  # consecutive reps above this build combo
PERFECT_THRESHOLD = 90  # reps above this are "perfect"

MAX_SESSIONS_PER_DAY = 2
MAX_REPS_PER_DAY = 50

RANK_THRESHOLDS: list[tuple[str, float]] = [
    ("elite", 5000),
    ("gold", 2000),
    ("silver", 500),
    ("bronze", 0),
]


def composite_to_multiplier(composite_score: float) -> float:
    """Convert composite_score (0-100) to quality multiplier (0.6-1.0)."""
    clamped = max(0.0, min(100.0, composite_score))
    return 0.6 + (clamped / 100.0) * 0.4


def calculate_session_points(
    rep_scores: list[float],
) -> dict:
    """Calculate Movement Points from a list of per-rep composite scores.

    Returns dict with:
        points_earned, reps_counted, reps_total, avg_quality,
        max_combo, perfect_reps, rep_multipliers
    """
    reps_total = len(rep_scores)
    reps_counted = 0
    total_points = 0.0
    multiplier_sum = 0.0
    max_combo = 0
    current_combo = 0
    perfect_reps = 0
    rep_multipliers: list[float] = []

    for score in rep_scores:
        if score < MIN_FORM_THRESHOLD:
            current_combo = 0
            continue

        multiplier = composite_to_multiplier(score)
        rep_multipliers.append(multiplier)
        reps_counted += 1
        total_points += multiplier
        multiplier_sum += multiplier

        if score >= PERFECT_THRESHOLD:
            perfect_reps += 1

        if score >= COMBO_THRESHOLD:
            current_combo += 1
            max_combo = max(max_combo, current_combo)
        else:
            current_combo = 0

    avg_quality = (multiplier_sum / reps_counted) if reps_counted > 0 else 0.0

    return {
        "points_earned": round(total_points, 2),
        "reps_counted": reps_counted,
        "reps_total": reps_total,
        "avg_quality": round(avg_quality, 4),
        "max_combo": max_combo,
        "perfect_reps": perfect_reps,
        "rep_multipliers": rep_multipliers,
    }


async def get_or_create_daily_log(
    db: AsyncSession, player_id, today: date | None = None
) -> DailyLog:
    """Get or create the DailyLog for a player on a given date."""
    today = today or datetime.now(timezone.utc).date()
    result = await db.execute(
        select(DailyLog).where(
            DailyLog.player_id == player_id,
            DailyLog.date == today,
        )
    )
    log = result.scalar_one_or_none()
    if log is None:
        log = DailyLog(player_id=player_id, date=today)
        db.add(log)
        await db.flush()
    return log


async def check_daily_caps(
    db: AsyncSession, player_id, today: date | None = None
) -> dict:
    """Check if a player can start a new session today.

    Returns:
        can_play: bool
        sessions_remaining: int
        reps_remaining: int
        reason: str | None (if can_play is False)
    """
    log = await get_or_create_daily_log(db, player_id, today)

    if log.sessions_today >= MAX_SESSIONS_PER_DAY:
        return {
            "can_play": False,
            "sessions_remaining": 0,
            "reps_remaining": max(0, MAX_REPS_PER_DAY - log.reps_today),
            "reason": "Daily session limit reached (2/2)",
        }

    reps_remaining = max(0, MAX_REPS_PER_DAY - log.reps_today)
    if reps_remaining == 0:
        return {
            "can_play": False,
            "sessions_remaining": MAX_SESSIONS_PER_DAY - log.sessions_today,
            "reps_remaining": 0,
            "reason": "Daily rep limit reached (50/50)",
        }

    return {
        "can_play": True,
        "sessions_remaining": MAX_SESSIONS_PER_DAY - log.sessions_today,
        "reps_remaining": reps_remaining,
        "reason": None,
    }


def update_streak(player: LeaguePlayer, today: date | None = None) -> None:
    """Update the player's streak based on their last active date."""
    today = today or datetime.now(timezone.utc).date()
    yesterday = today - timedelta(days=1)

    if player.last_active_date == today:
        # Already active today, no change
        return

    if player.last_active_date == yesterday:
        player.current_streak += 1
    else:
        player.current_streak = 1

    player.longest_streak = max(player.longest_streak, player.current_streak)
    player.last_active_date = today


def compute_rank(total_points: float) -> str:
    """Determine rank based on total lifetime points."""
    for rank_name, threshold in RANK_THRESHOLDS:
        if total_points >= threshold:
            return rank_name
    return "bronze"


def get_streak_multiplier(current_streak: int) -> float:
    """Get the streak bonus multiplier based on consecutive active days.

    Day 1-2: 1.0x (no bonus)
    Day 3-6: 1.1x
    Day 7-13: 1.2x
    Day 14+: 1.3x
    """
    if current_streak >= 14:
        return 1.3
    if current_streak >= 7:
        return 1.2
    if current_streak >= 3:
        return 1.1
    return 1.0
