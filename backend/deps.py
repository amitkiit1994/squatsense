"""FastAPI dependency injection: DB sessions and current user."""
from __future__ import annotations

from typing import AsyncGenerator
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings
from backend.db.engine import AsyncSessionLocal as async_session_factory

security = HTTPBearer(auto_error=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Yield an async DB session, rolling back on error."""
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def get_current_user_id(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> UUID:
    """Extract and validate user_id from JWT access token."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = credentials.credentials
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        user_id: str | None = payload.get("sub")
        token_type: str | None = payload.get("type")
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: missing subject",
            )
        # Reject league tokens — they must not authenticate as FreeForm users
        if token_type == "league":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type",
            )
        return UUID(user_id)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )


async def get_current_user(
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Load the full User ORM object for the authenticated user."""
    from backend.models.user import User

    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    return user


async def get_league_player_id(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> UUID:
    """Extract and validate player_id from a league JWT access token."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = credentials.credentials
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        player_id: str | None = payload.get("sub")
        token_type: str | None = payload.get("type")
        if player_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: missing subject",
            )
        if token_type != "league":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type for league",
            )
        return UUID(player_id)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )


async def get_optional_league_player_id(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> UUID | None:
    """Extract player_id from league JWT if present, otherwise return None."""
    if credentials is None:
        return None
    token = credentials.credentials
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        player_id: str | None = payload.get("sub")
        token_type: str | None = payload.get("type")
        if player_id is None or token_type != "league":
            return None
        return UUID(player_id)
    except JWTError:
        return None
