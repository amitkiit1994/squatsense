from __future__ import annotations

"""EmailOtp ORM model — one-time codes for email verification.

Stores only the SHA-256 hash of the 6-digit code, never the code itself.
Rows are single-use: ``consumed_at`` is set on successful verification,
when the attempt cap is reached, or when a newer OTP supersedes them.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from backend.db.base import Base


class EmailOtp(Base):
    __tablename__ = "email_otps"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    code_hash: Mapped[str] = mapped_column(
        String(64), nullable=False
    )  # sha256 hex digest of the 6-digit code
    purpose: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="verify"
    )
    attempts: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    consumed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
