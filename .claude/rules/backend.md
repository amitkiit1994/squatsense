---
paths: ["backend/**/*.py"]
---

# Backend Python Rules (FastAPI + SQLAlchemy)

## Imports
- First line: `from __future__ import annotations`
- Order: stdlib, third-party, local (`from backend.*`), alphabetical within groups
- Use `# noqa: E402` only when import order is forced by runtime needs

## Async
- ALL route handlers must be `async def`
- ALL database operations use `AsyncSession` from `sqlalchemy.ext.asyncio`
- Use `await db.execute(stmt)` for queries, never synchronous calls
- Dependencies return `AsyncGenerator[AsyncSession, None]`

## SQLAlchemy (2.0+ style ONLY)
- Models use `Mapped[T]` type hints with `mapped_column()`
- Queries use `select()` — NEVER use legacy `.query()` API
- Relationships use `lazy="selectin"` for async-compatible eager loading
- UUID primary keys: `UUID(as_uuid=True)` from `sqlalchemy.dialects.postgresql` (exception: `AnalysisJob` uses `String(32)` hex IDs for JSON-friendly job polling)
- Timestamps: `DateTime(timezone=True)` with `server_default=func.now()`
- JSONB for flexible data structures
- Composite indexes in `__table_args__`

## Pydantic v2 Schemas
- Request DTOs: `*Create` or `*Request` suffix
- Response DTOs: `*Response` suffix
- Use `Field(description=..., ge=..., le=...)` for validation
- Optional fields: `Optional[T] = Field(default=None, ...)`

## Routers
- `router = APIRouter(prefix="/resource", tags=["resource"])`
- Auth via `Depends(get_current_user_id)` or `Depends(get_league_player_id)`
- DB via `Depends(get_db)` — auto-commits on success, auto-rollbacks on error
- Status codes via constants: `status.HTTP_404_NOT_FOUND`
- Private helpers prefixed with `_`

## Logging
- `logger = logging.getLogger(__name__)`
- Use `%s` formatting: `logger.info("Created %s", entity.id)` — NOT f-strings
- Levels: info for significant events, debug for details, warning for degraded state

## Error Handling
- Raise `HTTPException(status_code=..., detail="...")` for client errors
- Let unexpected exceptions propagate to Sentry
- Rate limiting via `@limiter.limit()` decorator

## Auth Context
- FreeForm users: `get_current_user_id()` returns `UUID`, JWT with 15min expiry
- League players: `get_league_player_id()` returns `UUID`, JWT with `type: "league"`
- These are separate auth systems — do not mix them

## Code Style
- Section dividers: `# ── Section Name ────`
- No emojis in code or comments
- Type hints on all function signatures
