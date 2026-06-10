from __future__ import annotations

"""Payment event model — records Razorpay payment lifecycle events.

Events are reported by trusted internal services (e.g. traqgym-cloud)
via the internal payment-events endpoint. Amounts are stored in paise.
"""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Index, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from backend.db.base import Base


class PaymentEvent(Base):
    __tablename__ = "payment_events"
    __table_args__ = (
        Index("ix_payment_events_order_id", "razorpay_order_id"),
        Index("ix_payment_events_created_at", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    source: Mapped[str] = mapped_column(String(30), nullable=False)
    event_type: Mapped[str] = mapped_column(String(40), nullable=False)
    razorpay_order_id: Mapped[str] = mapped_column(String(64), nullable=False)
    razorpay_payment_id: Mapped[Optional[str]] = mapped_column(
        String(64), nullable=True
    )
    plan_id: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    billing: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    amount: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="INR")
    payer_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    raw: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
