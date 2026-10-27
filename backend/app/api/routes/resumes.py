"""Resume Parsing API."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.api.dependencies import require_document_provider
from app.api.errors import extraction_http_error
from app.config import settings
from app.contracts.v1 import ExtractionResult
from app.parsing.document import DocumentParseError
from app.providers.base import Provider, ProviderError
from app.services.resume_parsing import parse_resume

router = APIRouter(tags=["resume parsing"])


@router.post(
    "/resumes/parse",
    response_model=ExtractionResult,
    summary="Parse a resume into editable, evidence-backed suggestions",
    responses={
        403: {"description": "External processing is disabled or consent is missing."},
        413: {"description": "The upload exceeds a configured limit."},
        415: {"description": "Only PDF and DOCX files are supported."},
        422: {"description": "The file is empty, invalid, encrypted, or needs OCR."},
        502: {"description": "The configured provider returned an invalid response."},
        504: {"description": "The configured provider timed out."},
    },
)
def parse_resume_endpoint(
    file: Annotated[UploadFile, File(...)],
    provider: Annotated[Provider, Depends(require_document_provider)],
    allow_external_processing: Annotated[bool, Form()] = False,
) -> ExtractionResult:
    """Return suggestions; the caller can edit or discard them before saving."""

    try:
        max_bytes = settings.max_upload_mb * 1024 * 1024
        content = file.file.read(max_bytes + 1)
        return parse_resume(
            filename=file.filename,
            content=content,
            provider=provider,
            allow_external_processing=allow_external_processing,
        )
    except (DocumentParseError, ProviderError) as error:
        raise extraction_http_error(error) from None
    except OSError:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "UPLOAD_READ_FAILED",
                "message": "The uploaded file could not be read.",
            },
        ) from None
    finally:
        try:
            file.file.close()
        except OSError:
            pass
