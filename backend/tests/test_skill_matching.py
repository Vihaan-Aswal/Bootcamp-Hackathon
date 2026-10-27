"""Focused tests for deterministic, evidence-aware Skill Matching."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

from app.contracts.v1 import CandidateProfile, ExtractionResult, SkillMatchRequest
from app.services.skill_matching import calculate_skill_match

FIXTURES = Path(__file__).parent / "fixtures"


def _load(name: str) -> dict[str, Any]:
    import json

    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def _skill(
    name: str,
    *,
    skill_id: str | None = None,
    requirement: str | None = None,
    origin: str = "jd",
    evidence_status: str = "exact",
    element_id: str = "p1",
) -> dict[str, Any]:
    return {
        "skill_name": name,
        "skill_id": skill_id,
        "category_code": "OTHER",
        "evidence": f"The document references {name}.",
        "evidence_status": evidence_status,
        "confidence": "high",
        "requirement_type": requirement,
        "origin": origin,
        "source_ref": {
            "element_id": element_id,
            "filename": "sample-jd.pdf",
            "page": 1,
            "paragraph": None,
            "heading": "Requirements",
        },
    }


def _request(
    jd_skills: list[dict[str, Any]],
    candidate_skills: list[dict[str, Any]],
    confirmations: list[dict[str, Any]] | None = None,
) -> SkillMatchRequest:
    profile_payload = _load("candidate_profile.json")
    profile_payload["skills"] = candidate_skills
    jd_payload = _load("jd_extraction.json")
    jd_payload["skills"] = jd_skills
    return SkillMatchRequest.model_validate(
        {
            "schema_version": "1.0.0",
            "profile": CandidateProfile.model_validate(profile_payload),
            "jd": ExtractionResult.model_validate(jd_payload),
            "confirmations": confirmations or [],
        }
    )


def test_shared_canonical_id_is_reported_as_registry_match() -> None:
    request = _request(
        [_skill("Python", skill_id="python", requirement="required")],
        [_skill("Python", skill_id="python", origin="resume", requirement=None)],
    )

    result = calculate_skill_match(request)

    assert result.match_score == 100
    assert [skill.skill_name for skill in result.matched] == ["Python"]
    assert result.match_methods == ["registry_id"]


def test_same_canonical_display_name_without_ids_uses_exact_text_method() -> None:
    request = _request(
        [_skill("Python", requirement="required")],
        [_skill("Python", origin="resume", requirement=None)],
    )

    result = calculate_skill_match(request)

    assert result.match_score == 100
    assert result.match_methods == ["normalized_exact"]


def test_approved_alias_matches_and_keeps_c_plus_plus_distinct_from_c() -> None:
    request = _request(
        [_skill("C++", skill_id="cpp", requirement="required")],
        [
            _skill("C plus plus", origin="resume", requirement=None),
            _skill("C", skill_id="c", origin="resume", requirement=None),
        ],
    )

    result = calculate_skill_match(request)

    assert result.match_score == 100
    assert result.match_methods == ["alias"]
    assert result.missing_required == []


def test_exact_normalization_ignores_case_whitespace_and_outer_punctuation() -> None:
    request = _request(
        [_skill("GraphQL API,", requirement="required")],
        [_skill("  graphql api.  ", origin="resume", requirement=None)],
    )

    result = calculate_skill_match(request)

    assert result.match_score == 100
    assert result.match_methods == ["normalized_exact"]


def test_duplicate_required_aliases_count_once() -> None:
    request = _request(
        [
            _skill("Python", skill_id="python", requirement="required", element_id="p1"),
            _skill("Python 3", skill_id="python3", requirement="required", element_id="p2"),
        ],
        [_skill("Python", skill_id="python", origin="resume", requirement=None)],
    )

    result = calculate_skill_match(request)

    assert result.distinct_required_skill_count == 1
    assert result.match_score == 100
    assert len(result.matched) == 1
    assert len(result.requirement_evidence) == 1
    assert [skill.skill_name for skill in result.requirement_evidence[0].evidence] == [
        "Python",
        "Python 3",
    ]


def test_preferred_requirement_does_not_increase_required_score() -> None:
    request = _request(
        [
            _skill("Python", skill_id="python", requirement="required"),
            _skill("Java", skill_id="java", requirement="preferred"),
        ],
        [_skill("Java", skill_id="java", origin="resume", requirement=None)],
    )

    result = calculate_skill_match(request)

    assert result.status == "scorable"
    assert result.match_score == 0
    assert result.distinct_required_skill_count == 1
    assert [skill.skill_name for skill in result.missing_required] == ["Python"]
    assert [skill.skill_name for skill in result.preferred] == ["Java"]


def test_no_required_skills_returns_not_scorable() -> None:
    request = _request(
        [_skill("Kubernetes", skill_id="kubernetes", requirement="preferred")],
        [_skill("Kubernetes", skill_id="kubernetes", origin="resume", requirement=None)],
    )

    result = calculate_skill_match(request)

    assert result.status == "not_scorable"
    assert result.match_score is None
    assert result.distinct_required_skill_count == 0
    assert [skill.skill_name for skill in result.preferred] == ["Kubernetes"]


def test_fuzzy_suggestion_does_not_count_before_candidate_confirmation() -> None:
    request = _request(
        [_skill("GraphQL APIs", requirement="required")],
        [_skill("GraphQL API", origin="resume", requirement=None)],
    )

    result = calculate_skill_match(request)

    assert result.match_score == 0
    assert [skill.skill_name for skill in result.missing_required] == ["GraphQL APIs"]
    assert [(item.jd_skill_name, item.candidate_skill_name) for item in result.possible] == [
        ("GraphQL APIs", "GraphQL API")
    ]
    assert "confirmed_fuzzy" not in result.match_methods


def test_exact_fuzzy_confirmation_counts_and_resolves_suggestion() -> None:
    request = _request(
        [_skill("GraphQL APIs", requirement="required")],
        [_skill("GraphQL API", origin="resume", requirement=None)],
        [
            {
                "jd_skill_name": "GraphQL APIs",
                "candidate_skill_name": "GraphQL API",
                "confirmed": True,
            }
        ],
    )

    result = calculate_skill_match(request)

    assert result.match_score == 100
    assert [skill.skill_name for skill in result.matched] == ["GraphQL APIs"]
    assert result.missing_required == []
    assert result.possible == []
    assert result.match_methods == ["confirmed_fuzzy"]


def test_stale_confirmation_for_nonexistent_pair_never_counts() -> None:
    request = _request(
        [_skill("GraphQL APIs", requirement="required")],
        [_skill("GraphQL API", origin="resume", requirement=None)],
        [
            {
                "jd_skill_name": "GraphQL APIs",
                "candidate_skill_name": "Unrelated Tool",
                "confirmed": True,
            }
        ],
    )

    result = calculate_skill_match(request)

    assert result.match_score == 0
    assert result.matched == []
    assert result.missing_required[0].skill_name == "GraphQL APIs"
    assert len(result.possible) == 1


def test_empty_profile_skills_leaves_required_items_missing() -> None:
    request = _request(
        [_skill("Python", skill_id="python", requirement="required")],
        [],
    )

    result = calculate_skill_match(request)

    assert result.match_score == 0
    assert result.matched == []
    assert [skill.skill_name for skill in result.missing_required] == ["Python"]
    assert result.possible == []


def test_requirement_types_stay_in_separate_result_groups() -> None:
    request = _request(
        [
            _skill("Python", skill_id="python", requirement="required"),
            _skill("Kubernetes", skill_id="kubernetes", requirement="preferred"),
            _skill("Java", skill_id="java", requirement="mentioned"),
            _skill("REST APIs", skill_id="rest-api", requirement="unclear"),
        ],
        [],
    )

    result = calculate_skill_match(request)

    assert [skill.skill_name for skill in result.missing_required] == ["Python"]
    assert [skill.skill_name for skill in result.preferred] == ["Kubernetes"]
    assert [skill.skill_name for skill in result.mentioned] == ["Java"]
    assert [skill.skill_name for skill in result.unclear] == ["REST APIs"]


def test_unverified_required_claim_is_not_scored() -> None:
    request = _request(
        [
            _skill(
                "Python",
                skill_id="python",
                requirement="required",
                evidence_status="unverified",
            )
        ],
        [_skill("Python", skill_id="python", origin="resume", requirement=None)],
    )

    result = calculate_skill_match(request)

    assert result.status == "not_scorable"
    assert result.match_score is None
    assert result.matched == []


@pytest.mark.parametrize(
    ("matched_names", "expected_score"),
    [(["AlphaPlatform"], 13)],
)
def test_score_uses_half_up_rounding_for_exact_half(
    matched_names: list[str], expected_score: int
) -> None:
    names = [
        "AlphaPlatform",
        "BetaQueue",
        "GammaCompiler",
        "DeltaMonitor",
        "ZetaKernel",
        "ThetaLedger",
        "LambdaPipeline",
        "OmegaTelemetry",
    ]
    request = _request(
        [_skill(name, requirement="required") for name in names],
        [_skill(name, origin="resume", requirement=None) for name in matched_names],
    )

    result = calculate_skill_match(request)

    assert result.distinct_required_skill_count == 8
    assert result.match_score == expected_score
