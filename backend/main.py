"""FastAPI application factory for SquatSense backend."""
from __future__ import annotations

import logging
import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware

from backend.config import settings
from backend.db.engine import init_db

# ── Sentry ──────────────────────────────────────────────────────────────────
_sentry_dsn = os.getenv("SENTRY_DSN")
if _sentry_dsn:
    try:
        import sentry_sdk
        sentry_sdk.init(dsn=_sentry_dsn, traces_sample_rate=0.1)
        logging.getLogger("squatsense").info("Sentry initialized")
    except ImportError:
        logging.getLogger("squatsense").warning("sentry-sdk not installed — skipping Sentry init")

logger = logging.getLogger("squatsense")

# ── Configure logging level for all backend loggers ───────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s [%(name)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
# Reduce noise from third-party libs
logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)

# ── Rate limiter ─────────────────────────────────────────────────────────
from backend.rate_limit import limiter  # noqa: E402


# ── Request logging middleware ────────────────────────────────────────────
class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Log every HTTP request with method, path, status, and duration."""

    async def dispatch(self, request: Request, call_next):
        start = time.monotonic()
        method = request.method
        path = request.url.path
        query = str(request.url.query)
        req_id = f"{method} {path}" + (f"?{query}" if query else "")

        logger.info("→ %s (started)", req_id)
        try:
            response = await call_next(request)
            elapsed = (time.monotonic() - start) * 1000
            logger.info(
                "← %s %d (%.0fms)", req_id, response.status_code, elapsed
            )
            return response
        except Exception as exc:
            elapsed = (time.monotonic() - start) * 1000
            logger.error(
                "✗ %s EXCEPTION after %.0fms: %s", req_id, elapsed, exc
            )
            raise


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Run DB init on startup."""
    logger.info("Starting FreeForm Fitness backend")
    await init_db()
    logger.info("Database initialized")
    yield
    logger.info("Shutting down FreeForm Fitness backend")


def create_app() -> FastAPI:
    app = FastAPI(
        title="FreeForm Fitness API",
        version="1.0.0",
        description="Movement Intelligence Platform API",
        lifespan=lifespan,
    )

    # Rate limiting
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    # Request logging (added first so it wraps everything)
    app.add_middleware(RequestLoggingMiddleware)

    # CORS — restrict to configured origins, specific methods & headers
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "Accept"],
    )

    # Import and include routers
    from backend.routers import (
        analytics,
        analysis,
        auth,
        coach,
        exercises,
        league,
        league_auth,
        live,
        sessions,
        users,
        waitlist,
    )

    api_prefix = "/api/v1"
    app.include_router(auth.router, prefix=api_prefix)
    app.include_router(users.router, prefix=api_prefix)
    app.include_router(exercises.router, prefix=api_prefix)
    app.include_router(sessions.router, prefix=api_prefix)
    app.include_router(analysis.router, prefix=api_prefix)
    app.include_router(live.router, prefix=api_prefix)
    app.include_router(analytics.router, prefix=api_prefix)
    app.include_router(coach.router, prefix=api_prefix)
    app.include_router(waitlist.router, prefix=api_prefix)
    app.include_router(league_auth.router, prefix=api_prefix)
    app.include_router(league.router, prefix=api_prefix)

    @app.get("/api/v1/health")
    async def health():
        from sqlalchemy import text
        from backend.db.engine import AsyncSessionLocal

        try:
            async with AsyncSessionLocal() as session:
                await session.execute(text("SELECT 1"))
            return {"status": "ok", "database": "connected"}
        except Exception as exc:
            logger.error("Health check failed: %s", exc)
            return JSONResponse(
                status_code=503,
                content={"status": "degraded", "database": "unreachable"},
            )

    return app


app = create_app()
