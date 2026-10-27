"""Scoring endpoint for one profile and one JD Analytics result."""

from __future__ import annotations

from fastapi import APIRouter

from app.contracts.v1 import SkillMatchRequest, SkillMatchResult
from app.services.skill_matching import calculate_skill_match

router = APIRouter(prefix="/skill-matches", tags=["skill-matching"])


@router.post(
    "/score",
    response_model=SkillMatchResult,
    summary="Compare a candidate profile with one analyzed job description",
)
def score_skill_match(request: SkillMatchRequest) -> SkillMatchResult:
    return calculate_skill_match(request)
