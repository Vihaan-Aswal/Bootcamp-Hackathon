"""Local redaction for direct identifiers before an external resume request."""

from __future__ import annotations

import re
from collections.abc import Sequence

from app.contracts.v1 import SourceElement

_EMAIL = re.compile(r"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b")
_NUMBER_CANDIDATE = re.compile(r"(?<!\w)\+?\d[\d\s().-]{6,}\d(?!\w)")
_NAMED_IDENTIFIER = re.compile(r"(?i)\b(?:name|e-mail|email|phone|mobile|contact)\s*[:=-]\s*[^|;]+")


def _likely_header_name(text: str) -> str | None:
    candidate = re.split(r"\s+(?:\||•|—|–|-)\s+", text.strip(), maxsplit=1)[0].strip(" :|")
    tokens = candidate.split()
    if not 2 <= len(tokens) <= 4 or len(candidate) > 80:
        return None
    if candidate.casefold() in {"curriculum vitae", "work experience", "personal details"}:
        return None
    # A conservative ASCII-style name heuristic avoids erasing headings and
    # ordinary prose. Names explicitly labeled in the document are handled below.
    if not all(
        token[0].isupper() and all(ch.isalpha() or ch in "'-’" for ch in token) for token in tokens
    ):
        return None
    return candidate


def redact_resume_identifiers(
    elements: Sequence[SourceElement],
) -> tuple[tuple[SourceElement, ...], bool]:
    """Return copied elements with detected names, email addresses and phones masked.

    The originals remain local for evidence verification and location mapping.
    This is a best-effort privacy filter, not a guarantee that all personal
    information has been removed.
    """

    possible_name: str | None = None
    for element in elements[:3]:
        possible_name = _likely_header_name(element.text)
        if possible_name:
            break

    redacted: list[SourceElement] = []
    changed = False
    name_pattern = (
        re.compile(rf"(?i)(?<!\w){re.escape(possible_name)}(?!\w)") if possible_name else None
    )
    for element in elements:
        text = element.text
        updated = _EMAIL.sub("[REDACTED_EMAIL]", text)
        updated = _NAMED_IDENTIFIER.sub("[REDACTED_IDENTIFIER]", updated)
        if name_pattern:
            updated = name_pattern.sub("[REDACTED_NAME]", updated)

        def mask_phone(match: re.Match[str]) -> str:
            digits = re.sub(r"\D", "", match.group())
            return "[REDACTED_PHONE]" if 9 <= len(digits) <= 15 else match.group()

        updated = _NUMBER_CANDIDATE.sub(mask_phone, updated)
        if updated != text:
            changed = True
            redacted.append(element.model_copy(update={"text": updated}))
        else:
            redacted.append(element)
    return tuple(redacted), changed
