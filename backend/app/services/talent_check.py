"""Deterministic readiness scoring against one validated company skill bar."""

from __future__ import annotations

from fractions import Fraction

from pydantic import ValidationError

from app.contracts.v1 import (
    RADIX_CATEGORY_CODES,
    CandidateProfile,
    CompanySkillBar,
    GapRow,
    TalentCheckResult,
)


def _round_half_up(value: Fraction) -> int:
    """Round a non-negative rational to an integer, with exact halves upward."""

    whole, remainder = divmod(value.numerator, value.denominator)
    return whole + (2 * remainder >= value.denominator)


def calculate_talent_check(
    profile: CandidateProfile,
    company: CompanySkillBar,
    company_data_version: str,
) -> TalentCheckResult:
    """Return the 12 skillset comparisons and a withheld or complete score.

    Readiness is equal-weighted capped coverage across the 12 categories:
    ``round_half_up(100 * average(min(candidate / required, 1)))``.
    Ratings remain self-reported and never come from resume skills.
    """

    try:
        # Revalidate mutable Pydantic instances at the scoring boundary.
        checked_profile = CandidateProfile.model_validate(profile.model_dump())
        checked_company = CompanySkillBar.model_validate(company.model_dump())
    except (AttributeError, ValidationError) as exc:
        raise ValueError("profile or company data failed contract validation") from exc

    company_rows = {row.category_code: row for row in checked_company.skillsets}
    profile_levels = {
        row.category_code: row.level for row in checked_profile.skillset_levels
    }
    missing = [code for code in RADIX_CATEGORY_CODES if code not in profile_levels]

    rows: list[GapRow] = []
    for code in RADIX_CATEGORY_CODES:
        required = company_rows[code]
        candidate_level = profile_levels.get(code)
        # An unrated skill is surfaced as a gap in the incomplete result; the
        # UI can distinguish it by candidate_level=None and show "Not rated".
        is_gap = candidate_level is None or candidate_level < required.required_level
        gap_size = (
            max(required.required_level - candidate_level, 0)
            if candidate_level is not None
            else 0
        )
        rows.append(
            GapRow(
                category_code=code,
                category_name=required.category_name,
                required_level=required.required_level,
                candidate_level=candidate_level,
                gap=is_gap,
                gap_size=gap_size,
                bloom_code=required.bloom_code,
            )
        )

    score: int | None = None
    status = "incomplete" if missing else "complete"
    if not missing:
        coverage = sum(
            (
                Fraction(
                    min(profile_levels[code], company_rows[code].required_level),
                    company_rows[code].required_level,
                )
                for code in RADIX_CATEGORY_CODES
            ),
            start=Fraction(0, 1),
        )
        score = _round_half_up(coverage * Fraction(100, len(RADIX_CATEGORY_CODES)))

    return TalentCheckResult(
        company_id=checked_company.company_id,
        profile_id=checked_profile.profile_id,
        company_data_version=company_data_version,
        status=status,
        readiness_score=score,
        missing_categories=missing,
        rows=rows,
    )
