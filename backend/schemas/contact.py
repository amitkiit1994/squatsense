"""Office/enterprise contact inquiry schemas."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class ContactRequest(BaseModel):
    """Payload for an office/enterprise contact inquiry."""

    company_name: str = Field(..., min_length=1, max_length=200, description="Company name")
    contact_name: str = Field(..., min_length=1, max_length=200, description="Contact person name")
    email: EmailStr = Field(..., description="Contact email address")
    number_of_offices: Optional[str] = Field(
        default=None, max_length=20, description="Number of office locations (range label)"
    )
    estimated_employees: Optional[str] = Field(
        default=None, max_length=20, description="Estimated employee count (range label)"
    )
    message: Optional[str] = Field(default=None, max_length=2000, description="Additional message")


class ContactResponse(BaseModel):
    """Confirmation after contact inquiry submission."""

    ok: bool = Field(default=True, description="Whether the inquiry was accepted")
