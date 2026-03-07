"""Authentication router: register, login, refresh, logout, password reset."""

from __future__ import annotations

import asyncio
import hashlib
import logging
import secrets
import smtplib
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from uuid import UUID

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, status
from jose import JWTError, jwt
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings
from backend.deps import get_db
from backend.models.refresh_token import RefreshToken
from backend.models.user import User
from backend.schemas.auth import (
    ForgotPasswordRequest,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
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
# Endpoints
# ---------------------------------------------------------------------------

@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user account",
)
async def register(
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

    # Invite-only: check email allowlist (empty list = open registration)
    if settings.allowed_emails_list and body.email.lower() not in settings.allowed_emails_list:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Registration is currently invite-only. Join the waitlist to request access.",
        )

    hashed_pw = _hash_password(body.password)
    user = User(
        email=body.email,
        password_hash=hashed_pw,
        name=body.name,
    )
    db.add(user)
    await db.flush()  # populate user.id

    return await _issue_tokens(db, user.id)


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


def _build_reset_email(to_email: str, reset_url: str) -> MIMEMultipart:
    """Build the password reset email."""
    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Reset your FreeForm Fitness password"
    msg["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
    msg["To"] = to_email

    text = (
        "You requested a password reset for your FreeForm Fitness account.\n\n"
        f"Click here to reset your password:\n{reset_url}\n\n"
        "This link expires in 15 minutes. If you didn't request this, "
        "you can safely ignore this email.\n\n"
        "— The FreeForm Fitness Team"
    )

    html = f"""\
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

    msg.attach(MIMEText(text, "plain"))
    msg.attach(MIMEText(html, "html"))
    return msg


def _send_reset_email_sync(to_email: str, reset_url: str) -> None:
    """Send the reset email via SMTP (blocking, run in thread)."""
    if not settings.SMTP_HOST or not settings.SMTP_USER:
        logger.info("SMTP not configured. Reset URL for %s: %s", to_email, reset_url)
        return

    try:
        msg = _build_reset_email(to_email, reset_url)
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
            server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD or "")
            server.send_message(msg)
    except Exception:
        logger.exception("Failed to send reset email to %s", to_email)


async def _send_reset_email(to_email: str, reset_url: str) -> None:
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, _send_reset_email_sync, to_email, reset_url)


def _fire_and_forget_reset_email(to_email: str, reset_url: str) -> None:
    task = asyncio.create_task(_send_reset_email(to_email, reset_url))
    task.add_done_callback(
        lambda t: logger.exception(
            "Reset email task failed", exc_info=t.exception()
        )
        if t.exception()
        else None
    )


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
        _fire_and_forget_reset_email(user.email, reset_url)

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
