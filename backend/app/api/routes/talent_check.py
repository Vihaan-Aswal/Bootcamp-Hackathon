"""Talent Check API over the local, versioned company snapshot."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Body, HTTPException

from app.contracts.v1 import CandidateProfile, TalentCheckResult
from app.services.company_data import CompanyDataError, LoadedCompanyData, load_company_data
from app.services.talent_check import calculate_talent_check

router = APIRouter(tags=["talent-check"])


def _loaded() -> LoadedCompanyData:
    try:
        return load_company_data()
    except (CompanyDataError, OSError) as exc:
        raise HTTPException(status_code=503, detail="company data unavailable") from exc


@router.post(
    "/companies/{company_id}/talent-check",
    response_model=TalentCheckResult,
    summary="Compare one validated profile with a company's 12-skill bar",
)
def run_talent_check(
    company_id: str,
    profile: Annotated[CandidateProfile, Body()],
) -> TalentCheckResult:
    loaded = _loaded()
    company = loaded.company(company_id)
    if company is None:
        raise HTTPException(status_code=404, detail=f"unknown company_id: {company_id}")
    try:
        return calculate_talent_check(profile, company, loaded.data_version)
    except ValueError as exc:
        # The local company file is an input boundary even after loading; never
        # turn a malformed snapshot into a candidate-facing 500 response.
        raise HTTPException(status_code=503, detail="company data failed validation") from exc
