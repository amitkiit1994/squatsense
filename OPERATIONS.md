# Operations Runbook — SquatSense + FreeForm Fitness

Production operations guide for the shared backend and both frontend deployments.

## Architecture Overview

```
                    ┌─────────────────┐
                    │   Vercel CDN    │
                    ├─────────┬───────┤
                    │SquatSense│FreeForm│
                    │  :3001   │ :3000  │
                    └────┬─────┴───┬───┘
                         │         │
                    ┌────▼─────────▼────┐
                    │  Railway Backend  │
                    │  FastAPI :8000    │
                    │  (single worker)  │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │  PostgreSQL 16   │
                    │  (Railway addon) │
                    └──────────────────┘
```

## Health Checks

**Backend**: `GET /api/v1/health`
- Returns `{"status": "ok", "database": "connected"}` (200) when healthy
- Returns `{"status": "degraded", "database": "unreachable"}` (503) when DB is down
- Docker HEALTHCHECK polls every 30s with 15s startup grace

**Frontend**: Vercel handles health automatically via serverless deployment.

## Database

**Migrations** run automatically on deploy via Dockerfile CMD (`alembic upgrade head` before server start).

**Manual migration**:
```bash
cd squatsense
alembic revision --autogenerate -m "description_in_snake_case"
alembic upgrade head
```

**Backup** (requires pg_dump + access to production DB):
```bash
PGHOST=<railway-host> PGPORT=<port> PGUSER=postgres PGPASSWORD=<pwd> PGDATABASE=squatsense \
  ./scripts/backup_db.sh
```

## Environment Variables

See `backend/.env.example` for the full list. Critical production vars:

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | Yes | Railway provides this automatically |
| `JWT_SECRET_KEY` | Yes | Min 32 chars. Generate: `openssl rand -hex 32` |
| `CORS_ORIGINS` | Yes | Must include both frontend domains |
| `FRONTEND_URL` | Yes | Used in email links |
| `SQUATSENSE_URL` | Yes | Used in email links |
| `SENTRY_DSN` | Recommended | Error tracking |
| `RESEND_API_KEY` | Recommended | Transactional emails |

## Secrets Rotation

**JWT_SECRET_KEY**: Rotating invalidates all active sessions. Coordinate with low-traffic window.
1. Generate new key: `openssl rand -hex 32`
2. Update in Railway environment variables
3. Redeploy backend (automatic via Railway)
4. Users will need to re-authenticate (15min access tokens expire naturally)

**DATABASE_URL**: Managed by Railway. Rotation available via Railway dashboard.

**API keys** (OpenAI, Anthropic, Resend): Update in Railway env vars, redeploy.

## Monitoring

- **Sentry**: Error tracking with FastAPI integration (auto-captures unhandled exceptions)
- **Railway logs**: `railway logs --service backend`
- **Request logging**: Every request logged with method, path, status, and latency
- **Vercel Analytics**: Frontend performance (enable in Vercel dashboard)

## Incident Response

**Backend down**:
1. Check `GET /api/v1/health` — identifies if it's a DB issue
2. Check Railway logs for crash/OOM
3. Railway auto-restarts on crash; manual restart via `railway up`

**Database unreachable**:
1. Check Railway PostgreSQL addon status
2. Verify connection count isn't exhausted (single-worker = 1 connection pool)
3. Restart backend service if pool is stale

**Frontend deploy failed**:
1. Check Vercel build logs
2. Most common: TypeScript errors caught by `tsc --noEmit`
3. Fix locally, push, Vercel auto-redeploys

## Scaling Notes

Current architecture (single gunicorn worker) is intentional: kiosk queue state lives in process memory. For multi-worker scaling:
1. Move kiosk queue to Redis
2. Add Redis connection to config
3. Increase gunicorn workers: `-w $(nproc)`
4. Add Railway Redis addon

This is a Phase 2 concern — current single-worker handles the expected load for 5-10 gym kiosks.
