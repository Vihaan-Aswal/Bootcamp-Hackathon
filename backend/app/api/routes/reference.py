"""Skill categories and the 1-10 rating ladder shown beside profile ratings."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.schemas import LevelTopic, SkillCategory, SkillCategoryListResponse
from app.services.skill_registry import (
    CATEGORY_NAMES,
    REGISTRY_VERSION,
    load_level_ladder,
)

router = APIRouter(tags=["reference"])


@router.get(
    "/reference/skill-categories",
    response_model=SkillCategoryListResponse,
    summary="The 12 RADIX categories with their level topics",
)
def list_skill_categories() -> SkillCategoryListResponse:
    warnings: list[str] = []
    try:
        ladder = load_level_ladder()
    except (OSError, ValueError) as exc:
        ladder = {}
        warnings.append(f"level ladder unavailable: {exc}")

    categories = [
        SkillCategory(
            code=code,
            name=name,
            levels=[
                LevelTopic(level=level, topics=topics)
                for level, topics in sorted(ladder.get(code, {}).items())
            ],
        )
        for code, name in CATEGORY_NAMES.items()
    ]
    return SkillCategoryListResponse(
        registry_version=REGISTRY_VERSION,
        categories=categories,
        warnings=warnings,
    )
