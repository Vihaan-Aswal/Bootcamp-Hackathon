"""Runtime settings loaded from environment variables (backend only)."""

from __future__ import annotations

from pathlib import Path

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
    llm_provider: str = ""
    llm_model: str = ""
    llm_base_url: str = ""
    openrouter_api_key: str = ""
    groq_api_key: str = ""
    google_api_key: str = ""
    openai_compatible_api_key: str = ""
    llm_temperature: float = 0.0
    llm_timeout_seconds: int = 30
    llm_max_retries: int = 1

    max_upload_mb: int = 10
    max_pages: int = 20


settings = Settings()
