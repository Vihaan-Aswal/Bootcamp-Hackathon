"""Deterministic local provider for tests, demos and offline sample evaluation."""

from __future__ import annotations

import re
from collections.abc import Callable

from app.contracts.dto import LlmExtractionOutput, LlmSkillClaim
from app.contracts.v1 import RequirementType, SourceElement, SourceType
from app.providers.base import StructuredGenerationRequest
from app.services.skill_registry import CANONICAL_SKILLS, CanonicalSkill


class MockProvider:
    """Local rules-based provider; it never makes a network request.

    A responder can be injected in tests to model valid, malformed, delayed or
    provider-specific replies. The default extracts explicit registry terms
    with their original sentence as evidence, leaving uncertain classifications
    out of scoreable buckets.
    """

    name = "mock"
    model = "local-registry-rules"
    supports_json_schema = False

    def __init__(
        self, responder: Callable[[StructuredGenerationRequest], str] | None = None
    ) -> None:
        self._responder = responder

    def generate_structured(self, request: StructuredGenerationRequest) -> str:
        if self._responder is not None:
            return self._responder(request)
        result = _rule_based_extraction(request.source_type, request.elements)
        return result.model_dump_json()


def _requirement_type(text: str, heading: str | None) -> RequirementType:
    context = f"{heading or ''} {text}".casefold()
    if re.search(r"\b(?:may|might|could|not)\s+(?:be\s+)?required\b", context):
        return RequirementType.unclear
    if re.search(r"\b(?:must|required|essential|mandatory)\b", context):
        return RequirementType.required
    if re.search(r"\b(?:preferred|desirable|bonus|plus|nice to have)\b", context):
        return RequirementType.preferred
    return RequirementType.mentioned


def _evidence_sentence(text: str, start: int, end: int) -> str:
    left = max(text.rfind(mark, 0, start) for mark in (".", "!", "?", ";")) + 1
    stops = [index for mark in (".", "!", "?", ";") if (index := text.find(mark, end)) >= 0]
    right = min(stops) + 1 if stops else len(text)
    excerpt = text[left:right].strip()
    if len(excerpt) > 500:
        excerpt_start = max(0, start - 220)
        excerpt_end = min(len(text), end + 220)
        excerpt = text[excerpt_start:excerpt_end].strip()
    return excerpt or text[start:end]


def _matches_for_element(
    element: SourceElement,
) -> list[tuple[int, int, CanonicalSkill, str]]:
    candidates: list[tuple[int, int, CanonicalSkill, str]] = []
    for skill in CANONICAL_SKILLS:
        aliases = (skill.display_name, *skill.aliases)
        spans: list[tuple[int, int, str]] = []
        for alias in aliases:
            if len(alias) < 3 and not re.search(r"[+#]", alias):
                continue
            pattern = re.compile(rf"(?<![\w+#]){re.escape(alias)}(?![\w+#])", re.IGNORECASE)
            spans.extend(
                (match.start(), match.end(), match.group())
                for match in pattern.finditer(element.text)
            )
        if spans:
            start, end, matched = max(spans, key=lambda item: (item[1] - item[0], -item[0]))
            candidates.append((start, end, skill, matched))
    candidates.sort(key=lambda item: (-(item[1] - item[0]), item[0]))
    accepted: list[tuple[int, int, CanonicalSkill, str]] = []
    for candidate in candidates:
        start, end = candidate[0], candidate[1]
        if any(
            start < existing_end and end > existing_start
            for existing_start, existing_end, _, _ in accepted
        ):
            continue
        accepted.append(candidate)
    return sorted(accepted, key=lambda item: item[0])


def _rule_based_extraction(
    source_type: SourceType, elements: tuple[SourceElement, ...]
) -> LlmExtractionOutput:
    claims: list[LlmSkillClaim] = []
    seen: set[str] = set()
    for element in elements:
        for start, end, canonical, _matched in _matches_for_element(element):
            skill_id = canonical.skill_id
            if skill_id in seen:
                continue
            seen.add(skill_id)
            claims.append(
                LlmSkillClaim(
                    skill_name=canonical.display_name,
                    category_code=canonical.category_code,
                    requirement_type=(
                        _requirement_type(element.text, element.heading)
                        if source_type is SourceType.jd
                        else RequirementType.unclear
                    ),
                    confidence="high",
                    evidence_quote=_evidence_sentence(element.text, start, end),
                    source_element_id=element.element_id,
                )
            )
    return LlmExtractionOutput(skills=claims)
