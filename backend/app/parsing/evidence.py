"""Evidence quote verification against parser-created source elements."""

from __future__ import annotations

import re
import unicodedata

from app.contracts.v1 import EvidenceStatus, SourceElement


def normalize_evidence_text(value: str) -> str:
    """Normalize case and whitespace only; preserve words and punctuation."""

    normalized = unicodedata.normalize("NFKC", value).casefold()
    return re.sub(r"\s+", " ", normalized).strip()


def verify_evidence_quote(quote: str | None, element: SourceElement | None) -> EvidenceStatus:
    """Return exact/normalized/failed using the cited parser element only."""

    if not quote or element is None:
        return EvidenceStatus.failed
    if quote in element.text:
        return EvidenceStatus.exact
    normalized_quote = normalize_evidence_text(quote)
    if normalized_quote and normalized_quote in normalize_evidence_text(element.text):
        return EvidenceStatus.normalized
    return EvidenceStatus.failed
