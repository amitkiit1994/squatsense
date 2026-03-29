# SquatSense Frontend — Next.js

Free 30-second squat blitz game. Separate product from FreeForm Fitness — no cross-linking.

## Directory Structure

| Directory | Purpose |
|-----------|---------|
| `src/app/` | App Router pages (13 routes) |
| `src/components/` | Shared components (Navbar, AnalyticsInit) |
| `src/hooks/` | useWebSocket, useCamera, usePoseCalibration |
| `src/lib/` | API client, auth, analytics, ranks, types, WebSocket helpers |

## Route Map

| Route | What it does |
|-------|-------------|
| `/` | Landing page — "MOVE MORE. MOVE BETTER." |
| `/join` | Anonymous join with nickname |
| `/register` | Sign up / log in (dual tab) |
| `/play` | 30s squat blitz with real-time scoring |
| `/arena/[code]` | Kiosk TV display — leaderboard + spectator view |
| `/kiosk-join/[code]` | Phone QR scan to join kiosk queue |
| `/results` | Animated score, stats, shareable card |
| `/leaderboard` | Period-filtered rankings |
| `/profile` | Player stats, rank progression, history |
| `/setup` | Create/join team for office kiosk |
| `/reset-password` | Token-based password reset |
| `/verify-email` | Email verification callback |

## Key Infrastructure
- **Auth**: League JWT (30-day), stored in localStorage (`src/lib/auth.ts`)
- **Analytics**: PostHog via `src/lib/analytics.ts` (9 events)
- **Pose Detection**: MediaPipe Tasks Vision (client-side)
- **WebSocket**: Real-time pose data via `src/hooks/useWebSocket.ts`
- **Theme**: Dark (#0a0a0a) + neon green (#00ff88)
- **NOT a PWA** — no manifest.json, no service worker

## Conventions
- `"use client"` on all interactive components
- API calls via `src/lib/api.ts` with Bearer token auth
- Rank system: Bronze (0-499), Silver (500-1999), Gold (2000-4999), Elite (5000+)
- CSP headers configured in `next.config.ts`
