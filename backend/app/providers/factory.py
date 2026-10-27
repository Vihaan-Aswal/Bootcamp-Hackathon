"""Resolve exactly one configured backend provider, with no vendor failover."""

from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import urlsplit

from app.config import settings
from app.providers.adapters import GeminiProvider, OpenAICompatibleProvider
from app.providers.base import Provider, ProviderError
from app.providers.mock import MockProvider

_OPENROUTER_URL = "https://openrouter.ai/api/v1"
_GROQ_URL = "https://api.groq.com/openai/v1"
# Groq currently documents strict constrained output for these model IDs.
# Other Groq models use JSON-object mode and are validated by our local schema.
_GROQ_STRICT_JSON_SCHEMA_MODELS = frozenset(
    {"openai/gpt-oss-20b", "openai/gpt-oss-120b", "qwen/qwen3.8-27b"}
)


def _groq_supports_strict_json_schema(model: str) -> bool:
    return model.strip().casefold() in _GROQ_STRICT_JSON_SCHEMA_MODELS


@dataclass(frozen=True, slots=True)
class ProviderAvailability:
    name: str
    configured: bool
    supports_json_schema: bool
    external: bool
    resume_processing_allowed: bool


def _configured_credentials() -> tuple[str, str, str, str]:
    name = settings.llm_provider.strip().casefold() or "mock"
    model = settings.llm_model.strip()
    key = {
        "openrouter": settings.openrouter_api_key,
        "groq": settings.groq_api_key,
        "gemini": settings.google_api_key,
        "openai_compatible": settings.openai_compatible_api_key,
    }.get(name, "")
    base_url = settings.llm_base_url.strip()
    return name, model, key, base_url


def provider_availability() -> ProviderAvailability:
    """Expose provider readiness without exposing keys or making a network call."""

    name, model, key, base_url = _configured_credentials()
    if name == "mock":
        return ProviderAvailability("mock", True, False, False, True)
    if name == "openrouter":
        return ProviderAvailability(
            name, bool(key and model), True, True, settings.llm_resume_processing_allowed
        )
    if name == "groq":
        return ProviderAvailability(
            name,
            bool(key and model),
            _groq_supports_strict_json_schema(model),
            True,
            settings.llm_resume_processing_allowed,
        )
    if name == "gemini":
        return ProviderAvailability(
            name, bool(key and model), True, True, settings.llm_resume_processing_allowed
        )
    if name == "openai_compatible":
        parts = urlsplit(base_url)
        local_http = parts.scheme == "http" and parts.hostname in {"localhost", "127.0.0.1", "::1"}
        valid_url = bool(parts.netloc and (parts.scheme == "https" or local_http))
        return ProviderAvailability(
            name,
            bool(model and valid_url and (key or local_http)),
            False,
            not local_http,
            settings.llm_resume_processing_allowed,
        )
    return ProviderAvailability(name or "unknown", False, False, True, False)


def get_provider() -> Provider:
    """Resolve one explicitly configured backend provider for this request."""

    availability = provider_availability()
    name, model, key, base_url = _configured_credentials()
    if not availability.configured:
        raise ProviderError(
            "PROVIDER_NOT_CONFIGURED",
            "The selected provider is missing a model, API key, or valid base URL.",
            status_code=503,
        )
    common = {
        "model": model,
        "temperature": settings.llm_temperature,
        "timeout_seconds": settings.llm_timeout_seconds,
    }
    if name == "mock":
        return MockProvider()
    if name == "openrouter":
        return OpenAICompatibleProvider(
            name=name,
            api_key=key,
            base_url=_OPENROUTER_URL,
            strict_schema=True,
            disable_routing_fallbacks=True,
            **common,
        )
    if name == "groq":
        return OpenAICompatibleProvider(
            name=name,
            api_key=key,
            base_url=_GROQ_URL,
            strict_schema=availability.supports_json_schema,
            **common,
        )
    if name == "gemini":
        return GeminiProvider(api_key=key, **common)
    if name == "openai_compatible":
        return OpenAICompatibleProvider(
            name=name,
            api_key=key,
            base_url=base_url,
            strict_schema=False,
            **common,
        )
    raise ProviderError(
        "PROVIDER_NOT_SUPPORTED", "The selected provider is not supported.", status_code=503
    )
