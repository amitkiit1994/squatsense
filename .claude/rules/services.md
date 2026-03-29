---
paths: ["backend/services/**/*.py"]
---

# Services Layer Rules

## Purpose
Services contain business logic separated from routers. Routers handle HTTP concerns; services handle domain logic.

## Existing Services
- `scoring.py` — Per-rep 6-dimensional scoring (composite, depth, stability, symmetry, tempo, ROM, 0-100)
- `fatigue.py` — Fatigue index (0-100) and fatigue risk (low/moderate/high) from form degradation
- `load_recommender.py` — Load recommendation + goal-based programming (sets/reps/load/rest)
- `programming.py` — Adaptive periodization (accumulation/intensification/realization), deload detection
- `exercise_registry.py` — 8 exercises with configs (rep signals, depth thresholds, scoring weights, risk markers, cues)
- `movement_points.py` — SquatSense points calculation, daily caps, streak multipliers, rank tiers
- `profanity.py` — Nickname profanity filter

## Conventions
- Services are pure functions or stateless classes — no database sessions passed in unless necessary
- When a service needs DB access, accept `AsyncSession` as a parameter (do not import `get_db`)
- Scoring and fatigue calculations must be deterministic given the same inputs
- Threshold constants at module level, not buried in functions
- Exercise science parameters (scoring weights, depth thresholds, fatigue curves) come from Robin's methodology — document the rationale when changing them

## Adding a New Service
1. Create a new file in `backend/services/`
2. Import and use it from the relevant router
3. Add tests in `backend/tests/`
4. Do NOT put HTTP concerns (status codes, HTTPException) in services — return data or raise domain exceptions
