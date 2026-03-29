"""Session management router: create, list, detail, update, sets, delete."""

from __future__ import annotations

import logging
import math
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import JSONResponse
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.deps import get_current_user_id, get_db
from backend.models.user import User

logger = logging.getLogger("squatsense.sessions")
from backend.models.rep import Rep
from backend.models.session import Session, Set
from backend.schemas.session import (
    PopulateSetRequest,
    PopulateSetResponse,
    SessionCreate,
    SessionListItem,
    SessionListResponse,
    SessionResponse,
    SetCreate,
    SetResponse,
    SetSummaryInfo,
)

router = APIRouter(prefix="/sessions", tags=["sessions"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _build_session_response(session: Session) -> SessionResponse:
    """Transform a Session ORM object into the API response model."""
    sets_response = []
    for s in (session.sets or []):
        reps_resp = []
        last_rep_ts = None
        for r in (s.reps or []):
            reps_resp.append({
                "id": r.id,
                "set_id": r.set_id,
                "rep_number": r.rep_number,
                "depth_angle": r.primary_angle_deg,
                "knee_valgus_angle": r.secondary_angle_deg,
                "hip_shift": r.com_offset_norm,
                "trunk_lean": r.trunk_angle_deg,
                "tempo_seconds": (r.duration_ms / 1000.0) if r.duration_ms else None,
                "form_score": r.composite_score,
                "depth_score": r.depth_score,
                "stability_score": r.stability_score,
                "symmetry_score": r.symmetry_score,
                "tempo_score": r.tempo_score,
                "rom_score": r.rom_score,
                "flags": r.flags if isinstance(r.flags, list) else None,
                "timestamp": r.timestamp,
                "eccentric_ms": r.eccentric_ms,
                "pause_ms": r.pause_ms,
                "concentric_ms": r.concentric_ms,
            })
            if r.timestamp is not None:
                last_rep_ts = r.timestamp
        sets_response.append(
            SetResponse(
                id=s.id,
                session_id=s.session_id,
                set_number=s.set_number,
                target_reps=s.target_reps or 0,
                actual_reps=s.actual_reps or 0,
                load_used=s.load_used,
                avg_form_score=s.avg_form_score,
                started_at=s.created_at,
                completed_at=last_rep_ts,
                reps=reps_resp,
            )
        )

    # Identify strongest/weakest sets by avg_form_score
    scored_sets = [s for s in (session.sets or []) if s.avg_form_score is not None]
    strongest = None
    weakest = None
    if scored_sets:
        best = max(scored_sets, key=lambda s: s.avg_form_score)
        worst = min(scored_sets, key=lambda s: s.avg_form_score)
        strongest = SetSummaryInfo(
            set_number=best.set_number,
            actual_reps=best.actual_reps or 0,
            avg_form_score=best.avg_form_score,
            load_used=best.load_used,
        )
        weakest = SetSummaryInfo(
            set_number=worst.set_number,
            actual_reps=worst.actual_reps or 0,
            avg_form_score=worst.avg_form_score,
            load_used=worst.load_used,
        )

    return SessionResponse(
        id=session.id,
        user_id=session.user_id,
        exercise_type=session.exercise_type,
        source=session.source,
        load_used=session.load_used,
        total_reps=session.total_reps or 0,
        total_sets=session.total_sets or 0,
        avg_form_score=session.avg_form_score,
        fatigue_index=session.fatigue_index,
        fatigue_risk=session.fatigue_risk,
        started_at=session.started_at,
        completed_at=session.completed_at,
        created_at=session.created_at,
        sets=sets_response,
        strongest_set=strongest,
        weakest_set=weakest,
    )


async def _get_user_session(
    session_id: UUID,
    user_id: UUID,
    db: AsyncSession,
) -> Session:
    """Load a session with sets/reps, verifying ownership."""
    result = await db.execute(
        select(Session)
        .where(Session.id == session_id, Session.user_id == user_id)
        .options(
            selectinload(Session.sets).selectinload(Set.reps),
            selectinload(Session.reps),
        )
    )
    session = result.scalars().first()
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )
    return session


# ---------------------------------------------------------------------------
# POST / -- create session
# ---------------------------------------------------------------------------

@router.post(
    "/",
    response_model=SessionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Start a new training session",
)
async def create_session(
    body: SessionCreate,
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> SessionResponse:
    """Create a new session for the authenticated user."""
    # Sanitize exercise_type: strip query params and validate
    exercise_type = body.exercise_type.split("?")[0].strip().lower()
    from backend.core.exercises.base import ExerciseType
    valid_types = {e.value for e in ExerciseType}
    if exercise_type not in valid_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown exercise type {exercise_type!r}. Valid types: {sorted(valid_types)}",
        )

    session = Session(
        user_id=user_id,
        exercise_type=exercise_type,
        source=body.source,
        load_used=body.load_used,
        status="active",
        total_reps=0,
        total_sets=0,
        started_at=datetime.now(timezone.utc),
    )
    db.add(session)
    await db.flush()

    # New session has no sets/reps — build response directly to avoid
    # lazy-loading relationships in async context (MissingGreenlet).
    return SessionResponse(
        id=session.id,
        user_id=session.user_id,
        exercise_type=session.exercise_type,
        source=session.source,
        load_used=session.load_used,
        total_reps=0,
        total_sets=0,
        avg_form_score=None,
        fatigue_index=None,
        fatigue_risk=None,
        started_at=session.started_at,
        completed_at=None,
        created_at=session.created_at,
        sets=[],
        strongest_set=None,
        weakest_set=None,
    )


# ---------------------------------------------------------------------------
# GET / -- list sessions (paginated)
# ---------------------------------------------------------------------------

@router.get(
    "/",
    response_model=SessionListResponse,
    summary="List user's sessions (paginated)",
)
async def list_sessions(
    page: int = Query(default=1, ge=1, description="Page number"),
    page_size: int = Query(default=20, ge=1, le=100, description="Items per page"),
    exercise_type: str | None = Query(default=None, description="Filter by exercise type"),
    start_date: datetime | None = Query(default=None, description="Filter sessions from this date (ISO)"),
    end_date: datetime | None = Query(default=None, description="Filter sessions until this date (ISO)"),
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> SessionListResponse:
    """Return a paginated list of the user's sessions with optional filters."""
    filters = [Session.user_id == user_id]
    if exercise_type:
        filters.append(Session.exercise_type == exercise_type)
    if start_date:
        filters.append(Session.created_at >= start_date)
    if end_date:
        filters.append(Session.created_at <= end_date)

    # Total count
    count_result = await db.execute(
        select(func.count()).select_from(Session).where(*filters)
    )
    total = count_result.scalar() or 0
    pages = math.ceil(total / page_size) if total > 0 else 0
    offset = (page - 1) * page_size

    result = await db.execute(
        select(Session)
        .where(*filters)
        .order_by(Session.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    sessions = result.scalars().all()

    items = [
        SessionListItem(
            id=s.id,
            exercise_type=s.exercise_type,
            total_reps=s.total_reps or 0,
            avg_form_score=s.avg_form_score,
            fatigue_risk=s.fatigue_risk,
            created_at=s.created_at,
        )
        for s in sessions
    ]

    return SessionListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
    )


# ---------------------------------------------------------------------------
# GET /{session_id} -- session detail
# ---------------------------------------------------------------------------

@router.get(
    "/{session_id}",
    response_model=SessionResponse,
    summary="Get session detail with sets and reps",
)
async def get_session(
    session_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> SessionResponse:
    """Return full session data including nested sets and reps."""
    logger.info("GET session %s for user %s", session_id, user_id)
    session = await _get_user_session(session_id, user_id, db)
    resp = _build_session_response(session)
    logger.info(
        "GET session %s: sets=%d, total_reps=%d, avg_form=%s, "
        "fatigue_idx=%s, fatigue_risk=%s",
        session_id, len(resp.sets), resp.total_reps, resp.avg_form_score,
        resp.fatigue_index, resp.fatigue_risk,
    )
    for s in resp.sets:
        logger.info(
            "  set %d: actual_reps=%d, avg_form=%s, load=%s, reps_count=%d",
            s.set_number, s.actual_reps, s.avg_form_score, s.load_used,
            len(s.reps) if s.reps else 0,
        )
        for r in (s.reps or []):
            logger.info(
                "    rep %s: composite=%s depth=%s stab=%s sym=%s "
                "tempo=%s rom=%s | angle=%s trunk=%s depth_ok=%s",
                r.get("rep_number") if isinstance(r, dict) else getattr(r, "rep_number", "?"),
                r.get("form_score") if isinstance(r, dict) else getattr(r, "form_score", "?"),
                r.get("depth_score") if isinstance(r, dict) else getattr(r, "depth_score", "?"),
                r.get("stability_score") if isinstance(r, dict) else getattr(r, "stability_score", "?"),
                r.get("symmetry_score") if isinstance(r, dict) else getattr(r, "symmetry_score", "?"),
                r.get("tempo_score") if isinstance(r, dict) else getattr(r, "tempo_score", "?"),
                r.get("rom_score") if isinstance(r, dict) else getattr(r, "rom_score", "?"),
                r.get("depth_angle") if isinstance(r, dict) else getattr(r, "depth_angle", "?"),
                r.get("trunk_lean") if isinstance(r, dict) else getattr(r, "trunk_lean", "?"),
                r.get("flags") if isinstance(r, dict) else getattr(r, "flags", "?"),
            )
    return resp


# ---------------------------------------------------------------------------
# PUT /{session_id} -- update session
# ---------------------------------------------------------------------------

@router.put(
    "/{session_id}",
    response_model=SessionResponse,
    summary="Update session fields",
)
async def update_session(
    session_id: UUID,
    session_status: str | None = Query(default=None, alias="status", description="Session status"),
    load_used: float | None = Query(default=None, ge=0.0, description="Load in kg"),
    ai_coaching: str | None = Query(default=None, description="AI coaching feedback"),
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> SessionResponse:
    """Update mutable session fields (status, load, AI coaching)."""
    session = await _get_user_session(session_id, user_id, db)

    if session_status is not None:
        session.status = session_status
        if session_status == "completed" and session.completed_at is None:
            session.completed_at = datetime.now(timezone.utc)
    if load_used is not None:
        session.load_used = load_used
    if ai_coaching is not None:
        session.ai_coaching = ai_coaching

    db.add(session)
    await db.flush()

    return _build_session_response(session)


# ---------------------------------------------------------------------------
# POST /{session_id}/end -- end session and trigger analysis
# ---------------------------------------------------------------------------

@router.post(
    "/{session_id}/end",
    response_model=SessionResponse,
    summary="End a session, compute aggregates, and mark completed",
)
async def end_session(
    session_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> SessionResponse:
    """End a session by setting status to completed, computing aggregates, and returning the result.

    This endpoint:
    1. Sets the session status to 'completed' and records the completed_at timestamp.
    2. Aggregates total_reps, total_sets, and avg_form_score from the session's sets and reps.
    3. Returns the completed session.
    """
    logger.info("POST end_session: session=%s user=%s", session_id, user_id)
    session = await _get_user_session(session_id, user_id, db)

    # Mark as completed
    session.status = "completed"
    if session.completed_at is None:
        session.completed_at = datetime.now(timezone.utc)

    # Compute aggregates from sets
    sets = session.sets or []
    reps = session.reps or []

    total_sets = len(sets)
    total_reps_from_sets = sum((s.actual_reps or 0) for s in sets)
    # Also count direct reps if sets have no reps tracked
    total_reps_from_reps = len(reps)
    total_reps = max(total_reps_from_sets, total_reps_from_reps)

    # Compute avg form score from reps (composite_score) or sets (avg_form_score)
    rep_scores = [r.composite_score for r in reps if r.composite_score is not None]
    set_scores = [s.avg_form_score for s in sets if s.avg_form_score is not None]

    avg_form_score = None
    if rep_scores:
        avg_form_score = round(sum(rep_scores) / len(rep_scores), 1)
    elif set_scores:
        avg_form_score = round(sum(set_scores) / len(set_scores), 1)

    session.total_sets = total_sets
    session.total_reps = total_reps

    # If no reps were recorded, delete the empty session instead of saving it
    if total_reps == 0:
        logger.info(
            "end_session %s: 0 reps recorded — deleting empty session",
            session_id,
        )
        await db.delete(session)
        await db.flush()
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={"detail": "Session discarded — no reps recorded.", "discarded": True},
        )

    if avg_form_score is not None:
        session.avg_form_score = avg_form_score

    # Propagate fatigue from sets to session level
    set_fatigues = [s.fatigue_index for s in sets if s.fatigue_index is not None]
    set_risks = [s.fatigue_risk for s in sets if s.fatigue_risk is not None]
    if set_fatigues:
        session.fatigue_index = round(sum(set_fatigues) / len(set_fatigues), 1)
    if set_risks:
        risk_order = {"low": 0, "moderate": 1, "high": 2}
        max_risk_level = max(risk_order.get(r, 0) for r in set_risks)
        session.fatigue_risk = {0: "low", 1: "moderate", 2: "high"}[max_risk_level]

    # --- P2-13: Auto-update estimated 1RM on user's training_max ---
    load = session.load_used
    if load is not None and load > 0 and total_reps > 0 and total_reps <= 12:
        # Epley formula: 1RM = load * (1 + reps / 30)
        estimated_1rm = round(load * (1.0 + total_reps / 30.0), 1)
        user_result = await db.execute(
            select(User).where(User.id == user_id)
        )
        user = user_result.scalars().first()
        if user is not None:
            current_tm = user.training_max or {}
            et = session.exercise_type
            # Only update if new estimate is higher than existing
            existing = current_tm.get(et)
            if existing is None or estimated_1rm > existing:
                updated_tm = dict(current_tm)
                updated_tm[et] = estimated_1rm
                user.training_max = updated_tm
                db.add(user)
                logger.info(
                    "Updated training_max for user %s: %s = %.1f kg (was %s)",
                    user_id, et, estimated_1rm, existing,
                )

    # --- P2-16: Compute session duration ---
    if session.started_at and session.completed_at:
        duration_sec = (session.completed_at - session.started_at).total_seconds()
        logger.info("Session duration: %.0f seconds", duration_sec)

    # --- P2-16: Compute current_streak (consecutive days with sessions) ---
    # Done in analytics/summary instead (query-time computation)

    db.add(session)
    await db.flush()

    logger.info(
        "end_session %s: total_sets=%d, total_reps=%d, avg_form=%s, "
        "fatigue_index=%s, fatigue_risk=%s",
        session_id, total_sets, total_reps, avg_form_score,
        session.fatigue_index, session.fatigue_risk,
    )

    return _build_session_response(session)


# ---------------------------------------------------------------------------
# POST /{session_id}/populate-set-from-analysis -- add a set from video upload
# ---------------------------------------------------------------------------

@router.post(
    "/{session_id}/populate-set-from-analysis",
    response_model=PopulateSetResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Populate a set from video analysis results",
)
async def populate_set_from_analysis(
    session_id: UUID,
    body: PopulateSetRequest,
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> PopulateSetResponse:
    """Create a Set and its Reps from a completed analysis job result.

    Used by the video-upload flow: each uploaded video becomes one set.
    """
    logger.info(
        "POST populate_set_from_analysis: session=%s set=%d user=%s",
        session_id, body.set_number, user_id,
    )
    session = await _get_user_session(session_id, user_id, db)

    result = body.analysis_result
    reps_data = result.get("reps", [])

    if not reps_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Analysis result contains no reps.",
        )

    # Create the Set
    new_set = Set(
        session_id=session.id,
        set_number=body.set_number,
        target_reps=len(reps_data),
        actual_reps=len(reps_data),
        load_used=session.load_used,
    )
    db.add(new_set)
    await db.flush()  # get new_set.id

    # Create Rep records
    composite_scores: list[float] = []
    for rd in reps_data:
        dur = rd.get("duration_sec")
        rep = Rep(
            set_id=new_set.id,
            session_id=session.id,
            rep_number=rd.get("rep_number", 1),
            duration_ms=int(dur * 1000) if dur else None,
            eccentric_ms=rd.get("eccentric_ms"),
            pause_ms=rd.get("pause_ms"),
            concentric_ms=rd.get("concentric_ms"),
            composite_score=rd.get("composite_score"),
            depth_score=rd.get("depth_score"),
            stability_score=rd.get("stability_score"),
            symmetry_score=rd.get("symmetry_score"),
            tempo_score=rd.get("tempo_score"),
            rom_score=rd.get("rom_score"),
            primary_angle_deg=rd.get("knee_flexion_deg"),
            trunk_angle_deg=rd.get("trunk_angle_deg"),
            com_offset_norm=rd.get("com_offset_norm"),
            speed_proxy=rd.get("speed_proxy"),
            depth_ok=rd.get("depth_ok"),
            form_ok=rd.get("form_ok"),
            balance_ok=rd.get("balance_ok"),
            timestamp=datetime.now(timezone.utc),
        )
        db.add(rep)
        if rd.get("composite_score") is not None:
            composite_scores.append(rd["composite_score"])

    # Compute set-level aggregates
    avg_form = (
        round(sum(composite_scores) / len(composite_scores), 1)
        if composite_scores else None
    )
    new_set.avg_form_score = avg_form

    # Compute fatigue for this set
    from backend.services.fatigue import FatigueEngine
    fatigue_engine = FatigueEngine()
    fatigue_result = fatigue_engine.compute_set_fatigue(reps_data)
    new_set.fatigue_index = fatigue_result.get("fatigue_index")
    new_set.fatigue_risk = fatigue_result.get("fatigue_risk")

    db.add(new_set)
    await db.flush()

    logger.info(
        "populate_set_from_analysis: session=%s set=%d reps=%d avg_form=%s fatigue=%s",
        session_id, body.set_number, len(reps_data), avg_form, fatigue_result,
    )

    return PopulateSetResponse(
        set_number=body.set_number,
        reps=len(reps_data),
        avg_form_score=avg_form,
        fatigue_index=fatigue_result.get("fatigue_index"),
        fatigue_risk=fatigue_result.get("fatigue_risk"),
    )


# ---------------------------------------------------------------------------
# POST /{session_id}/sets -- add a set
# ---------------------------------------------------------------------------

@router.post(
    "/{session_id}/sets",
    response_model=SetResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add a set to a session",
)
async def add_set(
    session_id: UUID,
    body: SetCreate,
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> SetResponse:
    """Add a new set to the session."""
    logger.info(
        "POST add_set: session=%s, target_reps=%s, load=%s",
        session_id, body.target_reps, body.load_used,
    )
    session = await _get_user_session(session_id, user_id, db)

    # Determine the next set number
    existing_sets = session.sets or []
    next_set_number = len(existing_sets) + 1

    new_set = Set(
        session_id=session.id,
        set_number=next_set_number,
        target_reps=body.target_reps,
        actual_reps=0,
        load_used=body.load_used,
    )
    db.add(new_set)

    # Update session total_sets
    session.total_sets = next_set_number
    db.add(session)

    # Commit eagerly so the WebSocket end_set handler (which opens its own
    # DB connection) can find this Set row immediately.  The get_db
    # dependency's post-yield commit() becomes a no-op.
    await db.commit()

    return SetResponse(
        id=new_set.id,
        session_id=new_set.session_id,
        set_number=new_set.set_number,
        target_reps=new_set.target_reps or 0,
        actual_reps=new_set.actual_reps or 0,
        load_used=new_set.load_used,
        avg_form_score=new_set.avg_form_score,
        started_at=new_set.created_at,
        completed_at=None,
        reps=[],
    )


# ---------------------------------------------------------------------------
# DELETE /{session_id} -- delete session
# ---------------------------------------------------------------------------

@router.delete(
    "/{session_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a session and all associated data",
)
async def delete_session(
    session_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a session and cascade-delete its sets and reps."""
    # Verify ownership
    session = await _get_user_session(session_id, user_id, db)

    # Delete reps -> sets -> session (cascade should handle this, but be explicit)
    set_ids_q = select(Set.id).where(Set.session_id == session.id)
    await db.execute(delete(Rep).where(Rep.set_id.in_(set_ids_q)))
    await db.execute(delete(Set).where(Set.session_id == session.id))
    await db.execute(delete(Rep).where(Rep.session_id == session.id))
    await db.execute(delete(Session).where(Session.id == session.id))
    await db.flush()
