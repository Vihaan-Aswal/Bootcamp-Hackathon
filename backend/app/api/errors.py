"""Safe HTTP translation for document and provider failures."""

from __future__ import annotations

from fastapi import HTTPException

from app.parsing.document import DocumentParseError
from app.providers.base import ProviderError


def extraction_http_error(error: DocumentParseError | ProviderError) -> HTTPException:
    return HTTPException(
        status_code=error.status_code,
        detail={"code": error.code, "message": error.message},
    )
