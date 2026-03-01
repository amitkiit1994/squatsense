"""Exercise catalogue, programming, and analytics schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Exercise catalogue
# ---------------------------------------------------------------------------

class ExerciseInfo(BaseModel):
    """Static information about a supported exercise."""

    exercise_type: str = Field(
        ..., description="Unique exercise key (e.g. 'back_squat')"
    )
    display_name: str = Field(
        ..., description="Human-readable name (e.g. 'Back Squat')"
    )
    category: str = Field(
        ...,
        description="Movement category: 'squat', 'hinge', 'lunge', 'accessory'",
    )
    primary_side: str = Field(
        ...,
        description="Laterality: 'bilateral', 'unilateral_left', 'unilateral_right'",
    )
    description: Optional[str] = Field(
        default=None, description="Short description of the exercise"
    )


class ExerciseListResponse(BaseModel):
    """List of all available exercises."""

    exercises: list[ExerciseInfo] = Field(
        default_factory=list, description="Available exercises"
    )


# ---------------------------------------------------------------------------
# Programming
# ---------------------------------------------------------------------------

class ExerciseProgram(BaseModel):
    """A single exercise prescription within a training program."""

    exercise_type: str = Field(..., description="Exercise key")
    goal: str = Field(
        ...,
        description="Training goal: 'strength', 'hypertrophy', 'rehab', 'general'",
    )
    experience_level: str = Field(
        ...,
        description="Target experience level: 'beginner', 'intermediate', 'advanced'",
    )
    sets: int = Field(..., ge=1, description="Prescribed number of sets")
    reps: int = Field(..., ge=1, description="Prescribed reps per set")
    load_kg: Optional[float] = Field(
        default=None, ge=0.0, description="Recommended load in kg"
    )
    rest_seconds: int = Field(
        ..., ge=0, description="Rest period between sets in seconds"
    )


# ---------------------------------------------------------------------------
# Analytics / progress
# ---------------------------------------------------------------------------

class RecentSessionSummary(BaseModel):
    """Lightweight session reference used in analytics summaries."""

    id: UUID = Field(..., description="Session identifier")
    exercise_type: str = Field(..., description="Exercise key")
    total_reps: int = Field(..., description="Total reps in the session")
    avg_form_score: Optional[float] = Field(
        default=None, description="Average form score"
    )
    created_at: datetime = Field(..., description="Session timestamp")


class AnalyticsSummary(BaseModel):
    """High-level analytics overview for a user or exercise."""

    total_sessions: int = Field(..., ge=0, description="Total number of sessions")
    total_reps: int = Field(..., ge=0, description="Total reps across all sessions")
    avg_form_score: Optional[float] = Field(
        default=None, ge=0.0, le=100.0, description="Overall average form score"
    )
    strength_trend: list[float] = Field(
        default_factory=list,
        description="Ordered list of estimated 1RM or load values over time",
    )
    recent_sessions: list[RecentSessionSummary] = Field(
        default_factory=list,
        description="Most recent sessions (newest first)",
    )


class ProgressData(BaseModel):
    """Time-series data for a single metric."""

    dates: list[datetime] = Field(
        default_factory=list, description="Ordered date points"
    )
    values: list[float] = Field(
        default_factory=list, description="Metric values corresponding to each date"
    )
    metric_name: str = Field(
        ..., description="Name of the tracked metric (e.g. 'avg_form_score')"
    )


class TrendData(BaseModel):
    """Aggregated trend bundle for a user's training history."""

    strength_progression: ProgressData = Field(
        ..., description="Estimated strength (load/1RM) over time"
    )
    form_trend: ProgressData = Field(
        ..., description="Form score trend over time"
    )
    stability_trend: ProgressData = Field(
        ..., description="Stability/balance metrics over time"
    )
    fatigue_pattern: ProgressData = Field(
        ..., description="Fatigue index trend over time"
    )
    depth_trend: ProgressData = Field(
        default_factory=lambda: ProgressData(dates=[], values=[], metric_name="avg_depth_score"),
        description="Depth score trend over time",
    )
    symmetry_trend: ProgressData = Field(
        default_factory=lambda: ProgressData(dates=[], values=[], metric_name="avg_symmetry_score"),
        description="Symmetry score trend over time",
    )
    rom_trend: ProgressData = Field(
        default_factory=lambda: ProgressData(dates=[], values=[], metric_name="avg_rom_score"),
        description="Range of motion score trend over time",
    )
