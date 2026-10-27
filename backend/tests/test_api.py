"""HTTP boundary and the published OpenAPI surface."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.contracts.v1 import CONTRACT_VERSION, RADIX_CATEGORY_CODES

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
    module_statuses = {module["key"]: module["status"] for module in payload["modules"]}
    assert module_statuses["profile_builder"] == "ready"
    assert module_statuses["talent_check"] == "ready"
    assert module_statuses["skill_matching"] == "ready"


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


def test_profile_validation_endpoint_accepts_contract_profile(
    client: TestClient, fixture_json
) -> None:
    payload = fixture_json("candidate_profile.json")
    response = client.post("/api/v1/profiles/validate", json=payload)

    assert response.status_code == 200
    assert response.json()["profile_id"] == payload["profile_id"]


def test_profile_validation_endpoint_rejects_unknown_fields(
    client: TestClient, fixture_json
) -> None:
    payload = fixture_json("candidate_profile.json")
    payload["private_resume_text"] = "must not be stored"
    response = client.post("/api/v1/profiles/validate", json=payload)

    assert response.status_code == 422


def test_talent_check_endpoint_is_registered_and_returns_twelve_rows(
    client: TestClient, fixture_json
) -> None:
    profile = fixture_json("candidate_profile.json")
    profile["skillset_levels"] = [
        {"category_code": code.value, "level": 8, "source": "self_reported"}
        for code in RADIX_CATEGORY_CODES
    ]

    response = client.post("/api/v1/companies/google/talent-check", json=profile)

    assert response.status_code == 200, response.text
    result = response.json()
    assert result["status"] == "complete"
    assert isinstance(result["readiness_score"], int)
    assert len(result["rows"]) == 12
    assert len(result["company_data_version"]) == 64


def test_skill_match_endpoint_is_registered_and_returns_contract_groups(
    client: TestClient, fixture_json
) -> None:
    profile = fixture_json("candidate_profile.json")
    profile["skills"] = [
        {
            "skill_name": "Python",
            "skill_id": "python",
            "category_code": "COD",
            "evidence": "Python is used in several projects.",
            "evidence_status": "manual",
            "confidence": "high",
            "requirement_type": None,
            "origin": "manual",
        }
    ]
    request = {
        "schema_version": "1.0.0",
        "profile": profile,
        "jd": fixture_json("jd_extraction.json"),
        "confirmations": [],
    }

    response = client.post("/api/v1/skill-matches/score", json=request)

    assert response.status_code == 200, response.text
    result = response.json()
    assert result["status"] == "scorable"
    assert result["match_score"] == 100
    assert result["matched"][0]["skill_name"] == "Python"
    assert [skill["skill_name"] for skill in result["preferred"]] == ["Kubernetes"]
    assert {group["requirement_type"] for group in result["requirement_evidence"]} == {
        "required",
        "preferred",
    }


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
    assert components["CandidateProfile"]["properties"]["projects"]
    assert components["CandidateProfile"]["properties"]["experience"]
    assert "/api/v1/profiles/validate" in schema["paths"]
