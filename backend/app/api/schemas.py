"""Response envelopes for the reference and system endpoints.

Kept separate from ``app.contracts.v1`` because they describe service
metadata, not the shared candidate/JD/company domain objects.
"""

from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.contracts.v1 import CategoryCode, ContractModel

SourceStatus = Literal["provisional_csv_fallback", "official_snapshot"]


class LevelTopic(ContractModel):
    level: int = Field(ge=1, le=10)
    topics: list[str] = Field(default_factory=list)


class SkillCategory(ContractModel):
    code: CategoryCode
    name: str
    levels: list[LevelTopic] = Field(default_factory=list)


class SkillCategoryListResponse(ContractModel):
    registry_version: str
    categories: list[SkillCategory]
    warnings: list[str] = Field(default_factory=list)


class CompanySummary(ContractModel):
    company_id: str
    display_name: str


class CompanyListResponse(ContractModel):
    data_version: str
    source_status: SourceStatus
    official_json_confirmed: bool
    source_note: str
    companies: list[CompanySummary]


class CompanyDataStatus(ContractModel):
    available: bool
    data_version: str | None = None
    source_status: SourceStatus | None = None
    official_json_confirmed: bool | None = None
    company_count: int | None = None


class ModuleStatus(ContractModel):
    key: str
    name: str
    milestone: str
    status: Literal["ready", "planned"]


class ProviderStatus(ContractModel):
    name: str
    configured: bool
    supports_json_schema: bool
    external: bool
    resume_processing_allowed: bool
    jd_processing_allowed: bool
    route: list[str] = Field(default_factory=list)


class HealthResponse(ContractModel):
    status: Literal["ok"]
    contract_version: str
    registry_version: str
    provider: ProviderStatus
    company_data: CompanyDataStatus
    modules: list[ModuleStatus]
    warnings: list[str] = Field(default_factory=list)
