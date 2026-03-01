"""Analytics router: progress, trends, dashboard summary, volume, 1RM, PRs, recommendations."""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import extract, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.deps import get_current_user, get_current_user_id, get_db

logger = logging.getLogger("squatsense.analytics")
from backend.models.rep import Rep
from backend.models.session import Session, Set
from backend.models.user import User
from backend.schemas.exercise import (
    AnalyticsSummary,
    ProgressData,
    RecentSessionSummary,
    TrendData,
)
from backend.services.load_recommender import LoadRecommender

router = APIRouter(prefix="/analytics", tags=["analytics"])


# ---------------------------------------------------------------------------
# GET /progress -- strength progression data
# ---------------------------------------------------------------------------

@router.get(
    "/progress",
    response_model=ProgressData,
    summary="Strength progression data for a given exercise",
)
async def get_progress(
    exercise_type: Optional[str] = Query(None, description="Exercise type to query (omit for all)"),
    start_date: Optional[datetime] = Query(None, description="Filter from this date (ISO)"),
    end_date: Optional[datetime] = Query(None, description="Filter until this date (ISO)"),
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> ProgressData:
    """Return time-series load/strength data for the specified exercise."""
    stmt = select(Session).where(Session.user_id == user_id)
    if exercise_type:
        stmt = stmt.where(Session.exercise_type == exercise_type)
    if start_date:
        stmt = stmt.where(Session.created_at >= start_date)
    if end_date:
        stmt = stmt.where(Session.created_at <= end_date)
    result = await db.execute(stmt.order_by(Session.created_at.asc()))
    sessions = result.scalars().all()

    dates: list[datetime] = []
    values: list[float] = []

    for s in sessions:
        created = s.created_at
        if isinstance(created, str):
            try:
                created = datetime.fromisoformat(created)
            except (ValueError, TypeError):
                continue

        # Use load_used as the strength metric; fall back to avg_form_score
        value = s.load_used
        if value is None:
            value = s.avg_form_score
        if value is not None:
            dates.append(created)
            values.append(float(value))

    return ProgressData(
        dates=dates,
        values=values,
        metric_name="load_used_kg",
    )


# ---------------------------------------------------------------------------
# GET /trends -- form, stability, fatigue trends
# ---------------------------------------------------------------------------

@router.get(
    "/trends",
    response_model=TrendData,
    summary="Form, stability, and fatigue trends for a given exercise",
)
async def get_trends(
    exercise_type: Optional[str] = Query(None, description="Exercise type to query (omit for all)"),
    start_date: Optional[datetime] = Query(None, description="Filter from this date (ISO)"),
    end_date: Optional[datetime] = Query(None, description="Filter until this date (ISO)"),
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> TrendData:
    """Return trend data for form, stability, and fatigue across sessions."""
    logger.info("GET trends for user %s, exercise=%s", user_id, exercise_type)
    stmt = select(Session).where(Session.user_id == user_id)
    if exercise_type:
        stmt = stmt.where(Session.exercise_type == exercise_type)
    if start_date:
        stmt = stmt.where(Session.created_at >= start_date)
    if end_date:
        stmt = stmt.where(Session.created_at <= end_date)
    result = await db.execute(
        stmt.options(selectinload(Session.reps)).order_by(Session.created_at.asc())
    )
    sessions = result.scalars().all()

    # Build time-series from session-level and rep-level data
    strength_dates: list[datetime] = []
    strength_values: list[float] = []
    form_dates: list[datetime] = []
    form_values: list[float] = []
    stability_dates: list[datetime] = []
    stability_values: list[float] = []
    fatigue_dates: list[datetime] = []
    fatigue_values: list[float] = []
    depth_dates: list[datetime] = []
    depth_values: list[float] = []
    symmetry_dates: list[datetime] = []
    symmetry_values: list[float] = []
    rom_dates: list[datetime] = []
    rom_values: list[float] = []

    for s in sessions:
        created = s.created_at
        if isinstance(created, str):
            try:
                created = datetime.fromisoformat(created)
            except (ValueError, TypeError):
                continue

        # Strength (load)
        if s.load_used is not None:
            strength_dates.append(created)
            strength_values.append(float(s.load_used))

        # Form (session avg)
        if s.avg_form_score is not None:
            form_dates.append(created)
            form_values.append(float(s.avg_form_score))

        # Stability (average stability_score from reps)
        stability_scores = [
            r.stability_score for r in (s.reps or [])
            if r.stability_score is not None
        ]
        if stability_scores:
            avg_stability = sum(stability_scores) / len(stability_scores)
            stability_dates.append(created)
            stability_values.append(round(avg_stability, 1))

        # Fatigue
        if s.fatigue_index is not None:
            fatigue_dates.append(created)
            fatigue_values.append(float(s.fatigue_index))

        # Depth (average depth_score from reps)
        depth_scores = [
            r.depth_score for r in (s.reps or [])
            if r.depth_score is not None
        ]
        if depth_scores:
            avg_depth = sum(depth_scores) / len(depth_scores)
            depth_dates.append(created)
            depth_values.append(round(avg_depth, 1))

        # Symmetry (average symmetry_score from reps)
        sym_scores = [
            r.symmetry_score for r in (s.reps or [])
            if r.symmetry_score is not None
        ]
        if sym_scores:
            avg_sym = sum(sym_scores) / len(sym_scores)
            symmetry_dates.append(created)
            symmetry_values.append(round(avg_sym, 1))

        # ROM (average rom_score from reps)
        rom_scores = [
            r.rom_score for r in (s.reps or [])
            if r.rom_score is not None
        ]
        if rom_scores:
            avg_rom = sum(rom_scores) / len(rom_scores)
            rom_dates.append(created)
            rom_values.append(round(avg_rom, 1))

    logger.info(
        "TRENDS response: form=%d pts, stability=%d pts, fatigue=%d pts, "
        "depth=%d pts, symmetry=%d pts, rom=%d pts, strength=%d pts",
        len(form_values), len(stability_values), len(fatigue_values),
        len(depth_values), len(symmetry_values), len(rom_values),
        len(strength_values),
    )
    if form_values:
        logger.info("  form_trend values: %s", form_values)
    if depth_values:
        logger.info("  depth_trend values: %s", depth_values)
    if stability_values:
        logger.info("  stability_trend values: %s", stability_values)
    if symmetry_values:
        logger.info("  symmetry_trend values: %s", symmetry_values)
    if rom_values:
        logger.info("  rom_trend values: %s", rom_values)
    if fatigue_values:
        logger.info("  fatigue_pattern values: %s", fatigue_values)

    return TrendData(
        strength_progression=ProgressData(
            dates=strength_dates,
            values=strength_values,
            metric_name="load_used_kg",
        ),
        form_trend=ProgressData(
            dates=form_dates,
            values=form_values,
            metric_name="avg_form_score",
        ),
        stability_trend=ProgressData(
            dates=stability_dates,
            values=stability_values,
            metric_name="avg_stability_score",
        ),
        fatigue_pattern=ProgressData(
            dates=fatigue_dates,
            values=fatigue_values,
            metric_name="fatigue_index",
        ),
        depth_trend=ProgressData(
            dates=depth_dates,
            values=depth_values,
            metric_name="avg_depth_score",
        ),
        symmetry_trend=ProgressData(
            dates=symmetry_dates,
            values=symmetry_values,
            metric_name="avg_symmetry_score",
        ),
        rom_trend=ProgressData(
            dates=rom_dates,
            values=rom_values,
            metric_name="avg_rom_score",
        ),
    )


# ---------------------------------------------------------------------------
# GET /summary -- dashboard summary
# ---------------------------------------------------------------------------

@router.get(
    "/summary",
    summary="Dashboard summary for the current user",
)
async def get_summary(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return high-level analytics: totals, averages, and recent sessions."""
    user_id = user.id
    logger.info("GET summary for user %s", user_id)

    # Only count completed sessions (those that were ended or have actual data).
    # Sessions created but never used (no reps, never ended) are excluded.
    completed_filter = (
        Session.user_id == user_id,
        Session.completed_at.isnot(None) | (Session.total_reps > 0),
    )

    # Total sessions (completed only)
    count_result = await db.execute(
        select(func.count()).select_from(Session).where(*completed_filter)
    )
    total_sessions = count_result.scalar() or 0

    # Total reps across completed sessions
    reps_result = await db.execute(
        select(func.coalesce(func.sum(Session.total_reps), 0))
        .where(*completed_filter)
    )
    total_reps = reps_result.scalar() or 0

    # Average form score across sessions that have one
    avg_result = await db.execute(
        select(func.avg(Session.avg_form_score))
        .where(
            Session.user_id == user_id,
            Session.avg_form_score.isnot(None),
        )
    )
    avg_form_raw = avg_result.scalar()
    avg_form_score = round(float(avg_form_raw), 1) if avg_form_raw is not None else None

    # Strength trend (load_used over time, all exercises)
    trend_result = await db.execute(
        select(Session.load_used)
        .where(
            Session.user_id == user_id,
            Session.load_used.isnot(None),
        )
        .order_by(Session.created_at.asc())
    )
    strength_trend = [float(row[0]) for row in trend_result.all()]

    # Recent sessions (last 10, completed only)
    recent_result = await db.execute(
        select(Session)
        .where(*completed_filter)
        .order_by(Session.created_at.desc())
        .limit(10)
    )
    recent_sessions_orm = recent_result.scalars().all()

    recent_sessions = []
    for s in recent_sessions_orm:
        created = s.created_at
        if isinstance(created, str):
            try:
                created = datetime.fromisoformat(created)
            except (ValueError, TypeError):
                continue
        # Compute session duration if both timestamps exist
        duration_sec = None
        if s.started_at and s.completed_at:
            duration_sec = round((s.completed_at - s.started_at).total_seconds())
        recent_sessions.append({
            "id": str(s.id),
            "exercise_type": s.exercise_type,
            "total_reps": s.total_reps or 0,
            "avg_form_score": s.avg_form_score or 0,
            "fatigue_risk": s.fatigue_risk,
            "created_at": created.isoformat(),
            "duration_sec": duration_sec,
            "load_used": s.load_used,
        })

    # Compute total_volume (reps * load) across all sessions
    vol_result = await db.execute(
        select(
            func.coalesce(
                func.sum(Session.total_reps * Session.load_used), 0
            )
        ).where(
            Session.user_id == user_id,
            Session.load_used.isnot(None),
            Session.total_reps.isnot(None),
        )
    )
    total_volume = round(float(vol_result.scalar() or 0), 1)

    # Compute current streak (consecutive days with at least one session)
    day_col = func.date_trunc("day", Session.created_at).label("day")
    streak_result = await db.execute(
        select(day_col)
        .where(*completed_filter)
        .group_by(day_col)
        .order_by(day_col.desc())
    )
    session_days = [row[0].date() if hasattr(row[0], "date") else row[0] for row in streak_result.all()]
    current_streak = 0
    if session_days:
        today = date.today()
        # Allow today or yesterday as the start of the streak
        if session_days[0] >= today - timedelta(days=1):
            current_streak = 1
            for i in range(1, len(session_days)):
                if session_days[i] == session_days[i - 1] - timedelta(days=1):
                    current_streak += 1
                else:
                    break

    # Compute milestones
    milestones: list[dict[str, Any]] = []
    if total_sessions >= 1:
        milestones.append({"id": "first_session", "label": "First Session", "achieved": True})
    if total_sessions >= 10:
        milestones.append({"id": "10_sessions", "label": "10 Sessions", "achieved": True})
    if total_sessions >= 50:
        milestones.append({"id": "50_sessions", "label": "50 Sessions", "achieved": True})
    if total_reps >= 100:
        milestones.append({"id": "100_reps", "label": "100 Total Reps", "achieved": True})
    if total_reps >= 500:
        milestones.append({"id": "500_reps", "label": "500 Total Reps", "achieved": True})
    if current_streak >= 3:
        milestones.append({"id": "3_day_streak", "label": "3-Day Streak", "achieved": True})
    if current_streak >= 7:
        milestones.append({"id": "7_day_streak", "label": "7-Day Streak", "achieved": True})
    if avg_form_score is not None and avg_form_score >= 80:
        milestones.append({"id": "form_80", "label": "80+ Avg Form", "achieved": True})
    if avg_form_score is not None and avg_form_score >= 90:
        milestones.append({"id": "form_90", "label": "90+ Avg Form", "achieved": True})
    # Check for max load milestones
    if strength_trend:
        max_load = max(strength_trend)
        for threshold in [60, 100, 140, 180, 200]:
            if max_load >= threshold:
                milestones.append({
                    "id": f"load_{threshold}",
                    "label": f"{threshold}kg Lifted",
                    "achieved": True,
                })

    # Add upcoming milestones (not yet achieved)
    if total_sessions < 10:
        milestones.append({
            "id": "10_sessions",
            "label": "10 Sessions",
            "achieved": False,
            "progress": f"{total_sessions}/10",
        })
    if total_reps < 100:
        milestones.append({
            "id": "100_reps",
            "label": "100 Total Reps",
            "achieved": False,
            "progress": f"{total_reps}/100",
        })

    resp = {
        "user_name": user.name or "Athlete",
        "total_sessions": total_sessions,
        "total_reps": total_reps,
        "total_volume": total_volume,
        "avg_form_score": avg_form_score or 0,
        "current_streak": current_streak,
        "strength_trend": strength_trend,
        "recent_sessions": recent_sessions,
        "milestones": milestones,
    }
    logger.info(
        "SUMMARY response: sessions=%d, total_reps=%d, avg_form=%s, "
        "recent_count=%d, strength_trend_len=%d",
        total_sessions, total_reps, avg_form_score,
        len(recent_sessions), len(strength_trend),
    )
    for rs in recent_sessions:
        logger.info(
            "  recent: id=%s exercise=%s reps=%d form=%.1f date=%s",
            rs["id"][:8], rs["exercise_type"], rs["total_reps"],
            rs["avg_form_score"], rs["created_at"][:10],
        )
    return resp


# ---------------------------------------------------------------------------
# GET /volume -- training volume analytics
# ---------------------------------------------------------------------------

@router.get(
    "/volume",
    summary="Weekly training volume analytics",
)
async def get_volume(
    exercise_type: Optional[str] = Query(None, description="Exercise type to filter (omit for all)"),
    start_date: Optional[datetime] = Query(None, description="Filter from this date (ISO)"),
    end_date: Optional[datetime] = Query(None, description="Filter until this date (ISO)"),
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Return weekly training volume (total_reps * load_used), session counts, and rep totals."""
    logger.info("GET volume for user %s, exercise=%s", user_id, exercise_type)
    stmt = select(Session).where(Session.user_id == user_id)
    if exercise_type:
        stmt = stmt.where(Session.exercise_type == exercise_type)
    if start_date:
        stmt = stmt.where(Session.created_at >= start_date)
    if end_date:
        stmt = stmt.where(Session.created_at <= end_date)
    result = await db.execute(stmt.order_by(Session.created_at.asc()))
    sessions = result.scalars().all()

    # Group by ISO year-week
    weekly: dict[str, dict[str, Any]] = {}
    for s in sessions:
        created = s.created_at
        if isinstance(created, str):
            try:
                created = datetime.fromisoformat(created)
            except (ValueError, TypeError):
                continue

        iso_year, iso_week, _ = created.isocalendar()
        week_key = f"{iso_year}-W{iso_week:02d}"

        if week_key not in weekly:
            weekly[week_key] = {"week": week_key, "volume": 0.0, "sessions": 0, "total_reps": 0}

        reps = s.total_reps or 0
        load = s.load_used or 0.0
        weekly[week_key]["volume"] += reps * load
        weekly[week_key]["sessions"] += 1
        weekly[week_key]["total_reps"] += reps

    # Round volume values
    weeks = []
    for w in weekly.values():
        w["volume"] = round(w["volume"], 1)
        weeks.append(w)

    return {"weeks": weeks}


# ---------------------------------------------------------------------------
# GET /1rm-history -- estimated 1RM history
# ---------------------------------------------------------------------------

@router.get(
    "/1rm-history",
    summary="Estimated 1RM history over time",
)
async def get_1rm_history(
    exercise_type: Optional[str] = Query(None, description="Exercise type to filter (omit for all)"),
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Return time-series of estimated 1RM values computed via the Epley formula."""
    stmt = select(Session).where(Session.user_id == user_id)
    if exercise_type:
        stmt = stmt.where(Session.exercise_type == exercise_type)
    result = await db.execute(stmt.order_by(Session.created_at.asc()))
    sessions = result.scalars().all()

    history: list[dict[str, Any]] = []
    resolved_exercise_type = exercise_type or "all"

    for s in sessions:
        load = s.load_used
        reps = s.total_reps
        if load is None or load <= 0 or reps is None or reps <= 0:
            continue

        created = s.created_at
        if isinstance(created, str):
            try:
                created = datetime.fromisoformat(created)
            except (ValueError, TypeError):
                continue

        # Epley formula: 1RM = load * (1 + reps / 30)
        estimated_1rm = round(load * (1.0 + reps / 30.0), 2)
        history.append({
            "date": created.isoformat(),
            "estimated_1rm": estimated_1rm,
            "load_used": load,
            "reps": reps,
        })

    return {
        "exercise_type": resolved_exercise_type,
        "history": history,
    }


# ---------------------------------------------------------------------------
# GET /personal-records -- personal records list
# ---------------------------------------------------------------------------

@router.get(
    "/personal-records",
    summary="Personal records across all exercise types",
)
async def get_personal_records(
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Return best-session records for each exercise type (form, load, reps)."""
    result = await db.execute(
        select(Session)
        .where(Session.user_id == user_id)
        .order_by(Session.created_at.asc())
    )
    sessions = result.scalars().all()

    # Group by exercise_type and track bests (filter invalid exercise types)
    from backend.core.exercises.base import ExerciseType
    valid_types = {e.value for e in ExerciseType}
    exercise_records: dict[str, dict[str, Any]] = {}

    for s in sessions:
        et = s.exercise_type
        if et not in valid_types:
            continue
        created = s.created_at
        if isinstance(created, str):
            try:
                created = datetime.fromisoformat(created)
            except (ValueError, TypeError):
                continue

        if et not in exercise_records:
            exercise_records[et] = {
                "exercise_type": et,
                "best_form_score": None,
                "best_form_date": None,
                "heaviest_load": None,
                "heaviest_load_date": None,
                "most_reps_session": None,
                "most_reps_date": None,
            }

        rec = exercise_records[et]

        # Best form score
        if s.avg_form_score is not None:
            if rec["best_form_score"] is None or s.avg_form_score > rec["best_form_score"]:
                rec["best_form_score"] = round(float(s.avg_form_score), 1)
                rec["best_form_date"] = created.isoformat()

        # Heaviest load
        if s.load_used is not None:
            if rec["heaviest_load"] is None or s.load_used > rec["heaviest_load"]:
                rec["heaviest_load"] = float(s.load_used)
                rec["heaviest_load_date"] = created.isoformat()

        # Most reps in a session
        if s.total_reps is not None:
            if rec["most_reps_session"] is None or s.total_reps > rec["most_reps_session"]:
                rec["most_reps_session"] = s.total_reps
                rec["most_reps_date"] = created.isoformat()

    return {"records": list(exercise_records.values())}


# ---------------------------------------------------------------------------
# GET /recommendations -- personalised recommendations
# ---------------------------------------------------------------------------

_recommender = LoadRecommender()


@router.get(
    "/recommendations",
    summary="Personalised next-session recommendations",
)
async def get_recommendations(
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Use LoadRecommender to generate next-session recommendations based on recent sessions."""
    # Get the most recent sessions per exercise type
    result = await db.execute(
        select(Session)
        .where(Session.user_id == user_id)
        .order_by(Session.created_at.desc())
        .limit(50)
    )
    sessions = result.scalars().all()

    # Group by exercise type, take the most recent session per type
    latest_by_exercise: dict[str, Session] = {}
    consecutive_good_form: dict[str, int] = {}

    for s in sessions:
        et = s.exercise_type
        if et not in latest_by_exercise:
            latest_by_exercise[et] = s

    # Also count consecutive sessions with form > 85 (most recent first)
    exercise_sessions: dict[str, list[Session]] = {}
    for s in sessions:
        et = s.exercise_type
        if et not in exercise_sessions:
            exercise_sessions[et] = []
        exercise_sessions[et].append(s)

    for et, sess_list in exercise_sessions.items():
        count = 0
        for s in sess_list:
            if s.avg_form_score is not None and s.avg_form_score > 85:
                count += 1
            else:
                break
        consecutive_good_form[et] = count

    recommendations: list[dict[str, Any]] = []

    for et, session in latest_by_exercise.items():
        load = session.load_used
        if load is None or load <= 0:
            continue

        avg_form = session.avg_form_score or 70.0
        fatigue_idx = session.fatigue_index or 0.0
        fatigue_risk = session.fatigue_risk or "low"
        reps_completed = session.total_reps or 0
        # Assume target reps based on what was done
        target_reps = reps_completed if reps_completed > 0 else 5

        rec = _recommender.recommend_next_load(
            current_load_kg=load,
            avg_form_score=avg_form,
            fatigue_index=fatigue_idx,
            fatigue_risk=fatigue_risk,
            reps_completed=reps_completed,
            target_reps=target_reps,
            goal="strength",
        )

        consecutive = consecutive_good_form.get(et, 0)
        reason = rec.get("explanation", "")
        if consecutive >= 2 and rec["reason"] == "increase":
            reason = f"Form score > 85 for {consecutive} consecutive sessions. {reason}"

        # Suggest sets/reps based on the recommendation
        suggested_reps = target_reps if target_reps > 0 else 5
        suggested_sets = session.total_sets or 4

        recommendations.append({
            "exercise_type": et,
            "suggested_load_kg": rec["recommended_load_kg"],
            "suggested_sets": suggested_sets,
            "suggested_reps": suggested_reps,
            "reason": reason,
        })

    return {"recommendations": recommendations}
