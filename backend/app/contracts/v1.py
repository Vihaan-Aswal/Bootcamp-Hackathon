"""Canonical shared contract for RADIX Talent Match (v1).

Pydantic v2 models in this module are the single source of truth for every
boundary: HTTP API, profile JSON import/export, provider output and scoring.
The FastAPI OpenAPI schema is generated from these models, and the frontend
TypeScript types are generated from that schema.

Versioning rules:

* Every top-level object carries ``schema_version``. The major version is
  checked; unknown majors are rejected instead of being coerced silently.
* Changes inside a major version are additive. Removing or renaming a field
  requires a new major version.
* ``extra="forbid"`` everywhere: an unexpected field is a contract breach, not
  something to drop quietly.
"""

from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum
from typing import Annotated, Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

CONTRACT_VERSION = "1.0.0"
SUPPORTED_MAJOR_VERSION = 1


def _utcnow() -> datetime:
    return datetime.now(UTC)


class CategoryCode(StrEnum):
    """The 12 RADIX skillset categories, plus ``OTHER`` for unclassified skills."""

    COD = "COD"
    DSA = "DSA"
    OOD = "OOD"
    APTI = "APTI"
    COMM = "COMM"
    AI = "AI"
    CLOUD = "CLOUD"
    SQL = "SQL"
    SWE = "SWE"
    SYSD = "SYSD"
    NETW = "NETW"
    OS = "OS"
    OTHER = "OTHER"


RADIX_CATEGORY_CODES: tuple[CategoryCode, ...] = tuple(
    code for code in CategoryCode if code is not CategoryCode.OTHER
)

# A self-reported or employer-required level on the supplied 10-level ladder.
LadderLevel = Annotated[int, Field(ge=1, le=10, strict=True)]


class RequirementType(StrEnum):
    """Added design decision: the brief fixes neither taxonomy nor weighting."""

    required = "required"
    preferred = "preferred"
    mentioned = "mentioned"
    unclear = "unclear"


class Confidence(StrEnum):
    high = "high"
    medium = "medium"
    low = "low"


class EvidenceStatus(StrEnum):
    """How an evidence quote was checked against the parsed source text."""

    exact = "exact"
    normalized = "normalized"
    failed = "failed"
    unverified = "unverified"
    manual = "manual"


class SkillOrigin(StrEnum):
    manual = "manual"
    resume = "resume"
    jd = "jd"
    import_ = "import"


class SourceType(StrEnum):
    jd = "jd"
    resume = "resume"


class ElementKind(StrEnum):
    heading = "heading"
    paragraph = "paragraph"
    list_item = "list_item"
    table_row = "table_row"


class ContractModel(BaseModel):
    """Base for every contract object: rejects unknown fields."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class VersionedContractModel(ContractModel):
    schema_version: str = CONTRACT_VERSION

    @field_validator("schema_version")
    @classmethod
    def _supported_major(cls, value: str) -> str:
        major = value.split(".", 1)[0].strip()
        if not major.isdigit() or int(major) != SUPPORTED_MAJOR_VERSION:
            raise ValueError(
                f"unsupported schema_version {value!r}; "
                f"this build accepts {SUPPORTED_MAJOR_VERSION}.x"
            )
        return value


class SourceElement(ContractModel):
    """One ordered text unit produced by the parser (M2).

    Locations come from the parser, never from a model. A PDF element has a
    page; a DOCX element has a paragraph index; neither is invented.
    """

    element_id: str = Field(min_length=1, max_length=64)
    text: str = Field(min_length=1)
    kind: ElementKind = ElementKind.paragraph
    order: int = Field(ge=0)
    heading: str | None = Field(default=None, max_length=200)
    page: int | None = Field(default=None, ge=1)
    paragraph_index: int | None = Field(default=None, ge=0)
    bbox: tuple[float, float, float, float] | None = None


class SourceRef(ContractModel):
    element_id: str = Field(min_length=1, max_length=64)
    filename: str = Field(min_length=1, max_length=255)
    page: int | None = Field(default=None, ge=1)
    paragraph: int | None = Field(default=None, ge=0)
    heading: str | None = Field(default=None, max_length=200)


class Skill(ContractModel):
    skill_name: str = Field(min_length=1, max_length=120)
    skill_id: str | None = Field(default=None, max_length=120)
    category_code: CategoryCode = CategoryCode.OTHER
    evidence: str | None = Field(default=None, max_length=1000)
    evidence_status: EvidenceStatus = EvidenceStatus.unverified
    confidence: Confidence = Confidence.medium
    requirement_type: RequirementType | None = None
    origin: SkillOrigin
    source_ref: SourceRef | None = None

    @model_validator(mode="after")
    def _evidence_and_origin_rules(self) -> Skill:
        if self.evidence_status in (EvidenceStatus.exact, EvidenceStatus.normalized):
            if not self.evidence or self.source_ref is None:
                raise ValueError(
                    f"skill {self.skill_name!r}: verified evidence needs a quote "
                    "and a source reference"
                )
        if self.origin is SkillOrigin.jd and self.requirement_type is None:
            raise ValueError(f"skill {self.skill_name!r}: JD skills require a requirement_type")
        return self


class ExtractionMetadata(ContractModel):
    provider: str = Field(min_length=1, max_length=40)
    model: str | None = Field(default=None, max_length=120)
    extracted_at: datetime = Field(default_factory=_utcnow)
    source_format: Literal["pdf", "docx"]
    element_count: int = Field(ge=0)
    page_count: int | None = Field(default=None, ge=1)
    redaction_applied: bool = False
    warnings: list[str] = Field(default_factory=list, max_length=50)


class RejectedClaim(ContractModel):
    claim: str = Field(min_length=1, max_length=300)
    reason: str = Field(min_length=1, max_length=300)
    source_element_id: str | None = Field(default=None, max_length=64)


class EducationItem(ContractModel):
    institution: str = Field(min_length=1, max_length=200)
    qualification: str | None = Field(default=None, max_length=200)
    field_of_study: str | None = Field(default=None, max_length=200)
    start_year: int | None = Field(default=None, ge=1900, le=2100)
    end_year: int | None = Field(default=None, ge=1900, le=2100)
    evidence: str | None = Field(default=None, max_length=1000)
    source_ref: SourceRef | None = None


class ProjectItem(ContractModel):
    name: str = Field(min_length=1, max_length=200)
    summary: str | None = Field(default=None, max_length=1000)
    evidence: str | None = Field(default=None, max_length=1000)
    source_ref: SourceRef | None = None


class ExperienceItem(ContractModel):
    employer: str = Field(min_length=1, max_length=200)
    title: str | None = Field(default=None, max_length=200)
    start_year: int | None = Field(default=None, ge=1900, le=2100)
    end_year: int | None = Field(default=None, ge=1900, le=2100)
    summary: str | None = Field(default=None, max_length=1000)
    evidence: str | None = Field(default=None, max_length=1000)
    source_ref: SourceRef | None = None


class HackathonEntry(ContractModel):
    name: str = Field(min_length=1, max_length=200)
    summary: str | None = Field(default=None, max_length=500)
    year: int | None = Field(default=None, ge=1900, le=2100)


class InternshipEntry(ContractModel):
    employer: str = Field(min_length=1, max_length=200)
    role: str | None = Field(default=None, max_length=200)
    summary: str | None = Field(default=None, max_length=500)
    year: int | None = Field(default=None, ge=1900, le=2100)


class CertificationEntry(ContractModel):
    name: str = Field(min_length=1, max_length=200)
    issuer: str | None = Field(default=None, max_length=200)
    year: int | None = Field(default=None, ge=1900, le=2100)


class ExtractionResult(VersionedContractModel):
    """Output of JD Analytics or Resume Parsing for one document."""

    document_id: UUID = Field(default_factory=uuid4)
    source_type: SourceType
    filename: str = Field(min_length=1, max_length=255)
    company: str | None = Field(default=None, max_length=200)
    role: str | None = Field(default=None, max_length=200)
    skills: list[Skill] = Field(default_factory=list, max_length=200)
    education: list[EducationItem] = Field(default_factory=list, max_length=50)
    projects: list[ProjectItem] = Field(default_factory=list, max_length=50)
    experience: list[ExperienceItem] = Field(default_factory=list, max_length=50)
    metadata: ExtractionMetadata
    rejected_claims: list[RejectedClaim] = Field(default_factory=list, max_length=200)

    @model_validator(mode="after")
    def _jd_has_no_resume_sections(self) -> ExtractionResult:
        resume_sections = self.education or self.projects or self.experience
        if self.source_type is SourceType.jd and resume_sections:
            raise ValueError("JD extractions cannot carry education, projects or experience")
        return self


class BasicDetails(ContractModel):
    full_name: str = Field(min_length=1, max_length=120)
    email: EmailStr


class SkillsetLevel(ContractModel):
    """One self-reported 1-10 rating. Resume text never sets this value."""

    category_code: CategoryCode
    level: LadderLevel
    evidence_note: str | None = Field(default=None, max_length=280)
    source: Literal["self_reported"] = "self_reported"

    @field_validator("category_code")
    @classmethod
    def _not_other(cls, value: CategoryCode) -> CategoryCode:
        if value is CategoryCode.OTHER:
            raise ValueError("OTHER is not a rateable skillset category")
        return value


class CandidateProfile(VersionedContractModel):
    profile_id: UUID = Field(default_factory=uuid4)
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)
    basic_details: BasicDetails
    skills: list[Skill] = Field(default_factory=list, max_length=200)
    education: list[EducationItem] = Field(default_factory=list, max_length=50)
    projects: list[ProjectItem] = Field(default_factory=list, max_length=50)
    experience: list[ExperienceItem] = Field(default_factory=list, max_length=50)
    hackathons: list[HackathonEntry] = Field(default_factory=list, max_length=50)
    internships: list[InternshipEntry] = Field(default_factory=list, max_length=50)
    certifications: list[CertificationEntry] = Field(default_factory=list, max_length=50)
    preferred_roles: list[str] = Field(default_factory=list, max_length=20)
    cv_filename: str | None = Field(default=None, max_length=255)
    skillset_levels: list[SkillsetLevel] = Field(default_factory=list, max_length=12)
    # Ratings are optional in a draft; Talent Check withholds a score until all 12 exist.

    @model_validator(mode="after")
    def _one_rating_per_category(self) -> CandidateProfile:
        codes = [level.category_code for level in self.skillset_levels]
        if len(codes) != len(set(codes)):
            raise ValueError("skillset_levels must contain each category at most once")
        return self

    @property
    def missing_rating_categories(self) -> list[CategoryCode]:
        rated = {level.category_code for level in self.skillset_levels}
        return [code for code in RADIX_CATEGORY_CODES if code not in rated]


class CompanySkillRow(ContractModel):
    category_code: CategoryCode
    category_name: str = Field(min_length=1, max_length=120)
    required_level: LadderLevel
    bloom_code: str | None = Field(default=None, max_length=8)
    source_value: str | None = Field(default=None, max_length=32)


class CompanySkillBar(ContractModel):
    company_id: str = Field(pattern=r"^[a-z0-9][a-z0-9_]{1,63}$")
    display_name: str = Field(min_length=1, max_length=200)
    source_company_id: int | None = Field(default=None, ge=0)
    source_company_name: str | None = Field(default=None, max_length=200)
    skillsets: list[CompanySkillRow] = Field(min_length=12, max_length=12)

    @model_validator(mode="after")
    def _all_twelve_categories_once(self) -> CompanySkillBar:
        codes = [row.category_code for row in self.skillsets]
        if len(set(codes)) != len(codes):
            raise ValueError(f"company {self.company_id!r}: duplicate skillset categories")
        if set(codes) != set(RADIX_CATEGORY_CODES):
            missing = sorted(code.value for code in set(RADIX_CATEGORY_CODES) - set(codes))
            extra = sorted(code.value for code in set(codes) - set(RADIX_CATEGORY_CODES))
            raise ValueError(
                f"company {self.company_id!r}: expected the 12 RADIX categories; "
                f"missing={missing} unexpected={extra}"
            )
        return self


class CompanyDatasetMetadata(ContractModel):
    source_status: Literal["provisional_csv_fallback", "official_snapshot"]
    official_json_confirmed: bool
    source_file: str = Field(min_length=1, max_length=300)
    source_sha256: str = Field(pattern=r"^[A-Fa-f0-9]{64}$")
    source_company_count: int = Field(ge=0)
    included_target_company_count: int = Field(ge=1)
    note: str = Field(default="", max_length=1000)


class CompanyDataset(VersionedContractModel):
    """The local company snapshot that Talent Check loads (never a live query)."""

    dataset: CompanyDatasetMetadata
    companies: list[CompanySkillBar] = Field(min_length=1, max_length=50)

    @model_validator(mode="after")
    def _consistent_company_set(self) -> CompanyDataset:
        ids = [company.company_id for company in self.companies]
        if len(ids) != len(set(ids)):
            raise ValueError("company dataset contains duplicate company_id values")
        if len(ids) != self.dataset.included_target_company_count:
            raise ValueError(
                "dataset.included_target_company_count does not match the number of companies"
            )
        return self


class GapRow(ContractModel):
    category_code: CategoryCode
    category_name: str = Field(min_length=1, max_length=120)
    required_level: LadderLevel
    candidate_level: LadderLevel | None = None
    gap: bool
    gap_size: int = Field(ge=0, le=9)
    bloom_code: str | None = Field(default=None, max_length=8)


class TalentCheckResult(VersionedContractModel):
    company_id: str = Field(min_length=1, max_length=64)
    profile_id: UUID
    company_data_version: str = Field(min_length=1, max_length=64)
    status: Literal["complete", "incomplete"]
    readiness_score: int | None = Field(default=None, ge=0, le=100)
    missing_categories: list[CategoryCode] = Field(default_factory=list, max_length=12)
    rows: list[GapRow] = Field(min_length=12, max_length=12)
    formula_version: Literal["readiness_v1"] = "readiness_v1"

    @model_validator(mode="after")
    def _score_matches_status(self) -> TalentCheckResult:
        if self.status == "complete" and self.readiness_score is None:
            raise ValueError("a complete Talent Check requires a readiness score")
        if self.status == "incomplete" and self.readiness_score is not None:
            raise ValueError("an incomplete Talent Check must withhold the readiness score")
        if self.status == "incomplete" and not self.missing_categories:
            raise ValueError("an incomplete Talent Check must list the missing categories")
        if len({row.category_code for row in self.rows}) != len(self.rows):
            raise ValueError("Talent Check rows must cover each category once")
        return self


class PossibleMatch(ContractModel):
    """A fuzzy suggestion. It counts only after the candidate confirms it."""

    jd_skill_name: str = Field(min_length=1, max_length=120)
    candidate_skill_name: str = Field(min_length=1, max_length=120)
    similarity: float = Field(ge=0, le=1)
    method: Literal["fuzzy"] = "fuzzy"


class SkillMatchEvidenceGroup(ContractModel):
    """Equivalent JD requirements scored once while preserving every source quote."""

    group_key: str = Field(min_length=1, max_length=200)
    requirement_type: RequirementType
    evidence: list[Skill] = Field(min_length=1, max_length=200)


class SkillMatchResult(VersionedContractModel):
    jd_document_id: UUID
    profile_id: UUID | None = None
    status: Literal["scorable", "not_scorable"]
    match_score: int | None = Field(default=None, ge=0, le=100)
    distinct_required_skill_count: int = Field(ge=0)
    matched: list[Skill] = Field(default_factory=list, max_length=200)
    missing_required: list[Skill] = Field(default_factory=list, max_length=200)
    preferred: list[Skill] = Field(default_factory=list, max_length=200)
    mentioned: list[Skill] = Field(default_factory=list, max_length=200)
    unclear: list[Skill] = Field(default_factory=list, max_length=200)
    requirement_evidence: list[SkillMatchEvidenceGroup] = Field(
        default_factory=list, max_length=200
    )
    possible: list[PossibleMatch] = Field(default_factory=list, max_length=200)
    match_methods: list[Literal["registry_id", "alias", "normalized_exact", "confirmed_fuzzy"]] = (
        Field(default_factory=list)
    )
    registry_version: str = Field(min_length=1, max_length=40)
    formula_version: Literal["match_v1"] = "match_v1"

    @model_validator(mode="after")
    def _score_matches_status(self) -> SkillMatchResult:
        if self.status == "scorable":
            if self.match_score is None:
                raise ValueError("a scorable Skill Match requires a score")
            if self.distinct_required_skill_count == 0:
                raise ValueError("a scorable Skill Match needs at least one required skill")
        else:
            if self.match_score is not None:
                raise ValueError("a not_scorable Skill Match must withhold the score")
            if self.distinct_required_skill_count != 0:
                raise ValueError("not_scorable means there are no required skills to score")
        return self


class MatchConfirmation(ContractModel):
    """Candidate decision on one possible (fuzzy) match; input to scoring."""

    jd_skill_name: str = Field(min_length=1, max_length=120)
    candidate_skill_name: str = Field(min_length=1, max_length=120)
    confirmed: bool


class SkillMatchRequest(VersionedContractModel):
    """Validated profile, JD Analytics output and candidate match decisions."""

    profile: CandidateProfile
    jd: ExtractionResult
    confirmations: list[MatchConfirmation] = Field(default_factory=list, max_length=200)

    @model_validator(mode="after")
    def _job_description_only(self) -> SkillMatchRequest:
        if self.jd.source_type is not SourceType.jd:
            raise ValueError("Skill Matching requires a JD extraction result")
        return self


#: Domain objects published into the OpenAPI components so the generated
#: frontend types cover every handoff, including routes added in later milestones.
CONTRACT_MODELS: tuple[type[BaseModel], ...] = (
    SourceElement,
    Skill,
    ExtractionResult,
    CandidateProfile,
    CompanySkillRow,
    CompanySkillBar,
    CompanyDataset,
    GapRow,
    TalentCheckResult,
    PossibleMatch,
    SkillMatchEvidenceGroup,
    SkillMatchResult,
    MatchConfirmation,
    SkillMatchRequest,
)
