"""Authentication router: register, login, refresh, logout."""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
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
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
)

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
