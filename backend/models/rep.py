from __future__ import annotations

"""Rep ORM model."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.base import Base


class Rep(Base):
    __tablename__ = "reps"
    __table_args__ = (
        Index("ix_reps_set_id_rep_number", "set_id", "rep_number"),
        Index("ix_reps_session_id", "session_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    set_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sets.id", ondelete="CASCADE"),
        nullable=False,
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
    rep_number: Mapped[int] = mapped_column(Integer, nullable=False)

    timestamp: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # ── Phase timing (eccentric / pause / concentric) ──────────────────
    eccentric_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    pause_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    concentric_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # ── Scores ────────────────────────────────────────────────────────────
    composite_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    depth_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    stability_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    symmetry_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    tempo_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    rom_score: Mapped[float | None] = mapped_column(Float, nullable=True)

    # ── Angles ────────────────────────────────────────────────────────────
    primary_angle_deg: Mapped[float | None] = mapped_column(
        Float, nullable=True
    )
    secondary_angle_deg: Mapped[float | None] = mapped_column(
        Float, nullable=True
    )
    trunk_angle_deg: Mapped[float | None] = mapped_column(
        Float, nullable=True
    )
    ankle_angle_deg: Mapped[float | None] = mapped_column(
        Float, nullable=True
    )

    # ── Biomechanics ──────────────────────────────────────────────────────
    com_offset_norm: Mapped[float | None] = mapped_column(
        Float, nullable=True
    )
    speed_proxy: Mapped[float | None] = mapped_column(Float, nullable=True)

    # ── Boolean flags ─────────────────────────────────────────────────────
    depth_ok: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    form_ok: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    balance_ok: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    trunk_ok: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    # ── JSONB fields ──────────────────────────────────────────────────────
    joint_angles: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    flags: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    risk_markers: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # ── Metadata ──────────────────────────────────────────────────────────
    pose_confidence: Mapped[float | None] = mapped_column(
        Float, nullable=True
    )
    needs_review: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # ── Relationships ─────────────────────────────────────────────────────
    set_ = relationship("Set", back_populates="reps", lazy="selectin")
    session = relationship("Session", back_populates="reps", lazy="selectin")
