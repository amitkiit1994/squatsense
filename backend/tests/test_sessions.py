from __future__ import annotations

"""Tests for the league session lifecycle.

Covers: starting a session, completing a session with rep scores, and
verifying the streak multiplier is returned in the response.
"""

from httpx import AsyncClient


async def test_start_session(client: AsyncClient) -> None:
    """POST /api/v1/league/sessions/start returns a session_id for a valid player."""
    # First create a player via join
    join_resp = await client.post(
        "/api/v1/league/join",
        json={"nickname": "SessionStarter"},
    )
    assert join_resp.status_code == 200
    token = join_resp.json()["access_token"]

    # Start a session
    resp = await client.post(
        "/api/v1/league/sessions/start",
        json={"mode": "personal"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "session_id" in data
    assert data["sessions_remaining_today"] >= 0
    assert data["reps_remaining_today"] >= 0


async def test_complete_session(client: AsyncClient) -> None:
    """Start then complete a session with rep_scores; points should be > 0."""
    # Create player
    join_resp = await client.post(
        "/api/v1/league/join",
        json={"nickname": "Completer"},
    )
    token = join_resp.json()["access_token"]

    # Start session
    start_resp = await client.post(
        "/api/v1/league/sessions/start",
        json={"mode": "personal"},
        headers={"Authorization": f"Bearer {token}"},
    )
    session_id = start_resp.json()["session_id"]

    # Complete with some rep scores (scores above 30 = MIN_FORM_THRESHOLD)
    rep_scores = [85.0, 72.0, 90.0, 65.0, 45.0]
    resp = await client.post(
        f"/api/v1/league/sessions/{session_id}/complete",
        json={"rep_scores": rep_scores, "duration_sec": 30},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["points_earned"] > 0
    assert data["reps_counted"] == 5  # all scores are >= 30
    assert data["reps_total"] == 5
    assert data["avg_quality"] > 0
    assert data["rank"] in ("bronze", "silver", "gold", "elite")
    assert data["capped"] is False


async def test_streak_multiplier(client: AsyncClient) -> None:
    """Complete a session and verify streak_multiplier is present in the response."""
    # Create player
    join_resp = await client.post(
        "/api/v1/league/join",
        json={"nickname": "StreakTest"},
    )
    token = join_resp.json()["access_token"]

    # Start session
    start_resp = await client.post(
        "/api/v1/league/sessions/start",
        json={"mode": "personal"},
        headers={"Authorization": f"Bearer {token}"},
    )
    session_id = start_resp.json()["session_id"]

    # Complete
    resp = await client.post(
        f"/api/v1/league/sessions/{session_id}/complete",
        json={"rep_scores": [80.0, 75.0, 92.0], "duration_sec": 30},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()

    # On the first session ever, streak should be 1 and multiplier 1.0
    assert "streak_multiplier" in data
    assert data["streak_multiplier"] == 1.0
    assert data["current_streak"] == 1


async def test_duplicate_session_completion(client: AsyncClient) -> None:
    """Completing the same session_id twice returns 409 Conflict."""
    join_resp = await client.post(
        "/api/v1/league/join",
        json={"nickname": "DupeTest"},
    )
    token = join_resp.json()["access_token"]

    start_resp = await client.post(
        "/api/v1/league/sessions/start",
        json={"mode": "personal"},
        headers={"Authorization": f"Bearer {token}"},
    )
    session_id = start_resp.json()["session_id"]

    # First completion succeeds
    resp1 = await client.post(
        f"/api/v1/league/sessions/{session_id}/complete",
        json={"rep_scores": [80.0, 75.0], "duration_sec": 30},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp1.status_code == 200

    # Second completion with same session_id is rejected
    resp2 = await client.post(
        f"/api/v1/league/sessions/{session_id}/complete",
        json={"rep_scores": [80.0, 75.0], "duration_sec": 30},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp2.status_code == 409


async def test_empty_rep_scores_rejected(client: AsyncClient) -> None:
    """Completing a session with empty rep_scores returns 400."""
    join_resp = await client.post(
        "/api/v1/league/join",
        json={"nickname": "EmptyReps"},
    )
    token = join_resp.json()["access_token"]

    start_resp = await client.post(
        "/api/v1/league/sessions/start",
        json={"mode": "personal"},
        headers={"Authorization": f"Bearer {token}"},
    )
    session_id = start_resp.json()["session_id"]

    resp = await client.post(
        f"/api/v1/league/sessions/{session_id}/complete",
        json={"rep_scores": [], "duration_sec": 30},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 400
