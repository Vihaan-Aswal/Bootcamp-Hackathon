"""Single loader for the local company skillset snapshot.

The snapshot is static project data (never a live company query). The official
file was not supplied, so v1 loads the generated CSV fallback and reports its
provenance; a recovered official file in ``data/reference/official/`` takes
precedence automatically.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from pydantic import ValidationError

from app.config import settings
from app.contracts.v1 import CompanyDataset, CompanySkillBar

DATASET_FILENAME = "talent_check_company_skillsets.json"


class CompanyDataError(RuntimeError):
    """The company snapshot is missing, malformed or mislabelled."""


@dataclass(frozen=True, slots=True)
class LoadedCompanyData:
    dataset: CompanyDataset
    data_version: str
    path: Path

    @property
    def is_provisional(self) -> bool:
        return self.dataset.dataset.source_status == "provisional_csv_fallback"

    def company(self, company_id: str) -> CompanySkillBar | None:
        for company in self.dataset.companies:
            if company.company_id == company_id:
                return company
        return None


def resolve_dataset_path(data_dir: Path | None = None) -> Path:
    """Prefer a recovered official file, otherwise the generated fallback."""

    reference_dir = (data_dir or settings.data_dir) / "reference"
    official = reference_dir / "official" / DATASET_FILENAME
    if official.is_file():
        return official
    fallback = reference_dir / DATASET_FILENAME
    if fallback.is_file():
        return fallback
    raise CompanyDataError(f"company snapshot not found: expected {fallback} or {official}")


@lru_cache(maxsize=8)
def load_company_data(path: str | Path | None = None) -> LoadedCompanyData:
    file_path = Path(path) if path is not None else resolve_dataset_path()
    raw = file_path.read_bytes()

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise CompanyDataError(f"{file_path.name} is not valid JSON: {exc}") from exc

    try:
        dataset = CompanyDataset.model_validate(payload)
    except ValidationError as exc:
        raise CompanyDataError(f"{file_path.name} failed contract validation: {exc}") from exc

    metadata = dataset.dataset
    if metadata.official_json_confirmed and metadata.source_status != "official_snapshot":
        raise CompanyDataError(
            f"{file_path.name} claims an official snapshot but is labelled "
            f"{metadata.source_status!r}"
        )
    if not metadata.official_json_confirmed and metadata.source_status == "official_snapshot":
        raise CompanyDataError(f"{file_path.name} is labelled official but is not marked confirmed")

    return LoadedCompanyData(
        dataset=dataset,
        data_version=hashlib.sha256(raw).hexdigest(),
        path=file_path,
    )
