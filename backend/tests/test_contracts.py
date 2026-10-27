"""The shared contract must accept real handoffs and reject broken ones."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

import pytest
from pydantic import ValidationError

from app.contracts.dto import LlmExtractionOutput
from app.contracts.v1 import (
    CandidateProfile,
    CategoryCode,
    CompanySkillBar,
    EvidenceStatus,
    ExtractionResult,
    Skill,
    SkillMatchResult,
    SkillOrigin,
    SourceRef,
    TalentCheckResult,
)
from app.services.skill_registry import resolve_skill

VALID_FIXTURES = [
    ("jd_extraction.json", ExtractionResult),
    ("resume_extraction.json", ExtractionResult),
    ("candidate_profile.json", CandidateProfile),
    ("company_bar.json", CompanySkillBar),
    ("talent_check_result.json", TalentCheckResult),
    ("skill_match_result.json", SkillMatchResult),
    ("llm_extraction_output.json", LlmExtractionOutput),
]

INVALID_FIXTURES = [
    ("invalid/profile_level_11.json", CandidateProfile, "less than or equal to 10"),
    ("invalid/profile_schema_v2.json", CandidateProfile, "unsupported schema_version"),
    ("invalid/company_bar_11_rows.json", CompanySkillBar, "at least 12"),
    ("invalid/jd_with_education.json", ExtractionResult, "JD extractions"),
    ("invalid/profile_duplicate_category.json", CandidateProfile, "at most once"),
    ("invalid/skill_verified_without_quote.json", ExtractionResult, "verified evidence"),
]


@pytest.mark.parametrize(("name", "model"), VALID_FIXTURES)
def test_valid_fixture_satisfies_contract(
    fixture_json: Callable[[str], Any], name: str, model: type
) -> None:
    model.model_validate(fixture_json(name))


@pytest.mark.parametrize(("name", "model", "message"), INVALID_FIXTURES)
def test_invalid_fixture_is_rejected(
    fixture_json: Callable[[str], Any], name: str, model: type, message: str
) -> None:
    with pytest.raises(ValidationError) as error:
        model.model_validate(fixture_json(name))
    assert message in str(error.value)


def test_llm_dto_assembles_into_the_full_contract(
    fixture_json: Callable[[str], Any],
) -> None:
    dto = LlmExtractionOutput.model_validate(fixture_json("llm_extraction_output.json"))

    skills = []
    for claim in dto.skills:
        canonical = resolve_skill(claim.skill_name)
        skills.append(
            Skill(
                skill_name=claim.skill_name,
                skill_id=canonical.skill_id if canonical else None,
                category_code=claim.category_code,
                evidence=claim.evidence_quote,
                evidence_status=EvidenceStatus.exact,
                confidence=claim.confidence,
                requirement_type=claim.requirement_type,
                origin=SkillOrigin.jd,
                source_ref=SourceRef(element_id=claim.source_element_id, filename="ad.pdf", page=1),
            )
        )
    result = ExtractionResult(
        source_type="jd",
        filename="ad.pdf",
        skills=skills,
        metadata={
            "provider": "mock",
            "source_format": "pdf",
            "element_count": 3,
        },
        rejected_claims=[{"claim": "Go expert", "reason": "quote not found"}],
    )

    assert [skill.skill_id for skill in result.skills] == ["python", "kubernetes"]
    assert result.rejected_claims[0].reason == "quote not found"


def test_profile_without_twelve_ratings_is_a_valid_draft(
    fixture_json: Callable[[str], Any],
) -> None:
    profile = CandidateProfile.model_validate(fixture_json("candidate_profile.json"))

    assert len(profile.skillset_levels) == 2
    assert len(profile.missing_rating_categories) == 10
    assert CategoryCode.OTHER not in profile.missing_rating_categories


def test_complete_profile_has_no_missing_ratings(
    fixture_json: Callable[[str], Any],
) -> None:
    payload = fixture_json("candidate_profile.json")
    payload["skillset_levels"] = [
        {"category_code": code.value, "level": 5}
        for code in CategoryCode
        if code is not CategoryCode.OTHER
    ]

    profile = CandidateProfile.model_validate(payload)

    assert profile.missing_rating_categories == []


def test_complete_talent_check_requires_a_score(
    fixture_json: Callable[[str], Any],
) -> None:
    payload = fixture_json("talent_check_result.json")
    payload["readiness_score"] = None

    with pytest.raises(ValidationError):
        TalentCheckResult.model_validate(payload)


def test_incomplete_talent_check_must_withhold_the_score(
    fixture_json: Callable[[str], Any],
) -> None:
    payload = fixture_json("talent_check_result.json")
    payload["status"] = "incomplete"
    payload["missing_categories"] = ["OS"]

    with pytest.raises(ValidationError):
        TalentCheckResult.model_validate(payload)


def test_skill_match_without_required_skills_cannot_be_scorable(
    fixture_json: Callable[[str], Any],
) -> None:
    payload = fixture_json("skill_match_result.json")
    payload["distinct_required_skill_count"] = 0

    with pytest.raises(ValidationError):
        SkillMatchResult.model_validate(payload)


def test_other_is_not_accepted_in_a_company_bar(
    fixture_json: Callable[[str], Any],
) -> None:
    payload = fixture_json("company_bar.json")
    payload["skillsets"][0]["category_code"] = "OTHER"

    with pytest.raises(ValidationError):
        CompanySkillBar.model_validate(payload)


def test_levels_reject_non_integer_values(fixture_json: Callable[[str], Any]) -> None:
    payload = fixture_json("candidate_profile.json")
    payload["skillset_levels"][0]["level"] = "7"

    with pytest.raises(ValidationError):
        CandidateProfile.model_validate(payload)


def test_unknown_fields_are_rejected(fixture_json: Callable[[str], Any]) -> None:
    payload = fixture_json("candidate_profile.json")
    payload["unexpected"] = True

    with pytest.raises(ValidationError):
        CandidateProfile.model_validate(payload)
