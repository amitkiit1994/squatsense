"""League authentication router: join, register, login, upgrade, password reset, email verification."""

from __future__ import annotations

import asyncio
import hashlib
import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

import bcrypt
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from jose import JWTError, jwt
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings
from backend.deps import get_db, get_league_player_id
from backend.models.league import LeaguePlayer, LeagueTeam
from backend.rate_limit import limiter
from backend.services.profanity import is_nickname_clean
from backend.schemas.league import (
    LeagueForgotPasswordRequest,
    LeagueJoinRequest,
    LeagueLoginRequest,
    LeagueRegisterRequest,
    LeagueResetPasswordRequest,
    LeagueTokenResponse,
    LeagueUpgradeRequest,
    LeagueVerifyEmailRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/league", tags=["league-auth"])


# ── Helpers ──────────────────────────────────────────────────────────────────


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def _verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def _create_league_token(player_id: UUID) -> str:
    """Create a JWT access token with type='league'."""
    expire = datetime.now(timezone.utc) + timedelta(days=30)  # longer-lived for league
    payload = {"sub": str(player_id), "exp": expire, "type": "league"}
    return jwt.encode(
        payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM
    )


async def _resolve_team(
    db: AsyncSession, team_code: str | None
) -> LeagueTeam | None:
    """Look up team by code if provided."""
    if not team_code:
        return None
    result = await db.execute(
        select(LeagueTeam).where(LeagueTeam.code == team_code.upper())
    )
    team = result.scalar_one_or_none()
    if team is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Team '{team_code}' not found",
        )
    return team


async def _check_nickname_available(
    db: AsyncSession, nickname: str, team_id: UUID | None
) -> None:
    """Ensure nickname is unique within the team (or globally for personal)."""
    query = select(LeaguePlayer).where(func.lower(LeaguePlayer.nickname) == nickname.lower())
    if team_id is not None:
        query = query.where(LeaguePlayer.team_id == team_id)
    else:
        query = query.where(LeaguePlayer.team_id.is_(None))
    result = await db.execute(query)
    if result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Nickname '{nickname}' is already taken",
        )


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.post("/join", response_model=LeagueTokenResponse)
async def join_league(
    body: LeagueJoinRequest,
    db: AsyncSession = Depends(get_db),
):
    """Join the league anonymously with just a nickname."""
    # Profanity check
    if not is_nickname_clean(body.nickname):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="That nickname is not allowed. Please choose another.",
        )

    team = await _resolve_team(db, body.team_code)
    team_id = team.id if team else None

    await _check_nickname_available(db, body.nickname, team_id)

    player = LeaguePlayer(
        nickname=body.nickname,
        team_id=team_id,
    )
    db.add(player)

    if team:
        team.member_count += 1

    await db.flush()

    token = _create_league_token(player.id)
    logger.info("League join: %s (team=%s)", body.nickname, body.team_code)

    return LeagueTokenResponse(
        access_token=token,
        player_id=player.id,
        nickname=player.nickname,
        team_code=team.code if team else None,
    )


@router.post("/register", response_model=LeagueTokenResponse)
async def register_league(
    body: LeagueRegisterRequest,
    db: AsyncSession = Depends(get_db),
):
    """Register with email for persistent account."""
    # Profanity check
    if not is_nickname_clean(body.nickname):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="That nickname is not allowed. Please choose another.",
        )

    # Check email uniqueness
    result = await db.execute(
        select(LeaguePlayer).where(LeaguePlayer.email == body.email.lower())
    )
    if result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    team = await _resolve_team(db, body.team_code)
    team_id = team.id if team else None

    await _check_nickname_available(db, body.nickname, team_id)

    player = LeaguePlayer(
        nickname=body.nickname,
        email=body.email.lower(),
        password_hash=_hash_password(body.password),
        team_id=team_id,
    )
    db.add(player)

    if team:
        team.member_count += 1

    await db.flush()

    token = _create_league_token(player.id)
    logger.info("League register: %s (%s)", body.nickname, body.email)

    # Fire-and-forget verification email
    verify_token = _create_email_verify_token(player.id)
    verify_url = f"{settings.SQUATSENSE_URL}/verify-email?token={verify_token}"
    _fire_and_forget_email(
        player.email,
        "Verify your SquatSense email",
        _build_verify_html(verify_url),
    )

    return LeagueTokenResponse(
        access_token=token,
        player_id=player.id,
        nickname=player.nickname,
        team_code=team.code if team else None,
    )


@router.post("/login", response_model=LeagueTokenResponse)
@limiter.limit("10/minute")
async def login_league(
    request: Request,
    body: LeagueLoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """Login with email + password."""
    result = await db.execute(
        select(LeaguePlayer).where(LeaguePlayer.email == body.email.lower())
    )
    player = result.scalar_one_or_none()

    if player is None or player.password_hash is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not _verify_password(body.password, player.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    token = _create_league_token(player.id)
    team_code = None
    if player.team_id:
        team_result = await db.execute(
            select(LeagueTeam.code).where(LeagueTeam.id == player.team_id)
        )
        team_code = team_result.scalar_one_or_none()

    return LeagueTokenResponse(
        access_token=token,
        player_id=player.id,
        nickname=player.nickname,
        team_code=team_code,
    )


@router.post("/upgrade", response_model=LeagueTokenResponse)
async def upgrade_account(
    body: LeagueUpgradeRequest,
    player_id: UUID = Depends(get_league_player_id),
    db: AsyncSession = Depends(get_db),
):
    """Upgrade anonymous account to persistent with email + password."""
    player = await db.get(LeaguePlayer, player_id)
    if player is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Player not found")

    if player.email is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Account already has email",
        )

    # Check email uniqueness
    result = await db.execute(
        select(LeaguePlayer).where(LeaguePlayer.email == body.email.lower())
    )
    if result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    player.email = body.email.lower()
    player.password_hash = _hash_password(body.password)
    await db.flush()

    # Fire-and-forget verification email
    verify_token = _create_email_verify_token(player.id)
    verify_url = f"{settings.SQUATSENSE_URL}/verify-email?token={verify_token}"
    _fire_and_forget_email(
        player.email,
        "Verify your SquatSense email",
        _build_verify_html(verify_url),
    )

    token = _create_league_token(player.id)
    team_code = None
    if player.team_id:
        team_result = await db.execute(
            select(LeagueTeam.code).where(LeagueTeam.id == player.team_id)
        )
        team_code = team_result.scalar_one_or_none()

    return LeagueTokenResponse(
        access_token=token,
        player_id=player.id,
        nickname=player.nickname,
        team_code=team_code,
    )


# ── Password Reset ──────────────────────────────────────────────────────────

RESEND_API_URL = "https://api.resend.com/emails"


def _password_fingerprint(password_hash: str) -> str:
    """Derive a non-reversible fingerprint from the password hash for token invalidation."""
    return hashlib.sha256(password_hash.encode()).hexdigest()[:16]


def _create_league_reset_token(player_id: UUID, password_hash: str) -> str:
    """Create a short-lived JWT for league password reset."""
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.PASSWORD_RESET_EXPIRE_MINUTES
    )
    payload = {
        "sub": str(player_id),
        "exp": expire,
        "type": "league_password_reset",
        "pwd": _password_fingerprint(password_hash),
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def _create_email_verify_token(player_id: UUID) -> str:
    """Create a 24-hour JWT for email verification."""
    expire = datetime.now(timezone.utc) + timedelta(hours=24)
    payload = {
        "sub": str(player_id),
        "exp": expire,
        "type": "league_email_verify",
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def _build_reset_html(reset_url: str) -> str:
    """Build the password reset email HTML."""
    return f"""\
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; color: #e4e4e7; background-color: #18181b; border-radius: 16px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="font-size: 24px; font-weight: 700; margin: 0; color: #00ff88;">SquatSense</h1>
      </div>
      <h2 style="font-size: 20px; font-weight: 600; color: #fafafa; margin: 0 0 16px;">Reset your password</h2>
      <p style="font-size: 15px; line-height: 1.6; color: #a1a1aa; margin: 0 0 16px;">
        You requested a password reset for your league account. Click the button below to choose a new password.
      </p>
      <div style="text-align: center; margin: 24px 0;">
        <a href="{reset_url}" style="display: inline-block; padding: 12px 32px; background-color: #00ff88; color: #000000; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">
          Reset Password
        </a>
      </div>
      <p style="font-size: 13px; line-height: 1.6; color: #71717a; margin: 0 0 24px;">
        This link expires in 15 minutes. If you didn&rsquo;t request this, you can safely ignore this email.
      </p>
      <div style="border-top: 1px solid #27272a; padding-top: 16px; text-align: center;">
        <p style="font-size: 12px; color: #52525b; margin: 0;">
          &copy; 2026 SquatSense. All rights reserved.
        </p>
      </div>
    </div>
    """


def _build_verify_html(verify_url: str) -> str:
    """Build the email verification HTML."""
    return f"""\
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; color: #e4e4e7; background-color: #18181b; border-radius: 16px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="font-size: 24px; font-weight: 700; margin: 0; color: #00ff88;">SquatSense</h1>
      </div>
      <h2 style="font-size: 20px; font-weight: 600; color: #fafafa; margin: 0 0 16px;">Verify your email</h2>
      <p style="font-size: 15px; line-height: 1.6; color: #a1a1aa; margin: 0 0 16px;">
        Thanks for registering! Click the button below to verify your email address and secure your account.
      </p>
      <div style="text-align: center; margin: 24px 0;">
        <a href="{verify_url}" style="display: inline-block; padding: 12px 32px; background-color: #00ff88; color: #000000; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">
          Verify Email
        </a>
      </div>
      <p style="font-size: 13px; line-height: 1.6; color: #71717a; margin: 0 0 24px;">
        This link expires in 24 hours. If you didn&rsquo;t create this account, you can safely ignore this email.
      </p>
      <div style="border-top: 1px solid #27272a; padding-top: 16px; text-align: center;">
        <p style="font-size: 12px; color: #52525b; margin: 0;">
          &copy; 2026 SquatSense. All rights reserved.
        </p>
      </div>
    </div>
    """


async def _send_email(to_email: str, subject: str, html: str) -> None:
    """Send an email via Resend HTTP API."""
    logger.info("[EMAIL] Sending to=%s subject=%s", to_email, subject)
    if not settings.RESEND_API_KEY:
        logger.warning("[EMAIL] RESEND_API_KEY not configured — skipping send to %s", to_email)
        return

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                RESEND_API_URL,
                headers={
                    "Authorization": f"Bearer {settings.RESEND_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": f"{settings.SQUATSENSE_EMAIL_FROM_NAME} <{settings.SQUATSENSE_EMAIL_FROM}>",
                    "to": [to_email],
                    "subject": subject,
                    "html": html,
                },
                timeout=10.0,
            )
        if resp.status_code == 200:
            logger.info("[EMAIL] Sent successfully to %s (id=%s)", to_email, resp.json().get("id"))
        else:
            logger.error("[EMAIL] Resend API error %s: %s", resp.status_code, resp.text)
    except Exception:
        logger.exception("[EMAIL] Failed to send email to %s", to_email)


_background_tasks: set[asyncio.Task] = set()  # prevent GC of in-flight tasks


def _fire_and_forget_email(to_email: str, subject: str, html: str) -> None:
    """Send email in a background task."""
    task = asyncio.create_task(_send_email(to_email, subject, html))
    _background_tasks.add(task)

    def _on_done(t: asyncio.Task) -> None:
        _background_tasks.discard(t)
        if t.exception():
            logger.error("Email task failed: %s", t.exception())

    task.add_done_callback(_on_done)


@router.post("/forgot-password", summary="Request a league password reset email")
@limiter.limit("5/minute")
async def league_forgot_password(
    request: Request,
    body: LeagueForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Send a password reset link if the email exists.

    Always returns 200 to avoid leaking whether an email is registered.
    """
    result = await db.execute(
        select(LeaguePlayer).where(LeaguePlayer.email == body.email.lower())
    )
    player = result.scalar_one_or_none()

    if player is not None and player.password_hash is not None:
        token = _create_league_reset_token(player.id, player.password_hash)
        reset_url = f"{settings.SQUATSENSE_URL}/reset-password?token={token}&type=league"
        _fire_and_forget_email(
            player.email,
            "Reset your SquatSense password",
            _build_reset_html(reset_url),
        )

    return {"message": "If an account with that email exists, a reset link has been sent."}


@router.post("/reset-password", response_model=LeagueTokenResponse, summary="Reset league password with a token")
async def league_reset_password(
    body: LeagueResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
) -> LeagueTokenResponse:
    """Validate the reset token and update the player's password."""
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

    if payload.get("type") != "league_password_reset":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid reset token.",
        )

    player_id_str = payload.get("sub")
    pwd_prefix = payload.get("pwd")
    if not player_id_str or not pwd_prefix:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid reset token.",
        )

    result = await db.execute(
        select(LeaguePlayer).where(LeaguePlayer.id == player_id_str)
    )
    player = result.scalar_one_or_none()

    if player is None or player.password_hash is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid reset token.",
        )

    # Verify token hasn't been used (password hasn't changed since token was issued)
    if _password_fingerprint(player.password_hash) != pwd_prefix:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This reset link has already been used. Please request a new one.",
        )

    # Update password
    player.password_hash = _hash_password(body.new_password)
    await db.flush()

    # Auto-login
    token = _create_league_token(player.id)
    team_code = None
    if player.team_id:
        team_result = await db.execute(
            select(LeagueTeam.code).where(LeagueTeam.id == player.team_id)
        )
        team_code = team_result.scalar_one_or_none()

    return LeagueTokenResponse(
        access_token=token,
        player_id=player.id,
        nickname=player.nickname,
        team_code=team_code,
    )


# ── Email Verification ─────────────────────────────────────────────────────


@router.post("/send-verification", summary="Send email verification link")
@limiter.limit("3/hour")
async def send_verification(
    request: Request,
    player_id: UUID = Depends(get_league_player_id),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Send a verification email to the authenticated player."""
    player = await db.get(LeaguePlayer, player_id)
    if player is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Player not found")

    if player.email is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No email address on this account.",
        )

    if player.email_verified:
        return {"message": "Email already verified."}

    token = _create_email_verify_token(player.id)
    verify_url = f"{settings.SQUATSENSE_URL}/verify-email?token={token}"
    _fire_and_forget_email(
        player.email,
        "Verify your SquatSense email",
        _build_verify_html(verify_url),
    )

    return {"message": "Verification email sent."}


@router.post("/verify-email", summary="Verify email with token")
async def verify_email(
    body: LeagueVerifyEmailRequest,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Verify a player's email address using the token from the verification email."""
    try:
        payload = jwt.decode(
            body.token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification link. Please request a new one.",
        )

    if payload.get("type") != "league_email_verify":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid verification token.",
        )

    player_id_str = payload.get("sub")
    if not player_id_str:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid verification token.",
        )

    result = await db.execute(
        select(LeaguePlayer).where(LeaguePlayer.id == player_id_str)
    )
    player = result.scalar_one_or_none()

    if player is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid verification token.",
        )

    if player.email_verified:
        return {"message": "Email already verified."}

    player.email_verified = True
    await db.flush()

    logger.info("Email verified for player %s (%s)", player.nickname, player.email)

    return {"message": "Email verified successfully!"}
