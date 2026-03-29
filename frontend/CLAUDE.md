# FreeForm Fitness Frontend — Next.js

Full AI-powered training platform. Separate product from SquatSense — no cross-linking.

## Directory Structure

| Directory | Purpose |
|-----------|---------|
| `src/app/` | App Router pages (grouped routes) |
| `src/app/(app)/` | Authenticated app pages |
| `src/app/(auth)/` | Login, auth flows |
| `src/components/` | Layout and UI components |
| `src/hooks/` | useAuth, useCamera, useWebSocket |
| `src/lib/` | API client, auth, types, utils, WebSocket helpers |

## Key Infrastructure
- **Auth**: FreeForm JWT (15min access + 7-day refresh), invite-only via ALLOWED_EMAILS
- **PWA**: Yes — manifest.json + service worker
- **Analytics**: PostHog + full analytics dashboard
- **Pose Detection**: MediaPipe Tasks Vision (client-side)
- **WebSocket**: Real-time biomechanical analysis via `src/hooks/useWebSocket.ts`
- **SEO**: Dynamic sitemap.ts + robots.ts

## Conventions
- `"use client"` on all interactive components
- API calls via `src/lib/api.ts` using `apiFetch<T>()`
- Dark theme, professional styling
- Type imports: `import type { ... }`
- Path alias: `@/` maps to `./src/*`

## Current Phase
- Phase 1: Invite-only beta (NOW)
- Phase 2: Open registration + Stripe (NEXT)
- Pages for waitlist landing, onboarding, privacy policy are built
