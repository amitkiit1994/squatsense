# Implementation: View-Invariant Squat Angles (3D Pose)

This document describes the implementation plan to make rep detection and angle metrics (knee, trunk, depth) **less dependent on camera angle** by using 3D world landmarks from MediaPipe instead of 2D image coordinates.

---

## 1. Problem Statement

### Current behavior

- **Knee angle** and **depth** (knee flexion) are computed from **2D keypoints** in the image plane (`_angle_deg()` → `_knee_angle_deg()` in `src/reps.py`).
- **Trunk angle** is computed from shoulder-hip midpoints vs image vertical (`_trunk_angle_deg()` in `src/reps.py`).
- **Rep phase** (stand <-> squat) uses normalized hip Y (`_hip_y_norm()`) and "hip below knee" (`_hip_below_knee()`) — both in image coordinates.

### Observed issues

- If the camera is not exactly **side-on**, the **projected** knee angle in the image is smaller than the real 3D knee angle.
- Users must squat **deeper than intended** (e.g. full depth) for a rep to count or for "depth OK" to trigger.
- Knee and trunk angles feel wrong for the same reason: 2D projection varies with viewing angle.

### Root cause

All metrics are **view-dependent** because they use only **(x, y)** in the image. The same 3D squat can yield different 2D angles for different camera positions.

---

## 2. Solution Overview

Use **3D world landmarks** from MediaPipe Pose Landmarker:

- **Coordinate system**: Real-world 3D in **meters**, origin at the **hip center** (MediaPipe convention).
- **Output**: `PoseLandmarkerResult.pose_world_landmarks` — same 33 landmarks as 2D, with **x, y, z**.
- **Use 3D for**:
  - **Knee angle** (hip-knee-ankle) in 3D -> view-invariant flexion.
  - **Trunk angle** (spine vs vertical) in 3D -> view-invariant lean.
  - **Rep phase signal**: Use **3D knee flexion** instead of hip Y (see Section 5.3 for why hip Y in world coords won't work).
  - **Depth / "depth OK"**: Use 3D knee flexion >= 90 deg.
  - **Hip below knee**: Compare hip center Y vs knee mid Y in world coords.

2D keypoints remain for **visualization** (skeleton overlay, bounding box) and as **fallback** when 3D is unavailable.

---

## 3. MediaPipe API Details

### Pose Landmarker (current task API — used in `src/pose.py`)

- **Result**: `result = pose.detect(mp_image)` (see `pose.py:85`)
  - `result.pose_landmarks` — list of normalized 2D landmarks per person `(x, y)` in [0, 1].
  - `result.pose_world_landmarks` — list of **3D world landmarks** per person; each landmark has **x, y, z** in meters.
- **Landmark indices**: Same as `LandmarkIdx` (e.g. 23/24 hip, 25/26 knee, 27/28 ankle, 11/12 shoulder).
- **World origin**: Center between hips; axes are **camera-relative** (not gravity-aligned unless camera is level).

### Legacy API (mp.solutions.pose.Pose)

- `results.pose_landmarks` — 2D normalized.
- `results.pose_world_landmarks` — 3D world (if available in the version in use).

The current code falls back to the legacy API in `create_pose_detector()` (`pose.py:107-117`). The legacy path should extract 3D when available, returning `None` if not.

---

## 4. Data Model Changes

### 4.1 Pose output

**Current**: `process_frame()` returns `Optional[list[tuple[float, float]]]` — 33 points (x, y) in pixel coords (`pose.py:73`).

**Proposed**: Extend `process_frame()` to return a dict:

```python
{
    "keypoints_2d": list[tuple[float, float]],       # pixel coords, as before
    "keypoints_3d": list[tuple[float, float, float]] | None  # meters, hip-centered
}
```

Return `None` (not a dict) when no pose is detected. Existing callers unpack `keypoints_2d` for overlay/smoothing and pass `keypoints_3d` to the rep/metrics pipeline.

This is a single-inference approach (one `pose.detect()` call yields both 2D and 3D).

### 4.2 Rep / metrics pipeline

- **Input**: Per frame, pass **both** `keypoints_2d` and `keypoints_3d` into rep detection and metrics.
- **Fallback**: If `keypoints_3d` is `None` (legacy path or missing `pose_world_landmarks`), use existing 2D logic so behavior is unchanged.

---

## 5. Angle and Metric Math in 3D

### 5.1 Knee angle (3D)

- **Points**: Hip (e.g. left), Knee (left), Ankle (left); same for right.
- **Formula**: Angle at knee = angle between vectors (hip -> knee) and (ankle -> knee) in 3D.
  - `ba = (hip - knee)`, `bc = (ankle - knee)`
  - `cos(angle) = dot(ba, bc) / (|ba| |bc|)`
  - Knee flexion = 180 deg - angle (same convention as current `reps.py:385`).
- Use left/right average or the side with better visibility (e.g. larger limb length in 3D).

### 5.2 Trunk angle (3D)

- **Points**: Shoulder mid, Hip mid.
- **Vertical**: The MediaPipe world coordinate system is **camera-relative**, not gravity-aligned. The Y axis direction depends on camera orientation. **Empirical verification is required** — print raw world landmarks for a known upright pose and confirm which direction is "up" before hardcoding.
  - If the camera is level, `(0, -1, 0)` is likely "up" (MediaPipe convention: Y increases downward in world coords).
  - For robustness, calibrate the "up" vector from the first N standing frames (average trunk direction when standing = "up").
- **Trunk vector**: `(shoulder_mid - hip_mid)`.
- **Angle**: Angle between trunk vector and vertical (dot-product formula). 0 deg = upright; larger = forward lean.

### 5.3 Rep phase signal (3D) — IMPORTANT

**Problem with hip Y in world coords**: The current rep detection (`IncrementalRepDetector`) uses `_hip_y_norm()` — normalized hip Y position in the image — as the primary signal for phase transitions (standing -> descent -> bottom -> ascent -> standing). MediaPipe world landmarks have their **origin at hip center**, so hip Y in world coords is always near 0 regardless of squat depth. This makes world hip Y **useless** as a rep phase signal.

**Solution**: When 3D is available, use **3D knee flexion angle** as the rep phase signal instead of hip Y:

- **Standing**: knee flexion < ~35 deg (matches current `STANDING_KNEE_FLEXION_MAX`).
- **Bottom**: knee flexion at local maximum (deepest point).
- **Phase thresholds**: Calibrate from the first N standing frames (baseline knee flexion), then detect descent/ascent by knee flexion rising above / falling below adaptive thresholds.

This replaces the hip-Y-based sliding window with a knee-flexion-based sliding window. The signal shape is similar (low at standing, high at bottom) so the existing `find_peaks` logic can be reused with minimal changes.

**Fallback**: When 3D is not available, use the existing `_hip_y_norm()` 2D signal (no behavior change).

### 5.4 Depth / "depth OK" (3D)

- Use **knee flexion in 3D** >= `PARALLEL_KNEE_FLEXION_DEG` (90 deg) for "depth OK".
- **Hip below knee** in 3D: compare hip center Y vs knee mid Y in world coords. Since the origin is at hip center, hip Y ~ 0 and knee Y will be negative (above) or positive (below) depending on axis direction. Use the same relative comparison as current but in meters.

### 5.5 Balance / COM (keep 2D)

- **Current**: COM proxy and balance margin in 2D image (`_com_proxy()`, `_balance_metrics()` in `reps.py`).
- **Decision**: Keep COM/balance on **2D only**. These metrics are primarily for overlay feedback and don't suffer as much from view dependence. Converting to 3D is optional and can be done later.

---

## 6. File-by-File Implementation Plan

### 6.1 `src/pose.py`

| Task | Description |
|------|-------------|
| Extend `process_frame()` return type | After `pose.detect()`, read `result.pose_world_landmarks`; if present, convert to list of `(x, y, z)` in meters. Return `{"keypoints_2d": [...], "keypoints_3d": [...] or None}`. Return `None` when no pose detected. |
| Legacy path | For `mp.solutions.pose.Pose`, read `results.pose_world_landmarks` if available; else `keypoints_3d = None`. |
| Constants | Reuse existing `LandmarkIdx` for 3D (same indices). |

### 6.2 `src/reps.py`

| Task | Description |
|------|-------------|
| Add 3D geometry helpers | `_get_point_3d(kp3d, idx)` -> `Optional[tuple[float,float,float]]`; `_midpoint_3d(a, b)`; `_angle_deg_3d(a, b, c)` using 3D dot product and cross product norms. |
| Add 3D metric functions | `_knee_angle_deg_3d(kp3d)` (avg left/right), `_trunk_angle_deg_3d(kp3d, up_vector)`, `_hip_below_knee_3d(kp3d)`, `_knee_flexion_signal_3d(kp3d)` (for rep phase). |
| Add `_pose_valid_3d()` | Validate 3D keypoints: check required landmarks exist, limb lengths are in a reasonable range (e.g. 0.1-2.0 m), no NaN values. Mirrors `_pose_valid()` for 2D. |
| Update `compute_frame_metrics()` | Add `keypoints_3d=None` parameter. When `keypoints_3d` is not None and valid, use 3D helpers for knee angle, trunk angle, hip-below-knee. Keep COM/balance on 2D. |
| Update `IncrementalRepDetector.push()` | Add `keypoints_3d=None` parameter. When 3D is available, use **3D knee flexion** as the rep phase signal (replaces `_hip_y_norm()`). Store 3D keypoints in buffer alongside 2D. Apply same sliding-window peak detection on the knee flexion signal. Fall back to hip-Y-based logic when 3D is `None`. |
| Update `detect_reps_batch()` | Add `keypoints_3d_series=None` parameter. When 3D series is provided, build the rep signal from 3D knee flexion instead of `_hip_y_norm()`. Pass 3D keypoints to `compute_frame_metrics()` at bottom frames. |
| Update `smooth_keypoints_ema()` | Add a `smooth_keypoints_ema_3d()` variant that smooths `(x, y, z)` tuples, or make the existing function generic to handle both 2D and 3D (check tuple length). |
| Baseline | During calibration, compute and store 3D trunk angle baseline alongside 2D. Use 3D baseline when 3D metrics are active. |

### 6.3 `src/overlay.py` (no changes)

Overlay functions (`draw_skeleton`, `draw_realtime_overlay`, `draw_overlay_batch`) use 2D pixel-coordinate keypoints for drawing. **No changes needed** — continue passing `keypoints_2d` to all overlay functions.

### 6.4 `src/live.py`

| Task | Description |
|------|-------------|
| Unpack pose result | `process_frame()` now returns a dict. Unpack `keypoints_2d` and `keypoints_3d`. |
| Smoothing | Apply `smooth_keypoints_ema()` to `keypoints_2d` (as now). Apply 3D smoothing to `keypoints_3d` if present. |
| Rep detector | Call `rep_detector.push(frame_idx, kp_2d, fps, keypoints_3d=kp_3d)`. |
| Overlay | Pass `keypoints_2d` to `draw_realtime_overlay()` (unchanged). |
| Keypoint serialization | When saving `live_keypoints.json`, optionally include 3D keypoints: `[[x, y, z], ...]` alongside existing `[[x, y], ...]`. |

### 6.5 `web_app.py` (project root, not in `src/`)

| Task | Description |
|------|-------------|
| Unpack pose result | In `_process_frame_sync()` and the WebSocket handler, unpack `keypoints_2d` and `keypoints_3d` from `process_frame()`. |
| Smoothing | Apply 2D smoothing for overlay; 3D smoothing for rep detection. |
| Rep detector | Pass `keypoints_3d` to `rep_detector.push()`. |
| Overlay data | Continue sending normalized 2D keypoints over WebSocket for client-side skeleton drawing. |
| Serialization | When saving keypoints on stop, include 3D data if available. |

### 6.6 `run.py` (project root)

| Task | Description |
|------|-------------|
| Unpack pose result | In `run_offline()`, unpack dict from `process_frame()`. |
| Batch detection | Pass `keypoints_3d_series` to `detect_reps_batch()`. |
| Serialization | Include 3D keypoints in `offline_keypoints.json` if available. |

### 6.7 `src/decision.py` (no changes expected)

`decision.py` consumes metrics JSON (rep dicts with `knee_flexion_deg`, `depth_ok`, etc.) — the metric keys and semantics remain the same. **No changes needed** unless new 3D-specific metrics are added to the report.

---

## 7. Fallback and Robustness

- **No 3D**: If `pose_world_landmarks` is missing or empty, set `keypoints_3d = None` and use **existing 2D logic** everywhere. No change in behavior for older MediaPipe or legacy API.
- **Invalid 3D**: If some 3D coordinates are NaN or clearly wrong (e.g. limb length > 2 m or < 0.05 m), fall back to 2D for that frame. Use `_pose_valid_3d()` for this check.
- **Vertical direction**: The MediaPipe world coordinate system is camera-relative. For trunk angle:
  1. **Primary**: Calibrate the "up" vector from the first N standing frames (average shoulder-mid minus hip-mid direction when standing).
  2. **Fallback**: If camera is assumed level, use `(0, -1, 0)` in world coords.
  3. **Verify empirically**: Print raw world landmarks for a known upright pose before committing to a direction.
- **Rep phase signal switch**: When transitioning from 2D hip-Y signal to 3D knee-flexion signal, ensure the peak detection parameters (prominence, distance) are re-tuned for the new signal range (degrees vs normalized position). The signal shape is similar but the scale differs.

---

## 8. Testing and Validation

- **Unit tests**: For `_angle_deg_3d`, `_knee_angle_deg_3d`, `_trunk_angle_deg_3d` with synthetic 3D points (e.g. known 90 deg knee bend, known upright trunk).
- **Unit tests**: For `_pose_valid_3d` with valid, NaN, and out-of-range inputs.
- **Signal test**: Verify that 3D knee flexion signal from a real squat clip has clear peaks/troughs suitable for `find_peaks()`.
- **Regression**: Run existing offline pipeline on a few clips with 3D **disabled** (force `keypoints_3d = None`); rep count and metrics should match current behavior exactly.
- **View invariance**: Record (or use) the same squat from two angles (e.g. side vs 30 deg off); with 3D, knee flexion and "depth OK" should be similar; with 2D they will differ.
- **Live**: Test live pipeline and web app with 3D enabled; confirm overlay still uses 2D and rep/angle feedback uses 3D.
- **Axis verification**: Print raw `pose_world_landmarks` for a standing pose and document the coordinate axes (which direction is up, forward, right).

---

## 9. Optional: Camera Guidance (2D-only enhancement)

If 3D is not implemented first, or as an extra:

- **Docs / UI**: Recommend "Place camera side-on at hip height for best accuracy."
- **Simple "bad view" check**: Use 2D body aspect (e.g. bounding box width/height) or shoulder-hip line angle in image to detect strong rotation; show a warning like "Angle camera more to the side for accurate angles."

This does not fix the math but sets user expectations and can reduce support burden.

---

## 10. Summary Checklist

- [ ] Verify `PoseLandmarkerResult.pose_world_landmarks` shape, units (meters), and **axis directions** in the MediaPipe version in use.
- [ ] Extend `process_frame()` to return `{"keypoints_2d": ..., "keypoints_3d": ...}` dict.
- [ ] Add 3D geometry helpers in `reps.py`: `_angle_deg_3d`, `_knee_angle_deg_3d`, `_trunk_angle_deg_3d`, `_pose_valid_3d`.
- [ ] Add 3D rep phase signal function (`_knee_flexion_signal_3d`) to replace `_hip_y_norm` when 3D is available.
- [ ] Update `compute_frame_metrics()` to accept and use `keypoints_3d`.
- [ ] Update `IncrementalRepDetector.push()` to accept `keypoints_3d` and use knee-flexion-based phase detection.
- [ ] Update `detect_reps_batch()` to accept `keypoints_3d_series` and use 3D signal.
- [ ] Add `smooth_keypoints_ema_3d()` or make existing smoother generic.
- [ ] Update call sites: `src/live.py`, `web_app.py` (root), `run.py` (root) to unpack and pass 3D.
- [ ] Keep `src/overlay.py` and `src/decision.py` unchanged (2D overlay, same metric keys).
- [ ] Add fallback to 2D when 3D is missing or invalid; add `_pose_valid_3d()`.
- [ ] Add unit tests for 3D helpers and regression tests with 3D disabled.
- [ ] Verify 3D knee flexion signal works with `find_peaks()` on a real clip.
- [ ] Calibrate vertical direction from standing frames; document axis convention.

---

## References

- [MediaPipe Pose Landmarker (Python)](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/python)
- [Pose Landmarker Task API — detection result](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/python/vision/pose_landmarker.py) (`pose_landmarks`, `pose_world_landmarks`)
- [3D world landmarks (MediaPipe v0.8.6+)](https://github.com/google-ai-edge/mediapipe/releases/tag/v0.8.6)
