"""Tests for the public global leaderboard and stats.

Covers: zero-point rows are excluded (no 0.0 podium), test accounts are
hidden, and global stats skip test accounts.
"""

from __future__ import annotations

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.league import LeaguePlayer, LeagueSession


async def _add_session(db: AsyncSession, player: LeaguePlayer, points: float, reps: int = 10) -> None:
    """Helper: record a completed session for a player."""
    db.add(
        LeagueSession(
            player_id=player.id,
            reps_counted=reps,
            reps_total=reps,
            avg_quality=0.8,
            points_earned=points,
        )
    )
    await db.commit()


async def test_global_leaderboard_excludes_zero_point_players(
    client: AsyncClient, db: AsyncSession, create_player
) -> None:
    """Players with no points in the period do not appear on the public board."""
    scorer, _ = await create_player("Scorer")
    await create_player("Lurker")  # never plays
    await _add_session(db, scorer, 12.5)

    for period in ("today", "week", "alltime"):
        resp = await client.get(f"/api/v1/league/leaderboard?period={period}")
        assert resp.status_code == 200, resp.text
        nicknames = [e["nickname"] for e in resp.json()]
        assert "Scorer" in nicknames
        assert "Lurker" not in nicknames


async def test_global_leaderboard_empty_when_no_sessions(
    client: AsyncClient, create_player
) -> None:
    """With only zero-point players, the board is empty (frontend empty state)."""
    await create_player("NewPlayer")

    resp = await client.get("/api/v1/league/leaderboard?period=week")
    assert resp.status_code == 200
    assert resp.json() == []


async def test_global_leaderboard_hides_test_accounts(
    client: AsyncClient, db: AsyncSession, create_player
) -> None:
    """Accounts flagged is_test never appear, even with points."""
    real, _ = await create_player("RealPlayer")
    tester, _ = await create_player("FounderTest")
    tester.is_test = True
    await db.commit()

    await _add_session(db, real, 8.0)
    await _add_session(db, tester, 99.0)

    resp = await client.get("/api/v1/league/leaderboard?period=alltime")
    assert resp.status_code == 200
    nicknames = [e["nickname"] for e in resp.json()]
    assert nicknames == ["RealPlayer"]


async def test_global_stats_exclude_test_accounts(
    client: AsyncClient, db: AsyncSession, create_player
) -> None:
    """Global stats count only non-test players and their squats."""
    real, _ = await create_player("RealPlayer")
    tester, _ = await create_player("FounderTest")
    tester.is_test = True
    await db.commit()

    await _add_session(db, real, 8.0, reps=12)
    await _add_session(db, tester, 99.0, reps=30)

    resp = await client.get("/api/v1/league/stats")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_players"] == 1
    assert data["total_squats_today"] == 12
