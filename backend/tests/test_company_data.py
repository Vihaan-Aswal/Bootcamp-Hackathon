"""Company snapshot loading: provenance, validation and stable ids."""

from __future__ import annotations

import hashlib
import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest

from app.services.company_data import (
    CompanyDataError,
    load_company_data,
    resolve_dataset_path,
)


def _dataset_payload(bar: dict[str, Any], **metadata: Any) -> dict[str, Any]:
    meta = {
        "source_status": "provisional_csv_fallback",
        "official_json_confirmed": False,
        "source_file": "data/reference/source/staging_company_skill_levels_fixed.csv",
        "source_sha256": "A" * 64,
        "source_company_count": 116,
        "included_target_company_count": 1,
        "note": "test fixture",
    }
    meta.update(metadata)
    return {"schema_version": "1.0.0", "dataset": meta, "companies": [bar]}


def _write(path: Path, payload: dict[str, Any]) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


def test_repository_dataset_loads_three_companies() -> None:
    loaded = load_company_data()

    assert [company.company_id for company in loaded.dataset.companies] == [
        "google",
        "microsoft",
        "oracle_fss",
    ]
    assert loaded.is_provisional is True
    assert loaded.dataset.dataset.official_json_confirmed is False


def test_every_company_has_twelve_valid_levels() -> None:
    loaded = load_company_data()

    for company in loaded.dataset.companies:
        codes = [row.category_code for row in company.skillsets]
        assert len(codes) == 12
        assert len(set(codes)) == 12
        assert all(1 <= row.required_level <= 10 for row in company.skillsets)


def test_data_version_is_the_file_hash() -> None:
    loaded = load_company_data()

    digest = hashlib.sha256(loaded.path.read_bytes()).hexdigest()
    assert loaded.data_version == digest


def test_lookup_by_stable_id_not_display_name() -> None:
    loaded = load_company_data()

    assert loaded.company("google").display_name == "Google"
    assert loaded.company("Google") is None
    assert loaded.company("unknown") is None


def test_official_file_takes_precedence_when_present(
    tmp_path: Path, fixture_json: Callable[[str], Any]
) -> None:
    official = tmp_path / "reference" / "official" / "talent_check_company_skillsets.json"
    written = _write(
        official,
        _dataset_payload(
            fixture_json("company_bar.json"),
            source_status="official_snapshot",
            official_json_confirmed=True,
        ),
    )

    assert resolve_dataset_path(tmp_path) == written


def test_missing_dataset_is_reported(tmp_path: Path) -> None:
    with pytest.raises(CompanyDataError, match="not found"):
        resolve_dataset_path(tmp_path)


def test_mislabelled_fallback_is_rejected(
    tmp_path: Path, fixture_json: Callable[[str], Any]
) -> None:
    path = _write(
        tmp_path / "dataset.json",
        _dataset_payload(fixture_json("company_bar.json"), official_json_confirmed=True),
    )

    with pytest.raises(CompanyDataError, match="claims an official snapshot"):
        load_company_data(path)


def test_eleven_row_company_is_rejected(tmp_path: Path, fixture_json: Callable[[str], Any]) -> None:
    bar = fixture_json("company_bar.json")
    bar["skillsets"] = bar["skillsets"][:11]
    path = _write(tmp_path / "dataset.json", _dataset_payload(bar))

    with pytest.raises(CompanyDataError, match="failed contract validation"):
        load_company_data(path)


def test_duplicate_company_ids_are_rejected(
    tmp_path: Path, fixture_json: Callable[[str], Any]
) -> None:
    bar = fixture_json("company_bar.json")
    payload = _dataset_payload(bar)
    payload["companies"] = [bar, bar]
    payload["dataset"]["included_target_company_count"] = 2
    path = _write(tmp_path / "dataset.json", payload)

    with pytest.raises(CompanyDataError, match="duplicate company_id"):
        load_company_data(path)


def test_malformed_json_is_reported(tmp_path: Path) -> None:
    path = tmp_path / "dataset.json"
    path.write_text("{not json", encoding="utf-8")

    with pytest.raises(CompanyDataError, match="not valid JSON"):
        load_company_data(path)
