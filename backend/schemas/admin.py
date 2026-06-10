"""Admin leads overview schemas."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class LeadCounts(BaseModel):
    """Total row counts for each lead source."""

    gym_inquiries: int = Field(..., ge=0, description="Total B2B gym inquiries")
    contact_inquiries: int = Field(
        ..., ge=0, description="Total office/enterprise contact inquiries"
    )
    waitlist_emails: int = Field(..., ge=0, description="Total waitlist signups")
    users: int = Field(..., ge=0, description="Total registered users")


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
    created_at: datetime = Field(..., description="Submission timestamp")


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


class AdminLeadsResponse(BaseModel):
    """Lead counts plus the latest inquiries, newest first."""

    counts: LeadCounts = Field(..., description="Total counts per lead source")
    gym_inquiries: list[GymInquiryListItem] = Field(
        ..., description="Latest 50 gym inquiries, newest first"
    )
    contact_inquiries: list[ContactInquiryListItem] = Field(
        ..., description="Latest 50 contact inquiries, newest first"
    )
