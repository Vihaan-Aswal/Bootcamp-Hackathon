"""Runtime settings loaded from environment variables (backend only)."""

from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    """Backend configuration. Secrets stay here and are never logged."""

    model_config = SettingsConfigDict(
        env_file=BACKEND_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    data_dir: Path = REPO_ROOT / "data"
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    # Provider settings are read by the adapter added in M2; none of them may
    # ever be exposed through a VITE_* variable.
    llm_provider: Literal["mock", "openrouter", "groq", "gemini", "openai_compatible"] = "mock"
    llm_model: str = ""
    llm_base_url: str = ""
    openrouter_api_key: str = ""
    groq_api_key: str = ""
    google_api_key: str = ""
    openai_compatible_api_key: str = ""
    llm_temperature: float = Field(default=0.0, ge=0.0, le=2.0)
    llm_timeout_seconds: int = Field(default=30, ge=1, le=120)
    llm_max_retries: int = Field(default=1, ge=0, le=1)
    # Must be explicitly enabled after reviewing the selected provider's
    # current retention/training terms. Individual resume requests still need
    # a user opt-in when the provider is external.
    llm_resume_processing_allowed: bool = False

    max_upload_mb: int = Field(default=10, ge=1, le=50)
    max_pages: int = Field(default=20, ge=1, le=100)


settings = Settings()
