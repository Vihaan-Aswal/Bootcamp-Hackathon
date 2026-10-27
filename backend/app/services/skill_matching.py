"""Deterministic matching of one validated JD result to one candidate profile."""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal
from difflib import SequenceMatcher

from pydantic import ValidationError

from app.contracts.v1 import (
    EvidenceStatus,
    PossibleMatch,
    RequirementType,
    Skill,
    SkillMatchEvidenceGroup,
    SkillMatchRequest,
    SkillMatchResult,
    SkillOrigin,
)
from app.services.skill_registry import REGISTRY_VERSION, normalize_skill_name, resolve_skill

_METHOD_RANK = {"registry_id": 0, "alias": 1, "normalized_exact": 2}
_FUZZY_THRESHOLD = 0.74
_MIN_FUZZY_LENGTH = 4
_SCORABLE_EVIDENCE = {
    EvidenceStatus.exact,
    EvidenceStatus.normalized,
}


def _canonical_skill(skill: Skill):
    """Resolve a skill only when its optional ID does not contradict its name."""

    by_id = resolve_skill(skill.skill_id or "") if skill.skill_id else None
    by_name = resolve_skill(skill.skill_name)
    if by_id is not None and by_name is not None and by_id.skill_id != by_name.skill_id:
        return None
    return by_id or by_name


def _match_method(jd_skill: Skill, candidate_skill: Skill) -> str | None:
    """Return the strongest deterministic match method for a skill pair."""

    jd_canonical = _canonical_skill(jd_skill)
    candidate_canonical = _canonical_skill(candidate_skill)

    if (
        jd_skill.skill_id
        and candidate_skill.skill_id
        and jd_canonical is not None
        and candidate_canonical is not None
        and jd_canonical.skill_id == candidate_canonical.skill_id
        and normalize_skill_name(jd_skill.skill_id) == normalize_skill_name(jd_canonical.skill_id)
        and normalize_skill_name(candidate_skill.skill_id)
        == normalize_skill_name(candidate_canonical.skill_id)
    ):
        return "registry_id"

    if (
        jd_canonical is not None
        and candidate_canonical is not None
        and jd_canonical.skill_id == candidate_canonical.skill_id
    ):
        canonical_name = normalize_skill_name(jd_canonical.display_name)
        jd_name = normalize_skill_name(jd_skill.skill_name)
        candidate_name = normalize_skill_name(candidate_skill.skill_name)
        if jd_name != candidate_name or jd_name != canonical_name:
            return "alias"

    jd_name = normalize_skill_name(jd_skill.skill_name)
    candidate_name = normalize_skill_name(candidate_skill.skill_name)
    if jd_name and jd_name == candidate_name:
        return "normalized_exact"
    return None


def _identity(skill: Skill) -> str:
    canonical = _canonical_skill(skill)
    if canonical is not None:
        return f"registry:{canonical.skill_id}"
    return f"text:{normalize_skill_name(skill.skill_name)}"


def _deduplicate(skills: list[Skill]) -> list[Skill]:
    unique: dict[str, Skill] = {}
    for skill in skills:
        identity = _identity(skill)
        if identity != "text:":
            unique.setdefault(identity, skill)
    return list(unique.values())


def _confirmation_key(jd_name: str, candidate_name: str) -> tuple[str, str]:
    return normalize_skill_name(jd_name), normalize_skill_name(candidate_name)


def _fuzzy_suggestions(
    jd_skill: Skill,
    candidate_skills: list[Skill],
) -> list[PossibleMatch]:
    jd_name = normalize_skill_name(jd_skill.skill_name)
    if len(jd_name) < _MIN_FUZZY_LENGTH:
        return []

    jd_canonical = _canonical_skill(jd_skill)
    suggestions: list[PossibleMatch] = []
    for candidate in candidate_skills:
        candidate_name = normalize_skill_name(candidate.skill_name)
        if len(candidate_name) < _MIN_FUZZY_LENGTH or candidate_name == jd_name:
            continue

        candidate_canonical = _canonical_skill(candidate)
        # Do not suggest known-but-different technologies as fuzzy matches.
        if (
            jd_canonical is not None
            and candidate_canonical is not None
            and jd_canonical.skill_id != candidate_canonical.skill_id
        ):
            continue

        similarity = SequenceMatcher(None, jd_name, candidate_name, autojunk=False).ratio()
        if similarity >= _FUZZY_THRESHOLD:
            suggestions.append(
                PossibleMatch(
                    jd_skill_name=jd_skill.skill_name,
                    candidate_skill_name=candidate.skill_name,
                    similarity=similarity,
                )
            )

    return suggestions


def _round_half_up(numerator: int, denominator: int) -> int:
    return int(
        (Decimal(100) * Decimal(numerator) / Decimal(denominator)).quantize(
            Decimal("1"), rounding=ROUND_HALF_UP
        )
    )


def calculate_skill_match(request: SkillMatchRequest) -> SkillMatchResult:
    """Calculate a match result without provider calls or persistence."""

    try:
        # Revalidate mutable contract instances at the scoring boundary.
        request = SkillMatchRequest.model_validate(request.model_dump())
    except (AttributeError, ValidationError) as exc:
        raise ValueError("Skill Match request failed contract validation") from exc

    # Invalid or unverified provider claims must never silently enter the score.
    verified_jd_skills = [
        skill
        for skill in request.jd.skills
        if skill.origin is SkillOrigin.jd and skill.evidence_status in _SCORABLE_EVIDENCE
    ]
    groups: dict[RequirementType, list[Skill]] = {
        requirement: _deduplicate(
            [skill for skill in verified_jd_skills if skill.requirement_type is requirement]
        )
        for requirement in RequirementType
    }
    source_evidence: dict[tuple[RequirementType, str], list[Skill]] = {}
    for skill in request.jd.skills:
        if skill.origin is not SkillOrigin.jd or skill.requirement_type is None:
            continue
        key = (skill.requirement_type, _identity(skill))
        source_evidence.setdefault(key, []).append(skill)
    requirement_evidence = [
        SkillMatchEvidenceGroup(
            group_key=f"{requirement.value}:{identity}",
            requirement_type=requirement,
            evidence=evidence,
        )
        for (requirement, identity), evidence in source_evidence.items()
    ]

    required = groups[RequirementType.required]
    preferred = groups[RequirementType.preferred]
    mentioned = groups[RequirementType.mentioned]
    unclear = groups[RequirementType.unclear]

    candidate_skills = _deduplicate(
        [skill for skill in request.profile.skills if skill.origin is not SkillOrigin.jd]
    )
    matched: list[Skill] = []
    missing: list[Skill] = []
    methods: set[str] = set()
    possible_with_requirement: list[tuple[str, PossibleMatch]] = []

    true_confirmations: set[tuple[str, str]] = set()
    false_confirmations: set[tuple[str, str]] = set()
    for confirmation in request.confirmations:
        key = _confirmation_key(confirmation.jd_skill_name, confirmation.candidate_skill_name)
        if not all(key):
            continue
        (true_confirmations if confirmation.confirmed else false_confirmations).add(key)

    matched_count = 0
    for jd_skill in required:
        exact_candidates: list[tuple[int, int, Skill, str]] = []
        for index, candidate in enumerate(candidate_skills):
            method = _match_method(jd_skill, candidate)
            if method is not None:
                exact_candidates.append((_METHOD_RANK[method], index, candidate, method))

        if exact_candidates:
            _, _, _, method = min(exact_candidates, key=lambda item: (item[0], item[1]))
            matched.append(jd_skill)
            methods.add(method)
            matched_count += 1
            continue

        suggestions = _fuzzy_suggestions(jd_skill, candidate_skills)
        possible_with_requirement.extend((_identity(jd_skill), item) for item in suggestions)
        valid_pairs = {
            _confirmation_key(suggestion.jd_skill_name, suggestion.candidate_skill_name)
            for suggestion in suggestions
        }
        confirmed_pair = next(
            (
                pair
                for pair in sorted(valid_pairs)
                if pair in true_confirmations and pair not in false_confirmations
            ),
            None,
        )
        if confirmed_pair is not None:
            matched.append(jd_skill)
            methods.add("confirmed_fuzzy")
            matched_count += 1
        else:
            missing.append(jd_skill)

    # Keep only unresolved suggestions in the review list. A confirmed fuzzy
    # pair has moved into matched; other possible candidates for that JD skill
    # are no longer actionable once one candidate has confirmed the identity.
    matched_required_keys = {_identity(skill) for skill in matched}
    possible = [
        suggestion
        for requirement_key, suggestion in possible_with_requirement
        if requirement_key not in matched_required_keys
    ][:200]

    total_required = len(required)
    if total_required == 0:
        status = "not_scorable"
        score = None
    else:
        status = "scorable"
        score = _round_half_up(matched_count, total_required)

    return SkillMatchResult(
        jd_document_id=request.jd.document_id,
        profile_id=request.profile.profile_id,
        status=status,
        match_score=score,
        distinct_required_skill_count=total_required,
        matched=matched,
        missing_required=missing,
        preferred=preferred,
        mentioned=mentioned,
        unclear=unclear,
        requirement_evidence=requirement_evidence,
        possible=possible,
        match_methods=[method for method in _METHOD_RANK if method in methods]
        + (["confirmed_fuzzy"] if "confirmed_fuzzy" in methods else []),
        registry_version=REGISTRY_VERSION,
    )
