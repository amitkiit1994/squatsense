"""League request/response schemas for the SquatSense gamified squat league."""

from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


# ── Auth Schemas ─────────────────────────────────────────────────────────────


class LeagueJoinRequest(BaseModel):
    """Join the league with just a nickname (anonymous)."""

    nickname: str = Field(..., min_length=3, max_length=20)
    team_code: str | None = Field(None, description="Optional team code to join")


class LeagueRegisterRequest(BaseModel):
    """Full registration with email for persistence."""

    nickname: str = Field(..., min_length=3, max_length=20)
    email: EmailStr = Field(..., description="Player email for account persistence")
    password: str = Field(..., min_length=8, max_length=128, description="Account password")
    team_code: str | None = Field(None, description="Optional team code to join")


class LeagueLoginRequest(BaseModel):
    """Login with email + password."""

    email: EmailStr = Field(..., description="Registered email address")
    password: str = Field(..., description="Account password")


class LeagueUpgradeRequest(BaseModel):
    """Upgrade anonymous account to persistent."""

    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)


class LeagueTokenResponse(BaseModel):
    """JWT token for league players."""

    access_token: str = Field(..., description="JWT access token")
    token_type: str = Field(default="bearer", description="Token type")
    player_id: UUID = Field(..., description="Player UUID")
    nickname: str = Field(..., description="Player display name")
    team_code: str | None = Field(default=None, description="Team code if player belongs to a team")


# ── Team Schemas ─────────────────────────────────────────────────────────────


class CreateTeamRequest(BaseModel):
    """Create a new team/office."""

    name: str = Field(..., min_length=2, max_length=100)


class TeamResponse(BaseModel):
    """Team info."""

    id: UUID = Field(..., description="Team UUID")
    name: str = Field(..., description="Team display name")
    code: str = Field(..., description="Unique team join code")
    total_points: float = Field(..., description="Cumulative movement points", ge=0)
    total_sessions: int = Field(..., description="Total sessions played", ge=0)
    member_count: int = Field(..., description="Number of team members", ge=0)
    created_at: datetime = Field(..., description="Team creation timestamp")


# ── Session Schemas ──────────────────────────────────────────────────────────


class StartSessionRequest(BaseModel):
    """Start a league session."""

    mode: str = Field(default="personal", pattern="^(arena|personal)$")


class StartSessionResponse(BaseModel):
    """Response after starting a session."""

    session_id: UUID = Field(..., description="Created session UUID")
    reps_remaining_today: int = Field(..., description="Reps remaining before daily cap")
    sessions_remaining_today: int = Field(..., description="Sessions remaining before daily cap")


class CompleteSessionRequest(BaseModel):
    """Submit session results for Movement Points calculation."""

    rep_scores: list[float] = Field(
        ..., description="Per-rep composite scores (0-100)"
    )
    duration_sec: int = Field(default=30)


class CompleteSessionResponse(BaseModel):
    """Response after completing a session."""

    points_earned: float = Field(..., description="Points earned this session", ge=0)
    reps_counted: int = Field(..., description="Reps that met quality threshold", ge=0)
    reps_total: int = Field(..., description="Total reps attempted", ge=0)
    avg_quality: float = Field(..., description="Average rep quality score", ge=0, le=100)
    max_combo: int = Field(..., description="Longest consecutive quality rep streak", ge=0)
    perfect_reps: int = Field(..., description="Reps scoring 90+", ge=0)
    total_points: float = Field(..., description="Cumulative player points", ge=0)
    rank: str = Field(..., description="Player rank (bronze/silver/gold/elite)")
    current_streak: int = Field(..., description="Current daily play streak", ge=0)
    streak_multiplier: float = Field(default=1.0, description="Points multiplier from streak", ge=1.0)
    capped: bool = Field(..., description="Whether daily point cap was reached")


# ── Profile Schemas ──────────────────────────────────────────────────────────


class PlayerProfileResponse(BaseModel):
    """Player profile and stats."""

    id: UUID = Field(..., description="Player UUID")
    nickname: str = Field(..., description="Player display name")
    avatar_seed: str = Field(..., description="Seed for avatar generation")
    email: str | None = Field(default=None, description="Player email if registered")
    team_name: str | None = Field(default=None, description="Team name if member of a team")
    team_code: str | None = Field(default=None, description="Team join code")
    rank: str = Field(..., description="Player rank (bronze/silver/gold/elite)")
    total_points: float = Field(..., description="Cumulative movement points", ge=0)
    total_reps: int = Field(..., description="Total reps completed", ge=0)
    total_sessions: int = Field(..., description="Total sessions played", ge=0)
    best_session_points: float = Field(..., description="Highest points in a single session", ge=0)
    best_quality: float = Field(..., description="Highest average quality score", ge=0, le=100)
    current_streak: int = Field(..., description="Current daily play streak", ge=0)
    longest_streak: int = Field(..., description="Longest daily play streak achieved", ge=0)
    last_active_date: date | None = Field(default=None, description="Last date player was active")
    email_verified: bool = Field(default=False, description="Whether email has been verified")
    created_at: datetime = Field(..., description="Account creation timestamp")


class SessionHistoryEntry(BaseModel):
    """A single session in player history."""

    id: UUID = Field(..., description="Session UUID")
    mode: str = Field(..., description="Session mode (arena or personal)")
    reps_counted: int = Field(..., description="Reps meeting quality threshold", ge=0)
    reps_total: int = Field(..., description="Total reps attempted", ge=0)
    avg_quality: float = Field(..., description="Average rep quality score", ge=0, le=100)
    points_earned: float = Field(..., description="Points earned in session", ge=0)
    max_combo: int = Field(..., description="Longest quality rep streak", ge=0)
    perfect_reps: int = Field(..., description="Reps scoring 90+", ge=0)
    created_at: datetime = Field(..., description="Session timestamp")


# ── Leaderboard Schemas ──────────────────────────────────────────────────────


class LeaderboardEntry(BaseModel):
    """A single entry in a leaderboard."""

    position: int = Field(..., description="Leaderboard position", ge=1)
    player_id: UUID = Field(..., description="Player UUID")
    nickname: str = Field(..., description="Player display name")
    avatar_seed: str = Field(..., description="Seed for avatar generation")
    rank: str = Field(..., description="Player rank (bronze/silver/gold/elite)")
    value: float = Field(..., description="Leaderboard metric value (points, streak, etc.)")
    is_current_player: bool = Field(default=False, description="Whether this entry is the requesting player")


# ── Kiosk Schemas ────────────────────────────────────────────────────────────


class KioskRegisterResponse(BaseModel):
    """Response when kiosk registers itself."""

    kiosk_id: str = Field(..., description="Unique kiosk identifier")
    team_name: str = Field(..., description="Team name for this kiosk")
    team_code: str = Field(..., description="Team join code")


class KioskJoinRequest(BaseModel):
    """Phone submits nickname to start kiosk session."""

    nickname: str = Field(..., min_length=3, max_length=20)


class KioskPendingResponse(BaseModel):
    """Kiosk polls this to check if a player is ready."""

    has_pending: bool = Field(..., description="Whether a player is waiting in queue")
    player_id: UUID | None = Field(default=None, description="Pending player UUID")
    nickname: str | None = Field(default=None, description="Pending player nickname")
    queue_size: int = Field(default=0, description="Number of players in queue", ge=0)


class KioskSessionCompleteRequest(BaseModel):
    """Arena posts results so the phone can retrieve them."""

    player_id: str = Field(..., description="Player UUID as string")
    points_earned: float = Field(..., description="Points earned this session", ge=0)
    reps_counted: int = Field(..., description="Reps meeting quality threshold", ge=0)
    reps_total: int = Field(..., description="Total reps attempted", ge=0)
    avg_quality: float = Field(..., description="Average rep quality score", ge=0, le=100)
    max_combo: int = Field(..., description="Longest quality rep streak", ge=0)
    perfect_reps: int = Field(..., description="Reps scoring 90+", ge=0)
    total_points: float = Field(..., description="Cumulative player points", ge=0)
    rank: str = Field(..., description="Player rank after session")
    current_streak: int = Field(..., description="Current daily play streak", ge=0)
    capped: bool = Field(..., description="Whether daily point cap was reached")


# ── Password Reset / Email Verification Schemas ─────────────────────────────


class LeagueForgotPasswordRequest(BaseModel):
    """Request a password reset email."""

    email: EmailStr


class LeagueResetPasswordRequest(BaseModel):
    """Reset password with a token."""

    token: str = Field(..., description="Password reset token from email")
    new_password: str = Field(..., min_length=8, max_length=128, description="New password")


class LeagueVerifyEmailRequest(BaseModel):
    """Verify email with a token."""

    token: str = Field(..., description="Email verification token")


# ── Stats Schemas ────────────────────────────────────────────────────────────


class GlobalStatsResponse(BaseModel):
    """Global league stats for the landing page."""

    total_squats_today: int = Field(..., description="Total squats performed today across all players", ge=0)
    total_players: int = Field(..., description="Total registered players", ge=0)
    total_teams: int = Field(..., description="Total teams created", ge=0)
