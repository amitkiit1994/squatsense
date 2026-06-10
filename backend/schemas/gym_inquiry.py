"""Gym inquiry (B2B) schemas."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class GymInquiryRequest(BaseModel):
    """Payload for a B2B gym inquiry."""

    gym_name: str = Field(..., min_length=1, max_length=200, description="Name of the gym or chain")
    contact_name: str = Field(..., min_length=1, max_length=200, description="Contact person name")
    email: EmailStr = Field(..., description="Contact email address")
    phone: Optional[str] = Field(default=None, max_length=30, description="Phone number")
    city: Optional[str] = Field(default=None, max_length=100, description="City where the gym is located")
    num_locations: Optional[int] = Field(default=None, ge=1, description="Number of gym locations")
    message: Optional[str] = Field(default=None, max_length=2000, description="Additional message")


class GymInquiryResponse(BaseModel):
    """Confirmation after inquiry submission."""

    ok: bool = Field(default=True, description="Whether the inquiry was accepted")
