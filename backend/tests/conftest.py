from __future__ import annotations

"""Shared test fixtures for backend API tests.

Uses an in-memory SQLite database (aiosqlite driver) so tests run fast and
don't require a running Postgres instance.  PostgreSQL-specific column types
(UUID, JSONB) are transparently compiled to SQLite-compatible equivalents
via SQLAlchemy compiler-level hooks registered at import time.

Key design decisions:
- The test conftest does NOT set DATABASE_URL to SQLite, because
  ``backend.db.engine`` creates a module-level engine with pool parameters
  that are incompatible with SQLite.  Instead, only the ``get_db``
  dependency is overridden to use a separate, test-only SQLite engine.
- The ``init_db`` lifespan function is patched out so the app never
  tries to connect to the (absent) production Postgres on startup.
"""

import os
import uuid
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from unittest.mock import patch

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# ---------------------------------------------------------------------------
# 1.  Environment variables required *before* any application code is imported
# ---------------------------------------------------------------------------
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-jwt-signing")
# Do NOT override DATABASE_URL here — let the production engine module use
# its default Postgres URL.  We never actually connect through it.

# ---------------------------------------------------------------------------
# 2.  Register SQLite compilation rules for PostgreSQL-only types
#
#     SQLAlchemy's PostgreSQL UUID compiles to CHAR(32) on non-PG dialects
#     by default, but JSONB has no such fallback — we must teach the SQLite
#     compiler how to render it.
# ---------------------------------------------------------------------------
from sqlalchemy.dialects.sqlite.base import SQLiteTypeCompiler  # noqa: E402

if not hasattr(SQLiteTypeCompiler, "visit_JSONB"):
    def _visit_jsonb(self, type_, **kw):  # noqa: ARG001
        return "TEXT"
    SQLiteTypeCompiler.visit_JSONB = _visit_jsonb  # type: ignore[attr-defined]

# ---------------------------------------------------------------------------
# 3.  Now it is safe to import application modules
# ---------------------------------------------------------------------------
from backend.db.base import Base  # noqa: E402
import backend.models  # noqa: E402, F401  -- populate Base.metadata

# ---------------------------------------------------------------------------
# 4.  Test database engine and session factory
# ---------------------------------------------------------------------------
_TEST_DB_URL = "sqlite+aiosqlite:///:memory:"

test_engine = create_async_engine(
    _TEST_DB_URL,
    echo=False,
    connect_args={"check_same_thread": False},
)

TestSessionLocal = async_sessionmaker(
    bind=test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


# ---------------------------------------------------------------------------
# 5.  Dependency override for ``get_db``
# ---------------------------------------------------------------------------
async def _override_get_db() -> AsyncGenerator[AsyncSession, None]:
    """Yield a test database session, rolling back on error."""
    async with TestSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# ---------------------------------------------------------------------------
# 6.  A no-op lifespan to replace the production one (which calls init_db
#     and would try to connect to Postgres).
# ---------------------------------------------------------------------------
@asynccontextmanager
async def _test_lifespan(app):  # noqa: ARG001
    yield


# ---------------------------------------------------------------------------
# 7.  Fixtures
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture(autouse=True)
async def _setup_database() -> AsyncGenerator[None, None]:
    """Create all tables before each test and drop them afterwards."""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def db() -> AsyncGenerator[AsyncSession, None]:
    """Provide a test database session for direct DB access in tests."""
    async with TestSessionLocal() as session:
        yield session


@pytest_asyncio.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    """Provide an ``httpx.AsyncClient`` wired to the FastAPI test app.

    The ``get_db`` dependency from ``backend.deps`` is overridden so that all
    HTTP requests use the in-memory SQLite test database.  The production
    lifespan (which calls ``init_db`` against Postgres) is replaced with a
    no-op so the test app starts without a real database connection.
    """
    from backend.deps import get_db

    # Patch the lifespan so create_app() doesn't try to call init_db()
    with patch("backend.main.lifespan", _test_lifespan):
        from backend.main import create_app

        app = create_app()

    app.dependency_overrides[get_db] = _override_get_db

    # Also override the get_db that's imported directly in backend.db.engine
    # (some routers may import from there instead of backend.deps)
    try:
        from backend.db.engine import get_db as engine_get_db
        app.dependency_overrides[engine_get_db] = _override_get_db
    except ImportError:
        pass

    # Patch AsyncSessionLocal so the health check endpoint uses the test DB
    import backend.db.engine as _engine_mod
    _original_session_local = getattr(_engine_mod, "AsyncSessionLocal", None)
    _engine_mod.AsyncSessionLocal = TestSessionLocal  # type: ignore[attr-defined]

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac

    app.dependency_overrides.clear()

    # Restore original AsyncSessionLocal
    if _original_session_local is not None:
        _engine_mod.AsyncSessionLocal = _original_session_local


@pytest_asyncio.fixture
async def create_player(db: AsyncSession):
    """Factory fixture: create a ``LeaguePlayer`` and return ``(player, token)``.

    Usage::

        player, token = await create_player("CoolNick")
        player, token = await create_player("TeamPlayer", team_id=some_uuid)
    """
    from backend.models.league import LeaguePlayer
    from backend.routers.league_auth import _create_league_token

    async def _factory(
        nickname: str = "TestPlayer",
        *,
        team_id: uuid.UUID | None = None,
        email: str | None = None,
        password_hash: str | None = None,
    ) -> tuple[LeaguePlayer, str]:
        player = LeaguePlayer(
            nickname=nickname,
            team_id=team_id,
            email=email,
            password_hash=password_hash,
        )
        db.add(player)
        await db.commit()
        await db.refresh(player)
        token = _create_league_token(player.id)
        return player, token

    return _factory


@pytest_asyncio.fixture(autouse=True)
async def _clear_kiosk_state() -> AsyncGenerator[None, None]:
    """Reset in-memory kiosk registries between tests."""
    yield
    from backend.routers.league import (
        _kiosk_active,
        _kiosk_queue,
        _kiosk_registry,
        _player_results,
    )
    _kiosk_registry.clear()
    _kiosk_queue.clear()
    _kiosk_active.clear()
    _player_results.clear()
