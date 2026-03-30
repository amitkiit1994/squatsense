from __future__ import annotations

"""Application configuration via pydantic-settings."""

import json
from typing import Optional

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # ── Database ──────────────────────────────────────────────────────────
    DATABASE_URL: str = (
        "postgresql+asyncpg://postgres:postgres@localhost:5432/squatsense"
    )

    @field_validator("DATABASE_URL", mode="after")
    @classmethod
    def _ensure_asyncpg_driver(cls, v: str) -> str:
        """Railway provides postgresql:// URLs; ensure the asyncpg driver."""
        if v.startswith("postgresql://"):
            return v.replace("postgresql://", "postgresql+asyncpg://", 1)
        return v

    # ── JWT / Auth ────────────────────────────────────────────────────────
    JWT_SECRET_KEY: str = Field(..., description="Secret key used to sign JWTs")
    JWT_ALGORITHM: str = "HS256"

    @field_validator("JWT_SECRET_KEY", mode="after")
    @classmethod
    def _check_jwt_secret_length(cls, v: str) -> str:
        if len(v) < 32:
            raise ValueError(
                "JWT_SECRET_KEY must be at least 32 characters for HS256 security"
            )
        return v

    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    PASSWORD_RESET_EXPIRE_MINUTES: int = 15

    # ── Registration allowlist ────────────────────────────────────────
    # Comma-separated emails allowed to register. Empty = open registration.
    ALLOWED_EMAILS: str = ""

    # ── Frontend URLs (for email links) ───────────────────────────────
    FRONTEND_URL: str = "http://localhost:3000"
    SQUATSENSE_URL: str = "http://localhost:3001"

    # ── CORS ──────────────────────────────────────────────────────────────
    # Override via CORS_ORIGINS env var (JSON array or comma-separated).
    # Default allows only the local dev server.
    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://localhost:3001",
        "https://squatsense.ai",
        "https://www.squatsense.ai",
    ]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def _parse_cors(cls, v: object) -> list[str]:
        if isinstance(v, list):
            return v
        if isinstance(v, str):
            v = v.strip()
            if v.startswith("["):
                return json.loads(v)
            return [s.strip() for s in v.split(",") if s.strip()]
        return [str(v)]

    @property
    def allowed_emails_list(self) -> list[str]:
        """Parse ALLOWED_EMAILS csv string into a lowercase list."""
        v = self.ALLOWED_EMAILS.strip()
        if not v:
            return []
        return [e.strip().lower() for e in v.split(",") if e.strip()]

    # ── AI Coach ──────────────────────────────────────────────────────────
    AI_COACH_ENABLED: bool = False
    OPENAI_API_KEY: Optional[str] = None
    ANTHROPIC_API_KEY: Optional[str] = None
    OPENAI_MODEL: str = "gpt-4.1"

    # ── Email (Resend) ─────────────────────────────────────────────────
    RESEND_API_URL: str = "https://api.resend.com/emails"
    RESEND_API_KEY: Optional[str] = None
    EMAIL_FROM: str = "amit@freeformfitness.ai"
    EMAIL_FROM_NAME: str = "FreeForm Fitness"
    SQUATSENSE_EMAIL_FROM: str = "play@squatsense.ai"
    SQUATSENSE_EMAIL_FROM_NAME: str = "SquatSense"


settings = Settings()
