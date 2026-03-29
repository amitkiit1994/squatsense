# F3 FreeForm Fitness

The world's first AI-native movement intelligence platform for fitness. Real-time, per-rep biomechanical analysis using only a camera -- no wearables, no hardware.

## Products

### SquatSense ([squatsense.ai](https://squatsense.ai))

Free viral 30-second squat blitz game. Two play modes:

- **Personal Play** -- Open browser on phone/laptop, do a 30s squat blitz solo, get scored
- **Kiosk/Arena** -- TV in gym/office displays leaderboard, users join queue via QR code, take turns on the kiosk camera

### FreeForm Fitness ([freeformfitness.ai](https://freeformfitness.ai))

Full AI-powered training platform with real-time biomechanical analysis across 8 exercises, fatigue modeling, AI coaching, and adaptive programming. Invite-only beta.

## Architecture

```
squatsense/
├── backend/              # Shared FastAPI backend (Python 3.12)
│   ├── core/             # Pose detection, biomechanics, rep counting
│   │   └── exercises/    # 8 exercise-specific models
│   ├── services/         # Scoring, fatigue, load rec, programming
│   ├── routers/          # API routers under /api/v1
│   ├── models/           # SQLAlchemy ORM models
│   ├── schemas/          # Pydantic v2 DTOs
│   ├── db/               # Async engine + Alembic migrations
│   ├── ai/               # AI coach (OpenAI/Anthropic)
│   └── tests/            # pytest + pytest-asyncio
├── squatsense-web/       # SquatSense frontend (Next.js 16, React 19, TS 5, Tailwind 4)
├── frontend/             # FreeForm Fitness frontend (Next.js 16, React 19, TS 5, Tailwind 4)
└── scripts/              # Utility scripts
```

## Tech Stack

| Layer | Stack |
|-------|-------|
| Backend | Python 3.12, FastAPI, async SQLAlchemy 2.0, PostgreSQL 16, Alembic |
| Frontend | Next.js 16, React 19, TypeScript 5 (strict), Tailwind CSS 4 |
| ML/CV | MediaPipe Pose (33 landmarks), OpenCV (headless), NumPy |
| Infra | Railway (backend), Vercel (frontends), Docker, GitHub Actions CI/CD |
| Monitoring | Sentry (errors), PostHog (analytics) |

## Key Capabilities

- **Real-time pose detection** at ~12 FPS via WebSocket using MediaPipe 33-landmark model
- **6-dimensional rep scoring** -- depth, stability, symmetry, tempo, ROM, composite (0-100)
- **Fatigue modeling** -- rep-over-rep form degradation tracking with risk classification
- **Adaptive programming** -- periodized workout plans (accumulation/intensification/realization)
- **AI coaching** -- LLM-powered feedback with corrective drills and recovery suggestions
- **8 exercises** -- squat, deadlift, bench press, overhead press, lunge, pullup, row, pushup

## Development

### Prerequisites

- Python 3.12+
- Node.js 20+
- PostgreSQL 16 (or use docker-compose)

### Local Setup

```bash
# Backend + PostgreSQL
docker-compose up

# SquatSense frontend (port 3001)
cd squatsense-web && npm install && npm run dev

# FreeForm Fitness frontend (port 3000)
cd frontend && npm install && npm run dev
```

### Running Tests

```bash
# Backend tests (231 tests, in-memory SQLite)
cd backend && python -m pytest tests/ -v

# Frontend type check
cd squatsense-web && npx tsc --noEmit
cd frontend && npx tsc --noEmit
```

### Database Migrations

```bash
alembic revision --autogenerate -m "description"
alembic upgrade head
```

### Environment Variables

Key vars (see `.env`): `DATABASE_URL`, `JWT_SECRET_KEY`, `CORS_ORIGINS`, `AI_COACH_ENABLED`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `SENTRY_DSN`, `FRONTEND_URL`

## API Overview

All routes under `/api/v1`. Two auth systems:

| System | Product | Token | Expiry |
|--------|---------|-------|--------|
| FreeForm JWT | FreeForm Fitness | HS256 access + refresh | 15min + 7 days |
| League JWT | SquatSense | HS256 with `type: "league"` | 30 days |

### Router Mapping

| Router | Product |
|--------|---------|
| `auth`, `users`, `sessions`, `analysis`, `analytics`, `coach`, `exercises`, `waitlist` | FreeForm |
| `league`, `league_auth` | SquatSense |
| `live` (WebSocket) | Both |

## Deployment

- **Backend**: Railway (Docker, `Dockerfile.backend`)
- **SquatSense**: Vercel (`squatsense-web/`)
- **FreeForm**: Vercel (`frontend/`)
- **CI/CD**: GitHub Actions -- pytest, tsc, deploy checks

## License

Proprietary. All rights reserved.
