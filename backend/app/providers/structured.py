"""Pydantic validation and bounded structural retry shared by provider calls."""

from __future__ import annotations

from pydantic import BaseModel, ValidationError

from app.providers.base import Provider, ProviderError, StructuredGenerationRequest

MAX_PROVIDER_RESPONSE_CHARS = 200_000


def validate_structured_output[T: BaseModel](
    provider: Provider,
    request: StructuredGenerationRequest,
    output_model: type[T],
    *,
    max_retries: int = 1,
) -> T:
    """Make one call, with at most one schema-only correction for bad output."""

    attempts = max(0, min(max_retries, 1)) + 1
    for attempt in range(attempts):
        current = request
        if attempt:
            current = StructuredGenerationRequest(
                source_type=request.source_type,
                system_prompt=(
                    f"{request.system_prompt}\nYour previous response did not validate. "
                    "Return one complete JSON object that follows the supplied schema."
                ),
                user_prompt=request.user_prompt,
                schema_name=request.schema_name,
                schema=request.schema,
                elements=request.elements,
            )
        raw = provider.generate_structured(current)
        if not isinstance(raw, str) or not raw.strip() or len(raw) > MAX_PROVIDER_RESPONSE_CHARS:
            if attempt + 1 < attempts:
                continue
            raise ProviderError(
                "INVALID_PROVIDER_OUTPUT", "The provider returned an empty or oversized response."
            )
        try:
            return output_model.model_validate_json(raw)
        except (ValidationError, ValueError):
            if attempt + 1 < attempts:
                continue
            raise ProviderError(
                "INVALID_PROVIDER_OUTPUT",
                "The provider response did not match the required extraction format.",
            ) from None
    raise ProviderError("INVALID_PROVIDER_OUTPUT", "The provider response could not be validated.")
