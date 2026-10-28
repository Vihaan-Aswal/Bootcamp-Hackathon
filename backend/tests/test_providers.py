"""Provider adapters use one tool-free request and keep failures private."""

from __future__ import annotations

import json

import httpx
import pytest

from app.contracts.v1 import ElementKind, SourceElement, SourceType
from app.providers.adapters import GeminiProvider, OpenAICompatibleProvider
from app.providers.base import ProviderError, ProviderFallbackChain
from app.providers.factory import (
    _groq_supports_strict_json_schema,
    _openrouter_supports_strict_json_schema,
    get_provider,
)
from app.services.extraction_pipeline import create_extraction_request, run_extraction_provider


def _request():
    element = SourceElement(
        element_id="p1",
        text="Python is required.",
        kind=ElementKind.paragraph,
        order=0,
    )
    return create_extraction_request(
        source_type=SourceType.jd,
        elements=(element,),
        system_prompt="Extract only supported skills.",
    )


@pytest.mark.parametrize(
    ("model", "supports_schema"),
    [
        ("openai/gpt-oss-20b", True),
        ("OPENAI/GPT-OSS-120B", True),
        ("qwen/qwen3.8-27b", True),
        ("llama-3.3-70b-versatile", False),
        ("", False),
    ],
)
def test_groq_uses_strict_mode_only_for_supported_models(model: str, supports_schema: bool) -> None:
    assert _groq_supports_strict_json_schema(model) is supports_schema


@pytest.mark.parametrize(
    ("model", "supports_schema"),
    [
        ("dots-studio/dots-3-note-preview:free", True),
        ("xingchen-agi/xing4.0-29b-a4b:free", True),
        ("apodex/apodex-1.1-mini:free", True),
        ("google/gemma-4-31b-it:free", False),
        ("recursive/flint-v1.0:free", False),
    ],
)
def test_openrouter_uses_schema_mode_only_for_models_that_advertise_it(
    model: str, supports_schema: bool
) -> None:
    assert _openrouter_supports_strict_json_schema(model) is supports_schema


def test_openrouter_uses_strict_schema_without_upstream_fallback() -> None:
    captured: dict[str, object] = {}

    def respond(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["headers"] = dict(request.headers)
        captured["body"] = json.loads(request.content)
        return httpx.Response(200, json={"choices": [{"message": {"content": '{"skills":[]}'}}]})

    provider = OpenAICompatibleProvider(
        name="openrouter",
        model="vendor/model",
        api_key="test-secret",
        base_url="https://openrouter.ai/api/v1",
        strict_schema=True,
        disable_routing_fallbacks=True,
        transport=httpx.MockTransport(respond),
    )

    assert provider.generate_structured(_request()) == '{"skills":[]}'
    body = captured["body"]
    assert isinstance(body, dict)
    assert body["provider"] == {
        "require_parameters": True,
        "allow_fallbacks": False,
        "data_collection": "deny",
        "zdr": True,
    }
    assert body["response_format"]["json_schema"]["strict"] is True
    assert "tools" not in body
    assert captured["url"] == "https://openrouter.ai/api/v1/chat/completions"
    assert captured["headers"]["authorization"] == "Bearer test-secret"


def test_gemini_uses_structured_json_and_keeps_key_out_of_url() -> None:
    captured: dict[str, object] = {}

    def respond(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["headers"] = dict(request.headers)
        captured["body"] = json.loads(request.content)
        return httpx.Response(
            200,
            json={"candidates": [{"content": {"parts": [{"text": '{"skills":[]}'}]}}]},
        )

    provider = GeminiProvider(
        api_key="test-secret",
        model="gemini-test",
        transport=httpx.MockTransport(respond),
    )

    assert provider.generate_structured(_request()) == '{"skills":[]}'
    body = captured["body"]
    assert isinstance(body, dict)
    assert body["generationConfig"]["responseFormat"]["text"]["mimeType"] == "application/json"
    assert "tools" not in body
    assert "test-secret" not in captured["url"]
    assert captured["headers"]["x-goog-api-key"] == "test-secret"


@pytest.mark.parametrize("status_code", [401, 429, 500])
def test_provider_error_does_not_expose_response_body(status_code: int) -> None:
    secret_document_text = "private resume content must not leak"
    provider = OpenAICompatibleProvider(
        name="openai_compatible",
        model="test-model",
        api_key="private-key",
        base_url="https://api.example.test/v1",
        transport=httpx.MockTransport(
            lambda _request: httpx.Response(status_code, text=secret_document_text)
        ),
    )

    with pytest.raises(ProviderError) as error:
        provider.generate_structured(_request())
    assert secret_document_text not in str(error.value)
    assert "private-key" not in str(error.value)


def test_provider_timeout_is_sanitized_and_fallback_continues(
    caplog: pytest.LogCaptureFixture,
) -> None:
    private_document_text = "private resume content must not leak"

    def raise_timeout(_request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout(private_document_text)

    timed_out = OpenAICompatibleProvider(
        name="openrouter",
        model="timeout-model",
        api_key="private-key",
        base_url="https://api.example.test/v1",
        transport=httpx.MockTransport(raise_timeout),
    )

    with pytest.raises(ProviderError) as error:
        timed_out.generate_structured(_request())
    assert error.value.code == "PROVIDER_TIMEOUT"
    assert private_document_text not in str(error.value)
    assert "private-key" not in str(error.value)

    class WorkingProvider:
        name = "groq"
        model = "fallback-model"
        supports_json_schema = True
        external = True

        def generate_structured(self, _request):
            return '{"skills":[]}'

    chosen, output = run_extraction_provider(
        ProviderFallbackChain((timed_out, WorkingProvider())), _request()
    )
    assert chosen.name == "groq"
    assert output.skills == []
    assert private_document_text not in caplog.text


def test_openai_compatible_local_http_allows_no_key_but_requires_safe_url() -> None:
    provider = OpenAICompatibleProvider(
        name="openai_compatible",
        model="local-model",
        api_key="",
        base_url="http://localhost:1234/v1",
        transport=httpx.MockTransport(
            lambda _request: httpx.Response(
                200, json={"choices": [{"message": {"content": '{"skills":[]}'}}]}
            )
        ),
    )
    assert provider.generate_structured(_request()) == '{"skills":[]}'

    with pytest.raises(ProviderError):
        OpenAICompatibleProvider(
            name="openai_compatible",
            model="bad-url",
            api_key="",
            base_url="http://example.test/v1",
        )


def test_fallback_chain_tries_next_model_after_provider_failure(
    caplog: pytest.LogCaptureFixture,
) -> None:
    class FailingProvider:
        name = "openrouter"
        model = "first-free-model"
        supports_json_schema = True
        external = True

        def generate_structured(self, _request):
            raise ProviderError("PROVIDER_RATE_LIMITED", "rate limited", 503)

    class WorkingProvider:
        name = "groq"
        model = "openai/gpt-oss-120b"
        supports_json_schema = True
        external = True

        def generate_structured(self, _request):
            return '{"skills":[]}'

    chosen, output = run_extraction_provider(
        ProviderFallbackChain((FailingProvider(), WorkingProvider())), _request()
    )

    assert chosen.name == "groq"
    assert output.skills == []
    assert "PROVIDER_RATE_LIMITED" in caplog.text
    assert "private resume content" not in caplog.text


def test_fallback_chain_uses_next_model_when_schema_output_is_invalid() -> None:
    class MalformedProvider:
        name = "openrouter"
        model = "malformed-model"
        supports_json_schema = True
        external = True

        def generate_structured(self, _request):
            return '{"unexpected":"shape"}'

    class WorkingProvider:
        name = "groq"
        model = "openai/gpt-oss-120b"
        supports_json_schema = True
        external = True

        def generate_structured(self, _request):
            return '{"skills":[]}'

    chosen, output = run_extraction_provider(
        ProviderFallbackChain((MalformedProvider(), WorkingProvider())), _request()
    )

    assert chosen.model == "openai/gpt-oss-120b"
    assert output.skills == []


def test_fallback_factory_orders_models_before_groq(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.config import settings
    from app.providers.base import ProviderFallbackChain

    monkeypatch.setattr(settings, "llm_provider", "fallback")
    monkeypatch.setattr(settings, "openrouter_api_key", "openrouter-test-key")
    monkeypatch.setattr(settings, "groq_api_key", "groq-test-key")
    monkeypatch.setattr(
        settings,
        "llm_openrouter_fallback_models",
        "dots-studio/dots-3-note-preview:free,google/gemma-4-31b-it:free",
    )
    monkeypatch.setattr(settings, "llm_groq_fallback_model", "openai/gpt-oss-120b")

    chain = get_provider()

    assert isinstance(chain, ProviderFallbackChain)
    assert chain.route == (
        "openrouter/dots-studio/dots-3-note-preview:free",
        "openrouter/google/gemma-4-31b-it:free",
        "groq/openai/gpt-oss-120b",
    )
    assert chain.providers[0].supports_json_schema is True
    assert chain.providers[1].supports_json_schema is False
    assert chain.external is True
