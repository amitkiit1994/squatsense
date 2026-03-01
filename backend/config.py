"""Application configuration via pydantic-settings."""

from typing import Optional

from pydantic import Field
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

    # ── JWT / Auth ────────────────────────────────────────────────────────
    JWT_SECRET_KEY: str = Field(..., description="Secret key used to sign JWTs")
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ── CORS ──────────────────────────────────────────────────────────────
    # Override via CORS_ORIGINS env var (JSON array or comma-separated).
    # Default allows only the local dev server.
    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
    ]

    # ── AI Coach ──────────────────────────────────────────────────────────
    AI_COACH_ENABLED: bool = False
    OPENAI_API_KEY: Optional[str] = None
    ANTHROPIC_API_KEY: Optional[str] = None
    OPENAI_MODEL: str = "gpt-4.1"

    # ── Email (SMTP) ───────────────────────────────────────────────────
    SMTP_HOST: Optional[str] = None
    SMTP_PORT: int = 587
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    SMTP_FROM_EMAIL: str = "hello@squatsense.com"
    SMTP_FROM_NAME: str = "SquatSense"


settings = Settings()
