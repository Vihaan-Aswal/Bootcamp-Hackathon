"""Profile boundary validation for JSON imports and browser persistence."""

from __future__ import annotations

from fastapi import APIRouter

from app.contracts.v1 import CandidateProfile

router = APIRouter(tags=["profile builder"])


@router.post(
    "/profiles/validate",
    response_model=CandidateProfile,
    summary="Validate a candidate profile against contract v1",
)
def validate_profile(profile: CandidateProfile) -> CandidateProfile:
    """Apply the canonical Pydantic contract before import or persistence."""

    return profile
