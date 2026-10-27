"""JD Analytics upload API."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.api.dependencies import require_document_provider
from app.api.errors import extraction_http_error
from app.config import settings
from app.contracts.v1 import ExtractionResult
from app.parsing.document import DocumentParseError
from app.providers.base import Provider, ProviderError
from app.services.jd_analytics import analyze_jd

router = APIRouter(prefix="/jds", tags=["jd-analytics"])


@router.post(
    "/analyze",
    response_model=ExtractionResult,
    summary="Analyze one PDF or DOCX job description",
)
def analyze_jd_upload(
    file: Annotated[UploadFile, File()],
    provider: Annotated[Provider, Depends(require_document_provider)],
) -> ExtractionResult:
    """Upload is held in memory and closed on success and every failure path."""

    try:
        try:
            content = file.file.read(settings.max_upload_mb * 1024 * 1024 + 1)
        except OSError:
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "UPLOAD_READ_FAILED",
                    "message": "The uploaded file could not be read.",
                },
            ) from None
        return analyze_jd(file.filename, content, provider)
    except (DocumentParseError, ProviderError) as error:
        raise extraction_http_error(error) from None
    finally:
        try:
            file.file.close()
        except OSError:
            # The framework may already have closed the spooled upload.
            pass
