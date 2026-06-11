from __future__ import annotations

"""Tests for the email verification OTP endpoints.

Covers: request -> verify happy path (including User.email_verified being
set), the wrong-code attempt cap, code expiry, no account enumeration on
request-otp, and invalidation of prior codes. The 3/minute rate limit on
request-otp is NOT asserted, per existing convention (limiter counters are
reset between tests and rate limits are not unit-tested in this suite).
"""

import asyncio
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings
from backend.models.email_otp import EmailOtp
from backend.models.user import User
from backend.routers import auth as auth_module

_EMAIL = "verifyme@example.com"

_REGISTER_PAYLOAD = {
    "email": _EMAIL,
    "password": "Sup3rSecret!",
    "name": "Verify Me",
}


@pytest.fixture(autouse=True)
def _open_registration(monkeypatch: pytest.MonkeyPatch) -> None:
    """Force open registration regardless of the local ALLOWED_EMAILS env."""
    monkeypatch.setattr(settings, "ALLOWED_EMAILS", "")


@pytest.fixture
def otp_email_mock(monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
    """Mock the OTP email sender and return the mock for code capture."""
    send_mock = AsyncMock()
    monkeypatch.setattr(auth_module, "_send_otp_email", send_mock)
    return send_mock


def _sent_code(send_mock: AsyncMock) -> str:
    """Extract the most recently emailed code from the mocked sender."""
    args = send_mock.call_args.args
    return args[1]


async def _request_otp(client: AsyncClient, email: str = _EMAIL) -> None:
    resp = await client.post("/api/v1/auth/request-otp", json={"email": email})
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"ok": True}


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------

async def test_request_then_verify_happy_path(
    client: AsyncClient,
    db: AsyncSession,
    otp_email_mock: AsyncMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """request-otp emails a 6-digit code; verify-otp consumes it and flags the user."""
    # Register a user first (welcome email mocked out)
    monkeypatch.setattr(auth_module, "_send_welcome_email", AsyncMock())
    reg = await client.post("/api/v1/auth/register", json=_REGISTER_PAYLOAD)
    assert reg.status_code == 201, reg.text

    await _request_otp(client)
    otp_email_mock.assert_called_once()
    assert otp_email_mock.call_args.args[0] == _EMAIL
    code = _sent_code(otp_email_mock)
    assert len(code) == 6 and code.isdigit()

    resp = await client.post(
        "/api/v1/auth/verify-otp", json={"email": _EMAIL, "code": code}
    )
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"ok": True, "verified": True}

    # User is flagged verified
    result = await db.execute(select(User).where(User.email == _EMAIL))
    user = result.scalars().first()
    assert user is not None
    assert user.email_verified is True

    # OTP is consumed — the same code cannot be replayed
    replay = await client.post(
        "/api/v1/auth/verify-otp", json={"email": _EMAIL, "code": code}
    )
    assert replay.status_code == 400

    await asyncio.sleep(0)  # let fire-and-forget tasks complete


async def test_verify_without_account_still_succeeds(
    client: AsyncClient, db: AsyncSession, otp_email_mock: AsyncMock
) -> None:
    """Verification works for emails with no user account (no enumeration)."""
    await _request_otp(client, "noaccount@example.com")
    code = _sent_code(otp_email_mock)

    resp = await client.post(
        "/api/v1/auth/verify-otp",
        json={"email": "noaccount@example.com", "code": code},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["ok"] is True
    await asyncio.sleep(0)


# ---------------------------------------------------------------------------
# Wrong code attempt cap
# ---------------------------------------------------------------------------

async def test_wrong_code_attempts_cap(
    client: AsyncClient, otp_email_mock: AsyncMock
) -> None:
    """After OTP_MAX_ATTEMPTS wrong codes the OTP is consumed for good."""
    await _request_otp(client)
    code = _sent_code(otp_email_mock)
    wrong = "000000" if code != "000000" else "111111"

    for _ in range(auth_module.OTP_MAX_ATTEMPTS):
        resp = await client.post(
            "/api/v1/auth/verify-otp", json={"email": _EMAIL, "code": wrong}
        )
        assert resp.status_code == 400
        assert "Invalid or expired code" in resp.json()["detail"]

    # Even the CORRECT code is now rejected — the OTP was consumed at the cap
    resp = await client.post(
        "/api/v1/auth/verify-otp", json={"email": _EMAIL, "code": code}
    )
    assert resp.status_code == 400
    await asyncio.sleep(0)


# ---------------------------------------------------------------------------
# Expiry
# ---------------------------------------------------------------------------

async def test_expired_code_rejected(
    client: AsyncClient, db: AsyncSession, otp_email_mock: AsyncMock
) -> None:
    """A code past its expires_at is rejected with the generic error."""
    await _request_otp(client)
    code = _sent_code(otp_email_mock)

    # Force the OTP into the past
    result = await db.execute(
        select(EmailOtp).where(EmailOtp.email == _EMAIL)
    )
    otp = result.scalars().first()
    assert otp is not None
    otp.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    await db.commit()

    resp = await client.post(
        "/api/v1/auth/verify-otp", json={"email": _EMAIL, "code": code}
    )
    assert resp.status_code == 400
    assert "Invalid or expired code" in resp.json()["detail"]
    await asyncio.sleep(0)


# ---------------------------------------------------------------------------
# No enumeration
# ---------------------------------------------------------------------------

async def test_request_otp_does_not_leak_account_existence(
    client: AsyncClient, otp_email_mock: AsyncMock, monkeypatch: pytest.MonkeyPatch
) -> None:
    """request-otp returns an identical 200 body for known and unknown emails."""
    monkeypatch.setattr(auth_module, "_send_welcome_email", AsyncMock())
    reg = await client.post("/api/v1/auth/register", json=_REGISTER_PAYLOAD)
    assert reg.status_code == 201, reg.text

    known = await client.post(
        "/api/v1/auth/request-otp", json={"email": _EMAIL}
    )
    unknown = await client.post(
        "/api/v1/auth/request-otp", json={"email": "ghost@example.com"}
    )
    assert known.status_code == unknown.status_code == 200
    assert known.json() == unknown.json() == {"ok": True}
    await asyncio.sleep(0)


async def test_verify_with_no_outstanding_otp(
    client: AsyncClient,
) -> None:
    """verify-otp without a prior request returns the generic 400."""
    resp = await client.post(
        "/api/v1/auth/verify-otp", json={"email": _EMAIL, "code": "123456"}
    )
    assert resp.status_code == 400
    assert "Invalid or expired code" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# Prior OTP invalidation
# ---------------------------------------------------------------------------

async def test_new_request_invalidates_prior_code(
    client: AsyncClient, otp_email_mock: AsyncMock
) -> None:
    """Requesting a new code consumes the previous one; only the latest works."""
    await _request_otp(client)
    first_code = _sent_code(otp_email_mock)

    await _request_otp(client)
    second_code = _sent_code(otp_email_mock)
    assert otp_email_mock.call_count == 2

    if first_code != second_code:
        resp = await client.post(
            "/api/v1/auth/verify-otp", json={"email": _EMAIL, "code": first_code}
        )
        assert resp.status_code == 400

    resp = await client.post(
        "/api/v1/auth/verify-otp", json={"email": _EMAIL, "code": second_code}
    )
    assert resp.status_code == 200, resp.text
    await asyncio.sleep(0)
