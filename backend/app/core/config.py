"""Application configuration — reads from environment / .env file."""
from __future__ import annotations

from typing import List

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Application ───────────────────────────────────────────────────────────
    APP_NAME: str = "Sunset Group Dashboard"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False

    # ── Database ──────────────────────────────────────────────────────────────
    DATABASE_URL: str = "sqlite+aiosqlite:///./sunset_dashboard.db"

    # ── Security ──────────────────────────────────────────────────────────────
    SECRET_KEY: str = "CHANGE_ME_generate_a_strong_secret_key_here"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    ALGORITHM: str = "HS256"

    # ── CORS ──────────────────────────────────────────────────────────────────
    ALLOWED_ORIGINS: str = (
        "https://call.sunsetgroupbd.com,"
        "http://call.sunsetgroupbd.com,"
        "https://callapi.sunsetgroupbd.com,"
        "http://localhost:3000,"
        "http://127.0.0.1:3000"
    )

    # ── Cookies ───────────────────────────────────────────────────────────────
    COOKIE_SECURE: bool = False
    COOKIE_SAMESITE: str = "lax"

    # ── Business ──────────────────────────────────────────────────────────────
    BUSINESS_TIMEZONE: str = "Asia/Dhaka"

    @property
    def allowed_origins_list(self) -> List[str]:
        origins = [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]
        for default_domain in (
            "https://call.sunsetgroupbd.com",
            "http://call.sunsetgroupbd.com",
            "https://callapi.sunsetgroupbd.com",
        ):
            if default_domain not in origins:
                origins.append(default_domain)
        return origins

    @property
    def is_sqlite(self) -> bool:
        return self.DATABASE_URL.startswith("sqlite")

    @property
    def async_database_url(self) -> str:
        """Return an async-compatible database URL."""
        url = self.DATABASE_URL
        if url.startswith("postgresql://"):
            return url.replace("postgresql://", "postgresql+asyncpg://", 1)
        if url.startswith("postgres://"):
            return url.replace("postgres://", "postgresql+asyncpg://", 1)
        if url.startswith("sqlite://") and not url.startswith("sqlite+aiosqlite://"):
            return url.replace("sqlite://", "sqlite+aiosqlite://", 1)
        return url


settings = Settings()
