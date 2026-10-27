"""Health and readiness. Also the M1 "hello-world" for each module owner."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.schemas import CompanyDataStatus, HealthResponse, ModuleStatus, ProviderStatus
from app.contracts.v1 import CONTRACT_VERSION
from app.providers.factory import provider_availability
from app.services.company_data import CompanyDataError, load_company_data
from app.services.skill_registry import REGISTRY_VERSION

router = APIRouter(tags=["system"])

MODULES: tuple[ModuleStatus, ...] = (
    ModuleStatus(key="jd_analytics", name="JD Analytics", milestone="M2", status="ready"),
    ModuleStatus(key="resume_parsing", name="Resume Parsing", milestone="M2", status="ready"),
    ModuleStatus(key="profile_builder", name="Profile Builder", milestone="M3", status="ready"),
    ModuleStatus(key="talent_check", name="Talent Check", milestone="M4", status="ready"),
    ModuleStatus(key="skill_matching", name="Skill Matching", milestone="M4", status="ready"),
)


@router.get("/health", response_model=HealthResponse, summary="Service and data readiness")
def read_health() -> HealthResponse:
    warnings: list[str] = []
    provider = provider_availability()
    if not provider.configured:
        warnings.append("selected document provider is not fully configured")
    try:
        loaded = load_company_data()
    except (CompanyDataError, OSError) as exc:
        warnings.append(f"company data unavailable: {exc}")
        company_data = CompanyDataStatus(available=False)
    else:
        metadata = loaded.dataset.dataset
        company_data = CompanyDataStatus(
            available=True,
            data_version=loaded.data_version,
            source_status=metadata.source_status,
            official_json_confirmed=metadata.official_json_confirmed,
            company_count=len(loaded.dataset.companies),
        )

    return HealthResponse(
        status="ok",
        contract_version=CONTRACT_VERSION,
        registry_version=REGISTRY_VERSION,
        provider=ProviderStatus(
            name=provider.name,
            configured=provider.configured,
            supports_json_schema=provider.supports_json_schema,
            external=provider.external,
            resume_processing_allowed=provider.resume_processing_allowed,
        ),
        company_data=company_data,
        modules=list(MODULES),
        warnings=warnings,
    )
