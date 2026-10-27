"""Assemble validated provider claims into the canonical extraction contract."""

from __future__ import annotations

from collections.abc import Callable

from app.contracts.dto import LlmExtractionOutput, LlmSkillClaim
from app.contracts.v1 import (
    EducationItem,
    ExperienceItem,
    ExtractionMetadata,
    ExtractionResult,
    ProjectItem,
    RejectedClaim,
    RequirementType,
    Skill,
    SkillOrigin,
    SourceElement,
    SourceRef,
    SourceType,
)
from app.parsing.document import ParsedDocument
from app.parsing.evidence import verify_evidence_quote
from app.providers.base import Provider, ProviderError
from app.services.skill_registry import resolve_skill

RequirementResolver = Callable[[LlmSkillClaim, SourceElement], RequirementType]


def require_verified_claim_when_claims_exist(
    output: LlmExtractionOutput,
    result: ExtractionResult,
) -> None:
    """Reject a fallback candidate whose every claim fails source verification."""

    claim_count = sum(
        len(items)
        for items in (output.skills, output.education, output.projects, output.experience)
    )
    verified_count = sum(
        len(items)
        for items in (result.skills, result.education, result.projects, result.experience)
    )
    if claim_count and not verified_count:
        raise ProviderError(
            "UNVERIFIED_PROVIDER_OUTPUT",
            "The provider's claims could not be verified against the source document.",
            status_code=502,
        )


def _source_ref(document: ParsedDocument, element: SourceElement) -> SourceRef:
    return SourceRef(
        element_id=element.element_id,
        filename=document.filename,
        page=element.page,
        paragraph=element.paragraph_index,
        heading=element.heading,
    )


def build_extraction_result(
    *,
    document: ParsedDocument,
    source_type: SourceType,
    output: LlmExtractionOutput,
    provider: Provider,
    redaction_applied: bool = False,
    requirement_resolver: RequirementResolver | None = None,
) -> ExtractionResult:
    """Keep only claims whose quoted evidence exists in the cited source unit."""

    source_by_id = {element.element_id: element for element in document.elements}
    rejected: list[RejectedClaim] = []
    skills: list[Skill] = []

    for claim in output.skills:
        element = source_by_id.get(claim.source_element_id)
        if element is None:
            rejected.append(
                RejectedClaim(
                    claim=claim.skill_name,
                    reason="unknown source element; evidence could not be checked",
                    source_element_id=claim.source_element_id,
                )
            )
            continue
        evidence_status = verify_evidence_quote(claim.evidence_quote, element)
        if evidence_status.value == "failed":
            rejected.append(
                RejectedClaim(
                    claim=claim.skill_name,
                    reason="evidence quote was not found in the cited source element",
                    source_element_id=element.element_id,
                )
            )
            continue

        canonical = resolve_skill(claim.skill_name)
        requirement_type = None
        if source_type is SourceType.jd:
            requirement_type = (
                requirement_resolver(claim, element)
                if requirement_resolver
                else claim.requirement_type
            )
        skills.append(
            Skill(
                skill_name=claim.skill_name,
                skill_id=canonical.skill_id if canonical else None,
                category_code=canonical.category_code if canonical else claim.category_code,
                evidence=claim.evidence_quote,
                evidence_status=evidence_status,
                confidence=claim.confidence,
                requirement_type=requirement_type,
                origin=SkillOrigin.jd if source_type is SourceType.jd else SkillOrigin.resume,
                source_ref=_source_ref(document, element),
            )
        )

    education: list[EducationItem] = []
    projects: list[ProjectItem] = []
    experience: list[ExperienceItem] = []
    if source_type is SourceType.resume:
        for claim in output.education:
            element = source_by_id.get(claim.source_element_id)
            if (
                element is None
                or verify_evidence_quote(claim.evidence_quote, element).value == "failed"
            ):
                rejected.append(
                    RejectedClaim(
                        claim=claim.institution,
                        reason="education evidence was missing or could not be verified",
                        source_element_id=claim.source_element_id,
                    )
                )
                continue
            education.append(
                EducationItem(
                    institution=claim.institution,
                    qualification=claim.qualification,
                    field_of_study=claim.field_of_study,
                    start_year=claim.start_year,
                    end_year=claim.end_year,
                    evidence=claim.evidence_quote,
                    source_ref=_source_ref(document, element),
                )
            )
        for claim in output.projects:
            element = source_by_id.get(claim.source_element_id)
            if (
                element is None
                or verify_evidence_quote(claim.evidence_quote, element).value == "failed"
            ):
                rejected.append(
                    RejectedClaim(
                        claim=claim.name,
                        reason="project evidence was missing or could not be verified",
                        source_element_id=claim.source_element_id,
                    )
                )
                continue
            projects.append(
                ProjectItem(
                    name=claim.name,
                    summary=claim.summary,
                    evidence=claim.evidence_quote,
                    source_ref=_source_ref(document, element),
                )
            )
        for claim in output.experience:
            element = source_by_id.get(claim.source_element_id)
            if (
                element is None
                or verify_evidence_quote(claim.evidence_quote, element).value == "failed"
            ):
                rejected.append(
                    RejectedClaim(
                        claim=claim.employer,
                        reason="experience evidence was missing or could not be verified",
                        source_element_id=claim.source_element_id,
                    )
                )
                continue
            experience.append(
                ExperienceItem(
                    employer=claim.employer,
                    title=claim.title,
                    start_year=claim.start_year,
                    end_year=claim.end_year,
                    summary=claim.summary,
                    evidence=claim.evidence_quote,
                    source_ref=_source_ref(document, element),
                )
            )
    elif output.education or output.projects or output.experience:
        rejected.append(
            RejectedClaim(
                claim="resume-only sections",
                reason="JD extraction cannot include education, projects, or experience",
            )
        )

    metadata = ExtractionMetadata(
        provider=provider.name,
        model=provider.model,
        source_format=document.source_format,
        element_count=len(document.elements),
        page_count=document.page_count,
        redaction_applied=redaction_applied,
        warnings=(["No evidence-backed skills were extracted."] if not skills else []),
    )
    return ExtractionResult(
        source_type=source_type,
        filename=document.filename,
        skills=skills,
        education=education,
        projects=projects,
        experience=experience,
        metadata=metadata,
        rejected_claims=rejected,
    )
