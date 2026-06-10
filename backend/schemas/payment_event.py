"""Payment event schemas (internal service-to-service reporting)."""

from __future__ import annotations

import uuid
from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field


class PaymentEventCreate(BaseModel):
    """Payload for recording a Razorpay payment lifecycle event."""

    source: str = Field(
        ...,
        min_length=1,
        max_length=30,
        description="Reporting service identifier, e.g. traqgym-cloud",
    )
    event_type: Literal[
        "payment.verified", "payment.captured", "payment.failed"
    ] = Field(..., description="Payment lifecycle event type")
    razorpay_order_id: str = Field(
        ..., min_length=1, max_length=64, description="Razorpay order ID"
    )
    razorpay_payment_id: Optional[str] = Field(
        default=None, max_length=64, description="Razorpay payment ID"
    )
    plan_id: Optional[str] = Field(
        default=None, max_length=30, description="Plan identifier, e.g. starter"
    )
    billing: Optional[str] = Field(
        default=None, max_length=10, description="Billing period, e.g. monthly"
    )
    amount: Optional[int] = Field(
        default=None, ge=0, description="Amount in paise"
    )
    currency: str = Field(
        default="INR", min_length=3, max_length=8, description="ISO currency code"
    )
    payer_email: Optional[EmailStr] = Field(
        default=None, description="Payer email address for the receipt"
    )
    raw: Optional[dict] = Field(
        default=None, description="Raw provider payload for auditing"
    )


class PaymentEventResponse(BaseModel):
    """Confirmation after a payment event is recorded."""

    ok: bool = Field(default=True, description="Whether the event was recorded")
    id: uuid.UUID = Field(..., description="Recorded payment event ID")
