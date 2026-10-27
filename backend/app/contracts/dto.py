"""Provider-facing extraction DTO.

This is the only shape an LLM is asked to produce. It is deliberately flat and
provider-compatible: quotes and parser element ids, no page numbers, no
contract version, no domain objects. The backend verifies the quotes against
the parsed text and builds the contract objects in ``app.contracts.v1``.
"""

from __future__ import annotations

from pydantic import Field

from app.contracts.v1 import (
    CategoryCode,
    Confidence,
    ContractModel,
    RequirementType,
)


class LlmSkillClaim(ContractModel):
    skill_name: str = Field(min_length=1, max_length=120)
    category_code: CategoryCode = CategoryCode.OTHER
    requirement_type: RequirementType = RequirementType.unclear
    confidence: Confidence = Confidence.medium
    evidence_quote: str = Field(min_length=1, max_length=500)
    source_element_id: str = Field(min_length=1, max_length=64)


class LlmEducationClaim(ContractModel):
    institution: str = Field(min_length=1, max_length=200)
    qualification: str | None = Field(default=None, max_length=200)
    field_of_study: str | None = Field(default=None, max_length=200)
    start_year: int | None = Field(default=None, ge=1900, le=2100)
    end_year: int | None = Field(default=None, ge=1900, le=2100)
    evidence_quote: str = Field(min_length=1, max_length=500)
    source_element_id: str = Field(min_length=1, max_length=64)


class LlmProjectClaim(ContractModel):
    name: str = Field(min_length=1, max_length=200)
    summary: str | None = Field(default=None, max_length=500)
    evidence_quote: str = Field(min_length=1, max_length=500)
    source_element_id: str = Field(min_length=1, max_length=64)


class LlmExperienceClaim(ContractModel):
    employer: str = Field(min_length=1, max_length=200)
    title: str | None = Field(default=None, max_length=200)
    start_year: int | None = Field(default=None, ge=1900, le=2100)
    end_year: int | None = Field(default=None, ge=1900, le=2100)
    summary: str | None = Field(default=None, max_length=500)
    evidence_quote: str = Field(min_length=1, max_length=500)
    source_element_id: str = Field(min_length=1, max_length=64)


class LlmExtractionOutput(ContractModel):
    skills: list[LlmSkillClaim] = Field(default_factory=list, max_length=200)
    education: list[LlmEducationClaim] = Field(default_factory=list, max_length=50)
    projects: list[LlmProjectClaim] = Field(default_factory=list, max_length=50)
    experience: list[LlmExperienceClaim] = Field(default_factory=list, max_length=50)
