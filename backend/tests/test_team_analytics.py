"""Tests for the team kiosk analytics endpoint.

Covers: 404 for unknown teams, honest empty aggregates for fresh teams,
session aggregation (totals, unique players, avg score, top players),
and exclusion of internal test accounts.
"""

from __future__ import annotations

import uuid

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.league import LeaguePlayer, LeagueSession, LeagueTeam


async def _create_team(client: AsyncClient, name: str = "Analytics") -> str:
    """Helper: create a team via the API and return its code."""
    join_resp = await client.post(
        "/api/v1/league/join",
        json={"nickname": f"Creator_{name}"[:20]},
    )
    assert join_resp.status_code == 200, join_resp.text
    token = join_resp.json()["access_token"]

    resp = await client.post(
        "/api/v1/league/teams",
        json={"name": name},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["code"]


async def _team_id(db: AsyncSession, code: str) -> uuid.UUID:
    """Helper: look up a team's UUID by its code."""
    result = await db.execute(select(LeagueTeam).where(LeagueTeam.code == code))
    return result.scalar_one().id


async def _add_session(
    db: AsyncSession,
    player: LeaguePlayer,
    team_id: uuid.UUID,
    points: float,
    reps: int = 10,
) -> None:
    """Helper: record a completed team session for a player."""
    db.add(
        LeagueSession(
            player_id=player.id,
            team_id=team_id,
            reps_counted=reps,
            reps_total=reps,
            avg_quality=0.8,
            points_earned=points,
        )
    )
    await db.commit()


async def test_analytics_unknown_team_returns_404(client: AsyncClient) -> None:
    """GET /api/v1/league/teams/{code}/analytics with a bogus code is 404."""
    resp = await client.get("/api/v1/league/teams/ZZZZZZ/analytics")
    assert resp.status_code == 404
    assert resp.json()["detail"] == "Team not found"


async def test_analytics_empty_team(client: AsyncClient) -> None:
    """A fresh team reports honest zeros and a zero-filled 30-day window."""
    code = await _create_team(client, "EmptyOffice")

    resp = await client.get(f"/api/v1/league/teams/{code}/analytics")
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert data["team_code"] == code
    assert data["team_name"] == "EmptyOffice"
    assert data["total_sessions"] == 0
    assert data["unique_players"] == 0
    assert data["avg_score"] == 0
    assert data["top_players"] == []
    assert len(data["sessions_per_day"]) == 30
    assert all(d["sessions"] == 0 for d in data["sessions_per_day"])


async def test_analytics_aggregates_sessions(
    client: AsyncClient, db: AsyncSession, create_player
) -> None:
    """Totals, unique players, avg score, and top players are aggregated."""
    code = await _create_team(client, "BusyOffice")
    team_id = await _team_id(db, code)

    alice, _ = await create_player("Alice", team_id=team_id)
    bob, _ = await create_player("Bob", team_id=team_id)

    await _add_session(db, alice, team_id, 10.0)
    await _add_session(db, alice, team_id, 30.0)
    await _add_session(db, bob, team_id, 20.0)

    resp = await client.get(f"/api/v1/league/teams/{code}/analytics")
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert data["total_sessions"] == 3
    assert data["unique_players"] == 2
    assert data["avg_score"] == 20.0

    # Top players ordered by best single-session score
    top = data["top_players"]
    assert [p["nickname"] for p in top] == ["Alice", "Bob"]
    assert top[0]["best_score"] == 30.0
    assert top[1]["best_score"] == 20.0

    # All three sessions were created just now — today's bucket has them
    assert data["sessions_per_day"][-1]["sessions"] == 3
    assert sum(d["sessions"] for d in data["sessions_per_day"]) == 3


async def test_analytics_excludes_test_accounts(
    client: AsyncClient, db: AsyncSession, create_player
) -> None:
    """Sessions from is_test players never appear in any aggregate."""
    code = await _create_team(client, "TestyOffice")
    team_id = await _team_id(db, code)

    real, _ = await create_player("RealPlayer", team_id=team_id)
    tester, _ = await create_player("FounderTest", team_id=team_id)
    tester.is_test = True
    await db.commit()

    await _add_session(db, real, team_id, 8.0)
    await _add_session(db, tester, team_id, 99.0)

    resp = await client.get(f"/api/v1/league/teams/{code}/analytics")
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert data["total_sessions"] == 1
    assert data["unique_players"] == 1
    assert data["avg_score"] == 8.0
    assert [p["nickname"] for p in data["top_players"]] == ["RealPlayer"]
    assert sum(d["sessions"] for d in data["sessions_per_day"]) == 1


async def test_analytics_scoped_to_team(
    client: AsyncClient, db: AsyncSession, create_player
) -> None:
    """Sessions from another team do not leak into a team's analytics."""
    code_a = await _create_team(client, "OfficeA")
    code_b = await _create_team(client, "OfficeB")
    team_a = await _team_id(db, code_a)
    team_b = await _team_id(db, code_b)

    player_a, _ = await create_player("PlayerA", team_id=team_a)
    player_b, _ = await create_player("PlayerB", team_id=team_b)

    await _add_session(db, player_a, team_a, 15.0)
    await _add_session(db, player_b, team_b, 25.0)

    resp = await client.get(f"/api/v1/league/teams/{code_a}/analytics")
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert data["total_sessions"] == 1
    assert data["unique_players"] == 1
    assert [p["nickname"] for p in data["top_players"]] == ["PlayerA"]
