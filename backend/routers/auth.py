"""Authentication router: register, login, refresh, logout, password reset."""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import html
import logging
import secrets
from collections.abc import Coroutine
from datetime import datetime, timedelta, timezone
from uuid import UUID

import bcrypt
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from jose import JWTError, jwt
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings
from backend.deps import get_db
from backend.models.email_otp import EmailOtp
from backend.models.refresh_token import RefreshToken
from backend.models.user import User
from backend.rate_limit import limiter
from backend.schemas.auth import (
    ForgotPasswordRequest,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    RequestOtpRequest,
    ResetPasswordRequest,
    TokenResponse,
    VerifyOtpRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def _verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


# ---------------------------------------------------------------------------
# Token helpers
# ---------------------------------------------------------------------------

def _create_access_token(user_id: UUID) -> str:
    """Create a short-lived JWT access token."""
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = {"sub": str(user_id), "exp": expire, "type": "access"}
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def _create_refresh_token_value() -> str:
    """Generate a cryptographically random refresh token string."""
    return secrets.token_urlsafe(64)


def _hash_refresh_token(raw_token: str) -> str:
    """Hash a raw refresh token for storage (SHA-256)."""
    return hashlib.sha256(raw_token.encode()).hexdigest()


async def _issue_tokens(
    db: AsyncSession, user_id: UUID
) -> TokenResponse:
    """Create an access + refresh token pair and persist the refresh hash."""
    access_token = _create_access_token(user_id)
    raw_refresh = _create_refresh_token_value()
    token_hash = _hash_refresh_token(raw_refresh)
    expires_at = datetime.now(timezone.utc) + timedelta(
        days=settings.REFRESH_TOKEN_EXPIRE_DAYS
    )

    refresh_row = RefreshToken(
        user_id=user_id,
        token_hash=token_hash,
        expires_at=expires_at,
    )
    db.add(refresh_row)
    await db.flush()

    return TokenResponse(
        access_token=access_token,
        refresh_token=raw_refresh,
        token_type="bearer",
    )


# ---------------------------------------------------------------------------
# Fire-and-forget email tasks
# ---------------------------------------------------------------------------

_background_tasks: set[asyncio.Task] = set()  # prevent GC of fire-and-forget tasks


def _fire_and_forget_email(coro: Coroutine[None, None, None], label: str) -> None:
    """Run an email coroutine in the background without blocking the request."""
    task = asyncio.create_task(coro)
    _background_tasks.add(task)

    def _on_done(t: asyncio.Task) -> None:
        _background_tasks.discard(t)
        if t.exception():
            logger.error("%s task failed", label, exc_info=t.exception())

    task.add_done_callback(_on_done)


# ---------------------------------------------------------------------------
# Welcome email (sent on successful registration)
# ---------------------------------------------------------------------------

def _build_welcome_html(name: str, dashboard_url: str) -> str:
    """Build the registration welcome email HTML.

    Unlike the waitlist welcome (which promises future access), this is for
    users who already have an account: beta is free, 8 exercises, camera-only.
    """
    greeting = f"Hi {html.escape(name)}," if name else "Hi,"
    return f"""\
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; color: #e4e4e7; background-color: #18181b; border-radius: 16px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="font-size: 24px; font-weight: 700; margin: 0; color: #fb923c;">FreeForm Fitness</h1>
      </div>
      <h2 style="font-size: 20px; font-weight: 600; color: #fafafa; margin: 0 0 16px;">You're in the FreeForm Fitness beta</h2>
      <p style="font-size: 15px; line-height: 1.6; color: #a1a1aa; margin: 0 0 16px;">
        {greeting}
      </p>
      <p style="font-size: 15px; line-height: 1.6; color: #a1a1aa; margin: 0 0 16px;">
        Your account is ready and the beta is free while we build. You get
        real-time form analysis on 8 exercises &mdash; depth, stability, symmetry,
        tempo, and range of motion scored on every rep.
      </p>
      <p style="font-size: 15px; line-height: 1.6; color: #a1a1aa; margin: 0 0 16px;">
        All you need is a camera &mdash; your phone or laptop works. No wearables,
        no extra hardware.
      </p>
      <div style="text-align: center; margin: 24px 0;">
        <a href="{dashboard_url}" style="display: inline-block; padding: 12px 32px; background-color: #ea580c; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">
          Open Your Dashboard
        </a>
      </div>
      <p style="font-size: 13px; line-height: 1.6; color: #71717a; margin: 0 0 24px;">
        It's early &mdash; if something feels off, reply to this email and tell us.
        Beta feedback directly shapes what we build next.
      </p>
      <div style="border-top: 1px solid #27272a; padding-top: 16px; text-align: center;">
        <p style="font-size: 12px; color: #52525b; margin: 0;">
          &copy; 2026 FreeForm Fitness. All rights reserved.
        </p>
      </div>
    </div>
    """


async def _send_welcome_email(to_email: str, name: str) -> None:
    """Send the registration welcome email via Resend HTTP API."""
    logger.info("[EMAIL] Attempting welcome email to=%s from=%s", to_email, settings.EMAIL_FROM)
    if not settings.RESEND_API_KEY:
        logger.warning("[EMAIL] RESEND_API_KEY not configured. Skipping welcome email to %s", to_email)
        return

    dashboard_url = f"{settings.FRONTEND_URL}/dashboard"
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                settings.RESEND_API_URL,
                headers={
                    "Authorization": f"Bearer {settings.RESEND_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": f"{settings.EMAIL_FROM_NAME} <{settings.EMAIL_FROM}>",
                    "to": [to_email],
                    "subject": "You're in the FreeForm Fitness beta",
                    "html": _build_welcome_html(name, dashboard_url),
                },
                timeout=10.0,
            )
        if resp.status_code == 200:
            logger.info("[EMAIL] Welcome email sent successfully to %s (id=%s)", to_email, resp.json().get("id"))
        else:
            logger.error("[EMAIL] Resend API error %s: %s", resp.status_code, resp.text)
    except Exception:
        logger.exception("[EMAIL] Failed to send welcome email to %s", to_email)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user account",
)
@limiter.limit("5/minute")
async def register(
    request: Request,
    body: RegisterRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Create a new user, hash the password, and return a token pair."""
    # Check for existing email
    result = await db.execute(select(User).where(User.email == body.email))
    if result.scalars().first() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists",
        )

    # Operational safety valve: email allowlist (empty list = open registration).
    # Registration is open beta -- this copy must never claim invite-only.
    if settings.allowed_emails_list and body.email.lower() not in settings.allowed_emails_list:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Registration is temporarily unavailable for this email address. Please try again later.",
        )

    hashed_pw = _hash_password(body.password)
    user = User(
        email=body.email,
        password_hash=hashed_pw,
        name=body.name,
    )
    db.add(user)
    await db.flush()  # populate user.id

    tokens = await _issue_tokens(db, user.id)

    # Fire-and-forget: never block or fail registration on email problems
    _fire_and_forget_email(
        _send_welcome_email(user.email, user.name or ""), "Welcome email"
    )

    return tokens


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Log in with email and password",
)
async def login(
    body: LoginRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Verify credentials and return a token pair."""
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalars().first()

    if user is None or user.password_hash is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not _verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    return await _issue_tokens(db, user.id)


@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Refresh an access token",
)
async def refresh(
    body: RefreshRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Validate the refresh token, revoke it, and issue a new pair."""
    token_hash = _hash_refresh_token(body.refresh_token)

    result = await db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    )
    stored = result.scalars().first()

    if stored is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    # Check expiry
    expires_at = stored.expires_at
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if not hasattr(expires_at, "tzinfo") or expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        await db.delete(stored)
        await db.flush()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has expired",
        )

    user_id = stored.user_id

    # Revoke the old refresh token (single use)
    await db.delete(stored)
    await db.flush()

    return await _issue_tokens(db, user_id)


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Log out (invalidate refresh token)",
)
async def logout(
    body: RefreshRequest,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Invalidate the supplied refresh token."""
    token_hash = _hash_refresh_token(body.refresh_token)
    await db.execute(
        delete(RefreshToken).where(RefreshToken.token_hash == token_hash)
    )
    await db.flush()


# ---------------------------------------------------------------------------
# Password reset
# ---------------------------------------------------------------------------

def _create_password_reset_token(user_id: UUID, password_hash: str) -> str:
    """Create a short-lived JWT for password reset.

    Embeds first 8 chars of current password hash so the token
    auto-invalidates once the password is changed.
    """
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.PASSWORD_RESET_EXPIRE_MINUTES
    )
    payload = {
        "sub": str(user_id),
        "exp": expire,
        "type": "password_reset",
        "pwd": password_hash[:8],
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def _build_reset_html(reset_url: str) -> str:
    """Build the password reset email HTML."""
    return f"""\
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; color: #e4e4e7; background-color: #18181b; border-radius: 16px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="font-size: 24px; font-weight: 700; margin: 0; color: #fb923c;">FreeForm Fitness</h1>
      </div>
      <h2 style="font-size: 20px; font-weight: 600; color: #fafafa; margin: 0 0 16px;">Reset your password</h2>
      <p style="font-size: 15px; line-height: 1.6; color: #a1a1aa; margin: 0 0 16px;">
        You requested a password reset. Click the button below to choose a new password.
      </p>
      <div style="text-align: center; margin: 24px 0;">
        <a href="{reset_url}" style="display: inline-block; padding: 12px 32px; background-color: #ea580c; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">
          Reset Password
        </a>
      </div>
      <p style="font-size: 13px; line-height: 1.6; color: #71717a; margin: 0 0 24px;">
        This link expires in 15 minutes. If you didn&rsquo;t request this, you can safely ignore this email.
      </p>
      <div style="border-top: 1px solid #27272a; padding-top: 16px; text-align: center;">
        <p style="font-size: 12px; color: #52525b; margin: 0;">
          &copy; 2026 FreeForm Fitness. All rights reserved.
        </p>
      </div>
    </div>
    """


async def _send_reset_email(to_email: str, reset_url: str) -> None:
    """Send the reset email via Resend HTTP API."""
    logger.info("[EMAIL] Attempting reset email to=%s from=%s", to_email, settings.EMAIL_FROM)
    if not settings.RESEND_API_KEY:
        logger.warning("[EMAIL] RESEND_API_KEY not configured. Reset URL for %s: %s", to_email, reset_url)
        return

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                settings.RESEND_API_URL,
                headers={
                    "Authorization": f"Bearer {settings.RESEND_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": f"{settings.EMAIL_FROM_NAME} <{settings.EMAIL_FROM}>",
                    "to": [to_email],
                    "subject": "Reset your FreeForm Fitness password",
                    "html": _build_reset_html(reset_url),
                },
                timeout=10.0,
            )
        if resp.status_code == 200:
            logger.info("[EMAIL] Reset email sent successfully to %s (id=%s)", to_email, resp.json().get("id"))
        else:
            logger.error("[EMAIL] Resend API error %s: %s", resp.status_code, resp.text)
    except Exception:
        logger.exception("[EMAIL] Failed to send reset email to %s", to_email)


@router.post(
    "/forgot-password",
    summary="Request a password reset email",
)
async def forgot_password(
    body: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Send a password reset link if the email exists.

    Always returns 200 to avoid leaking whether an email is registered.
    """
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalars().first()

    if user is not None and user.password_hash is not None:
        token = _create_password_reset_token(user.id, user.password_hash)
        reset_url = f"{settings.FRONTEND_URL}/reset-password?token={token}"
        _fire_and_forget_email(_send_reset_email(user.email, reset_url), "Reset email")

    return {"message": "If an account with that email exists, a reset link has been sent."}


@router.post(
    "/reset-password",
    response_model=TokenResponse,
    summary="Reset password with a token",
)
async def reset_password(
    body: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Validate the reset token and update the user's password."""
    try:
        payload = jwt.decode(
            body.token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset link. Please request a new one.",
        )

    if payload.get("type") != "password_reset":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid reset token.",
        )

    user_id = payload.get("sub")
    pwd_prefix = payload.get("pwd")
    if not user_id or not pwd_prefix:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid reset token.",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()

    if user is None or user.password_hash is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid reset token.",
        )

    # Verify token hasn't been used (password hasn't changed since token was issued)
    if user.password_hash[:8] != pwd_prefix:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This reset link has already been used. Please request a new one.",
        )

    # Update password
    user.password_hash = _hash_password(body.new_password)
    await db.flush()

    # Auto-login: issue new token pair
    return await _issue_tokens(db, user.id)


# ---------------------------------------------------------------------------
# Email verification via one-time code (OTP)
#
# NOTE: Email verification is OPTIONAL for now. The registration flow is
# UNCHANGED — users can register and use the product without verifying.
# Enforcement (e.g. gating features on User.email_verified) comes later.
# ---------------------------------------------------------------------------

OTP_EXPIRY_MINUTES = 10
OTP_MAX_ATTEMPTS = 5
OTP_PURPOSE_VERIFY = "verify"


def _generate_otp_code() -> str:
    """Generate a cryptographically random 6-digit code."""
    return f"{secrets.randbelow(1_000_000):06d}"


def _hash_otp_code(code: str) -> str:
    """Hash an OTP code for storage (SHA-256 hex digest)."""
    return hashlib.sha256(code.encode()).hexdigest()


def _as_utc(dt: datetime) -> datetime:
    """Normalize a possibly-naive datetime (SQLite) to UTC-aware."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _build_otp_html(code: str) -> str:
    """Build the verification code email HTML."""
    return f"""\
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; color: #e4e4e7; background-color: #18181b; border-radius: 16px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="font-size: 24px; font-weight: 700; margin: 0; color: #fb923c;">FreeForm Fitness</h1>
      </div>
      <h2 style="font-size: 20px; font-weight: 600; color: #fafafa; margin: 0 0 16px;">Your verification code</h2>
      <p style="font-size: 15px; line-height: 1.6; color: #a1a1aa; margin: 0 0 16px;">
        Enter this code to verify your email address:
      </p>
      <div style="text-align: center; margin: 24px 0;">
        <span style="display: inline-block; padding: 12px 32px; background-color: #27272a; color: #fafafa; border-radius: 8px; font-weight: 700; font-size: 28px; letter-spacing: 8px;">{code}</span>
      </div>
      <p style="font-size: 13px; line-height: 1.6; color: #71717a; margin: 0 0 24px;">
        This code expires in {OTP_EXPIRY_MINUTES} minutes. If you didn&rsquo;t request it,
        you can safely ignore this email &mdash; nothing changes on your account.
      </p>
      <div style="border-top: 1px solid #27272a; padding-top: 16px; text-align: center;">
        <p style="font-size: 12px; color: #52525b; margin: 0;">
          &copy; 2026 FreeForm Fitness. All rights reserved.
        </p>
      </div>
    </div>
    """


async def _send_otp_email(to_email: str, code: str) -> None:
    """Send the verification code email via Resend HTTP API."""
    logger.info("[EMAIL] Attempting OTP email to=%s from=%s", to_email, settings.EMAIL_FROM)
    if not settings.RESEND_API_KEY:
        logger.warning("[EMAIL] RESEND_API_KEY not configured. Skipping OTP email to %s", to_email)
        return

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                settings.RESEND_API_URL,
                headers={
                    "Authorization": f"Bearer {settings.RESEND_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": f"{settings.EMAIL_FROM_NAME} <{settings.EMAIL_FROM}>",
                    "to": [to_email],
                    "subject": "Your FreeForm Fitness verification code",
                    "html": _build_otp_html(code),
                },
                timeout=10.0,
            )
        if resp.status_code == 200:
            logger.info("[EMAIL] OTP email sent successfully to %s (id=%s)", to_email, resp.json().get("id"))
        else:
            logger.error("[EMAIL] Resend API error %s: %s", resp.status_code, resp.text)
    except Exception:
        logger.exception("[EMAIL] Failed to send OTP email to %s", to_email)


@router.post(
    "/request-otp",
    summary="Request an email verification code",
)
@limiter.limit("3/minute")
async def request_otp(
    request: Request,
    body: RequestOtpRequest,
    db: AsyncSession = Depends(get_db),
) -> dict[str, bool]:
    """Generate and email a 6-digit verification code.

    Always returns 200 {"ok": true} regardless of whether the email belongs
    to an existing account, to avoid account enumeration.
    """
    email = body.email.lower()

    # Invalidate any prior unconsumed OTPs for this email — only the most
    # recent code is ever valid.
    now = datetime.now(timezone.utc)
    await db.execute(
        update(EmailOtp)
        .where(
            EmailOtp.email == email,
            EmailOtp.purpose == OTP_PURPOSE_VERIFY,
            EmailOtp.consumed_at.is_(None),
        )
        .values(consumed_at=now)
    )

    code = _generate_otp_code()
    otp = EmailOtp(
        email=email,
        code_hash=_hash_otp_code(code),
        purpose=OTP_PURPOSE_VERIFY,
        attempts=0,
        expires_at=now + timedelta(minutes=OTP_EXPIRY_MINUTES),
    )
    db.add(otp)
    await db.flush()

    # Fire-and-forget: never block or fail the request on email problems
    _fire_and_forget_email(_send_otp_email(email, code), "OTP email")

    logger.info("OTP requested for %s", email)
    return {"ok": True}


@router.post(
    "/verify-otp",
    summary="Verify an email with a one-time code",
)
async def verify_otp(
    body: VerifyOtpRequest,
    db: AsyncSession = Depends(get_db),
) -> dict[str, bool]:
    """Verify the 6-digit code for an email address.

    On success the OTP is consumed and, if a user account exists for the
    email, ``User.email_verified`` is set to true. Wrong codes are capped at
    OTP_MAX_ATTEMPTS per OTP, after which the OTP is consumed.
    """
    email = body.email.lower()
    generic_error = HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Invalid or expired code. Please request a new one.",
    )

    result = await db.execute(
        select(EmailOtp)
        .where(
            EmailOtp.email == email,
            EmailOtp.purpose == OTP_PURPOSE_VERIFY,
            EmailOtp.consumed_at.is_(None),
        )
        .order_by(EmailOtp.created_at.desc())
        .limit(1)
    )
    otp = result.scalars().first()

    if otp is None:
        raise generic_error

    now = datetime.now(timezone.utc)
    if _as_utc(otp.expires_at) < now:
        raise generic_error

    if otp.attempts >= OTP_MAX_ATTEMPTS:
        # Defensive: should already be consumed at the cap below
        otp.consumed_at = now
        await db.commit()
        raise generic_error

    # Constant-time comparison of the SHA-256 digests
    if not hmac.compare_digest(_hash_otp_code(body.code), otp.code_hash):
        otp.attempts += 1
        if otp.attempts >= OTP_MAX_ATTEMPTS:
            otp.consumed_at = now
        # Commit explicitly: the HTTPException below would otherwise roll
        # back the attempt counter in the get_db dependency.
        await db.commit()
        raise generic_error

    # Success: consume the OTP and flag the user if one exists.
    otp.consumed_at = now

    user_result = await db.execute(
        select(User).where(func.lower(User.email) == email)
    )
    user = user_result.scalars().first()
    if user is not None:
        user.email_verified = True
        logger.info("Email verified for user %s", user.id)
    else:
        logger.info("OTP verified for %s (no account yet)", email)

    await db.flush()
    return {"ok": True, "verified": True}
