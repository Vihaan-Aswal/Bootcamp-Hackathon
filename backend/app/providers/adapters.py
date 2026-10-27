"""Small HTTP adapters for configured structured-output providers.

No adapter has tools, browser access, database access, automatic vendor
fallback, or response-body logging. Model output is still validated locally.
"""

from __future__ import annotations

import copy
import json
from collections.abc import Mapping
from typing import Any
from urllib.parse import quote, urlsplit

import httpx

from app.providers.base import ProviderError, StructuredGenerationRequest


def _strict_json_schema(schema: Mapping[str, Any]) -> dict[str, Any]:
    """Inline Pydantic definitions and prepare an OpenAI-style strict schema."""

    definitions = schema.get("$defs", {})

    def inline(node: Any, stack: frozenset[str] = frozenset()) -> Any:
        if isinstance(node, list):
            return [inline(item, stack) for item in node]
        if not isinstance(node, dict):
            return node
        reference = node.get("$ref")
        if reference and reference.startswith("#/$defs/"):
            name = reference.rsplit("/", 1)[-1]
            if name in stack or name not in definitions:
                raise ProviderError(
                    "INVALID_SCHEMA", "The extraction schema could not be prepared.", 500
                )
            target = inline(copy.deepcopy(definitions[name]), stack | {name})
            siblings = {key: value for key, value in node.items() if key != "$ref"}
            if siblings and isinstance(target, dict):
                target.update(inline(siblings, stack))
            return target

        result = {
            key: inline(value, stack)
            for key, value in node.items()
            if key not in {"$defs", "$ref", "default", "title"}
        }
        if result.get("type") == "object":
            properties = result.get("properties", {})
            result["required"] = list(properties)
            result["additionalProperties"] = False
        return result

    result = inline(copy.deepcopy(dict(schema)))
    if not isinstance(result, dict) or result.get("type") != "object":
        raise ProviderError("INVALID_SCHEMA", "The extraction schema could not be prepared.", 500)
    return result


def _schema_instruction(request: StructuredGenerationRequest) -> str:
    return f"\nReturn JSON matching this schema named {request.schema_name}:\n" + json.dumps(
        request.schema, ensure_ascii=False, separators=(",", ":")
    )


class OpenAICompatibleProvider:
    """Chat Completions JSON mode, used for OpenRouter/Groq/generic endpoints."""

    supports_json_schema = False

    def __init__(
        self,
        *,
        name: str,
        model: str,
        api_key: str,
        base_url: str,
        temperature: float = 0.0,
        timeout_seconds: int = 30,
        strict_schema: bool = False,
        disable_routing_fallbacks: bool = False,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self.name = name
        self.model = model
        self._api_key = api_key
        self._base_url = _validated_base_url(base_url)
        self._temperature = temperature
        self._timeout_seconds = timeout_seconds
        self._strict_schema = strict_schema
        self._disable_routing_fallbacks = disable_routing_fallbacks
        self._transport = transport
        self.supports_json_schema = strict_schema

    def generate_structured(self, request: StructuredGenerationRequest) -> str:
        body: dict[str, Any] = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": request.system_prompt + _schema_instruction(request)},
                {"role": "user", "content": request.user_prompt},
            ],
            "temperature": self._temperature,
            "stream": False,
            "response_format": (
                {
                    "type": "json_schema",
                    "json_schema": {
                        "name": request.schema_name,
                        "strict": True,
                        "schema": _strict_json_schema(request.schema),
                    },
                }
                if self._strict_schema
                else {"type": "json_object"}
            ),
        }
        if self._disable_routing_fallbacks:
            # OpenRouter can route a model to several upstream vendors. Require
            # the selected endpoint parameters and forbid upstream failover.
            body["provider"] = {"require_parameters": True, "allow_fallbacks": False}
        return self._post_chat_completion(body)

    def _post_chat_completion(self, body: dict[str, Any]) -> str:
        url = self._base_url
        if not url.rstrip("/").endswith("/chat/completions"):
            url = url.rstrip("/") + "/chat/completions"
        headers = {"Content-Type": "application/json"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"
        try:
            with httpx.Client(
                timeout=self._timeout_seconds,
                follow_redirects=False,
                transport=self._transport,
            ) as client:
                response = client.post(url, headers=headers, json=body)
        except httpx.TimeoutException:
            raise ProviderError(
                "PROVIDER_TIMEOUT", "The provider request timed out.", 504
            ) from None
        except httpx.HTTPError:
            raise ProviderError(
                "PROVIDER_UNAVAILABLE", "The provider could not be reached.", 502
            ) from None

        if response.status_code == 429:
            raise ProviderError(
                "PROVIDER_RATE_LIMITED", "The provider is rate-limiting requests.", 503
            )
        if response.status_code in {401, 403}:
            raise ProviderError(
                "PROVIDER_AUTH_FAILED", "The provider rejected its configured credentials.", 503
            )
        if response.status_code in {402, 413}:
            raise ProviderError(
                "PROVIDER_LIMIT",
                "The provider rejected the request because of an account or size limit.",
                503,
            )
        if response.status_code in {408, 504}:
            raise ProviderError("PROVIDER_TIMEOUT", "The provider request timed out.", 504)
        if response.status_code >= 400:
            raise ProviderError(
                "PROVIDER_REQUEST_FAILED",
                "The provider could not complete the extraction request.",
                502,
            )
        payload = _response_json(response)
        choices = payload.get("choices") if isinstance(payload, dict) else None
        if not isinstance(choices, list) or not choices or not isinstance(choices[0], dict):
            raise ProviderError(
                "INVALID_PROVIDER_RESPONSE", "The provider returned an invalid response."
            )
        message = choices[0].get("message")
        content = message.get("content") if isinstance(message, dict) else None
        if not isinstance(content, str):
            raise ProviderError(
                "INVALID_PROVIDER_RESPONSE", "The provider returned no extraction text."
            )
        return content


class GeminiProvider:
    """Google Gemini generateContent API with JSON-schema response format."""

    name = "gemini"
    supports_json_schema = True
    base_url = "https://generativelanguage.googleapis.com/v1beta/models"

    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        temperature: float = 0.0,
        timeout_seconds: int = 30,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self._api_key = api_key
        self.model = model
        self._temperature = temperature
        self._timeout_seconds = timeout_seconds
        self._transport = transport

    def generate_structured(self, request: StructuredGenerationRequest) -> str:
        url = f"{self.base_url}/{quote(self.model, safe='-_.')}:generateContent"
        body = {
            "systemInstruction": {
                "parts": [{"text": request.system_prompt + _schema_instruction(request)}]
            },
            "contents": [{"role": "user", "parts": [{"text": request.user_prompt}]}],
            "generationConfig": {
                "temperature": self._temperature,
                "responseFormat": {
                    "text": {
                        "mimeType": "application/json",
                        "schema": request.schema,
                    }
                },
            },
        }
        try:
            with httpx.Client(
                timeout=self._timeout_seconds,
                follow_redirects=False,
                transport=self._transport,
            ) as client:
                response = client.post(
                    url,
                    headers={"x-goog-api-key": self._api_key, "Content-Type": "application/json"},
                    json=body,
                )
        except httpx.TimeoutException:
            raise ProviderError(
                "PROVIDER_TIMEOUT", "The provider request timed out.", 504
            ) from None
        except httpx.HTTPError:
            raise ProviderError(
                "PROVIDER_UNAVAILABLE", "The provider could not be reached.", 502
            ) from None

        if response.status_code == 429:
            raise ProviderError(
                "PROVIDER_RATE_LIMITED", "The provider is rate-limiting requests.", 503
            )
        if response.status_code in {401, 403}:
            raise ProviderError(
                "PROVIDER_AUTH_FAILED", "The provider rejected its configured credentials.", 503
            )
        if response.status_code in {402, 413}:
            raise ProviderError(
                "PROVIDER_LIMIT",
                "The provider rejected the request because of an account or size limit.",
                503,
            )
        if response.status_code in {408, 504}:
            raise ProviderError("PROVIDER_TIMEOUT", "The provider request timed out.", 504)
        if response.status_code >= 400:
            raise ProviderError(
                "PROVIDER_REQUEST_FAILED",
                "The provider could not complete the extraction request.",
                502,
            )
        payload = _response_json(response)
        candidates = payload.get("candidates") if isinstance(payload, dict) else None
        if (
            not isinstance(candidates, list)
            or not candidates
            or not isinstance(candidates[0], dict)
        ):
            raise ProviderError(
                "INVALID_PROVIDER_RESPONSE", "The provider returned an invalid response."
            )
        content = candidates[0].get("content")
        parts = content.get("parts") if isinstance(content, dict) else None
        text = (
            parts[0].get("text")
            if isinstance(parts, list) and parts and isinstance(parts[0], dict)
            else None
        )
        if not isinstance(text, str):
            raise ProviderError(
                "INVALID_PROVIDER_RESPONSE", "The provider returned no extraction text."
            )
        return text


def _validated_base_url(value: str) -> str:
    parts = urlsplit(value.strip())
    local_http = parts.scheme == "http" and parts.hostname in {"localhost", "127.0.0.1", "::1"}
    if parts.scheme != "https" and not local_http:
        raise ProviderError("INVALID_PROVIDER_URL", "The provider base URL must use HTTPS.", 503)
    if not parts.netloc or parts.username or parts.password or parts.query or parts.fragment:
        raise ProviderError("INVALID_PROVIDER_URL", "The provider base URL is invalid.", 503)
    return value.rstrip("/")


def _response_json(response: httpx.Response) -> dict[str, Any]:
    try:
        payload = response.json()
    except ValueError:
        raise ProviderError(
            "INVALID_PROVIDER_RESPONSE", "The provider returned invalid JSON."
        ) from None
    if not isinstance(payload, dict):
        raise ProviderError(
            "INVALID_PROVIDER_RESPONSE", "The provider returned an invalid response."
        )
    return payload
