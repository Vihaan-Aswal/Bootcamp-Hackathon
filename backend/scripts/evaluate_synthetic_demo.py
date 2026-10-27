"""Verify two offline synthetic roles and two candidate profiles end to end."""

from __future__ import annotations

from pathlib import Path

from app.contracts.v1 import RADIX_CATEGORY_CODES, CandidateProfile, SkillMatchRequest
from app.parsing.document import DocumentParseError
from app.providers.base import ProviderError
from app.providers.mock import MockProvider
from app.services.company_data import load_company_data
from app.services.jd_analytics import analyze_jd
from app.services.resume_parsing import parse_resume
from app.services.skill_matching import calculate_skill_match
from app.services.talent_check import calculate_talent_check

REPO_ROOT = Path(__file__).resolve().parents[2]
SYNTHETIC_ROOT = REPO_ROOT / "data" / "samples" / "synthetic"


def _parse_resume(path: Path, provider: MockProvider) -> CandidateProfile | None:
    try:
        result = parse_resume(
            filename=path.name,
            content=path.read_bytes(),
            provider=provider,
        )
    except (DocumentParseError, ProviderError, OSError):
        return None
    if not result.skills:
        return None
    index = 0 if path.stem.endswith("alpha") else 1
    rating = 8 if index == 0 else 3
    label = "Alpha" if index == 0 else "Beta"
    slug = label.casefold()
    return CandidateProfile(
        basic_details={
            "full_name": f"Synthetic Candidate {label}",
            "email": f"candidate-{slug}@example.com",
        },
        skills=result.skills,
        education=result.education,
        projects=result.projects,
        experience=result.experience,
        cv_filename=result.filename,
        skillset_levels=[
            {"category_code": code, "level": rating, "source": "self_reported"}
            for code in RADIX_CATEGORY_CODES
        ],
    )


def main() -> int:
    provider = MockProvider()
    company_data = load_company_data()
    company = company_data.dataset.companies[0]
    resume_paths = sorted((SYNTHETIC_ROOT / "Resumes").glob("*.docx"))
    jd_paths = sorted((SYNTHETIC_ROOT / "JDs").glob("*.docx"))
    if len(resume_paths) != 2 or len(jd_paths) != 2:
        print("Synthetic demo inputs unavailable; run the fixture builder first.")
        return 2

    profiles = [profile for path in resume_paths if (profile := _parse_resume(path, provider))]
    jds = []
    for path in jd_paths:
        try:
            jds.append(analyze_jd(path.name, path.read_bytes(), provider))
        except (DocumentParseError, ProviderError, OSError):
            continue

    if len(profiles) != 2 or len(jds) != 2:
        print("Synthetic demo parsing did not return two candidate profiles and two JDs.")
        return 1

    scores: dict[tuple[str, str], int] = {}
    readiness: set[int] = set()
    for jd in jds:
        for profile in profiles:
            talent_check = calculate_talent_check(
                profile, company, company_data.data_version
            )
            if talent_check.status != "complete" or talent_check.readiness_score is None:
                return 1
            readiness.add(talent_check.readiness_score)
            match = calculate_skill_match(
                SkillMatchRequest(profile=profile, jd=jd, confirmations=[])
            )
            if match.status != "scorable" or match.match_score is None:
                return 1
            scores[(jd.filename, profile.cv_filename or "")] = match.match_score

    role_a = next(jd for jd in jds if jd.filename == "role_alpha.docx")
    role_b = next(jd for jd in jds if jd.filename == "role_beta.docx")
    candidate_a = next(
        profile for profile in profiles if profile.cv_filename == "candidate_alpha.docx"
    )
    candidate_b = next(
        profile for profile in profiles if profile.cv_filename == "candidate_beta.docx"
    )
    expected = (
        scores[(role_a.filename, candidate_a.cv_filename or "")] == 100
        and scores[(role_a.filename, candidate_b.cv_filename or "")] == 0
        and scores[(role_b.filename, candidate_a.cv_filename or "")] == 0
        and scores[(role_b.filename, candidate_b.cv_filename or "")] == 100
    )
    print(f"Synthetic roles scored end to end: {len(jds)}/2")
    print(f"Candidate self-reports produce different readiness scores: {len(readiness) > 1}")
    print(f"Two candidates produce distinct results on both roles: {expected}")
    return 0 if expected and len(readiness) > 1 else 1


if __name__ == "__main__":
    raise SystemExit(main())
