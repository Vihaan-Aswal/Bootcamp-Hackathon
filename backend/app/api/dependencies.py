"""Shared API dependencies for configured document providers."""

from __future__ import annotations

from app.api.errors import extraction_http_error
from app.providers.base import ProviderError, ProviderRoute
from app.providers.factory import get_provider


def require_document_provider() -> ProviderRoute:
    """Translate unavailable provider configuration into the safe API error shape."""

    try:
        return get_provider()
    except ProviderError as error:
        raise extraction_http_error(error) from None
