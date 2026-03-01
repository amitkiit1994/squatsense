"""User profile router: CRUD, onboarding, export, delete."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.deps import get_current_user, get_db
from backend.models.refresh_token import RefreshToken
from backend.models.rep import Rep
from backend.models.session import Session, Set
from backend.models.user import User
from backend.schemas.user import (
    OnboardingUpdate,
    SessionExport,
    TrainingMaxUpdate,
    UserExport,
    UserResponse,
    UserUpdate,
)

router = APIRouter(prefix="/users", tags=["users"])


# ---------------------------------------------------------------------------
# GET /me
# ---------------------------------------------------------------------------

@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get current user profile",
)
async def get_me(
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    """Return the authenticated user's profile."""
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        name=current_user.name or "",
        avatar_url=current_user.avatar_url,
        experience_level=current_user.experience_level,
        goal=current_user.goal,
        injury_history=current_user.injury_history if current_user.injury_history else None,
        training_max=current_user.training_max if current_user.training_max else None,
        baseline_metrics=current_user.baseline_metrics if current_user.baseline_metrics else None,
        onboarding_completed=current_user.onboarding_completed,
        created_at=current_user.created_at,
    )


# ---------------------------------------------------------------------------
# PUT /me
# ---------------------------------------------------------------------------

@router.put(
    "/me",
    response_model=UserResponse,
    summary="Update profile (name, avatar_url)",
)
async def update_me(
    body: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """Update profile and settings fields for the current user."""
    if body.name is not None:
        current_user.name = body.name
    if body.avatar_url is not None:
        current_user.avatar_url = body.avatar_url
    if body.goal is not None:
        current_user.goal = body.goal
    if body.experience_level is not None:
        current_user.experience_level = body.experience_level
    if body.training_maxes is not None:
        current_user.training_max = body.training_maxes
    if body.injury_history is not None:
        current_user.injury_history = [
            injury.model_dump() for injury in body.injury_history
        ]

    db.add(current_user)
    await db.flush()

    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        name=current_user.name or "",
        avatar_url=current_user.avatar_url,
        experience_level=current_user.experience_level,
        goal=current_user.goal,
        injury_history=current_user.injury_history if current_user.injury_history else None,
        training_max=current_user.training_max if current_user.training_max else None,
        baseline_metrics=current_user.baseline_metrics if current_user.baseline_metrics else None,
        onboarding_completed=current_user.onboarding_completed,
        created_at=current_user.created_at,
    )


# ---------------------------------------------------------------------------
# PUT /me/password
# ---------------------------------------------------------------------------

@router.put(
    "/me/password",
    summary="Change the current user's password",
)
async def change_password(
    current_password: str = Body(..., description="Current password"),
    new_password: str = Body(..., description="New password (min 8 chars)"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Change the user's password after verifying the current password."""
    from backend.routers.auth import _verify_password, _hash_password

    # OAuth users have no password_hash — they can't use password-based change
    if not current_user.password_hash:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password change is not available for OAuth accounts",
        )

    if not _verify_password(current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )

    if len(new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be at least 8 characters",
        )

    current_user.password_hash = _hash_password(new_password)
    db.add(current_user)
    await db.flush()

    return {"message": "Password updated successfully"}


# ---------------------------------------------------------------------------
# PUT /me/onboarding
# ---------------------------------------------------------------------------

@router.put(
    "/me/onboarding",
    response_model=UserResponse,
    summary="Complete onboarding (experience level, goal, injury history)",
)
async def update_onboarding(
    body: OnboardingUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """Update onboarding fields and mark onboarding as completed."""
    current_user.experience_level = body.experience_level
    current_user.goal = body.goal
    if body.injury_history is not None:
        current_user.injury_history = [
            injury.model_dump() for injury in body.injury_history
        ]
    current_user.onboarding_completed = True

    db.add(current_user)
    await db.flush()

    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        name=current_user.name or "",
        avatar_url=current_user.avatar_url,
        experience_level=current_user.experience_level,
        goal=current_user.goal,
        injury_history=current_user.injury_history if current_user.injury_history else None,
        training_max=current_user.training_max if current_user.training_max else None,
        baseline_metrics=current_user.baseline_metrics if current_user.baseline_metrics else None,
        onboarding_completed=current_user.onboarding_completed,
        created_at=current_user.created_at,
    )


# ---------------------------------------------------------------------------
# PUT /me/training-max
# ---------------------------------------------------------------------------

@router.put(
    "/me/training-max",
    response_model=UserResponse,
    summary="Update training max weights",
)
async def update_training_max(
    body: TrainingMaxUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """Merge training max weights into the user's profile."""
    existing = current_user.training_max or {}
    existing.update(body.training_max)
    current_user.training_max = existing

    db.add(current_user)
    await db.flush()

    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        name=current_user.name or "",
        avatar_url=current_user.avatar_url,
        experience_level=current_user.experience_level,
        goal=current_user.goal,
        injury_history=current_user.injury_history if current_user.injury_history else None,
        training_max=current_user.training_max if current_user.training_max else None,
        baseline_metrics=current_user.baseline_metrics if current_user.baseline_metrics else None,
        onboarding_completed=current_user.onboarding_completed,
        created_at=current_user.created_at,
    )


# ---------------------------------------------------------------------------
# GET /me/export
# ---------------------------------------------------------------------------

@router.get(
    "/me/export",
    response_model=UserExport,
    summary="Export all user data as JSON",
)
async def export_data(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserExport:
    """Export the user's complete data (profile + sessions + reps)."""
    result = await db.execute(
        select(Session)
        .where(Session.user_id == current_user.id)
        .options(selectinload(Session.reps))
        .order_by(Session.created_at.desc())
    )
    sessions = result.scalars().all()

    session_exports = []
    for s in sessions:
        rep_dicts = []
        for r in s.reps:
            rep_dicts.append({
                "id": str(r.id),
                "rep_number": r.rep_number,
                "composite_score": r.composite_score,
                "depth_score": r.depth_score,
                "stability_score": r.stability_score,
                "symmetry_score": r.symmetry_score,
                "tempo_score": r.tempo_score,
                "rom_score": r.rom_score,
                "primary_angle_deg": r.primary_angle_deg,
                "depth_ok": r.depth_ok,
                "form_ok": r.form_ok,
                "balance_ok": r.balance_ok,
                "risk_markers": r.risk_markers,
                "created_at": str(r.created_at),
            })
        session_exports.append(
            SessionExport(
                id=s.id,
                exercise_type=s.exercise_type,
                total_reps=s.total_reps or 0,
                avg_form_score=s.avg_form_score,
                fatigue_risk=s.fatigue_risk,
                created_at=s.created_at,
                reps=rep_dicts,
            )
        )

    return UserExport(
        id=current_user.id,
        email=current_user.email,
        name=current_user.name or "",
        avatar_url=current_user.avatar_url,
        experience_level=current_user.experience_level,
        goal=current_user.goal,
        injury_history=current_user.injury_history if current_user.injury_history else None,
        training_max=current_user.training_max if current_user.training_max else None,
        baseline_metrics=current_user.baseline_metrics if current_user.baseline_metrics else None,
        onboarding_completed=current_user.onboarding_completed,
        created_at=current_user.created_at,
        sessions=session_exports,
    )


# ---------------------------------------------------------------------------
# DELETE /me
# ---------------------------------------------------------------------------

@router.delete(
    "/me",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete user and all data",
)
async def delete_me(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Permanently delete the user and all associated data."""
    user_id = current_user.id

    # Delete reps belonging to user's sessions
    session_ids_q = select(Session.id).where(Session.user_id == user_id)
    set_ids_q = select(Set.id).where(Set.session_id.in_(session_ids_q))
    await db.execute(delete(Rep).where(Rep.set_id.in_(set_ids_q)))
    await db.execute(delete(Set).where(Set.session_id.in_(session_ids_q)))
    await db.execute(delete(Session).where(Session.user_id == user_id))
    await db.execute(delete(RefreshToken).where(RefreshToken.user_id == user_id))
    await db.execute(delete(User).where(User.id == user_id))
    await db.flush()
