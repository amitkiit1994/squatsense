# Backend — Shared FastAPI Service

This backend serves both SquatSense and FreeForm Fitness. All routes are under `/api/v1`.

## Quick Reference

| Directory | Purpose |
|-----------|---------|
| `core/` | Pose detection, biomechanics, rep counting — pure computation, no I/O |
| `core/exercises/` | 8 exercise-specific models inheriting from `base.py` |
| `services/` | Business logic — scoring, fatigue, load rec, programming |
| `routers/` | 11 API routers — HTTP/WebSocket handlers |
| `models/` | SQLAlchemy ORM models (Mapped[], UUID PKs) |
| `schemas/` | Pydantic v2 request/response DTOs |
| `db/` | Async engine, session factory, Alembic migrations |
| `ai/` | LLM-powered AI coach (OpenAI/Anthropic) |
| `tests/` | pytest-asyncio with in-memory SQLite |

## Which Product Uses What

| Router | Product |
|--------|---------|
| `auth.py`, `users.py`, `sessions.py`, `analysis.py`, `analytics.py`, `coach.py`, `exercises.py`, `waitlist.py` | FreeForm |
| `league.py`, `league_auth.py` | SquatSense |
| `live.py` (WebSocket) | Both |

## Running

```bash
python -m pytest tests/ -v          # tests
alembic revision --autogenerate -m "desc"  # new migration
alembic upgrade head                # apply migrations
```
