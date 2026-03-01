"""Async SQLAlchemy engine, session factory, and FastAPI dependency."""

import logging
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy import event

from backend.config import settings
from backend.db.base import Base

logger = logging.getLogger("squatsense.db")

# Railway (and other PaaS) provide DATABASE_URL as postgresql://...
# SQLAlchemy async requires the asyncpg driver prefix.
_db_url = settings.DATABASE_URL
if _db_url.startswith("postgresql://"):
    _db_url = _db_url.replace("postgresql://", "postgresql+asyncpg://", 1)

engine = create_async_engine(
    _db_url,
    echo=False,
    pool_size=10,
    max_overflow=5,
    pool_timeout=10,
    pool_recycle=300,
    pool_pre_ping=True,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

# ── Pool event logging ────────────────────────────────────────────────────
@event.listens_for(engine.sync_engine, "checkout")
def _on_checkout(dbapi_conn, connection_record, connection_proxy):
    pool = engine.sync_engine.pool
    logger.debug(
        "DB pool checkout: size=%d, checkedout=%d, overflow=%d",
        pool.size(), pool.checkedout(), pool.overflow(),
    )


@event.listens_for(engine.sync_engine, "checkin")
def _on_checkin(dbapi_conn, connection_record):
    pool = engine.sync_engine.pool
    logger.debug(
        "DB pool checkin: size=%d, checkedout=%d, overflow=%d",
        pool.size(), pool.checkedout(), pool.overflow(),
    )


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that yields an async database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def init_db() -> None:
    """Create all tables defined on the declarative Base."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
