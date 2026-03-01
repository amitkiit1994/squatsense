"""User ORM model."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    password_hash: Mapped[str | None] = mapped_column(Text, nullable=True)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    experience_level: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )
    goal: Mapped[str | None] = mapped_column(String(20), nullable=True)

    injury_history: Mapped[dict | list] = mapped_column(
        JSONB, nullable=False, server_default="[]"
    )
    training_max: Mapped[dict] = mapped_column(
        JSONB, nullable=False, server_default="{}"
    )
    baseline_metrics: Mapped[dict] = mapped_column(
        JSONB, nullable=False, server_default="{}"
    )

    onboarding_completed: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )

    auth_provider: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="email"
    )
    auth_provider_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    # ── Relationships ─────────────────────────────────────────────────────
    sessions = relationship("Session", back_populates="user", lazy="selectin")
    refresh_tokens = relationship(
        "RefreshToken", back_populates="user", lazy="selectin"
    )
