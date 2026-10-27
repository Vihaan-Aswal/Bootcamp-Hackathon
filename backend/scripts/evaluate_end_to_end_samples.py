"""Run an offline, aggregate-only end-to-end check on the local official sample pack."""

from __future__ import annotations

from collections import defaultdict
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
SAMPLES = REPO_ROOT / "data" / "samples" / "official"


def _group_pairs(folder: Path) -> dict[str, list[Path]]:
    grouped: dict[str, list[Path]] = defaultdict(list)
    if not folder.is_dir():
        return grouped
    for path in folder.rglob("*"):
        if path.is_file() and path.suffix.casefold() in {".pdf", ".docx"}:
            grouped[path.stem.casefold()].append(path)
    return dict(sorted(grouped.items()))


def _sample_path(paths: list[Path], index: int) -> Path:
    preferred_suffix = ".pdf" if index % 2 == 0 else ".docx"
    ordered_paths = sorted(paths)
    return next(
        (path for path in ordered_paths if path.suffix.casefold() == preferred_suffix),
        ordered_paths[0],
    )


def _demo_profile(resume, index: int) -> CandidateProfile:
    # These deterministic demo ratings are independent test inputs, never resume inferences.
    rating = min(6, 3 + index)
    return CandidateProfile(
        basic_details={
            "full_name": f"Local demo profile {index + 1}",
            "email": f"demo-profile-{index + 1}@example.com",
        },
        skills=resume.skills,
        education=resume.education,
        projects=resume.projects,
        experience=resume.experience,
        cv_filename=resume.filename,
        skillset_levels=[
            {"category_code": category, "level": rating, "source": "self_reported"}
            for category in RADIX_CATEGORY_CODES
        ],
    )


def main() -> int:
    jd_groups = _group_pairs(SAMPLES / "JDs")
    resume_groups = _group_pairs(SAMPLES / "Resumes")
    if len(jd_groups) != 6 or len(resume_groups) != 4:
        print("End-to-end sample check unavailable: expected six JDs and four resumes locally.")
        return 2

    provider = MockProvider()
    loaded_company_data = load_company_data()
    company = loaded_company_data.dataset.companies[0]
    jd_results = []
    profiles: list[CandidateProfile] = []
    jd_with_skills = 0
    resumes_with_skills = 0
    scored_pairs = 0
    successful_roles = 0
    readiness_scores: set[int] = set()
    different_match_results = False

    for index, paths in enumerate(resume_groups.values()):
        path = _sample_path(paths, index)
        try:
            resume = parse_resume(
                filename=path.name,
                content=path.read_bytes(),
                provider=provider,
                allow_external_processing=False,
            )
        except (DocumentParseError, ProviderError, OSError):
            continue
        if not resume.skills:
            continue
        resumes_with_skills += 1
        profiles.append(_demo_profile(resume, len(profiles)))

    for index, paths in enumerate(jd_groups.values()):
        path = _sample_path(paths, index)
        try:
            jd = analyze_jd(path.name, path.read_bytes(), provider)
        except (DocumentParseError, ProviderError, OSError):
            continue
        if not jd.skills:
            continue
        jd_with_skills += 1
        jd_results.append(jd)

    for jd in jd_results:
        role_scored = False
        scores_for_role: set[int] = set()
        for profile in profiles:
            check = calculate_talent_check(
                profile, company, loaded_company_data.data_version
            )
            if check.status != "complete" or check.readiness_score is None:
                continue
            readiness_scores.add(check.readiness_score)
            match = calculate_skill_match(
                SkillMatchRequest(profile=profile, jd=jd, confirmations=[])
            )
            if match.status != "scorable" or match.match_score is None:
                continue
            scores_for_role.add(match.match_score)
            role_scored = True
            scored_pairs += 1
        successful_roles += int(role_scored)
        different_match_results |= len(scores_for_role) > 1

    print(f"Official JD pairs with extracted skills: {jd_with_skills}/6 (minimum 3/6)")
    print(f"Official resume pairs with extracted skills: {resumes_with_skills}/4 (minimum 2/4)")
    print(f"JD roles with a complete profile-to-score flow: {successful_roles}/6 (minimum 2)")
    print(f"Complete profile/role score pairs: {scored_pairs}")
    readiness_varies = len(readiness_scores) > 1
    print(f"Candidate self-reports produced different readiness scores: {readiness_varies}")
    print(
        "Candidate profiles produced different match scores for a role: "
        f"{different_match_results}"
    )

    if jd_with_skills < 3 or resumes_with_skills < 2 or successful_roles < 2:
        return 1
    if len(readiness_scores) < 2 or not different_match_results:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
