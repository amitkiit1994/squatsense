"""Drill completion tracking ORM model."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from backend.db.base import Base


class DrillCompletion(Base):
    __tablename__ = "drill_completions"
    __table_args__ = (
        Index("ix_drill_completions_user_id_completed_at", "user_id", "completed_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    drill_name: Mapped[str] = mapped_column(String(200), nullable=False)
    exercise_type: Mapped[str] = mapped_column(String(50), nullable=False)
    target_area: Mapped[str | None] = mapped_column(String(100), nullable=True)
    completed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
