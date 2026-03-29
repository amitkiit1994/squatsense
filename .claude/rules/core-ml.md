---
paths: ["backend/core/**/*.py"]
---

# Core Biomechanics & ML Engine Rules

## Purpose
This directory contains the movement intelligence engine — pose detection, biomechanical analysis, rep counting, and exercise-specific models. This is the core IP of FreeForm Fitness.

## Architecture
- `pose.py` — MediaPipe 33-landmark detection, 2D + 3D coordinates
- `geometry.py` — Joint angle calculations (3D vector math)
- `frame_metrics.py` — Per-frame biomechanical feature extraction
- `rep_detector.py` — State machine for rep counting with phase transitions (eccentric/pause/concentric)
- `signal.py`, `smoothing.py` — EMA smoothing for noisy pose data
- `exercises/` — 8 exercise-specific models (squat, deadlift, bench, OHP, lunge, pullup, row, pushup)

## Performance
- This code runs in real-time via WebSocket, throttled to ~12 FPS (`MIN_FRAME_INTERVAL = 0.08s` in live.py)
- Minimize allocations in hot paths — reuse arrays where possible
- NumPy vectorized operations over Python loops
- No I/O or database calls in core/ — pure computation only

## Conventions
- Angle functions prefixed: `_angle_deg_3d()`, `_knee_angle_deg_3d()`
- Threshold constants at module level: `CALIBRATION_FRAMES`, `_QUEUE_ENTRY_TTL`
- Exercise configs define: rep signals, depth thresholds, scoring weights, risk markers, coaching cues
- All angles in degrees, all distances normalized to body proportions

## Testing
- Core algorithms should have deterministic unit tests
- Test with known landmark positions and expected outputs
- Edge cases: missing landmarks, single-side visibility, extreme angles

## Modifying Exercises
- Each exercise in `exercises/` inherits from `base.py`
- To add a new exercise: create a new file in `exercises/`, register it in `services/exercise_registry.py`
- Scoring weights and thresholds come from exercise science data — changes should be validated against real movement data
