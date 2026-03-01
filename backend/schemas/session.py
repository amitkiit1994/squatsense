"""Training-session, set, and rep schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Rep
# ---------------------------------------------------------------------------

class RepResponse(BaseModel):
    """Single rep captured during a set."""

    id: UUID = Field(..., description="Rep unique identifier")
    set_id: UUID = Field(..., description="Parent set identifier")
    rep_number: int = Field(..., ge=1, description="1-based rep index within the set")
    depth_angle: Optional[float] = Field(
        default=None, description="Knee-flexion depth in degrees"
    )
    knee_valgus_angle: Optional[float] = Field(
        default=None, description="Knee valgus/varus angle in degrees"
    )
    hip_shift: Optional[float] = Field(
        default=None, description="Lateral hip shift in cm"
    )
    trunk_lean: Optional[float] = Field(
        default=None, description="Forward trunk lean in degrees"
    )
    tempo_seconds: Optional[float] = Field(
        default=None, description="Total rep duration in seconds"
    )
    form_score: Optional[float] = Field(
        default=None, ge=0.0, le=100.0, description="Composite form score 0-100"
    )
    depth_score: Optional[float] = Field(
        default=None, ge=0.0, le=100.0, description="Depth sub-score 0-100"
    )
    stability_score: Optional[float] = Field(
        default=None, ge=0.0, le=100.0, description="Stability sub-score 0-100"
    )
    symmetry_score: Optional[float] = Field(
        default=None, ge=0.0, le=100.0, description="Left-right symmetry sub-score 0-100"
    )
    tempo_score: Optional[float] = Field(
        default=None, ge=0.0, le=100.0, description="Tempo consistency sub-score 0-100"
    )
    rom_score: Optional[float] = Field(
        default=None, ge=0.0, le=100.0, description="Range of motion sub-score 0-100"
    )
    flags: Optional[list[str]] = Field(
        default=None,
        description="Form deviation flags (e.g. 'knee_cave', 'shallow_depth')",
    )
    timestamp: Optional[datetime] = Field(
        default=None, description="Wall-clock time when the rep was recorded"
    )
    eccentric_ms: Optional[int] = Field(
        default=None, description="Eccentric (lowering) phase duration in milliseconds"
    )
    pause_ms: Optional[int] = Field(
        default=None, description="Pause at bottom duration in milliseconds"
    )
    concentric_ms: Optional[int] = Field(
        default=None, description="Concentric (rising) phase duration in milliseconds"
    )


# ---------------------------------------------------------------------------
# Set
# ---------------------------------------------------------------------------

class SetCreate(BaseModel):
    """Payload to start a new set inside a session."""

    target_reps: int = Field(
        ..., ge=1, description="Planned number of reps for this set"
    )
    load_used: Optional[float] = Field(
        default=None, ge=0.0, description="Weight used for this set in kg"
    )


class SetResponse(BaseModel):
    """Full set data returned by the API."""

    id: UUID = Field(..., description="Set unique identifier")
    session_id: UUID = Field(..., description="Parent session identifier")
    set_number: int = Field(..., ge=1, description="1-based set index within the session")
    target_reps: int = Field(..., ge=1, description="Planned reps")
    actual_reps: int = Field(default=0, ge=0, description="Reps completed")
    load_used: Optional[float] = Field(
        default=None, ge=0.0, description="Weight used in kg"
    )
    avg_form_score: Optional[float] = Field(
        default=None, ge=0.0, le=100.0, description="Average form score across reps"
    )
    started_at: Optional[datetime] = Field(
        default=None, description="Set start timestamp"
    )
    completed_at: Optional[datetime] = Field(
        default=None, description="Set completion timestamp"
    )
    reps: list[RepResponse] = Field(
        default_factory=list, description="Ordered rep data for this set"
    )


# ---------------------------------------------------------------------------
# Session
# ---------------------------------------------------------------------------

class SessionCreate(BaseModel):
    """Payload to start a new training session."""

    exercise_type: str = Field(
        ..., description="Exercise identifier (e.g. 'back_squat', 'front_squat')"
    )
    source: str = Field(
        default="live",
        description="How the session was captured: 'live', 'upload', 'manual'",
    )
    load_used: Optional[float] = Field(
        default=None, ge=0.0, description="Default load for the session in kg"
    )


class SetSummaryInfo(BaseModel):
    """Lightweight summary of a single set, used for strongest/weakest references."""

    set_number: int = Field(..., description="1-based set index")
    actual_reps: int = Field(..., description="Reps completed")
    avg_form_score: Optional[float] = Field(
        default=None, description="Average form score"
    )
    load_used: Optional[float] = Field(default=None, description="Weight in kg")


class SessionResponse(BaseModel):
    """Full session data returned by the API."""

    id: UUID = Field(..., description="Session unique identifier")
    user_id: UUID = Field(..., description="Owning user identifier")
    exercise_type: str = Field(..., description="Exercise identifier")
    source: str = Field(..., description="Capture source")
    load_used: Optional[float] = Field(default=None, description="Default load in kg")
    total_reps: int = Field(default=0, ge=0, description="Total reps across all sets")
    total_sets: int = Field(default=0, ge=0, description="Number of sets")
    avg_form_score: Optional[float] = Field(
        default=None, ge=0.0, le=100.0, description="Session-wide average form score"
    )
    fatigue_index: Optional[float] = Field(
        default=None,
        description="Computed fatigue index (higher = more fatigued)",
    )
    fatigue_risk: Optional[str] = Field(
        default=None,
        description="Fatigue risk level: 'low', 'moderate', 'high'",
    )
    started_at: Optional[datetime] = Field(
        default=None, description="Session start timestamp"
    )
    completed_at: Optional[datetime] = Field(
        default=None, description="Session completion timestamp"
    )
    created_at: datetime = Field(..., description="Record creation timestamp")
    sets: list[SetResponse] = Field(
        default_factory=list, description="Ordered set data"
    )
    strongest_set: Optional[SetSummaryInfo] = Field(
        default=None, description="Set with the best form score"
    )
    weakest_set: Optional[SetSummaryInfo] = Field(
        default=None, description="Set with the worst form score"
    )


class SessionListItem(BaseModel):
    """Compact session info used in paginated list responses."""

    id: UUID = Field(..., description="Session unique identifier")
    exercise_type: str = Field(..., description="Exercise identifier")
    total_reps: int = Field(default=0, description="Total reps")
    avg_form_score: Optional[float] = Field(default=None, description="Average form score")
    fatigue_risk: Optional[str] = Field(default=None, description="Fatigue risk level")
    created_at: datetime = Field(..., description="Record creation timestamp")


class SessionListResponse(BaseModel):
    """Paginated list of sessions."""

    items: list[SessionListItem] = Field(
        default_factory=list, description="Sessions on this page"
    )
    total: int = Field(..., ge=0, description="Total number of sessions")
    page: int = Field(..., ge=1, description="Current page number")
    page_size: int = Field(..., ge=1, description="Items per page")
    pages: int = Field(..., ge=0, description="Total number of pages")


# ---------------------------------------------------------------------------
# Session summary (post-session analytics)
# ---------------------------------------------------------------------------

class SessionSummary(BaseModel):
    """Aggregate metrics computed after a session is completed."""

    total_reps: int = Field(..., ge=0, description="Total reps completed")
    avg_form_score: Optional[float] = Field(
        default=None, ge=0.0, le=100.0, description="Session average form score"
    )
    fatigue_index: Optional[float] = Field(
        default=None, description="Computed fatigue index"
    )
    fatigue_risk: Optional[str] = Field(
        default=None, description="Fatigue risk level"
    )
    load_recommendation: Optional[float] = Field(
        default=None, description="Suggested load for next session in kg"
    )
    ai_coaching: Optional[str] = Field(
        default=None, description="AI-generated coaching feedback"
    )
    strongest_set: Optional[SetSummaryInfo] = Field(
        default=None, description="Best-performing set"
    )
    weakest_set: Optional[SetSummaryInfo] = Field(
        default=None, description="Worst-performing set"
    )
