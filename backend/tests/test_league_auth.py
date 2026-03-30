from __future__ import annotations

"""Tests for the league authentication endpoints.

Covers: anonymous join, profanity filtering, registration, login, and
duplicate-nickname rejection.
"""

from httpx import AsyncClient


async def test_join_anonymous(client: AsyncClient) -> None:
    """POST /api/v1/league/join with a valid nickname returns 200 + token."""
    resp = await client.post(
        "/api/v1/league/join",
        json={"nickname": "GoodPlayer"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["nickname"] == "GoodPlayer"
    assert data["player_id"] is not None


async def test_join_profanity_rejected(client: AsyncClient) -> None:
    """POST /api/v1/league/join with an offensive nickname returns 400."""
    resp = await client.post(
        "/api/v1/league/join",
        json={"nickname": "fuck"},
    )
    assert resp.status_code == 400
    assert "not allowed" in resp.json()["detail"].lower()


async def test_register(client: AsyncClient) -> None:
    """POST /api/v1/league/register with nickname/email/password returns 200 + token."""
    resp = await client.post(
        "/api/v1/league/register",
        json={
            "nickname": "RegPlayer",
            "email": "reg@example.com",
            "password": "SecurePass123",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["nickname"] == "RegPlayer"
    assert data["player_id"] is not None


async def test_login(client: AsyncClient) -> None:
    """Register a player, then login with the same credentials."""
    # First register
    await client.post(
        "/api/v1/league/register",
        json={
            "nickname": "LoginTest",
            "email": "login@example.com",
            "password": "SecurePass123",
        },
    )

    # Then login
    resp = await client.post(
        "/api/v1/league/login",
        json={
            "email": "login@example.com",
            "password": "SecurePass123",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["nickname"] == "LoginTest"


async def test_login_wrong_password(client: AsyncClient) -> None:
    """Register, then attempt login with a wrong password -> 401."""
    await client.post(
        "/api/v1/league/register",
        json={
            "nickname": "WrongPwd",
            "email": "wrongpwd@example.com",
            "password": "CorrectPass1",
        },
    )

    resp = await client.post(
        "/api/v1/league/login",
        json={
            "email": "wrongpwd@example.com",
            "password": "WrongPass99",
        },
    )
    assert resp.status_code == 401
    assert "invalid" in resp.json()["detail"].lower()


async def test_duplicate_nickname(client: AsyncClient) -> None:
    """Joining twice with the same nickname (no team) returns 409."""
    await client.post(
        "/api/v1/league/join",
        json={"nickname": "DupeName"},
    )

    resp = await client.post(
        "/api/v1/league/join",
        json={"nickname": "DupeName"},
    )
    assert resp.status_code == 409
    assert "already taken" in resp.json()["detail"].lower()
