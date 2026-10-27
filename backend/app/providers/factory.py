"""Resolve one provider or the explicitly configured ordered fallback route."""

from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import urlsplit

from app.config import settings
from app.providers.adapters import GeminiProvider, OpenAICompatibleProvider
from app.providers.base import Provider, ProviderError, ProviderFallbackChain
from app.providers.mock import MockProvider

_OPENROUTER_URL = "https://openrouter.ai/api/v1"
_GROQ_URL = "https://api.groq.com/openai/v1"
# OpenRouter's current model/endpoint documentation advertises JSON Schema for
# these models. Other candidates use JSON-object mode and local validation.
_OPENROUTER_STRICT_JSON_SCHEMA_MODELS = frozenset(
    {
        "dots-studio/dots-3-note-preview:free",
        "xingchen-agi/xing4.0-29b-a4b:free",
        "apodex/apodex-1.1-mini:free",
    }
)
# Groq currently documents strict constrained output for these model IDs.
# Other Groq models use JSON-object mode and are validated by our local schema.
_GROQ_STRICT_JSON_SCHEMA_MODELS = frozenset(
    {"openai/gpt-oss-20b", "openai/gpt-oss-120b", "qwen/qwen3.8-27b"}
)


def _groq_supports_strict_json_schema(model: str) -> bool:
    return model.strip().casefold() in _GROQ_STRICT_JSON_SCHEMA_MODELS


def _openrouter_supports_strict_json_schema(model: str) -> bool:
    return model.strip().casefold() in _OPENROUTER_STRICT_JSON_SCHEMA_MODELS


@dataclass(frozen=True, slots=True)
class ProviderAvailability:
    name: str
    configured: bool
    supports_json_schema: bool
    external: bool
    resume_processing_allowed: bool
    route: tuple[str, ...] = ()


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


def _fallback_providers() -> tuple[Provider, ...]:
    """Build the configured waterfall: OpenRouter models, Groq, then loopback model."""

    providers: list[Provider] = []
    common = {
        "temperature": settings.llm_temperature,
        "timeout_seconds": settings.llm_timeout_seconds,
    }
    if settings.openrouter_api_key.strip():
        model_ids = [
            model.strip()
            for model in settings.llm_openrouter_fallback_models.split(",")
            if model.strip()
        ]
        providers.extend(
            OpenAICompatibleProvider(
                name="openrouter",
                api_key=settings.openrouter_api_key,
                base_url=_OPENROUTER_URL,
                model=model,
                strict_schema=_openrouter_supports_strict_json_schema(model),
                disable_routing_fallbacks=True,
                **common,
            )
            for model in model_ids
        )
    if settings.groq_api_key.strip() and settings.llm_groq_fallback_model.strip():
        model = settings.llm_groq_fallback_model.strip()
        providers.append(
            OpenAICompatibleProvider(
                name="groq",
                api_key=settings.groq_api_key,
                base_url=_GROQ_URL,
                model=model,
                strict_schema=_groq_supports_strict_json_schema(model),
                **common,
            )
        )

    local_model = settings.llm_local_fallback_model.strip()
    local_url = settings.llm_local_fallback_base_url.strip()
    local_parts = urlsplit(local_url)
    is_loopback = (
        local_parts.scheme == "http"
        and local_parts.hostname in {"localhost", "127.0.0.1", "::1"}
        and bool(local_parts.netloc)
    )
    if local_model and is_loopback:
        providers.append(
            OpenAICompatibleProvider(
                name="local",
                api_key="",
                base_url=local_url,
                model=local_model,
                strict_schema=False,
                **common,
            )
        )
    return tuple(providers)


def provider_availability() -> ProviderAvailability:
    """Expose provider readiness without exposing keys or making a network call."""

    name, model, key, base_url = _configured_credentials()
    if name == "mock":
        return ProviderAvailability(
            "mock", True, False, False, True, ("mock/local-registry-rules",)
        )
    if name == "fallback":
        chain = _fallback_providers()
        route = ProviderFallbackChain(chain).route
        return ProviderAvailability(
            "fallback",
            bool(chain),
            all(provider.supports_json_schema for provider in chain),
            any(provider.external for provider in chain),
            settings.llm_resume_processing_allowed,
            route,
        )
    if name == "openrouter":
        return ProviderAvailability(
            name,
            bool(key and model),
            True,
            True,
            settings.llm_resume_processing_allowed,
            (f"openrouter/{model}",) if model else (),
        )
    if name == "groq":
        return ProviderAvailability(
            name,
            bool(key and model),
            _groq_supports_strict_json_schema(model),
            True,
            settings.llm_resume_processing_allowed,
            (f"groq/{model}",) if model else (),
        )
    if name == "gemini":
        return ProviderAvailability(
            name,
            bool(key and model),
            True,
            True,
            settings.llm_resume_processing_allowed,
            (f"gemini/{model}",) if model else (),
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
            (f"{name}/{model}",) if model else (),
        )
    return ProviderAvailability(name or "unknown", False, False, True, False)


def get_provider() -> Provider | ProviderFallbackChain:
    """Resolve the configured document provider route for this request."""

    availability = provider_availability()
    name, model, key, base_url = _configured_credentials()
    if not availability.configured:
        raise ProviderError(
            "PROVIDER_NOT_CONFIGURED",
            "The selected provider is missing a model, API key, or valid base URL.",
            status_code=503,
        )
    if name == "fallback":
        return ProviderFallbackChain(_fallback_providers())
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
