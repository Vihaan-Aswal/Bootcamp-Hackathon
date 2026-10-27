"""Frozen provider interface shared by JD Analytics and Resume Parsing."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

from app.contracts.v1 import SourceElement, SourceType


@dataclass(frozen=True, slots=True)
class StructuredGenerationRequest:
    """One tool-free structured generation request for a parsed document."""

    source_type: SourceType
    system_prompt: str
    user_prompt: str
    schema_name: str
    schema: dict[str, Any]
    # Only the elements that are safe to expose to this provider are included.
    # The mock adapter uses them for deterministic, offline extraction.
    elements: tuple[SourceElement, ...]


class ProviderError(RuntimeError):
    """Provider failures have safe messages that exclude prompts and secrets."""

    def __init__(self, code: str, message: str, status_code: int = 502) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


class Provider(Protocol):
    """A single structured generation operation; providers receive no tools."""

    name: str
    model: str | None
    supports_json_schema: bool
    external: bool

    def generate_structured(self, request: StructuredGenerationRequest) -> str:
        """Return model output text; callers must validate it with Pydantic."""


@dataclass(frozen=True, slots=True)
class ProviderFallbackChain:
    """Ordered providers tried until one returns locally valid structured output."""

    providers: tuple[Provider, ...]
    name: str = "fallback"
    model: str | None = None

    @property
    def supports_json_schema(self) -> bool:
        return all(provider.supports_json_schema for provider in self.providers)

    @property
    def external(self) -> bool:
        return any(provider.external for provider in self.providers)

    @property
    def route(self) -> tuple[str, ...]:
        return tuple(
            f"{provider.name}/{provider.model}" if provider.model else provider.name
            for provider in self.providers
        )


ProviderRoute = Provider | ProviderFallbackChain
