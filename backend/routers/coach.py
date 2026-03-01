"""AI coaching router: session feedback, corrective drills, latest coaching, drill history."""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.deps import get_current_user, get_current_user_id, get_db
from backend.models.session import Session, Set
from backend.models.user import User
from backend.ai.coach import ai_coach_feedback, get_corrective_drills

logger = logging.getLogger("squatsense.coach")

router = APIRouter(prefix="/coach", tags=["coach"])


# ---------------------------------------------------------------------------
# Helpers for coaching history (variety across sessions)
# ---------------------------------------------------------------------------

async def _get_recent_coaching(
    db: AsyncSession,
    user_id: UUID,
    exclude_session_id: UUID | None = None,
    limit: int = 3,
) -> list[dict[str, Any]]:
    """Retrieve coaching from the user's recent sessions.

    Returns up to *limit* parsed coaching dicts (newest first) so the AI
    prompt can avoid repeating the same drills and cues.
    """
    query = (
        select(Session.ai_coaching)
        .where(
            Session.user_id == user_id,
            Session.ai_coaching.isnot(None),
        )
        .order_by(Session.created_at.desc())
        .limit(limit + 1)  # fetch one extra in case we need to exclude
    )
    if exclude_session_id is not None:
        query = query.where(Session.id != exclude_session_id)

    result = await db.execute(query)
    rows = result.scalars().all()

    coaching_history: list[dict[str, Any]] = []
    for raw in rows:
        if not raw:
            continue
        try:
            parsed = json.loads(raw) if isinstance(raw, str) else raw
            if isinstance(parsed, dict) and parsed.get("coaching_cues"):
                coaching_history.append(parsed)
        except (json.JSONDecodeError, TypeError):
            continue
        if len(coaching_history) >= limit:
            break

    return coaching_history


async def _save_coaching_to_session(
    db: AsyncSession,
    session: Session,
    coaching: dict[str, Any],
) -> None:
    """Persist coaching feedback JSON to the session's ai_coaching field."""
    try:
        session.ai_coaching = json.dumps(coaching)
        db.add(session)
        await db.flush()
        logger.info("Saved coaching to session %s", session.id)
    except Exception:
        logger.exception("Failed to save coaching to session %s", session.id)


# ---------------------------------------------------------------------------
# POST /feedback -- AI coaching for a session
# ---------------------------------------------------------------------------

@router.post(
    "/feedback",
    summary="Get AI coaching feedback for a completed session",
)
async def get_feedback(
    session_id: UUID = Query(..., description="Session ID to analyse"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Generate AI coaching feedback for a given session.

    Returns structured coaching cues, a corrective drill, and a recovery
    suggestion.  Falls back to a static response when the AI coach is
    disabled or unavailable.
    """
    user_id = user.id
    logger.info("POST feedback: session=%s user=%s (loading session data...)", session_id, user_id)

    # Build user context for personalised coaching
    user_context = {
        "experience_level": user.experience_level,
        "goal": user.goal,
        "injury_history": user.injury_history,
    }

    # Load session with sets and reps
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

    # Build rep dicts for the AI coach
    reps_data: list[dict[str, Any]] = []
    for rep in (session.reps or []):
        reps_data.append({
            "rep": rep.rep_number,
            "composite_score": rep.composite_score,
            "depth_score": rep.depth_score,
            "stability_score": rep.stability_score,
            "symmetry_score": rep.symmetry_score,
            "tempo_score": rep.tempo_score,
            "rom_score": rep.rom_score,
            "primary_angle_deg": rep.primary_angle_deg,
            "trunk_angle_deg": rep.trunk_angle_deg,
            "com_offset_norm": rep.com_offset_norm,
            "speed_proxy": rep.speed_proxy,
            "duration_ms": rep.duration_ms,
            "depth_ok": rep.depth_ok,
            "form_ok": rep.form_ok,
            "balance_ok": rep.balance_ok,
            "trunk_ok": rep.trunk_ok,
            "risk_markers": rep.risk_markers,
            "flags": rep.flags,
            "pose_confidence": rep.pose_confidence,
            "needs_review": rep.needs_review,
        })

    # Build set dicts
    sets_data: list[dict[str, Any]] = []
    for s in (session.sets or []):
        sets_data.append({
            "set_number": s.set_number,
            "actual_reps": s.actual_reps,
            "avg_form_score": s.avg_form_score,
            "fatigue_index": s.fatigue_index,
            "fatigue_risk": s.fatigue_risk,
            "depth_ok": s.depth_ok,
            "stability_ok": s.stability_ok,
            "tempo_ok": s.tempo_ok,
        })

    logger.info(
        "COACH input: session=%s exercise=%s reps=%d sets=%d "
        "fatigue_idx=%s fatigue_risk=%s avg_form=%s",
        session_id, session.exercise_type, len(reps_data), len(sets_data),
        session.fatigue_index, session.fatigue_risk, session.avg_form_score,
    )
    for i, rd in enumerate(reps_data):
        logger.info(
            "  rep %d input: composite=%s depth=%s stab=%s sym=%s "
            "tempo=%s rom=%s depth_ok=%s form_ok=%s balance_ok=%s",
            i + 1, rd.get("composite_score"), rd.get("depth_score"),
            rd.get("stability_score"), rd.get("symmetry_score"),
            rd.get("tempo_score"), rd.get("rom_score"),
            rd.get("depth_ok"), rd.get("form_ok"), rd.get("balance_ok"),
        )

    # Fetch recent coaching from past sessions to avoid repetition
    previous_coaching = await _get_recent_coaching(db, user_id, exclude_session_id=session_id, limit=3)

    # Call AI coach (LLM-powered, may return None if disabled)
    coaching = await ai_coach_feedback(
        exercise_type=session.exercise_type,
        reps=reps_data,
        sets=sets_data,
        fatigue_index=session.fatigue_index,
        fatigue_risk=session.fatigue_risk,
        user_context=user_context,
        previous_coaching=previous_coaching,
    )

    if coaching is not None:
        from backend.ai.coach import _collect_risk_markers
        risk_counts = _collect_risk_markers(reps_data)
        logger.info(
            "COACH AI feedback: session=%s exercise=%s reps_count=%d "
            "risk_markers=%s cues=%s drill=%s",
            session_id, session.exercise_type, len(reps_data),
            sorted(risk_counts.keys()),
            coaching.get("coaching_cues", []),
            coaching.get("corrective_drill", {}).get("name", "none"),
        )
        # Persist coaching to session for future variety
        await _save_coaching_to_session(db, session, coaching)
        return {
            "session_id": str(session_id),
            "exercise_type": session.exercise_type,
            "detected_risk_markers": sorted(risk_counts.keys()),
            "coaching": coaching,
        }

    # Fallback: data-driven coaching based on actual rep metrics
    from backend.ai.coach import _collect_risk_markers

    cues: list[str] = []

    # Analyse rep-level boolean flags and sub-scores
    total = len(reps_data)
    if total > 0:
        depth_fail = sum(1 for r in reps_data if r.get("depth_ok") is False)
        trunk_fail = sum(1 for r in reps_data if r.get("trunk_ok") is False)
        balance_fail = sum(1 for r in reps_data if r.get("balance_ok") is False)
        form_fail = sum(1 for r in reps_data if r.get("form_ok") is False)

        # Depth cue — actionable coaching based on angle data
        if depth_fail > total * 0.4:
            from backend.core.exercises import ExerciseType, get_exercise_config
            try:
                ex_config = get_exercise_config(ExerciseType(session.exercise_type))
                ideal_lo = ex_config.ideal_depth_range[0]
            except (ValueError, KeyError):
                ideal_lo = 95.0
            angles = [r.get("primary_angle_deg") for r in reps_data
                       if r.get("primary_angle_deg") is not None]
            avg_angle = sum(angles) / len(angles) if angles else 0
            if avg_angle >= ideal_lo:
                cues.append(
                    f"Depth was flagged in {depth_fail}/{total} reps despite "
                    f"knee angles averaging {avg_angle:.0f}°. Focus on controlled "
                    "hip hinge — sit back into the squat and hold the bottom "
                    "position for 1-2 seconds to build confidence at depth."
                )
            else:
                deficit = ideal_lo - avg_angle
                cues.append(
                    f"Depth was insufficient in {depth_fail}/{total} reps "
                    f"(avg {avg_angle:.0f}° vs target {ideal_lo:.0f}°). "
                    "Work on ankle and hip mobility — try goblet squats to a box "
                    "set at parallel, pausing 2 seconds at the bottom."
                )
        # Trunk cue
        if trunk_fail > total * 0.4:
            trunk_angles = [r.get("trunk_angle_deg") for r in reps_data
                            if r.get("trunk_angle_deg") is not None]
            avg_trunk = sum(trunk_angles) / len(trunk_angles) if trunk_angles else 0
            cues.append(
                f"Excessive forward lean in {trunk_fail}/{total} reps "
                f"(avg trunk angle {avg_trunk:.0f}°). "
                "Brace your core before descending and focus on driving your "
                "chest up as you rise out of the bottom."
            )
        # Balance cue
        if balance_fail > total * 0.4:
            cues.append(
                f"Balance was off in {balance_fail}/{total} reps. "
                "Keep weight distributed across mid-foot, slow down the eccentric "
                "(3 seconds down), and practice single-leg balance holds."
            )

    # Sub-score based cues — actionable coaching
    if total > 0:
        sym_scores = [r.get("symmetry_score") for r in reps_data if r.get("symmetry_score") is not None]
        if sym_scores:
            avg_sym = sum(sym_scores) / len(sym_scores)
            if avg_sym < 50:
                cues.append(
                    f"Left-right symmetry averaged {avg_sym:.0f}/100. "
                    "Add unilateral work like Bulgarian split squats or single-leg "
                    "Romanian deadlifts (3x8 per side) to address the imbalance."
                )
        stab_scores = [r.get("stability_score") for r in reps_data if r.get("stability_score") is not None]
        if stab_scores:
            avg_stab = sum(stab_scores) / len(stab_scores)
            if avg_stab < 60:
                cues.append(
                    f"Stability averaged {avg_stab:.0f}/100. Slow your tempo to "
                    "3 seconds down, 1 second pause, 2 seconds up. Add Pallof "
                    "presses (3x10 per side) to strengthen core anti-rotation."
                )
        # Tempo cue for very inconsistent reps
        tempo_scores = [r.get("tempo_score") for r in reps_data if r.get("tempo_score") is not None]
        if tempo_scores:
            avg_tempo = sum(tempo_scores) / len(tempo_scores)
            if avg_tempo < 50:
                cues.append(
                    f"Tempo consistency averaged {avg_tempo:.0f}/100. "
                    "Use a metronome or count '1-2-3 down, 1 pause, 1-2 up' "
                    "to build consistent rep timing."
                )

    if session.avg_form_score is not None and session.avg_form_score < 70:
        cues.append("Overall form score is below 70. Focus on controlled movement through the full range of motion.")
    if session.fatigue_risk == "high":
        cues.append("Fatigue risk is high. Consider reducing load or volume next session.")

    # Injury-aware coaching cues from user profile
    injuries = user_context.get("injury_history", [])
    if isinstance(injuries, list):
        for inj in injuries:
            area = inj.get("area", "") if isinstance(inj, dict) else str(inj)
            area_lower = area.lower()
            if "knee" in area_lower:
                cues.append(
                    "Due to your knee injury history: avoid locking out aggressively, "
                    "monitor any pain during deep flexion, and consider wrapping or bracing if needed."
                )
            elif "back" in area_lower or "spine" in area_lower or "lumbar" in area_lower:
                cues.append(
                    "Due to your back injury history: prioritise bracing before every rep, "
                    "avoid rounding under load, and consider a belt for working sets."
                )
            elif "shoulder" in area_lower:
                cues.append(
                    "Due to your shoulder injury history: warm up thoroughly, "
                    "keep elbows tucked, and stop if you feel any sharp pain overhead."
                )
            elif "hip" in area_lower:
                cues.append(
                    "Due to your hip injury history: focus on controlled depth, "
                    "warm up with hip circles and 90/90 stretches, and avoid bouncing at the bottom."
                )

    if not cues:
        cues.append("Maintain your current training intensity and focus on consistency.")

    # Pick a targeted corrective drill based on detected risk markers
    # Use session ID hash for drill rotation across sessions
    risk_counts = _collect_risk_markers(reps_data)
    drills = get_corrective_drills(
        session.exercise_type, risk_counts, rotation_seed=hash(str(session.id))
    )
    top_drill = drills[0] if drills else {
        "name": "General Mobility Flow",
        "description": (
            "Perform a 5-minute flow: 10 hip circles per direction, "
            "10 leg swings per side, 10 thoracic rotations per side, "
            "and 30 seconds of deep squat hold."
        ),
    }

    # Detect priority areas from risk markers
    detected_markers = sorted(risk_counts.keys())

    logger.info(
        "COACH static feedback: session=%s exercise=%s reps_count=%d "
        "risk_markers=%s cues_count=%d drill=%s",
        session_id, session.exercise_type, len(reps_data),
        detected_markers, len(cues), top_drill.get("name", "none"),
    )
    for i, cue in enumerate(cues):
        logger.info("  cue %d: %s", i + 1, cue[:120])

    static_coaching = {
        "coaching_cues": cues,
        "corrective_drill": top_drill,
        "recovery_suggestion": (
            "Allow 48 hours before training the same movement pattern again. "
            "Prioritise sleep and hydration."
        ),
        "provider": "static",
    }
    # Persist static coaching to session for future variety
    await _save_coaching_to_session(db, session, static_coaching)
    return {
        "session_id": str(session_id),
        "exercise_type": session.exercise_type,
        "detected_risk_markers": detected_markers,
        "coaching": static_coaching,
    }


# ---------------------------------------------------------------------------
# GET /drills -- corrective drills for risk markers
# ---------------------------------------------------------------------------

@router.get(
    "/drills",
    summary="Get corrective drills for specific risk markers",
)
async def get_drills(
    exercise_type: str = Query(..., description="Exercise type"),
    risk_markers: str = Query(
        ...,
        description=(
            "Comma-separated risk marker names "
            "(e.g. 'knee_valgus,shallow_depth')"
        ),
    ),
) -> dict[str, Any]:
    """Return corrective drills matching the supplied risk markers.

    The ``risk_markers`` query parameter is a comma-separated list of
    marker names.  Each marker with a matching entry in the drill database
    produces one drill in the response.
    """
    # Validate exercise type
    from backend.core.exercises.base import ExerciseType
    valid_types = {e.value for e in ExerciseType}
    if exercise_type not in valid_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown exercise type {exercise_type!r}. Valid types: {sorted(valid_types)}",
        )

    # Parse comma-separated markers into a dict with truthy values
    marker_names = [m.strip() for m in risk_markers.split(",") if m.strip()]
    if not marker_names:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one risk_marker is required",
        )

    markers_dict: dict[str, Any] = {name: True for name in marker_names}
    drills = get_corrective_drills(exercise_type, markers_dict)

    return {
        "exercise_type": exercise_type,
        "risk_markers": marker_names,
        "drills": drills,
    }


# ---------------------------------------------------------------------------
# GET /latest -- latest coaching feedback for the user
# ---------------------------------------------------------------------------

@router.get(
    "/latest",
    summary="Get latest coaching feedback for the most recent session",
)
async def get_latest_feedback(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Find the user's most recent session and return coaching data for it.

    If no sessions exist, returns a default empty coaching response.
    """
    user_id = user.id
    user_context = {
        "experience_level": user.experience_level,
        "goal": user.goal,
        "injury_history": user.injury_history,
    }

    # Find the most recent session
    result = await db.execute(
        select(Session)
        .where(Session.user_id == user_id)
        .options(
            selectinload(Session.sets).selectinload(Set.reps),
            selectinload(Session.reps),
        )
        .order_by(Session.created_at.desc())
        .limit(1)
    )
    session = result.scalars().first()

    if session is None:
        return {
            "session_id": None,
            "session_date": None,
            "exercise_type": None,
            "overall_assessment": "No sessions recorded yet.",
            "summary": "Start your first training session to receive personalised coaching feedback.",
            "cues": [],
            "priority_areas": [],
            "coaching": None,
        }

    session_date = session.created_at
    if isinstance(session_date, str):
        try:
            session_date = datetime.fromisoformat(session_date)
        except (ValueError, TypeError):
            session_date = None

    # Build rep dicts for the AI coach (reuse pattern from feedback endpoint)
    reps_data: list[dict[str, Any]] = []
    for rep in (session.reps or []):
        reps_data.append({
            "rep": rep.rep_number,
            "composite_score": rep.composite_score,
            "depth_score": rep.depth_score,
            "stability_score": rep.stability_score,
            "symmetry_score": rep.symmetry_score,
            "tempo_score": rep.tempo_score,
            "rom_score": rep.rom_score,
            "primary_angle_deg": rep.primary_angle_deg,
            "trunk_angle_deg": rep.trunk_angle_deg,
            "com_offset_norm": rep.com_offset_norm,
            "speed_proxy": rep.speed_proxy,
            "duration_ms": rep.duration_ms,
            "depth_ok": rep.depth_ok,
            "form_ok": rep.form_ok,
            "balance_ok": rep.balance_ok,
            "trunk_ok": rep.trunk_ok,
            "risk_markers": rep.risk_markers,
            "flags": rep.flags,
            "pose_confidence": rep.pose_confidence,
            "needs_review": rep.needs_review,
        })

    # Build set dicts
    sets_data: list[dict[str, Any]] = []
    for s in (session.sets or []):
        sets_data.append({
            "set_number": s.set_number,
            "actual_reps": s.actual_reps,
            "avg_form_score": s.avg_form_score,
            "fatigue_index": s.fatigue_index,
            "fatigue_risk": s.fatigue_risk,
            "depth_ok": s.depth_ok,
            "stability_ok": s.stability_ok,
            "tempo_ok": s.tempo_ok,
        })

    # Fetch recent coaching from past sessions to avoid repetition
    previous_coaching = await _get_recent_coaching(db, user_id, exclude_session_id=session.id, limit=3)

    # Try AI coach
    coaching = await ai_coach_feedback(
        exercise_type=session.exercise_type,
        reps=reps_data,
        sets=sets_data,
        fatigue_index=session.fatigue_index,
        fatigue_risk=session.fatigue_risk,
        user_context=user_context,
        previous_coaching=previous_coaching,
    )

    # Persist coaching to session for future variety
    if coaching is not None:
        await _save_coaching_to_session(db, session, coaching)

    # Build overall assessment and priority areas from session data
    avg_score = session.avg_form_score
    if avg_score is not None and avg_score >= 85:
        overall_assessment = "Excellent session. Form quality was consistently high."
    elif avg_score is not None and avg_score >= 70:
        overall_assessment = "Good session with room for improvement in some areas."
    elif avg_score is not None:
        overall_assessment = "This session highlighted several areas that need attention."
    else:
        overall_assessment = "Session completed. Form data is limited."

    # Determine priority areas from coaching cues or rep flags
    priority_areas: list[str] = []
    if coaching and isinstance(coaching.get("coaching_cues"), list):
        # Extract key themes from coaching cues (take first 3)
        priority_areas = coaching["coaching_cues"][:3]
    else:
        if avg_score is not None and avg_score < 70:
            priority_areas.append("Improve overall movement quality and control.")
        if session.fatigue_risk == "high":
            priority_areas.append("Manage fatigue levels -- consider reducing volume or intensity.")

    # Build summary
    total_reps = session.total_reps or 0
    total_sets = session.total_sets or 0
    summary = (
        f"{session.exercise_type.replace('_', ' ').title()} session: "
        f"{total_sets} sets, {total_reps} reps"
    )
    if avg_score is not None:
        summary += f", average form score {avg_score:.0f}/100"
    if session.fatigue_risk:
        summary += f", fatigue risk: {session.fatigue_risk}"
    summary += "."

    # Extract cues
    cues: list[str] = []
    if coaching and isinstance(coaching.get("coaching_cues"), list):
        cues = coaching["coaching_cues"]
    else:
        if avg_score is not None and avg_score < 70:
            cues.append("Focus on controlled movement through the full range of motion.")
        if session.fatigue_risk == "high":
            cues.append("Consider reducing load or volume to manage fatigue accumulation.")
        if not cues:
            cues.append("Maintain your current training intensity and focus on consistency.")

    return {
        "session_id": str(session.id),
        "session_date": session_date.isoformat() if session_date else None,
        "exercise_type": session.exercise_type,
        "overall_assessment": overall_assessment,
        "summary": summary,
        "cues": cues,
        "priority_areas": priority_areas,
        "coaching": coaching,
    }


# ---------------------------------------------------------------------------
# POST /drill-complete -- mark a drill as completed
# ---------------------------------------------------------------------------

@router.post(
    "/drill-complete",
    summary="Mark a drill as completed",
)
async def complete_drill(
    drill_name: str = Query(..., description="Name of the drill completed"),
    exercise_type: str = Query(default="squat", description="Exercise type this drill targets"),
    target_area: str | None = Query(default=None, description="Target area (e.g. 'depth', 'stability')"),
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Record a drill completion for the current user."""
    from backend.models.drill_completion import DrillCompletion

    completion = DrillCompletion(
        user_id=user_id,
        drill_name=drill_name,
        exercise_type=exercise_type,
        target_area=target_area,
    )
    db.add(completion)
    await db.flush()
    logger.info("Drill completed: user=%s drill=%s exercise=%s", user_id, drill_name, exercise_type)
    return {
        "id": str(completion.id),
        "drill_name": drill_name,
        "exercise_type": exercise_type,
        "target_area": target_area,
        "completed_at": completion.completed_at.isoformat() if completion.completed_at else None,
    }


# ---------------------------------------------------------------------------
# GET /drill-history -- drill completion history
# ---------------------------------------------------------------------------

@router.get(
    "/drill-history",
    summary="Get drill completion history for the user",
)
async def get_drill_history(
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> list:
    """Return drill completion history for the user, most recent first."""
    from backend.models.drill_completion import DrillCompletion

    result = await db.execute(
        select(DrillCompletion)
        .where(DrillCompletion.user_id == user_id)
        .order_by(DrillCompletion.completed_at.desc())
        .limit(50)
    )
    completions = result.scalars().all()
    return [
        {
            "drill_id": str(c.id),
            "drill_name": c.drill_name,
            "target_area": c.target_area or c.exercise_type,
            "completed_at": c.completed_at.isoformat() if c.completed_at else None,
        }
        for c in completions
    ]
