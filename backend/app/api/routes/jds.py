"""JD Analytics upload API."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.api.dependencies import require_document_provider
from app.api.errors import extraction_http_error
from app.config import settings
from app.contracts.v1 import ExtractionResult
from app.parsing.document import DocumentParseError
from app.providers.base import ProviderError, ProviderRoute
from app.services.jd_analytics import analyze_jd

router = APIRouter(prefix="/jds", tags=["jd-analytics"])


@router.post(
    "/analyze",
    response_model=ExtractionResult,
    summary="Analyze one PDF or DOCX job description",
)
def analyze_jd_upload(
    file: Annotated[UploadFile, File()],
    provider: Annotated[ProviderRoute, Depends(require_document_provider)],
    allow_external_processing: Annotated[bool, Form()] = False,
) -> ExtractionResult:
    """Upload is held in memory and closed on success and every failure path."""

    try:
        if provider.external:
            if not settings.llm_jd_processing_allowed:
                raise HTTPException(
                    status_code=403,
                    detail={
                        "code": "EXTERNAL_JD_PROCESSING_DISABLED",
                        "message": (
                            "External job-description processing is disabled until an "
                            "administrator reviews the selected provider's current terms."
                        ),
                    },
                )
            if not allow_external_processing:
                raise HTTPException(
                    status_code=403,
                    detail={
                        "code": "EXTERNAL_JD_CONSENT_REQUIRED",
                        "message": (
                            "Review the provider's current terms and consent before sending "
                            "this job description for analysis."
                        ),
                    },
                )
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
