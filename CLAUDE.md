# FreeForm Fitness / SquatSense — Claude Code Instructions

## Product Context

This is **F3 FreeForm Fitness** — the world's first AI-native movement intelligence platform for fitness. Two user-facing products, one shared backend:

1. **SquatSense** (`squatsense-web/`) — Free viral 30-second squat blitz game with kiosk + personal play modes. Complete and production-ready. Deployed at `squatsense.ai`.
2. **FreeForm Fitness** (`frontend/`) — Full AI-powered training platform with real-time biomechanical analysis, 8 exercises, fatigue modeling, AI coaching, adaptive programming. B2C app + B2B gym licensing. Deployed at `freeformfitness.ai`.

**These are completely separate user-facing products. No CTAs between them. No account linking. No shared UI. One shared backend.**

Key differentiator: Real-time, per-rep biomechanical analysis using only a camera — no wearables, no hardware. Scores depth, stability, symmetry, tempo, and ROM for every rep.

## Architecture

```
squatsense/
├── backend/              # Shared FastAPI backend (Python 3.12)
│   ├── core/             # Pose detection, biomechanics engines, rep detection
│   │   └── exercises/    # 8 exercise-specific biomechanical models
│   ├── services/         # Business logic (scoring, fatigue, programming, load rec)
│   ├── routers/          # 11 API routers under /api/v1
│   ├── models/           # SQLAlchemy ORM models (async, UUID PKs)
│   ├── schemas/          # Pydantic v2 request/response DTOs
│   ├── db/               # Async engine + Alembic migrations
│   ├── ai/               # AI coach (OpenAI/Anthropic LLM integration)
│   ├── tests/            # pytest + pytest-asyncio (in-memory SQLite)
│   ├── config.py         # Pydantic Settings (env vars)
│   ├── deps.py           # Dependency injection (get_db, auth)
│   ├── main.py           # FastAPI app factory
│   └── rate_limit.py     # slowapi rate limiter
├── squatsense-web/       # SquatSense frontend (Next.js 16, React 19, TS 5, Tailwind 4)
├── frontend/             # FreeForm Fitness frontend (Next.js, React 19, TS 5, Tailwind)
├── scripts/              # Utility scripts (db seeding)
└── .github/workflows/    # CI/CD (pytest + tsc + deploy)
```

## Tech Stack

### Backend
- **Python 3.12**, FastAPI, async-first throughout
- **SQLAlchemy 2.0+** with `Mapped[]` type hints, `mapped_column()`, `select()` queries (NOT legacy `.query()`)
- **PostgreSQL 16** via asyncpg (async driver), aiosqlite for tests
- **Alembic** for migrations (`backend/db/migrations/`)
- **Pydantic v2** with `BaseSettings` for config, `BaseModel` for schemas
- **MediaPipe** for pose detection, **OpenCV** (headless) for CV
- **JWT auth** (python-jose), bcrypt passwords, rate limiting (slowapi)
- **Sentry** for error tracking, **gunicorn + uvicorn** in production

### Frontend (both apps)
- **Next.js 16** with App Router, React 19, TypeScript 5 (strict)
- **Tailwind CSS 4** for styling
- **MediaPipe Tasks Vision** for client-side pose detection
- **PostHog** analytics, **Sentry** error tracking
- Path alias: `@/` maps to `./src/*`
- API calls use relative paths (`/api/v1/...`) via Next.js rewrites

### Infrastructure
- **Railway** for backend, **Vercel** for frontends
- **Docker** (python:3.12-slim) for backend containerization
- **docker-compose** for local dev (PostgreSQL + backend)
- CI/CD: GitHub Actions (pytest, tsc, build checks)

## Key Conventions

### Python (Backend)
- Always start files with `from __future__ import annotations`
- Imports: stdlib → third-party → local (`from backend.*`), alphabetical within groups
- All route handlers and DB operations are `async`
- Use `Depends()` for dependency injection (get_db, get_current_user_id)
- Logger per module: `logger = logging.getLogger(__name__)` — use `%s` formatting, NOT f-strings in log calls
- UUID primary keys everywhere (PostgreSQL `UUID(as_uuid=True)`)
- Timestamps always timezone-aware: `DateTime(timezone=True)`
- HTTP status via constants: `status.HTTP_404_NOT_FOUND`, not magic numbers
- Private helpers prefixed with `_` (e.g., `_build_session_response()`)
- Section dividers in code: `# ── Section Name ────`

### TypeScript (Frontend)
- `"use client"` directive for client components
- Type imports: `import type { ... }` for TypeScript types
- Constants: `UPPER_SNAKE_CASE` (e.g., `MIN_FORM_THRESHOLD`)
- Components: PascalCase, hooks: `use` prefix (e.g., `useWebSocket`)
- Dark theme: #0a0a0a background, #00ff88 neon green accent (SquatSense)
- No emojis in code or UI text

### Schemas & API
- Request schemas: `*Create`, `*Request` (e.g., `SessionCreate`, `CreateTeamRequest`)
- Response schemas: `*Response` (e.g., `SessionResponse`, `TeamResponse`)
- All API routes under `/api/v1` prefix
- Field validation with `ge=`, `le=` constraints, `Field(description=...)`

### Database
- Models use modern SQLAlchemy 2.0 style with `Mapped[]` and `mapped_column()`
- Relationships use `lazy="selectin"` for async-compatible eager loading
- Queries use `select()` + `await db.execute()` pattern
- JSONB columns for flexible data (risk_markers, training_max, injury_history)
- Composite indexes in `__table_args__`

## Development

### Local Setup
```bash
docker-compose up          # PostgreSQL + backend on :8000
cd squatsense-web && npm run dev  # SquatSense frontend on :3001
cd frontend && npm run dev        # FreeForm frontend on :3000
```

### Running Tests
```bash
# Backend
cd backend && python -m pytest tests/ -v

# Frontend type check
cd squatsense-web && npx tsc --noEmit
```

### Database Migrations
```bash
# Create migration
alembic revision --autogenerate -m "description"

# Apply migrations
alembic upgrade head
```

### Environment Variables
Key vars (see `.env`): `DATABASE_URL`, `JWT_SECRET_KEY`, `CORS_ORIGINS`, `AI_COACH_ENABLED`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `SENTRY_DSN`, `ALLOWED_EMAILS`, `FRONTEND_URL`

## Two Auth Systems
- **FreeForm auth** (`routers/auth.py`, `deps.py:get_current_user_id`): JWT HS256, 15min access + 7-day single-use refresh, invite-only via `ALLOWED_EMAILS`
- **League auth** (`routers/league_auth.py`, `deps.py:get_league_player_id`): League JWT with `type: "league"`, 30-day expiry, anonymous join + optional email registration

## Product Phases

Understanding what is built vs what is NOT built prevents Claude from generating code for non-existent features.

| Phase | Status | What It Covers |
|-------|--------|----------------|
| Phase 0 | NOW | Deploy everything — no new code, deployment only |
| Phase 1 | NOW | SquatSense kiosk rollout (5 locations) + FreeForm invite-only beta |
| Phase 2 | NEXT | FreeForm open registration, Stripe integration, B2B gym go-live |
| Phase 3 | FUTURE (post-fundraise) | Dual-camera per station, pose fusion, gym admin dashboard |
| Phase 4 | FUTURE (post-fundraise) | Coach dashboard, remote form feedback, team analytics |
| Phase 5 | FUTURE | Aggregate movement data, population benchmarks, predictive injury modeling |

**Currently building: Phase 0-1 only.** Phases 3-5 are R&D concepts — no code exists for them.

## SquatSense Play Modes

- **Personal Play** — User opens browser on phone/laptop, does 30s squat blitz solo, gets scored
- **Kiosk/Arena** — TV in gym/office displays leaderboard via `/arena/[code]`, users join queue via QR code on phone (`/kiosk-join/[code]`), take turns doing blitz on the kiosk camera

## Router-to-Product Mapping

| Router | Product |
|--------|---------|
| `auth.py`, `users.py`, `sessions.py`, `analysis.py`, `analytics.py`, `coach.py`, `exercises.py`, `waitlist.py` | FreeForm |
| `league.py`, `league_auth.py` | SquatSense |
| `live.py` (WebSocket) | Both |

## Video Upload Analysis

FreeForm supports async video upload analysis (`routers/analysis.py`): users upload mp4/mov/avi/webm/mkv (max 100MB), backend processes asynchronously via thread pool, results stored in `AnalysisJob` model. Job polling via 202/200/500 status codes. In-memory cache (200 entries).

## Frontend Differences

| Aspect | SquatSense (`squatsense-web/`) | FreeForm (`frontend/`) |
|--------|-------------------------------|------------------------|
| PWA | No (standard web app) | Yes (`manifest.json`, service worker) |
| Theme | Dark (#0a0a0a) + neon green (#00ff88) | Dark theme, professional styling |
| Auth | Anonymous join + optional registration | Invite-only, email-gated |
| Analytics | PostHog (9 events) | PostHog + full analytics dashboard |

## What NOT to Do
- Do NOT add links, CTAs, or references between SquatSense and FreeForm products
- Do NOT use the legacy SQLAlchemy `.query()` API — use `select()` statements
- Do NOT use f-strings in logger calls — use `%s` formatting for lazy evaluation
- Do NOT add emojis to code, comments, or UI unless explicitly asked
- Do NOT create unnecessary abstractions — this codebase favors explicit, direct code
- Do NOT modify `.env` files — they contain secrets
- Do NOT build or reference Phase 3/4/5 features (dual-camera, coach dashboard, data platform) — they do not exist yet

## Planning Documents (in `docs/`, gitignored)
- `docs/PRODUCT_PLAN.md` — Full PRD with technical architecture
- `docs/GTM_PLAN.md` — Go-to-market strategy
- `docs/REVENUE_MODEL.md` — Financial projections and business model
- `docs/TECHNOLOGY_INVESTMENT_ESTIMATE.md` — Tech cost breakdown for investors
