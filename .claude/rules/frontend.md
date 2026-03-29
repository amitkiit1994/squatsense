---
paths: ["squatsense-web/**/*.{ts,tsx}", "frontend/**/*.{ts,tsx}"]
---

# Frontend Rules (Next.js 16 + React 19 + TypeScript 5)

## Framework
- Next.js 16 App Router — server components by default
- `"use client"` directive required for client components (hooks, state, browser APIs)
- Path alias: `@/` maps to `./src/*` — always use it for imports

## TypeScript
- Strict mode enabled — no `any` types unless absolutely necessary
- Type imports: `import type { Foo } from "..."` for types only
- Export interfaces for hook return types (e.g., `UseWebSocketReturn`)
- Inline props typing for components: `{ children: React.ReactNode }`

## Naming
- Files: kebab-case (e.g., `use-camera.ts`) or camelCase for hooks (`useCamera.ts`)
- Components: PascalCase (e.g., `Navbar`, `AnalyticsInit`)
- Hooks: `use` prefix (e.g., `useWebSocket`, `usePoseCalibration`)
- Constants: `UPPER_SNAKE_CASE` (e.g., `MIN_FORM_THRESHOLD`, `TOKEN_KEY`)
- Functions/variables: camelCase

## State Management
- React hooks: `useState`, `useCallback`, `useRef`, `useEffect`
- localStorage for auth persistence (tokens, player data)
- No external state library — granular `useState` per data point
- WebSocket connections managed via `useRef`

## API Client
- Use `apiFetch<T>()` from `@/lib/api` for typed API calls
- Relative paths: `/api/v1/...` (proxied via Next.js rewrites)
- Bearer token in Authorization header
- 401 responses clear auth and redirect to `/join` (SquatSense) or `/login` (FreeForm)

## Styling
- Tailwind CSS 4 — utility classes, no CSS modules
- SquatSense theme: dark (#0a0a0a background), neon green (#00ff88) accent
- FreeForm theme: follows Tailwind defaults with custom color palette

## Two Separate Apps
- `squatsense-web/` — SquatSense game (kiosk, personal play, leagues)
- `frontend/` — FreeForm Fitness training platform
- These share NO components, NO auth, NO routing between them
- Different deployment targets (both on Vercel, different domains)
