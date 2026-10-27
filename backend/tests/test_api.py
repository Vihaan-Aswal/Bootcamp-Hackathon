"""HTTP boundary and the published OpenAPI surface."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.contracts.v1 import CONTRACT_VERSION

SCRIPTS_DIR = Path(__file__).parents[1] / "scripts"


def _load_export_script():
    spec = importlib.util.spec_from_file_location(
        "export_openapi", SCRIPTS_DIR / "export_openapi.py"
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_health_reports_the_contract_and_data_state(client: TestClient) -> None:
    payload = client.get("/api/v1/health").json()

    assert payload["status"] == "ok"
    assert payload["contract_version"] == CONTRACT_VERSION
    assert payload["company_data"]["available"] is True
    assert payload["company_data"]["source_status"] == "provisional_csv_fallback"
    assert payload["company_data"]["official_json_confirmed"] is False
    assert payload["provider"] == {
        "name": "mock",
        "configured": True,
        "supports_json_schema": False,
        "external": False,
        "resume_processing_allowed": True,
    }
    assert {module["key"] for module in payload["modules"]} == {
        "jd_analytics",
        "resume_parsing",
        "profile_builder",
        "talent_check",
        "skill_matching",
    }


def test_company_list_matches_the_dataset(client: TestClient) -> None:
    payload = client.get("/api/v1/companies").json()

    assert len(payload["companies"]) == 3
    assert payload["source_status"] == "provisional_csv_fallback"
    assert len(payload["data_version"]) == 64


def test_company_detail_returns_twelve_rows(client: TestClient) -> None:
    payload = client.get("/api/v1/companies/google").json()

    assert payload["company_id"] == "google"
    assert len(payload["skillsets"]) == 12
    assert {row["category_code"] for row in payload["skillsets"]}.isdisjoint({"OTHER"})


def test_unknown_company_returns_404(client: TestClient) -> None:
    response = client.get("/api/v1/companies/not-a-company")

    assert response.status_code == 404
    assert "not-a-company" in response.json()["detail"]


@pytest.mark.parametrize(
    ("path", "filename", "form_data"),
    [
        ("/api/v1/jds/analyze", "role.pdf", {}),
        ("/api/v1/resumes/parse", "resume.pdf", {"allow_external_processing": "true"}),
    ],
)
def test_document_routes_return_safe_error_for_missing_provider_credentials(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    path: str,
    filename: str,
    form_data: dict[str, str],
) -> None:
    monkeypatch.setattr(settings, "llm_provider", "openrouter")
    monkeypatch.setattr(settings, "llm_model", "test-model")
    monkeypatch.setattr(settings, "openrouter_api_key", "")

    response = client.post(
        path,
        files={
            "file": (
                filename,
                b"not parsed because no provider is configured",
                "application/pdf",
            )
        },
        data=form_data,
    )

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "PROVIDER_NOT_CONFIGURED"
    assert "API key" in response.json()["detail"]["message"]


def test_skill_categories_expose_the_ladder(client: TestClient) -> None:
    payload = client.get("/api/v1/reference/skill-categories").json()

    assert payload["registry_version"]
    assert len(payload["categories"]) == 12
    first = payload["categories"][0]
    assert [level["level"] for level in first["levels"]] == list(range(1, 11))
    assert first["levels"][0]["topics"]


def test_openapi_publishes_every_contract_object() -> None:
    schema = _load_export_script().build_schema()
    components = schema["components"]["schemas"]

    for name in (
        "CandidateProfile",
        "ExtractionResult",
        "CompanyDataset",
        "TalentCheckResult",
        "SkillMatchResult",
        "Skill",
    ):
        assert name in components
    assert components["CandidateProfile"]["properties"]["skillset_levels"]
