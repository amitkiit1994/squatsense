from __future__ import annotations

"""League ORM models for the SquatSense gamified squat league."""

import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.base import Base


class LeagueTeam(Base):
    __tablename__ = "league_teams"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    code: Mapped[str] = mapped_column(
        String(10), unique=True, nullable=False
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )

    total_points: Mapped[float] = mapped_column(
        Float, nullable=False, server_default="0"
    )
    total_sessions: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )
    member_count: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # ── Relationships ────────────────────────────────────────────────────
    # noload: these collections grow unboundedly — load explicitly when needed
    players = relationship("LeaguePlayer", back_populates="team", lazy="noload")
    sessions = relationship(
        "LeagueSession",
        back_populates="team",
        lazy="noload",
        foreign_keys="LeagueSession.team_id",
    )


class LeaguePlayer(Base):
    __tablename__ = "league_players"
    __table_args__ = (
        UniqueConstraint("nickname", "team_id", name="uq_nickname_per_team"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    nickname: Mapped[str] = mapped_column(String(20), nullable=False)
    email: Mapped[str | None] = mapped_column(
        String(255), unique=True, nullable=True
    )
    password_hash: Mapped[str | None] = mapped_column(Text, nullable=True)
    email_verified: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    avatar_seed: Mapped[str] = mapped_column(
        String(32), nullable=False, default=lambda: uuid.uuid4().hex[:8]
    )

    team_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("league_teams.id"),
        nullable=True,
    )

    rank: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="bronze"
    )

    total_points: Mapped[float] = mapped_column(
        Float, nullable=False, server_default="0"
    )
    total_reps: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )
    total_sessions: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )
    best_session_points: Mapped[float] = mapped_column(
        Float, nullable=False, server_default="0"
    )
    best_quality: Mapped[float] = mapped_column(
        Float, nullable=False, server_default="0"
    )

    current_streak: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )
    longest_streak: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )
    last_active_date: Mapped[date | None] = mapped_column(
        Date, nullable=True
    )

    f3_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    # ── Relationships ────────────────────────────────────────────────────
    team = relationship("LeagueTeam", back_populates="players", lazy="selectin")
    # noload: these collections grow unboundedly — load explicitly when needed
    league_sessions = relationship(
        "LeagueSession", back_populates="player", lazy="noload"
    )
    daily_logs = relationship(
        "DailyLog", back_populates="player", lazy="noload"
    )


class LeagueSession(Base):
    __tablename__ = "league_sessions"
    __table_args__ = (
        Index("ix_league_sessions_team_created", "team_id", "created_at"),
        Index("ix_league_sessions_player_created", "player_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    player_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("league_players.id"),
        nullable=False,
    )
    team_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("league_teams.id"),
        nullable=True,
    )
    session_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        nullable=True,
        unique=True,
    )

    mode: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="personal"
    )

    reps_counted: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )
    reps_total: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )
    avg_quality: Mapped[float] = mapped_column(
        Float, nullable=False, server_default="0"
    )
    points_earned: Mapped[float] = mapped_column(
        Float, nullable=False, server_default="0"
    )
    duration_sec: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="30"
    )

    max_combo: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )
    perfect_reps: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )

    capped: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # ── Relationships ────────────────────────────────────────────────────
    player = relationship("LeaguePlayer", back_populates="league_sessions", lazy="selectin")
    team = relationship(
        "LeagueTeam",
        back_populates="sessions",
        foreign_keys=[team_id],
        lazy="selectin",
    )
    # No FK to sessions table — league sessions are self-contained


class DailyLog(Base):
    __tablename__ = "daily_logs"
    __table_args__ = (
        UniqueConstraint("player_id", "date", name="uq_daily_log_player_date"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    player_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("league_players.id"),
        nullable=False,
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)

    sessions_today: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )
    reps_today: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )
    points_today: Mapped[float] = mapped_column(
        Float, nullable=False, server_default="0"
    )

    # ── Relationships ────────────────────────────────────────────────────
    player = relationship("LeaguePlayer", back_populates="daily_logs", lazy="selectin")
