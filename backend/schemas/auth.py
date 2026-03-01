"""Authentication request/response schemas."""

from pydantic import BaseModel, EmailStr, Field


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
