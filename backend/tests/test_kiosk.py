from __future__ import annotations

"""Tests for the kiosk pairing flow.

Covers: kiosk registration, queue join, pending poll, profanity rejection,
and duplicate-in-queue rejection.
"""

from httpx import AsyncClient


async def _create_team(client: AsyncClient, name: str = "TestTeam") -> str:
    """Helper: create a team and return its code."""
    resp = await client.post(
        "/api/v1/league/teams",
        json={"name": name},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["code"]


async def _register_kiosk(client: AsyncClient, team_code: str) -> str:
    """Helper: register a kiosk for a team and return the kiosk_id."""
    resp = await client.post(f"/api/v1/league/kiosk/{team_code}/register")
    assert resp.status_code == 200, resp.text
    return resp.json()["kiosk_id"]


async def test_register_kiosk(client: AsyncClient) -> None:
    """POST /api/v1/league/kiosk/{team_code}/register returns a kiosk_id."""
    team_code = await _create_team(client)
    resp = await client.post(f"/api/v1/league/kiosk/{team_code}/register")
    assert resp.status_code == 200
    data = resp.json()
    assert "kiosk_id" in data
    assert data["team_code"] == team_code


async def test_join_kiosk_queue(client: AsyncClient) -> None:
    """POST /api/v1/league/kiosk/{kiosk_id}/join queues the player."""
    team_code = await _create_team(client)
    kiosk_id = await _register_kiosk(client, team_code)

    resp = await client.post(
        f"/api/v1/league/kiosk/{kiosk_id}/join",
        json={"nickname": "KioskUser"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "queued"
    assert data["queue_position"] == 1
    assert "access_token" in data


async def test_kiosk_pending(client: AsyncClient) -> None:
    """After joining the queue, GET pending should return has_pending=True (no token exposed)."""
    team_code = await _create_team(client)
    kiosk_id = await _register_kiosk(client, team_code)

    # Join the queue
    await client.post(
        f"/api/v1/league/kiosk/{kiosk_id}/join",
        json={"nickname": "PendingUser"},
    )

    # Poll pending — access_token should NOT be in response (security fix)
    resp = await client.get(f"/api/v1/league/kiosk/{kiosk_id}/pending")
    assert resp.status_code == 200
    data = resp.json()
    assert data["has_pending"] is True
    assert data["nickname"] == "PendingUser"
    assert "access_token" not in data
    assert data["queue_size"] == 1

    # Token is now returned only via session-started
    started_resp = await client.post(f"/api/v1/league/kiosk/{kiosk_id}/session-started")
    assert started_resp.status_code == 200
    started_data = started_resp.json()
    assert started_data["access_token"] is not None


async def test_kiosk_profanity(client: AsyncClient) -> None:
    """Joining the kiosk with an offensive nickname returns 400."""
    team_code = await _create_team(client)
    kiosk_id = await _register_kiosk(client, team_code)

    resp = await client.post(
        f"/api/v1/league/kiosk/{kiosk_id}/join",
        json={"nickname": "fuck"},
    )
    assert resp.status_code == 400
    assert "not allowed" in resp.json()["detail"].lower()


async def test_kiosk_duplicate_in_queue(client: AsyncClient) -> None:
    """Joining the same kiosk queue twice with the same nickname returns 409."""
    team_code = await _create_team(client)
    kiosk_id = await _register_kiosk(client, team_code)

    await client.post(
        f"/api/v1/league/kiosk/{kiosk_id}/join",
        json={"nickname": "DupeKiosk"},
    )

    resp = await client.post(
        f"/api/v1/league/kiosk/{kiosk_id}/join",
        json={"nickname": "DupeKiosk"},
    )
    assert resp.status_code == 409
    assert "already in the queue" in resp.json()["detail"].lower()
