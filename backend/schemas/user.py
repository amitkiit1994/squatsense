"""User profile request/response schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


# ---------------------------------------------------------------------------
# Nested helpers
# ---------------------------------------------------------------------------

class InjuryRecord(BaseModel):
    """A single injury history entry."""

    area: str = Field(..., description="Body area affected (e.g. 'knee', 'lower_back')")
    side: str = Field(
        ..., description="Affected side: 'left', 'right', or 'bilateral'"
    )
    notes: Optional[str] = Field(
        default=None, description="Free-text notes about the injury"
    )


class BaselineMetrics(BaseModel):
    """Optional baseline biomechanics captured during onboarding."""

    squat_depth_degrees: Optional[float] = Field(
        default=None, description="Baseline knee-flexion depth in degrees"
    )
    hip_mobility_degrees: Optional[float] = Field(
        default=None, description="Baseline hip mobility in degrees"
    )
    ankle_mobility_degrees: Optional[float] = Field(
        default=None, description="Baseline ankle dorsiflexion in degrees"
    )


# ---------------------------------------------------------------------------
# Responses
# ---------------------------------------------------------------------------

class UserResponse(BaseModel):
    """Full user profile returned by the API."""

    id: UUID = Field(..., description="User unique identifier")
    email: EmailStr = Field(..., description="User email address")
    name: str = Field(..., description="Display name")
    avatar_url: Optional[str] = Field(
        default=None, description="URL to avatar image"
    )
    experience_level: Optional[str] = Field(
        default=None,
        description="Self-reported experience level: 'beginner', 'intermediate', 'advanced'",
    )
    goal: Optional[str] = Field(
        default=None,
        description="Primary training goal: 'strength', 'hypertrophy', 'rehab', 'general'",
    )
    injury_history: Optional[list[InjuryRecord]] = Field(
        default=None, description="List of past / current injuries"
    )
    training_max: Optional[dict[str, float]] = Field(
        default=None,
        description="Mapping of exercise_type -> training-max weight in kg",
    )
    baseline_metrics: Optional[BaselineMetrics] = Field(
        default=None, description="Baseline biomechanics from onboarding"
    )
    onboarding_completed: bool = Field(
        default=False, description="Whether the user finished onboarding"
    )
    created_at: datetime = Field(..., description="Account creation timestamp")


# ---------------------------------------------------------------------------
# Update payloads
# ---------------------------------------------------------------------------

class UserUpdate(BaseModel):
    """Partial update for profile and settings fields."""

    name: Optional[str] = Field(
        default=None, min_length=1, max_length=100, description="Display name"
    )
    avatar_url: Optional[str] = Field(
        default=None, description="URL to avatar image"
    )
    goal: Optional[str] = Field(
        default=None, description="Primary training goal"
    )
    experience_level: Optional[str] = Field(
        default=None, description="Self-reported experience level"
    )
    training_maxes: Optional[dict[str, float]] = Field(
        default=None, description="Mapping of exercise_type -> training-max weight"
    )
    injury_history: Optional[list[InjuryRecord]] = Field(
        default=None, description="List of past / current injuries"
    )


class OnboardingUpdate(BaseModel):
    """Payload submitted during the onboarding flow."""

    experience_level: str = Field(
        ...,
        description="Self-reported experience level: 'beginner', 'intermediate', 'advanced'",
    )
    goal: str = Field(
        ...,
        description="Primary training goal: 'strength', 'hypertrophy', 'rehab', 'general'",
    )
    injury_history: Optional[list[InjuryRecord]] = Field(
        default=None, description="List of past / current injuries"
    )


class TrainingMaxUpdate(BaseModel):
    """Update training-max weights for one or more exercises."""

    training_max: dict[str, float] = Field(
        ...,
        description="Mapping of exercise_type -> training-max weight in kg",
    )


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------

class SessionExport(BaseModel):
    """Minimal session representation used inside UserExport."""

    id: UUID
    exercise_type: str
    total_reps: int
    avg_form_score: Optional[float] = None
    fatigue_risk: Optional[str] = None
    created_at: datetime
    reps: list[dict[str, Any]] = Field(
        default_factory=list, description="Raw rep data for the session"
    )


class UserExport(BaseModel):
    """Complete data export for a user (GDPR-style)."""

    id: UUID
    email: EmailStr
    name: str
    avatar_url: Optional[str] = None
    experience_level: Optional[str] = None
    goal: Optional[str] = None
    injury_history: Optional[list[InjuryRecord]] = None
    training_max: Optional[dict[str, float]] = None
    baseline_metrics: Optional[BaselineMetrics] = None
    onboarding_completed: bool
    created_at: datetime
    sessions: list[SessionExport] = Field(
        default_factory=list, description="All training sessions with nested reps"
    )
