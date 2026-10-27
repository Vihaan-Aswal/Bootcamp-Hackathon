"""Evaluate official local samples without network calls or content output."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Callable
from pathlib import Path

from app.contracts.v1 import ExtractionResult
from app.parsing.document import DocumentParseError
from app.providers.base import ProviderError
from app.providers.mock import MockProvider
from app.services.jd_analytics import analyze_jd
from app.services.resume_parsing import parse_resume

REPO_ROOT = Path(__file__).resolve().parents[2]
SAMPLES = REPO_ROOT / "data" / "samples" / "official"


def _group_pairs(folder: Path) -> dict[str, list[Path]]:
    grouped: dict[str, list[Path]] = defaultdict(list)
    for path in folder.rglob("*"):
        if path.is_file() and path.suffix.casefold() in {".pdf", ".docx"}:
            grouped[path.stem.casefold()].append(path)
    return grouped


def _count_with_skills(
    documents: dict[str, list[Path]],
    extractor: Callable[[Path, bytes, MockProvider], ExtractionResult],
) -> tuple[int, int]:
    passed = 0
    for paths in documents.values():
        found_skill = False
        for path in paths:
            try:
                result = extractor(path, path.read_bytes(), MockProvider())
            except (DocumentParseError, ProviderError, OSError):
                continue
            if result.skills:
                found_skill = True
        passed += int(found_skill)
    return len(documents), passed


def _extract_jd(path: Path, content: bytes, provider: MockProvider) -> ExtractionResult:
    return analyze_jd(path.name, content, provider)


def _extract_resume(path: Path, content: bytes, provider: MockProvider) -> ExtractionResult:
    return parse_resume(filename=path.name, content=content, provider=provider)


def main() -> int:
    if not SAMPLES.is_dir():
        print("Official sample pack is unavailable; no sample evaluation was run.")
        return 2

    jd_total, jd_passed = _count_with_skills(_group_pairs(SAMPLES / "JDs"), _extract_jd)
    resume_total, resume_passed = _count_with_skills(
        _group_pairs(SAMPLES / "Resumes"), _extract_resume
    )
    print(f"Official JDs with evidence-backed skills: {jd_passed}/{jd_total} (required 3/6)")
    print(
        f"Official resumes with evidence-backed skills: {resume_passed}/{resume_total} "
        "(required 2/4)"
    )
    if jd_total != 6 or resume_total != 4:
        print("The local official pack does not contain the expected six JDs and four resumes.")
        return 2
    if jd_passed < 3 or resume_passed < 2:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
