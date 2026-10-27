"""Company skillset snapshots loaded from the validated local dataset."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.api.schemas import CompanyListResponse, CompanySummary
from app.contracts.v1 import CompanySkillBar
from app.services.company_data import (
    CompanyDataError,
    LoadedCompanyData,
    load_company_data,
)

router = APIRouter(tags=["companies"])


def _loaded() -> LoadedCompanyData:
    try:
        return load_company_data()
    except (CompanyDataError, OSError) as exc:
        raise HTTPException(status_code=503, detail=f"company data unavailable: {exc}") from exc


@router.get(
    "/companies",
    response_model=CompanyListResponse,
    summary="Companies available for Talent Check",
)
def list_companies() -> CompanyListResponse:
    loaded = _loaded()
    metadata = loaded.dataset.dataset
    return CompanyListResponse(
        data_version=loaded.data_version,
        source_status=metadata.source_status,
        official_json_confirmed=metadata.official_json_confirmed,
        source_note=metadata.note,
        companies=[
            CompanySummary(company_id=company.company_id, display_name=company.display_name)
            for company in loaded.dataset.companies
        ],
    )


@router.get(
    "/companies/{company_id}",
    response_model=CompanySkillBar,
    summary="One company's 12 required levels",
)
def get_company(company_id: str) -> CompanySkillBar:
    company = _loaded().company(company_id)
    if company is None:
        raise HTTPException(status_code=404, detail=f"unknown company_id: {company_id}")
    return company
