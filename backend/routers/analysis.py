"""Video upload analysis router: async job-based processing with DB persistence."""

from __future__ import annotations

import asyncio
import logging
import shutil
import tempfile
import threading
import time
import uuid
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.pose import create_pose_detector, process_frame
from backend.db.engine import AsyncSessionLocal
from backend.models.analysis_job import AnalysisJob
from backend.services.scoring import CompositeScorer
from backend.services.fatigue import FatigueEngine
from backend.services.exercise_registry import get_exercise_by_name

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/analysis", tags=["analysis"])

# ---------------------------------------------------------------------------
# In-memory cache for fast polling of active jobs (write-through to DB)
# ---------------------------------------------------------------------------

_JOB_CACHE: dict[str, dict[str, Any]] = {}
_CACHE_LOCK = threading.Lock()
_MAX_CACHE = 200

# Max upload size: 100 MB
_MAX_UPLOAD_BYTES = 100 * 1024 * 1024


# ---------------------------------------------------------------------------
# DB persistence helpers (run from background threads via asyncio)
# ---------------------------------------------------------------------------

async def _db_update_job(job_id: str, status: str, result: dict | None = None, error: str | None = None) -> None:
    """Update job status in the database."""
    async with AsyncSessionLocal() as session:
        stmt = select(AnalysisJob).where(AnalysisJob.id == job_id)
        db_result = await session.execute(stmt)
        job = db_result.scalars().first()
        if job:
            job.status = status
            if result is not None:
                job.result = result
            if error is not None:
                job.error = error
            session.add(job)
            await session.commit()


def _update_job_sync(job_id: str, status: str, result: dict | None = None, error: str | None = None) -> None:
    """Update job in DB from a background thread by creating a new event loop."""
    try:
        loop = asyncio.new_event_loop()
        loop.run_until_complete(_db_update_job(job_id, status, result, error))
        loop.close()
    except Exception:
        logger.exception("Failed to persist job %s to database", job_id)


# ---------------------------------------------------------------------------
# Background analysis
# ---------------------------------------------------------------------------

def _run_analysis(job_id: str, video_path: str, exercise_type: str) -> None:
    """Run pose estimation, rep detection, and scoring in a background thread."""
    try:
        # Lazy import to avoid loading heavy libs at module level
        from backend.core.rep_detector import IncrementalRepDetector
        from backend.core.frame_metrics import compute_frame_metrics
        from backend.core.smoothing import smooth_keypoints_ema, smooth_keypoints_ema_3d

        pose = create_pose_detector()

        # Look up exercise config — reject unknown types
        try:
            exercise_config = get_exercise_by_name(exercise_type)
        except KeyError:
            with _CACHE_LOCK:
                _JOB_CACHE[job_id]["status"] = "failed"
                _JOB_CACHE[job_id]["error"] = f"Unknown exercise type: {exercise_type!r}"
            _update_job_sync(job_id, "failed", error=f"Unknown exercise type: {exercise_type!r}")
            return

        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            with _CACHE_LOCK:
                _JOB_CACHE[job_id]["status"] = "failed"
                _JOB_CACHE[job_id]["error"] = "Could not open video file"
            _update_job_sync(job_id, "failed", error="Could not open video file")
            return

        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        detector = IncrementalRepDetector()
        scorer = CompositeScorer()
        fatigue_engine = FatigueEngine()

        frame_idx = 0
        prev_kp = None
        prev_kp3 = None
        session_tempo_values: list[float] = []

        while True:
            ret, frame = cap.read()
            if not ret:
                break

            pose_result = process_frame(frame, pose)
            keypoints = None
            keypoints_3d = None

            if pose_result is not None:
                keypoints = pose_result["keypoints_2d"]
                keypoints_3d = pose_result.get("keypoints_3d")

                # EMA smoothing
                keypoints = smooth_keypoints_ema(keypoints, prev_kp)
                prev_kp = keypoints
                if keypoints_3d is not None:
                    keypoints_3d = smooth_keypoints_ema_3d(keypoints_3d, prev_kp3)
                    prev_kp3 = keypoints_3d

            detector.push(frame_idx, keypoints, fps, keypoints_3d=keypoints_3d)
            frame_idx += 1

        cap.release()

        # Score each rep
        scored_reps = []
        for rep_data in detector.confirmed_reps:
            # Compute tempo avg
            dur = rep_data.get("duration_sec")
            if dur is not None:
                session_tempo_values.append(dur * 1000.0)
            avg_tempo_ms = (
                sum(session_tempo_values) / len(session_tempo_values)
                if session_tempo_values
                else None
            )

            # Build metrics dict for scorer
            metrics = {
                "primary_angle_deg": rep_data.get("knee_flexion_deg"),
                "secondary_angle_deg": rep_data.get("hip_angle_deg"),
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
            scores = scorer.score_rep(metrics, exercise_config, avg_tempo_ms)

            scored_rep = {
                "rep_number": rep_data.get("rep"),
                "duration_sec": dur,
                "depth_ok": rep_data.get("depth_ok"),
                "form_ok": rep_data.get("form_ok"),
                "balance_ok": rep_data.get("balance_ok"),
                "trunk_ok": rep_data.get("trunk_ok"),
                "knee_flexion_deg": rep_data.get("knee_flexion_deg"),
                "trunk_angle_deg": rep_data.get("trunk_angle_deg"),
                "pose_confidence": rep_data.get("pose_confidence"),
            }
            scored_rep.update(scores)
            scored_reps.append(scored_rep)

        # Fatigue analysis
        fatigue_result = fatigue_engine.compute_set_fatigue(scored_reps)

        # Session summary
        composite_scores = [
            r["composite_score"] for r in scored_reps if r.get("composite_score") is not None
        ]
        avg_form = (
            round(sum(composite_scores) / len(composite_scores), 1)
            if composite_scores
            else None
        )

        result = {
            "exercise_type": exercise_type,
            "total_reps": len(scored_reps),
            "fps": fps,
            "total_frames": frame_idx,
            "avg_form_score": avg_form,
            "fatigue_index": fatigue_result.get("fatigue_index"),
            "fatigue_risk": fatigue_result.get("fatigue_risk"),
            "reps": scored_reps,
        }

        # Update both cache and DB
        with _CACHE_LOCK:
            _JOB_CACHE[job_id]["status"] = "completed"
            _JOB_CACHE[job_id]["result"] = result
        _update_job_sync(job_id, "completed", result=result)

    except Exception as exc:
        logger.exception("Analysis job %s failed", job_id)
        with _CACHE_LOCK:
            _JOB_CACHE[job_id]["status"] = "failed"
            _JOB_CACHE[job_id]["error"] = str(exc)
        _update_job_sync(job_id, "failed", error=str(exc))
    finally:
        # Clean up temp video
        try:
            Path(video_path).unlink(missing_ok=True)
        except Exception:
            pass


# ---------------------------------------------------------------------------
# POST / -- upload video for analysis
# ---------------------------------------------------------------------------

@router.post(
    "/",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Upload a video for async analysis",
)
async def upload_video(
    file: UploadFile = File(..., description="Video file to analyse"),
    exercise_type: str = Form(default="squat", description="Exercise type"),
) -> JSONResponse:
    """Accept a video upload, start background analysis, return a job ID."""
    # Validate exercise type upfront
    try:
        get_exercise_by_name(exercise_type)
    except KeyError:
        from backend.core.exercises.base import ExerciseType
        valid = [e.value for e in ExerciseType]
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown exercise type {exercise_type!r}. Valid types: {valid}",
        )

    # Validate MIME type (accept common video formats)
    _ALLOWED_MIMES = {
        "video/mp4", "video/quicktime", "video/x-msvideo", "video/webm",
        "video/x-matroska", "video/mpeg", "video/ogg",
        "application/octet-stream",  # some browsers send this for video
    }
    _ALLOWED_EXTENSIONS = {".mp4", ".mov", ".avi", ".webm", ".mkv", ".mpeg", ".mpg", ".ogg"}

    content_type = (file.content_type or "").lower()
    raw_suffix = Path(file.filename or "video.mp4").suffix.lower() or ".mp4"

    if content_type not in _ALLOWED_MIMES and raw_suffix not in _ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported file type '{content_type}'. Upload a video file (mp4, mov, avi, webm, mkv).",
        )

    # Sanitize suffix — only allow known video extensions
    suffix = raw_suffix if raw_suffix in _ALLOWED_EXTENSIONS else ".mp4"

    # Save upload to temp file (with size limit)
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    try:
        total_read = 0
        while True:
            chunk = await file.read(1024 * 1024)  # 1 MB chunks
            if not chunk:
                break
            total_read += len(chunk)
            if total_read > _MAX_UPLOAD_BYTES:
                tmp.close()
                Path(tmp.name).unlink(missing_ok=True)
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail=f"File too large. Maximum size is {_MAX_UPLOAD_BYTES // (1024*1024)} MB.",
                )
            tmp.write(chunk)
        tmp.flush()
        tmp.close()
    except HTTPException:
        raise
    except Exception as exc:
        tmp.close()
        Path(tmp.name).unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to read uploaded file: {exc}",
        )

    job_id = uuid.uuid4().hex

    # Persist to database
    async with AsyncSessionLocal() as db:
        db_job = AnalysisJob(
            id=job_id,
            status="pending",
            exercise_type=exercise_type,
        )
        db.add(db_job)
        await db.commit()

    # Write-through to in-memory cache
    with _CACHE_LOCK:
        # Evict oldest cached entry if at capacity
        if len(_JOB_CACHE) >= _MAX_CACHE:
            oldest_key = min(_JOB_CACHE, key=lambda k: _JOB_CACHE[k].get("created", 0))
            del _JOB_CACHE[oldest_key]

        _JOB_CACHE[job_id] = {
            "status": "pending",
            "result": None,
            "error": None,
            "created": time.time(),
        }

    # Start background thread
    thread = threading.Thread(
        target=_run_analysis,
        args=(job_id, tmp.name, exercise_type),
        daemon=True,
    )
    thread.start()

    return JSONResponse(
        status_code=status.HTTP_202_ACCEPTED,
        content={"job_id": job_id, "status": "pending"},
    )


# ---------------------------------------------------------------------------
# GET /{job_id} -- poll job status
# ---------------------------------------------------------------------------

@router.get(
    "/{job_id}",
    summary="Poll analysis job status",
)
async def get_job_status(job_id: str) -> JSONResponse:
    """Return 202 while pending, 200 with results when done, 500 if failed."""
    # Check in-memory cache first (fast path for active jobs)
    with _CACHE_LOCK:
        cached = _JOB_CACHE.get(job_id)

    if cached is not None:
        return _build_job_response(job_id, cached["status"], cached.get("result"), cached.get("error"))

    # Fall back to database (for jobs from before a restart)
    async with AsyncSessionLocal() as db:
        stmt = select(AnalysisJob).where(AnalysisJob.id == job_id)
        result = await db.execute(stmt)
        job = result.scalars().first()

    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found",
        )

    return _build_job_response(job_id, job.status, job.result, job.error)


def _build_job_response(job_id: str, job_status: str, result: dict | None, error: str | None) -> JSONResponse:
    """Build a JSONResponse based on job status."""
    if job_status == "pending":
        return JSONResponse(
            status_code=status.HTTP_202_ACCEPTED,
            content={"job_id": job_id, "status": "pending"},
        )

    if job_status == "failed":
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "job_id": job_id,
                "status": "failed",
                "error": error or "Unknown error",
            },
        )

    # completed
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "job_id": job_id,
            "status": "completed",
            "result": result,
        },
    )
