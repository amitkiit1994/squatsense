"""Live WebSocket analysis router: real-time pose estimation and rep detection."""

from __future__ import annotations

import base64
import concurrent.futures
import json
import logging
import time
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

import cv2
import numpy as np
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from backend.core.pose import create_pose_detector, process_frame
from backend.db.engine import AsyncSessionLocal
from backend.models.rep import Rep
from backend.models.session import Set
from backend.services.scoring import CompositeScorer
from backend.services.fatigue import FatigueEngine
from backend.services.exercise_registry import get_exercise_by_name
from backend.services.load_recommender import LoadRecommender

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ws/live", tags=["live"])

# Thread pool for CPU-bound pose estimation so the event loop stays responsive
_POSE_EXECUTOR = concurrent.futures.ThreadPoolExecutor(
    max_workers=2, thread_name_prefix="live_pose"
)


async def _save_reps_to_set(
    session_id: UUID,
    set_number: int,
    scored_reps: list[dict],
    avg_form: float | None,
    fatigue_result: dict,
    rest_duration_sec: float | None = None,
) -> None:
    """Persist scored reps to the database, updating the existing set created by the frontend.

    If a Set with the given set_number already exists for this session, it is
    updated with actual_reps, avg_form_score, and fatigue data.  Otherwise a
    new Set row is created.
    """
    from sqlalchemy import select

    logger.info(
        "_save_reps_to_set: session=%s set=%d reps=%d avg_form=%s fatigue=%s",
        session_id, set_number, len(scored_reps), avg_form, fatigue_result,
    )
    import asyncio as _asyncio

    async with AsyncSessionLocal() as db:
        # Try to find the set already created by the frontend API.
        # Retry with exponential backoff in case the REST commit hasn't
        # been flushed to disk yet (race between HTTP and WebSocket).
        existing_set = None
        _retry_delays = [0.1, 0.2, 0.5]  # 100ms, 200ms, 500ms
        for _attempt in range(len(_retry_delays) + 1):
            result = await db.execute(
                select(Set).where(
                    Set.session_id == session_id,
                    Set.set_number == set_number,
                )
            )
            existing_set = result.scalars().first()
            if existing_set is not None:
                break
            if _attempt < len(_retry_delays):
                logger.info(
                    "_save_reps_to_set: Set %d not found yet, retrying after %dms (attempt %d/%d)",
                    set_number, int(_retry_delays[_attempt] * 1000),
                    _attempt + 1, len(_retry_delays),
                )
                await _asyncio.sleep(_retry_delays[_attempt])

        if existing_set is not None:
            existing_set.actual_reps = len(scored_reps)
            existing_set.avg_form_score = avg_form
            existing_set.fatigue_index = fatigue_result.get("fatigue_index")
            existing_set.fatigue_risk = fatigue_result.get("fatigue_risk")
            if rest_duration_sec is not None:
                existing_set.rest_duration_sec = rest_duration_sec
            db.add(existing_set)
            target_set = existing_set
        else:
            target_set = Set(
                session_id=session_id,
                set_number=set_number,
                target_reps=len(scored_reps),
                actual_reps=len(scored_reps),
                avg_form_score=avg_form,
                fatigue_index=fatigue_result.get("fatigue_index"),
                fatigue_risk=fatigue_result.get("fatigue_risk"),
                rest_duration_sec=rest_duration_sec,
            )
            db.add(target_set)

        await db.flush()

        for rep_data in scored_reps:
            dur_sec = rep_data.get("duration_sec")
            rep = Rep(
                set_id=target_set.id,
                session_id=session_id,
                rep_number=rep_data.get("rep_number", 0),
                duration_ms=int(dur_sec * 1000) if dur_sec else None,
                eccentric_ms=rep_data.get("eccentric_ms"),
                pause_ms=rep_data.get("pause_ms"),
                concentric_ms=rep_data.get("concentric_ms"),
                composite_score=rep_data.get("composite_score"),
                depth_score=rep_data.get("depth_score"),
                stability_score=rep_data.get("stability_score"),
                symmetry_score=rep_data.get("symmetry_score"),
                tempo_score=rep_data.get("tempo_score"),
                rom_score=rep_data.get("rom_score"),
                primary_angle_deg=rep_data.get("primary_angle_deg"),
                trunk_angle_deg=rep_data.get("trunk_angle_deg"),
                com_offset_norm=rep_data.get("com_offset_norm"),
                speed_proxy=rep_data.get("speed_proxy"),
                depth_ok=rep_data.get("depth_ok"),
                form_ok=rep_data.get("form_ok"),
                balance_ok=rep_data.get("balance_ok"),
                timestamp=datetime.now(timezone.utc),
            )
            db.add(rep)

        await db.commit()


def _decode_frame(data: bytes) -> Optional[np.ndarray]:
    """Decode a JPEG frame from raw bytes or base64-encoded string."""
    if not data:
        return None

    # Try raw JPEG bytes first
    try:
        arr = np.frombuffer(data, dtype=np.uint8)
        frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if frame is not None:
            return frame
    except Exception:
        pass

    # Try base64 decoding
    try:
        if isinstance(data, bytes):
            data_str = data.decode("utf-8", errors="ignore")
        else:
            data_str = data
        # Strip data URI prefix if present
        if "," in data_str:
            data_str = data_str.split(",", 1)[1]
        raw = base64.b64decode(data_str)
        arr = np.frombuffer(raw, dtype=np.uint8)
        frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        return frame
    except Exception:
        return None


def _process_frame_sync(
    frame: np.ndarray,
    pose: Any,
) -> Optional[dict]:
    """Run pose estimation synchronously (for thread pool)."""
    return process_frame(frame, pose)


# ---------------------------------------------------------------------------
# WebSocket /
# ---------------------------------------------------------------------------

@router.websocket("/")
async def live_analysis(
    websocket: WebSocket,
    exercise_type: str = Query(default="squat"),
    session_id: str | None = Query(default=None),
) -> None:
    """Accept JPEG frames over WebSocket and return real-time analysis.

    Client sends:
      - Binary messages: raw JPEG frame data
      - Text messages: JSON with optional commands (e.g., {"command": "stop"})

    Server sends back JSON per frame:
      {
        "landmarks": [[x, y], ...],  // 33 points
        "metrics": {
          "knee_flexion_deg": float,
          "trunk_angle_deg": float,
          "composite_score": float,
          ...
        },
        "rep_count": int,
        "form_score": float | null,
        "fatigue": {
          "fatigue_index": float,
          "fatigue_risk": str,
        },
        "status": str,
        "phase": str,
      }

    On "stop" command, sends final session summary.
    """
    await websocket.accept()
    logger.info(
        "WebSocket connected: exercise=%s, session_id=%s",
        exercise_type, session_id,
    )

    # Lazy imports to avoid loading heavy libs if unused
    from backend.core.rep_detector import IncrementalRepDetector
    from backend.core.smoothing import smooth_keypoints_ema, smooth_keypoints_ema_3d

    # Look up exercise config — reject unknown types
    try:
        exercise_config = get_exercise_by_name(exercise_type)
    except KeyError:
        from backend.core.exercises.base import ExerciseType
        valid = [e.value for e in ExerciseType]
        await websocket.send_json({
            "type": "error",
            "error": f"Unknown exercise type {exercise_type!r}. Valid types: {valid}",
        })
        await websocket.close(code=1008)
        return

    pose = None  # lazy-init: only created when JPEG frames arrive (not needed for landmarks mode)
    detector = IncrementalRepDetector()
    scorer = CompositeScorer()
    fatigue_engine = FatigueEngine()
    load_recommender = LoadRecommender()

    import asyncio

    frame_idx = 0
    prev_kp: Optional[list] = None
    prev_kp3: Optional[list] = None
    session_tempo_values: list[float] = []
    fps = 15.0  # estimated; client can adjust
    last_rep_count = 0

    # Per-set rep tracking: index into detector.confirmed_reps where the
    # current set begins.  When "end_set" is received, reps from
    # set_start_rep_idx..len(confirmed_reps) are scored and saved.
    set_start_rep_idx = 0
    current_set_number = 1
    last_set_end_time: float | None = None  # monotonic time when last set ended
    last_set_was_ended = False  # True after end_set, reset on start_set

    # Frame throttling: process at most ~10 fps to keep the event loop
    # responsive for HTTP requests running on the same server.
    MIN_FRAME_INTERVAL = 0.08  # seconds (~12 fps max processing rate)
    last_frame_time = 0.0

    # Cached fatigue result — only recomputed when rep count changes.
    cached_fatigue: dict[str, Any] = {"fatigue_index": 0.0, "fatigue_risk": "low"}
    fatigue_rep_count = 0

    try:
        while True:
            raw = await websocket.receive()

            # Handle client disconnect gracefully
            if raw.get("type") == "websocket.disconnect":
                logger.info("WebSocket client disconnected (session_id=%s)", session_id)
                return

            # Handle text messages (commands)
            if "text" in raw and raw["text"]:
                try:
                    msg = json.loads(raw["text"])
                except (json.JSONDecodeError, TypeError):
                    msg = {"command": raw["text"]}

                command = msg.get("command", "").lower().strip()

                # Update FPS if provided
                if "fps" in msg:
                    try:
                        fps = float(msg["fps"])
                    except (ValueError, TypeError):
                        pass

                if command == "end_set":
                    # Do NOT flush pending reps here.  The user explicitly
                    # ended the set, so only reps that were fully confirmed
                    # during live tracking should count.  Flushing can
                    # force-confirm a partial movement (e.g. the user
                    # shifting position after their last rep) as a phantom
                    # rep, causing the report to show more reps than the
                    # live UI counted.
                    logger.info("end_set: phase=%s (not flushing partial reps)", detector.last_phase)

                    # Compute rest duration since last set ended
                    rest_sec: float | None = None
                    now_mono = time.monotonic()
                    if last_set_end_time is not None:
                        rest_sec = round(now_mono - last_set_end_time, 1)

                    # Score and save reps for the current set
                    current_reps = detector.confirmed_reps[set_start_rep_idx:]
                    logger.info(
                        "end_set command: set=%d, set_start_rep_idx=%d, "
                        "total_confirmed_reps=%d, current_set_reps=%d, session=%s",
                        current_set_number, set_start_rep_idx,
                        len(detector.confirmed_reps), len(current_reps), session_id,
                    )
                    if session_id and current_reps:
                        set_scored = []
                        set_tempos: list[float] = []
                        for rep_idx, rep_data in enumerate(current_reps):
                            dur = rep_data.get("duration_sec")
                            if dur is not None:
                                set_tempos.append(dur * 1000.0)
                            avg_t = sum(set_tempos) / len(set_tempos) if set_tempos else None
                            mfs = {
                                "primary_angle_deg": rep_data.get("knee_flexion_deg"),
                                "trunk_angle_deg": rep_data.get("trunk_angle_deg"),
                                "com_offset_norm": rep_data.get("com_offset_norm"),
                                "speed_proxy": rep_data.get("speed_proxy"),
                                "duration_ms": (dur * 1000.0) if dur else None,
                                "balance_ok_pct": rep_data.get("balance_ok_pct", 0.5),
                                "com_variance": rep_data.get("com_variance", 0.02),
                                "left_primary_angle": rep_data.get("left_knee_flexion_deg"),
                                "right_primary_angle": rep_data.get("right_knee_flexion_deg"),
                                "depth_ok": rep_data.get("depth_ok"),
                            }
                            scores = scorer.score_rep(mfs, exercise_config, avg_t)
                            logger.info(
                                "end_set scoring rep %s: mfs=%s → scores=%s",
                                rep_data.get("rep"), mfs, scores,
                            )
                            sr = {
                                "rep_number": rep_idx + 1,  # per-set numbering (1-based)
                                "duration_sec": dur,
                                "depth_ok": rep_data.get("depth_ok"),
                                "form_ok": rep_data.get("form_ok"),
                                "balance_ok": rep_data.get("balance_ok"),
                                "primary_angle_deg": rep_data.get("knee_flexion_deg"),
                                "trunk_angle_deg": rep_data.get("trunk_angle_deg"),
                                "com_offset_norm": rep_data.get("com_offset_norm"),
                                "speed_proxy": rep_data.get("speed_proxy"),
                                "eccentric_ms": rep_data.get("eccentric_ms"),
                                "pause_ms": rep_data.get("pause_ms"),
                                "concentric_ms": rep_data.get("concentric_ms"),
                            }
                            sr.update(scores)
                            set_scored.append(sr)

                        set_fatigue = fatigue_engine.compute_set_fatigue(set_scored)
                        set_composites = [
                            r["composite_score"] for r in set_scored
                            if r.get("composite_score") is not None
                        ]
                        set_avg = (
                            round(sum(set_composites) / len(set_composites), 1)
                            if set_composites else None
                        )
                        logger.info(
                            "end_set set %d summary: scored_reps=%d, composites=%s, "
                            "avg_form=%.1f, fatigue=%s",
                            current_set_number, len(set_scored), set_composites,
                            set_avg or 0.0, set_fatigue,
                        )

                        try:
                            sid = UUID(session_id)
                            await _save_reps_to_set(
                                sid, current_set_number, set_scored, set_avg, set_fatigue,
                                rest_duration_sec=rest_sec,
                            )
                            logger.info(
                                "Saved %d reps for set %d of session %s (rest=%.1fs)",
                                len(set_scored), current_set_number, session_id,
                                rest_sec or 0.0,
                            )
                        except Exception:
                            logger.exception(
                                "Failed to save set %d reps for session %s",
                                current_set_number, session_id,
                            )

                        # Generate load recommendation for next set
                        load_used = msg.get("load_used", 0)
                        target_reps = msg.get("target_reps", len(current_reps))
                        if load_used and load_used > 0 and set_avg is not None:
                            rec = load_recommender.recommend_next_load(
                                current_load_kg=float(load_used),
                                avg_form_score=set_avg,
                                fatigue_index=set_fatigue.get("fatigue_index", 0.0),
                                fatigue_risk=set_fatigue.get("fatigue_risk", "low"),
                                reps_completed=len(set_scored),
                                target_reps=int(target_reps),
                                goal="strength",
                            )
                        else:
                            rec = None

                        # Send set summary back to frontend
                        set_summary_msg = {
                            "type": "set_summary",
                            "set_number": current_set_number,
                            "reps": len(set_scored),
                            "avg_form_score": set_avg,
                            "fatigue_index": set_fatigue.get("fatigue_index"),
                            "fatigue_risk": set_fatigue.get("fatigue_risk"),
                            "load_recommendation": rec,
                            "rest_duration_sec": rest_sec,
                        }
                        await websocket.send_json(set_summary_msg)

                    # Record set end time for rest tracking and advance
                    last_set_end_time = time.monotonic()
                    set_start_rep_idx = len(detector.confirmed_reps)
                    current_set_number += 1
                    last_set_was_ended = True
                    continue

                if command == "start_set":
                    # Frontend signals start of next set — just ensure index is up to date
                    set_start_rep_idx = len(detector.confirmed_reps)
                    last_set_was_ended = False
                    continue

                if command == "stop":
                    # Only flush if the user was genuinely mid-rep
                    # (BOTTOM or ASCENT).  Early DESCENT is likely just
                    # noise from the user shifting after their last rep.
                    if detector.last_phase in ("BOTTOM", "ASCENT"):
                        if detector.flush_pending_rep(frame_idx, fps):
                            logger.info("stop: flushed pending rep (was in %s phase)", detector.last_phase)
                    else:
                        logger.info("stop: skipping flush (phase=%s)", detector.last_phase)

                    # Compute final session summary using ALL reps
                    scored_reps = []
                    for rep_data in detector.confirmed_reps:
                        dur = rep_data.get("duration_sec")
                        if dur is not None:
                            session_tempo_values.append(dur * 1000.0)
                        avg_tempo_ms = (
                            sum(session_tempo_values) / len(session_tempo_values)
                            if session_tempo_values
                            else None
                        )
                        metrics_for_score = {
                            "primary_angle_deg": rep_data.get("knee_flexion_deg"),
                            "trunk_angle_deg": rep_data.get("trunk_angle_deg"),
                            "com_offset_norm": rep_data.get("com_offset_norm"),
                            "speed_proxy": rep_data.get("speed_proxy"),
                            "duration_ms": (dur * 1000.0) if dur else None,
                            "balance_ok_pct": rep_data.get("balance_ok_pct", 0.5),
                            "com_variance": rep_data.get("com_variance", 0.02),
                            "left_primary_angle": rep_data.get("left_knee_flexion_deg"),
                            "right_primary_angle": rep_data.get("right_knee_flexion_deg"),
                            "depth_ok": rep_data.get("depth_ok"),
                        }
                        scores = scorer.score_rep(metrics_for_score, exercise_config, avg_tempo_ms)
                        scored_rep = {
                            "rep_number": rep_data.get("rep"),
                            "duration_sec": dur,
                            "depth_ok": rep_data.get("depth_ok"),
                            "form_ok": rep_data.get("form_ok"),
                            "balance_ok": rep_data.get("balance_ok"),
                            "primary_angle_deg": rep_data.get("knee_flexion_deg"),
                            "trunk_angle_deg": rep_data.get("trunk_angle_deg"),
                            "com_offset_norm": rep_data.get("com_offset_norm"),
                            "speed_proxy": rep_data.get("speed_proxy"),
                            "eccentric_ms": rep_data.get("eccentric_ms"),
                            "pause_ms": rep_data.get("pause_ms"),
                            "concentric_ms": rep_data.get("concentric_ms"),
                        }
                        scored_rep.update(scores)
                        scored_reps.append(scored_rep)

                    fatigue_result = fatigue_engine.compute_set_fatigue(scored_reps)
                    composite_scores = [
                        r["composite_score"] for r in scored_reps
                        if r.get("composite_score") is not None
                    ]
                    avg_form = (
                        round(sum(composite_scores) / len(composite_scores), 1)
                        if composite_scores
                        else None
                    )

                    # ── Persist any unsaved reps (last set) to DB ────────
                    # Skip if the user explicitly ended their last set via
                    # end_set — any reps detected between end_set and stop
                    # are noise from the user moving, not real training reps.
                    unsaved_reps = detector.confirmed_reps[set_start_rep_idx:]
                    if last_set_was_ended and unsaved_reps:
                        logger.info(
                            "stop: ignoring %d unsaved reps detected after "
                            "last end_set (noise, not a real set)",
                            len(unsaved_reps),
                        )
                        unsaved_reps = []
                    if session_id and unsaved_reps:
                        # Score and save just the unsaved reps from the last set
                        last_set_scored = []
                        last_tempos: list[float] = []
                        for rep_idx, rep_data in enumerate(unsaved_reps):
                            dur = rep_data.get("duration_sec")
                            if dur is not None:
                                last_tempos.append(dur * 1000.0)
                            avg_t = sum(last_tempos) / len(last_tempos) if last_tempos else None
                            mfs = {
                                "primary_angle_deg": rep_data.get("knee_flexion_deg"),
                                "trunk_angle_deg": rep_data.get("trunk_angle_deg"),
                                "com_offset_norm": rep_data.get("com_offset_norm"),
                                "speed_proxy": rep_data.get("speed_proxy"),
                                "duration_ms": (dur * 1000.0) if dur else None,
                                "balance_ok_pct": rep_data.get("balance_ok_pct", 0.5),
                                "com_variance": rep_data.get("com_variance", 0.02),
                                "left_primary_angle": rep_data.get("left_knee_flexion_deg"),
                                "right_primary_angle": rep_data.get("right_knee_flexion_deg"),
                                "depth_ok": rep_data.get("depth_ok"),
                            }
                            scores = scorer.score_rep(mfs, exercise_config, avg_t)
                            sr = {
                                "rep_number": rep_idx + 1,  # per-set numbering (1-based)
                                "duration_sec": dur,
                                "depth_ok": rep_data.get("depth_ok"),
                                "form_ok": rep_data.get("form_ok"),
                                "balance_ok": rep_data.get("balance_ok"),
                                "primary_angle_deg": rep_data.get("knee_flexion_deg"),
                                "trunk_angle_deg": rep_data.get("trunk_angle_deg"),
                                "com_offset_norm": rep_data.get("com_offset_norm"),
                                "speed_proxy": rep_data.get("speed_proxy"),
                                "eccentric_ms": rep_data.get("eccentric_ms"),
                                "pause_ms": rep_data.get("pause_ms"),
                                "concentric_ms": rep_data.get("concentric_ms"),
                            }
                            sr.update(scores)
                            last_set_scored.append(sr)

                        last_fatigue = fatigue_engine.compute_set_fatigue(last_set_scored)
                        last_composites = [
                            r["composite_score"] for r in last_set_scored
                            if r.get("composite_score") is not None
                        ]
                        last_avg = (
                            round(sum(last_composites) / len(last_composites), 1)
                            if last_composites else None
                        )

                        try:
                            sid = UUID(session_id)
                            await _save_reps_to_set(
                                sid, current_set_number, last_set_scored, last_avg, last_fatigue,
                            )
                            logger.info(
                                "Saved %d reps for final set %d of session %s",
                                len(last_set_scored), current_set_number, session_id,
                            )
                        except Exception:
                            logger.exception(
                                "Failed to save final set reps for session %s", session_id
                            )

                    summary = {
                        "type": "session_summary",
                        "exercise_type": exercise_type,
                        "total_reps": len(scored_reps),
                        "avg_form_score": avg_form,
                        "fatigue_index": fatigue_result.get("fatigue_index"),
                        "fatigue_risk": fatigue_result.get("fatigue_risk"),
                        "reps": scored_reps,
                    }
                    logger.info(
                        "SESSION SUMMARY: exercise=%s, total_reps=%d, "
                        "avg_form=%.1f, fatigue_idx=%.1f, fatigue_risk=%s",
                        exercise_type, len(scored_reps), avg_form or 0,
                        fatigue_result.get("fatigue_index", 0),
                        fatigue_result.get("fatigue_risk", "low"),
                    )
                    for i, sr in enumerate(scored_reps):
                        logger.info(
                            "  rep %d: composite=%.1f depth=%.1f stab=%.1f "
                            "sym=%.1f tempo=%.1f rom=%.1f | "
                            "angle=%.1f trunk=%.1f depth_ok=%s form_ok=%s",
                            i + 1,
                            sr.get("composite_score", 0),
                            sr.get("depth_score", 0),
                            sr.get("stability_score", 0),
                            sr.get("symmetry_score", 0),
                            sr.get("tempo_score", 0),
                            sr.get("rom_score", 0),
                            sr.get("primary_angle_deg") or 0,
                            sr.get("trunk_angle_deg") or 0,
                            sr.get("depth_ok"),
                            sr.get("form_ok"),
                        )
                    await websocket.send_json(summary)
                    await websocket.close()
                    return

                if command == "ping":
                    await websocket.send_json({"type": "pong"})
                    continue

                # ── Client-side landmarks (hybrid mode) ──────────────
                # When the client runs pose detection locally, it sends
                # normalized landmarks instead of JPEG frames.  This
                # skips image decode + server-side pose estimation,
                # reducing round-trip latency from ~300-500ms to ~50ms.
                # FreeForm continues using the binary JPEG path below.
                if msg.get("type") == "landmarks":
                    pass  # handled below after text/binary dispatch
                else:
                    # For unknown commands, just continue
                    continue

            # ── Determine input mode and extract keypoints ───────────
            keypoints = None
            keypoints_3d = None
            landmarks_out: list[list[float]] = []

            if "text" in raw and raw["text"]:
                # Landmarks mode: client sent pose data directly
                # (msg was already parsed above in the command handler)
                msg = json.loads(raw["text"])
                now = time.monotonic()
                if now - last_frame_time < MIN_FRAME_INTERVAL:
                    await asyncio.sleep(0)
                    continue

                # Estimate actual fps from frame arrival intervals
                if last_frame_time > 0:
                    dt = now - last_frame_time
                    if 0.01 < dt < 2.0:
                        # Exponential moving average of fps
                        measured_fps = 1.0 / dt
                        fps = 0.7 * fps + 0.3 * measured_fps
                last_frame_time = now

                lm_width = msg.get("width", 640)
                lm_height = msg.get("height", 480)
                norm_lms = msg.get("landmarks", [])
                world_lms = msg.get("world_landmarks")

                if not norm_lms or len(norm_lms) < 33:
                    await websocket.send_json({"error": "Invalid landmarks"})
                    continue

                # Convert normalized (0-1) to pixel coords for 2D
                keypoints = [
                    (lm[0] * lm_width, lm[1] * lm_height) for lm in norm_lms
                ]
                # Convert world landmarks to 3D tuples
                keypoints_3d = (
                    [(lm[0], lm[1], lm[2]) for lm in world_lms]
                    if world_lms and len(world_lms) >= 33
                    else None
                )

                # EMA smoothing
                keypoints = smooth_keypoints_ema(keypoints, prev_kp)
                prev_kp = keypoints
                if keypoints_3d is not None:
                    keypoints_3d = smooth_keypoints_ema_3d(keypoints_3d, prev_kp3)
                    prev_kp3 = keypoints_3d

                landmarks_out = [[round(x, 1), round(y, 1)] for x, y in keypoints]

                # Yield to event loop (landmarks are cheap but keep loop responsive)
                await asyncio.sleep(0)

            else:
                # ── Binary JPEG frames (server-side pose detection) ──
                # Used by FreeForm and older SquatSense clients.
                data = raw.get("bytes")
                if data is None:
                    continue

                # Frame throttling
                now = time.monotonic()
                if now - last_frame_time < MIN_FRAME_INTERVAL:
                    await asyncio.sleep(0)
                    continue

                # Estimate actual fps from frame arrival intervals
                if last_frame_time > 0:
                    dt = now - last_frame_time
                    if 0.01 < dt < 2.0:
                        measured_fps = 1.0 / dt
                        fps = 0.7 * fps + 0.3 * measured_fps
                last_frame_time = now

                frame = _decode_frame(data)
                if frame is None:
                    await websocket.send_json({"error": "Could not decode frame"})
                    continue

                # Lazy-init pose detector on first JPEG frame
                if pose is None:
                    pose = create_pose_detector()

                # Run pose estimation in thread pool
                loop = asyncio.get_event_loop()
                pose_result = await loop.run_in_executor(
                    _POSE_EXECUTOR, _process_frame_sync, frame, pose
                )

                # Yield to event loop so pending HTTP requests get a chance
                await asyncio.sleep(0)

                if pose_result is not None:
                    keypoints = pose_result["keypoints_2d"]
                    keypoints_3d = pose_result.get("keypoints_3d")

                    # EMA smoothing
                    keypoints = smooth_keypoints_ema(keypoints, prev_kp)
                    prev_kp = keypoints
                    if keypoints_3d is not None:
                        keypoints_3d = smooth_keypoints_ema_3d(keypoints_3d, prev_kp3)
                        prev_kp3 = keypoints_3d

                    landmarks_out = [[round(x, 1), round(y, 1)] for x, y in keypoints]

            # ── Shared pipeline: rep detection + scoring + response ──
            # Push to rep detector
            state = detector.push(frame_idx, keypoints, fps, keypoints_3d=keypoints_3d)
            frame_idx += 1

            # Periodic diagnostic logging
            if frame_idx % 30 == 0:
                logger.info(
                    "live_diag: frame=%d, fps=%.1f, phase=%s, reps=%d, "
                    "knee=%.1f, trunk=%.1f, status=%s, has_3d=%s",
                    frame_idx, fps, state.get("phase"), detector.rep_count,
                    state.get("knee_flexion_deg") or 0.0,
                    state.get("trunk_angle_deg") or 0.0,
                    state.get("status"),
                    keypoints_3d is not None,
                )

            # Yield after rep detection (sync CPU work) to keep event loop responsive
            await asyncio.sleep(0)

            # Score the latest rep if a new one was detected
            current_form_score: Optional[float] = None
            rep_metrics: dict[str, Any] = {}

            if detector.rep_count > last_rep_count and detector.confirmed_reps:
                last_rep_count = detector.rep_count
                latest_rep = detector.confirmed_reps[-1]
                logger.info(
                    "NEW REP #%d detected: raw_data=%s",
                    detector.rep_count, {
                        k: latest_rep.get(k) for k in [
                            "rep", "knee_flexion_deg", "trunk_angle_deg",
                            "com_offset_norm", "speed_proxy", "duration_sec",
                            "depth_ok", "form_ok", "balance_ok",
                            "left_knee_flexion_deg", "right_knee_flexion_deg",
                            "balance_ok_pct", "com_variance",
                        ]
                    },
                )
                dur = latest_rep.get("duration_sec")
                if dur is not None:
                    session_tempo_values.append(dur * 1000.0)
                avg_tempo_ms = (
                    sum(session_tempo_values) / len(session_tempo_values)
                    if session_tempo_values
                    else None
                )
                metrics_for_score = {
                    "primary_angle_deg": latest_rep.get("knee_flexion_deg"),
                    "trunk_angle_deg": latest_rep.get("trunk_angle_deg"),
                    "com_offset_norm": latest_rep.get("com_offset_norm"),
                    "speed_proxy": latest_rep.get("speed_proxy"),
                    "duration_ms": (dur * 1000.0) if dur else None,
                    "balance_ok_pct": latest_rep.get("balance_ok_pct", 0.5),
                    "com_variance": latest_rep.get("com_variance", 0.02),
                    "left_primary_angle": latest_rep.get("left_knee_flexion_deg"),
                    "right_primary_angle": latest_rep.get("right_knee_flexion_deg"),
                    "depth_ok": latest_rep.get("depth_ok"),
                }
                scores = scorer.score_rep(metrics_for_score, exercise_config, avg_tempo_ms)
                current_form_score = scores.get("composite_score")
                rep_metrics = scores
                logger.info(
                    "REP #%d scored: composite=%.1f, scores=%s",
                    detector.rep_count, current_form_score or 0, scores,
                )

            # Fatigue — only recompute when a new rep is confirmed (not every frame)
            if (
                len(detector.confirmed_reps) >= 3
                and len(detector.confirmed_reps) != fatigue_rep_count
            ):
                fatigue_rep_count = len(detector.confirmed_reps)
                scored_for_fatigue = []
                temp_tempos: list[float] = []
                for rd in detector.confirmed_reps:
                    dur_val = rd.get("duration_sec")
                    if dur_val is not None:
                        temp_tempos.append(dur_val * 1000.0)
                    avg_t = (
                        sum(temp_tempos) / len(temp_tempos) if temp_tempos else None
                    )
                    mfs = {
                        "primary_angle_deg": rd.get("knee_flexion_deg"),
                        "speed_proxy": rd.get("speed_proxy"),
                        "balance_ok_pct": rd.get("balance_ok_pct", 0.5),
                        "com_variance": rd.get("com_variance", 0.02),
                        "left_primary_angle": rd.get("left_knee_flexion_deg"),
                        "right_primary_angle": rd.get("right_knee_flexion_deg"),
                        "depth_ok": rd.get("depth_ok"),
                    }
                    s = scorer.score_rep(mfs, exercise_config, avg_t)
                    scored_for_fatigue.append(s)
                cached_fatigue = fatigue_engine.compute_set_fatigue(scored_for_fatigue)

            response = {
                "type": "frame_result",
                "landmarks": landmarks_out,
                "metrics": {
                    "knee_flexion_deg": state.get("knee_flexion_deg"),
                    "trunk_angle_deg": state.get("trunk_angle_deg"),
                    "com_offset_norm": state.get("com_offset_norm"),
                    "speed_proxy": state.get("speed_proxy"),
                    **rep_metrics,
                },
                "rep_count": state.get("rep_count", 0),
                "form_score": current_form_score,
                "fatigue": {
                    "fatigue_index": cached_fatigue.get("fatigue_index", 0.0),
                    "fatigue_risk": cached_fatigue.get("fatigue_risk", "low"),
                },
                "status": state.get("status", "Tracking"),
                "phase": state.get("phase", "TOP_READY"),
                "server_fps": round(fps, 1),
            }
            # Log frame metrics every 30 frames to avoid spam
            if frame_idx % 30 == 0:
                logger.info(
                    "frame %d: knee=%.1f, trunk=%.1f, com=%.4f, speed=%.4f, "
                    "reps=%d, phase=%s, status=%s, form_score=%s, fatigue=%.1f",
                    frame_idx,
                    state.get("knee_flexion_deg") or 0,
                    state.get("trunk_angle_deg") or 0,
                    state.get("com_offset_norm") or 0,
                    state.get("speed_proxy") or 0,
                    state.get("rep_count", 0),
                    state.get("phase", "?"),
                    state.get("status", "?"),
                    current_form_score,
                    cached_fatigue.get("fatigue_index", 0.0),
                )
            await websocket.send_json(response)

    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected (session_id=%s)", session_id)
    except RuntimeError as exc:
        # Starlette raises RuntimeError when receive() is called after disconnect
        if "disconnect" in str(exc).lower():
            logger.info("WebSocket client disconnected (session_id=%s)", session_id)
        else:
            logger.exception("WebSocket runtime error (session_id=%s)", session_id)
    except Exception:
        logger.exception("WebSocket error (session_id=%s)", session_id)
        try:
            await websocket.close(code=1011)
        except Exception:
            pass
