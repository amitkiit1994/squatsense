"""Session and Set ORM models."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.base import Base


class Session(Base):
    __tablename__ = "sessions"
    __table_args__ = (
        Index("ix_sessions_user_id_created_at", "user_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )

    exercise_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="active"
    )

    total_reps: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_sets: Mapped[int | None] = mapped_column(Integer, nullable=True)

    avg_form_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    fatigue_index: Mapped[float | None] = mapped_column(Float, nullable=True)
    fatigue_risk: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )

    strongest_set_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    weakest_set_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )

    load_used: Mapped[float | None] = mapped_column(Float, nullable=True)
    load_recommendation: Mapped[float | None] = mapped_column(
        Float, nullable=True
    )

    ai_coaching: Mapped[str | None] = mapped_column(Text, nullable=True)

    source: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="live"
    )

    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # ── Relationships ─────────────────────────────────────────────────────
    user = relationship("User", back_populates="sessions")
    sets = relationship(
        "Set",
        back_populates="session",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    reps = relationship(
        "Rep",
        back_populates="session",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class Set(Base):
    __tablename__ = "sets"
    __table_args__ = (
        Index("ix_sets_session_id_set_number", "session_id", "set_number"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sessions.id", ondelete="CASCADE"),
        nullable=False,
    )

    set_number: Mapped[int] = mapped_column(Integer, nullable=False)

    target_reps: Mapped[int | None] = mapped_column(Integer, nullable=True)
    actual_reps: Mapped[int | None] = mapped_column(Integer, nullable=True)

    avg_form_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    fatigue_index: Mapped[float | None] = mapped_column(Float, nullable=True)
    fatigue_risk: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )

    depth_ok: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    stability_ok: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    tempo_ok: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    overall_ok: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    load_used: Mapped[float | None] = mapped_column(Float, nullable=True)
    rest_duration_sec: Mapped[float | None] = mapped_column(
        Float, nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # ── Relationships ─────────────────────────────────────────────────────
    session = relationship("Session", back_populates="sets")
    reps = relationship(
        "Rep",
        back_populates="set_",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
