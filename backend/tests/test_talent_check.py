"""Talent Check scoring and HTTP boundary tests."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.api.routes import talent_check as talent_check_route
from app.contracts.v1 import (
    RADIX_CATEGORY_CODES,
    CandidateProfile,
    CompanySkillBar,
)
from app.services.company_data import CompanyDataError, load_company_data
from app.services.talent_check import calculate_talent_check

FIXTURE_DIR = Path(__file__).parent / "fixtures"


def _fixture(name: str) -> dict[str, Any]:
    import json

    return json.loads((FIXTURE_DIR / name).read_text(encoding="utf-8"))


def _profile(levels: dict[str, int] | None = None) -> CandidateProfile:
    payload = _fixture("candidate_profile.json")
    payload["skillset_levels"] = [
        {
            "category_code": code.value,
            "level": levels[code.value],
            "source": "self_reported",
        }
        for code in RADIX_CATEGORY_CODES
        if levels is not None and code.value in levels
    ]
    return CandidateProfile.model_validate(payload)


def _company_payload(required_level: int | None = None) -> dict[str, Any]:
    payload = _fixture("company_bar.json")
    if required_level is not None:
        for row in payload["skillsets"]:
            row["required_level"] = required_level
    return payload


def _loaded_company() -> tuple[CompanySkillBar, str]:
    loaded = load_company_data()
    company = loaded.company("google")
    assert company is not None
    return company, loaded.data_version


def _required_levels(company: CompanySkillBar) -> dict[str, int]:
    return {row.category_code.value: row.required_level for row in company.skillsets}


def test_all_company_bar_levels_produce_full_score_and_no_gaps() -> None:
    company, version = _loaded_company()
    result = calculate_talent_check(_profile(_required_levels(company)), company, version)

    assert result.status == "complete"
    assert result.readiness_score == 100
    expected_order = sorted(
        result.rows,
        key=lambda row: RADIX_CATEGORY_CODES.index(row.category_code),
    )
    assert result.rows == expected_order
    assert all(not row.gap and row.gap_size == 0 for row in result.rows)
    assert result.company_data_version == version
    assert result.company_id == company.company_id


def test_all_below_bar_produces_gaps_and_a_lower_score() -> None:
    company, version = _loaded_company()
    below = {code: 1 for code in _required_levels(company)}

    result = calculate_talent_check(_profile(below), company, version)

    assert result.status == "complete"
    assert result.readiness_score is not None and result.readiness_score < 100
    assert all(row.gap and row.gap_size > 0 for row in result.rows)


def test_above_bar_levels_are_capped_for_score_and_gap() -> None:
    company, version = _loaded_company()
    above = {code: 10 for code in _required_levels(company)}

    result = calculate_talent_check(_profile(above), company, version)

    assert result.readiness_score == 100
    assert all(not row.gap and row.gap_size == 0 for row in result.rows)


def test_single_category_gap_has_matching_gap_size() -> None:
    company, version = _loaded_company()
    levels = _required_levels(company)
    levels["DSA"] -= 1

    result = calculate_talent_check(_profile(levels), company, version)

    gaps = [row for row in result.rows if row.gap]
    assert [(row.category_code.value, row.gap_size) for row in gaps] == [("DSA", 1)]
    assert result.readiness_score == 99


def test_missing_rating_withholds_score_and_marks_unrated_row() -> None:
    company, version = _loaded_company()
    levels = _required_levels(company)
    del levels["COD"]

    result = calculate_talent_check(_profile(levels), company, version)
    cod = next(row for row in result.rows if row.category_code.value == "COD")

    assert result.status == "incomplete"
    assert result.readiness_score is None
    assert [code.value for code in result.missing_categories] == ["COD"]
    assert cod.candidate_level is None
    assert cod.gap and cod.gap_size == 0


def test_all_missing_ratings_are_incomplete_in_registry_order() -> None:
    company, version = _loaded_company()
    result = calculate_talent_check(_profile({}), company, version)

    assert result.status == "incomplete"
    assert result.readiness_score is None
    assert result.missing_categories == list(RADIX_CATEGORY_CODES)


def test_name_and_email_do_not_change_readiness() -> None:
    company, version = _loaded_company()
    base = _profile(_required_levels(company))
    changed = base.model_copy(
        update={
            "basic_details": base.basic_details.model_copy(
                update={"full_name": "Different Candidate", "email": "other@example.com"}
            )
        }
    )

    original_result = calculate_talent_check(base, company, version)
    changed_result = calculate_talent_check(changed, company, version)

    assert changed_result.readiness_score == original_result.readiness_score
    assert changed_result.rows == original_result.rows


def test_changing_a_rating_changes_readiness() -> None:
    company, version = _loaded_company()
    low = {code: 1 for code in _required_levels(company)}
    high = dict(low, COD=10)

    low_result = calculate_talent_check(_profile(low), company, version)
    high_result = calculate_talent_check(_profile(high), company, version)

    assert high_result.readiness_score > low_result.readiness_score


def test_exact_half_is_rounded_up() -> None:
    company = CompanySkillBar.model_validate(_company_payload(required_level=2))
    levels = {code.value: 2 for code in RADIX_CATEGORY_CODES}
    for code in ("OOD", "APTI", "COMM"):
        levels[code] = 1

    result = calculate_talent_check(_profile(levels), company, "f" * 64)

    # Nine full ratios and three one-half ratios yield exactly 87.5.
    assert result.readiness_score == 88


def test_invalid_mutated_company_bar_is_rejected_by_scoring() -> None:
    loaded_company, version = _loaded_company()
    levels = _required_levels(loaded_company)
    company = CompanySkillBar.model_validate(loaded_company.model_dump())
    company.skillsets = company.skillsets[:11]

    with pytest.raises(ValueError, match="failed contract validation"):
        calculate_talent_check(_profile(levels), company, version)


def test_company_contract_rejects_duplicate_or_invalid_rows() -> None:
    payload = _company_payload()
    payload["skillsets"][1]["category_code"] = payload["skillsets"][0]["category_code"]

    with pytest.raises(ValidationError, match="duplicate skillset categories"):
        CompanySkillBar.model_validate(payload)


def _client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    local_app = FastAPI()
    local_app.include_router(talent_check_route.router, prefix="/api/v1")
    monkeypatch.setattr(talent_check_route, "load_company_data", load_company_data)
    return TestClient(local_app)


def test_talent_check_route_returns_shared_result_and_unknown_company_is_404(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    company, _version = _loaded_company()
    profile = _profile(_required_levels(company))
    with _client(monkeypatch) as client:
        response = client.post(
            "/api/v1/companies/google/talent-check",
            json=profile.model_dump(mode="json"),
        )
        unknown = client.post(
            "/api/v1/companies/not-a-company/talent-check",
            json=profile.model_dump(mode="json"),
        )

    assert response.status_code == 200, response.text
    assert response.json()["readiness_score"] == 100
    assert response.json()["status"] == "complete"
    assert len(response.json()["rows"]) == 12
    assert unknown.status_code == 404


def test_talent_check_route_returns_503_when_company_data_is_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def unavailable() -> Any:
        raise CompanyDataError("malformed private file details")

    monkeypatch.setattr(talent_check_route, "load_company_data", unavailable)
    app = FastAPI()
    app.include_router(talent_check_route.router, prefix="/api/v1")
    company, _version = _loaded_company()
    profile = _profile(_required_levels(company))

    with TestClient(app) as client:
        response = client.post(
            "/api/v1/companies/google/talent-check",
            json=profile.model_dump(mode="json"),
        )

    assert response.status_code == 503
    assert response.json()["detail"] == "company data unavailable"
    assert "private file details" not in response.text


def test_talent_check_route_rejects_invalid_profile_contract(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    company, _version = _loaded_company()
    invalid = _fixture("candidate_profile.json")
    invalid["private_resume_text"] = "should not pass the API boundary"

    with _client(monkeypatch) as client:
        response = client.post("/api/v1/companies/google/talent-check", json=invalid)

    assert response.status_code == 422
