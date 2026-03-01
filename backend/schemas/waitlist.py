"""Waitlist signup schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class WaitlistSignupRequest(BaseModel):
    """Payload for joining the waitlist."""

    email: EmailStr = Field(..., description="Email address to join the waitlist")


class WaitlistSignupResponse(BaseModel):
    """Confirmation after successful signup."""

    message: str = Field(
        default="You're on the list!",
        description="Success message",
    )
    email: str = Field(..., description="Registered email")
    created_at: datetime = Field(..., description="Signup timestamp")
