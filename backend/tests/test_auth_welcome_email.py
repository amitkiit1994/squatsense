"""Tests for the registration welcome email trigger.

Covers: welcome email fired on successful registration, registration not
blocked by email failures, no email on duplicate registration, the skip
path when RESEND_API_KEY is unset, and the Resend payload contents.
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock

import pytest
from httpx import AsyncClient

from backend.config import settings
from backend.routers import auth as auth_module

_REGISTER_PAYLOAD = {
    "email": "newuser@example.com",
    "password": "Sup3rSecret!",
    "name": "New User",
}


@pytest.fixture(autouse=True)
def _open_registration(monkeypatch: pytest.MonkeyPatch) -> None:
    """Force open registration regardless of the local ALLOWED_EMAILS env."""
    monkeypatch.setattr(settings, "ALLOWED_EMAILS", "")


async def test_register_sends_welcome_email(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """POST /api/v1/auth/register fires the welcome email exactly once."""
    send_mock = AsyncMock()
    monkeypatch.setattr(auth_module, "_send_welcome_email", send_mock)

    resp = await client.post("/api/v1/auth/register", json=_REGISTER_PAYLOAD)
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["access_token"]
    assert body["refresh_token"]

    send_mock.assert_called_once_with("newuser@example.com", "New User")
    await asyncio.sleep(0)  # let the fire-and-forget task complete


async def test_register_succeeds_when_email_send_fails(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Registration must not block or fail on welcome email errors."""
    send_mock = AsyncMock(side_effect=RuntimeError("resend is down"))
    monkeypatch.setattr(auth_module, "_send_welcome_email", send_mock)

    resp = await client.post("/api/v1/auth/register", json=_REGISTER_PAYLOAD)
    assert resp.status_code == 201, resp.text
    assert resp.json()["access_token"]

    await asyncio.sleep(0)  # let the failing task run its done-callback


async def test_duplicate_register_sends_no_welcome_email(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A 409 duplicate registration must not trigger another welcome email."""
    send_mock = AsyncMock()
    monkeypatch.setattr(auth_module, "_send_welcome_email", send_mock)

    first = await client.post("/api/v1/auth/register", json=_REGISTER_PAYLOAD)
    assert first.status_code == 201, first.text

    second = await client.post("/api/v1/auth/register", json=_REGISTER_PAYLOAD)
    assert second.status_code == 409

    send_mock.assert_called_once()
    await asyncio.sleep(0)


async def test_send_welcome_email_skips_without_api_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """_send_welcome_email logs and returns when RESEND_API_KEY is unset."""
    monkeypatch.setattr(settings, "RESEND_API_KEY", None)

    class _ExplodingClient:
        def __init__(self, *args: object, **kwargs: object) -> None:
            raise AssertionError("HTTP client must not be used without an API key")

    monkeypatch.setattr(auth_module.httpx, "AsyncClient", _ExplodingClient)

    # Must not raise and must not touch the HTTP client
    await auth_module._send_welcome_email("newuser@example.com", "New User")


async def test_send_welcome_email_posts_resend_payload(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """_send_welcome_email posts honest beta copy to the Resend API."""
    monkeypatch.setattr(settings, "RESEND_API_KEY", "re_test_key")
    monkeypatch.setattr(settings, "FRONTEND_URL", "https://www.freeformfitness.ai")
    captured: dict[str, object] = {}

    class _FakeResponse:
        status_code = 200

        @staticmethod
        def json() -> dict[str, str]:
            return {"id": "email_123"}

    class _FakeClient:
        async def __aenter__(self) -> _FakeClient:
            return self

        async def __aexit__(self, *args: object) -> bool:
            return False

        async def post(self, url: str, **kwargs: object) -> _FakeResponse:
            captured["url"] = url
            captured["headers"] = kwargs.get("headers")
            captured["json"] = kwargs.get("json")
            return _FakeResponse()

    monkeypatch.setattr(auth_module.httpx, "AsyncClient", _FakeClient)

    await auth_module._send_welcome_email("newuser@example.com", "New User")

    assert captured["url"] == settings.RESEND_API_URL
    headers = captured["headers"]
    assert isinstance(headers, dict)
    assert headers["Authorization"] == "Bearer re_test_key"

    payload = captured["json"]
    assert isinstance(payload, dict)
    assert payload["to"] == ["newuser@example.com"]
    assert payload["subject"] == "You're in the FreeForm Fitness beta"
    html_body = payload["html"]
    assert isinstance(html_body, str)
    # Honest beta copy: free, 8 exercises, camera-only, dashboard link
    assert "free" in html_body
    assert "8 exercises" in html_body
    assert "camera" in html_body
    assert "https://www.freeformfitness.ai/dashboard" in html_body
    # Must NOT reuse the waitlist copy that promises future access
    assert "We'll email you as soon as we're ready" not in html_body
