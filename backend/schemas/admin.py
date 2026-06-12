"""Admin leads overview schemas."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, model_validator

# Pipeline stages for gym inquiries, in funnel order. Kept as a plain tuple
# (not a DB enum) so adding a stage stays a code-only change.
GYM_PIPELINE_STAGES: tuple[str, ...] = (
    "new",
    "contacted",
    "demo",
    "trial",
    "won",
    "lost",
)

GymStage = Literal["new", "contacted", "demo", "trial", "won", "lost"]


class LeadCounts(BaseModel):
    """Total row counts for each lead source."""

    gym_inquiries: int = Field(..., ge=0, description="Total B2B gym inquiries")
    contact_inquiries: int = Field(
        ..., ge=0, description="Total office/enterprise contact inquiries"
    )
    waitlist_emails: int = Field(..., ge=0, description="Total waitlist signups")
    users: int = Field(..., ge=0, description="Total registered users")
    payment_events: int = Field(
        ..., ge=0, description="Total recorded payment events"
    )


class GymInquiryListItem(BaseModel):
    """A single B2B gym inquiry row."""

    id: uuid.UUID = Field(..., description="Inquiry ID")
    gym_name: str = Field(..., description="Gym name")
    contact_name: str = Field(..., description="Contact person name")
    email: str = Field(..., description="Contact email address")
    phone: Optional[str] = Field(default=None, description="Contact phone number")
    city: Optional[str] = Field(default=None, description="Gym city")
    num_locations: Optional[int] = Field(
        default=None, description="Number of gym locations"
    )
    message: Optional[str] = Field(default=None, description="Additional message")
    stage: GymStage = Field(..., description="Pipeline stage")
    next_action: Optional[str] = Field(
        default=None, description="Free-text next action for this lead"
    )
    stage_updated_at: Optional[datetime] = Field(
        default=None, description="When the stage was last changed"
    )
    created_at: datetime = Field(..., description="Submission timestamp")


class GymInquiryUpdateRequest(BaseModel):
    """Partial update for a gym inquiry's pipeline fields.

    At least one of ``stage`` / ``next_action`` must be provided.
    ``next_action`` may be explicitly null to clear it.
    """

    stage: Optional[GymStage] = Field(
        default=None, description="New pipeline stage"
    )
    next_action: Optional[str] = Field(
        default=None,
        max_length=255,
        description="Next action note (null clears it)",
    )

    @model_validator(mode="after")
    def _require_at_least_one_field(self) -> "GymInquiryUpdateRequest":
        if not self.model_fields_set:
            raise ValueError(
                "Provide at least one of 'stage' or 'next_action'."
            )
        return self


class ContactInquiryListItem(BaseModel):
    """A single office/enterprise contact inquiry row."""

    id: uuid.UUID = Field(..., description="Inquiry ID")
    company_name: str = Field(..., description="Company name")
    contact_name: str = Field(..., description="Contact person name")
    email: str = Field(..., description="Contact email address")
    number_of_offices: Optional[str] = Field(
        default=None, description="Number of office locations (range label)"
    )
    estimated_employees: Optional[str] = Field(
        default=None, description="Estimated employee count (range label)"
    )
    message: Optional[str] = Field(default=None, description="Additional message")
    created_at: datetime = Field(..., description="Submission timestamp")


class PaymentEventListItem(BaseModel):
    """A single recorded payment event row."""

    id: uuid.UUID = Field(..., description="Payment event ID")
    source: str = Field(..., description="Reporting service identifier")
    event_type: str = Field(..., description="Payment lifecycle event type")
    razorpay_order_id: str = Field(..., description="Razorpay order ID")
    razorpay_payment_id: Optional[str] = Field(
        default=None, description="Razorpay payment ID"
    )
    plan_id: Optional[str] = Field(default=None, description="Plan identifier")
    billing: Optional[str] = Field(default=None, description="Billing period")
    amount: Optional[int] = Field(default=None, description="Amount in paise")
    currency: str = Field(..., description="ISO currency code")
    payer_email: Optional[str] = Field(
        default=None, description="Payer email address"
    )
    created_at: datetime = Field(..., description="Recording timestamp")


class AdminLeadsResponse(BaseModel):
    """Lead counts plus the latest inquiries, newest first."""

    counts: LeadCounts = Field(..., description="Total counts per lead source")
    stage_counts: dict[str, int] = Field(
        ...,
        description=(
            "Gym inquiry counts per pipeline stage; always contains all six "
            "stages (new, contacted, demo, trial, won, lost)"
        ),
    )
    gym_inquiries: list[GymInquiryListItem] = Field(
        ..., description="Latest 50 gym inquiries, newest first"
    )
    contact_inquiries: list[ContactInquiryListItem] = Field(
        ..., description="Latest 50 contact inquiries, newest first"
    )
    payment_events: list[PaymentEventListItem] = Field(
        ..., description="Latest 20 payment events, newest first"
    )
