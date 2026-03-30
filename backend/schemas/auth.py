from __future__ import annotations

"""Authentication request/response schemas."""

import re

from pydantic import BaseModel, EmailStr, Field, field_validator


def _validate_password_strength(password: str) -> str:
    """Ensure password has at least one uppercase, one lowercase, and one digit."""
    if not re.search(r"[A-Z]", password):
        msg = "Password must contain at least one uppercase letter"
        raise ValueError(msg)
    if not re.search(r"[a-z]", password):
        msg = "Password must contain at least one lowercase letter"
        raise ValueError(msg)
    if not re.search(r"\d", password):
        msg = "Password must contain at least one digit"
        raise ValueError(msg)
    return password


class RegisterRequest(BaseModel):
    """Payload for user registration."""

    model_config = {"strict": True}

    email: EmailStr = Field(..., description="User email address")
    password: str = Field(
        ..., min_length=8, max_length=128, description="Account password"
    )
    name: str = Field(
        ..., min_length=1, max_length=100, description="Display name"
    )

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        return _validate_password_strength(v)


class LoginRequest(BaseModel):
    """Payload for user login."""

    model_config = {"strict": True}

    email: EmailStr = Field(..., description="User email address")
    password: str = Field(..., description="Account password")


class TokenResponse(BaseModel):
    """JWT token pair returned after successful authentication."""

    access_token: str = Field(..., description="Short-lived access JWT")
    refresh_token: str = Field(..., description="Long-lived refresh JWT")
    token_type: str = Field(default="bearer", description="Token scheme")


class RefreshRequest(BaseModel):
    """Payload for refreshing an access token."""

    model_config = {"strict": True}

    refresh_token: str = Field(..., description="Valid refresh JWT")


class ForgotPasswordRequest(BaseModel):
    """Payload for requesting a password reset email."""

    email: EmailStr = Field(..., description="Account email address")


class ResetPasswordRequest(BaseModel):
    """Payload for resetting password with a token."""

    token: str = Field(..., description="Password reset token from email")
    new_password: str = Field(
        ..., min_length=8, max_length=128, description="New password"
    )

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        return _validate_password_strength(v)
