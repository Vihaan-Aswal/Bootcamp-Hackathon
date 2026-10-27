"""The registry is data: 12 categories, a complete ladder and stable aliases."""

from __future__ import annotations

import pytest

from app.contracts.v1 import RADIX_CATEGORY_CODES, CategoryCode
from app.services import skill_registry


def test_twelve_radix_categories_with_unique_names() -> None:
    assert len(RADIX_CATEGORY_CODES) == 12
    assert set(skill_registry.CATEGORY_NAMES) == set(RADIX_CATEGORY_CODES)
    names = list(skill_registry.CATEGORY_NAMES.values())
    assert len(names) == len(set(names))
    assert len(names) == 12


def test_every_canonical_skill_uses_a_radix_category() -> None:
    assert skill_registry.CANONICAL_SKILLS
    for skill in skill_registry.CANONICAL_SKILLS:
        assert skill.category_code in RADIX_CATEGORY_CODES
        assert skill.skill_id == skill_registry.normalize_skill_name(skill.skill_id)


def test_every_display_name_and_alias_resolves_to_its_own_skill() -> None:
    for skill in skill_registry.CANONICAL_SKILLS:
        for key in (skill.skill_id, skill.display_name, *skill.aliases):
            resolved = skill_registry.resolve_skill(key)
            assert resolved is not None
            assert resolved.skill_id == skill.skill_id


@pytest.mark.parametrize("name", ["C", "C++", "C#"])
def test_c_family_stays_distinct(name: str) -> None:
    resolved = skill_registry.resolve_skill(name)
    assert resolved is not None
    assert resolved.skill_id in {"c", "cpp", "csharp"}


def test_c_family_keys_are_not_collapsed() -> None:
    keys = {skill_registry.normalize_skill_name(name) for name in ("C", "C++", "C#")}
    assert keys == {"c", "c++", "c#"}


@pytest.mark.parametrize(
    ("variant", "expected"),
    [
        ("JavaScript", "javascript"),
        ("javascript", "javascript"),
        ("  JS  ", "javascript"),
        ("Node.js", "nodejs"),
        ("nodejs", "nodejs"),
        ("Postgres", "postgresql"),
        ("PostgreSQL", "postgresql"),
        ("k8s", "kubernetes"),
        ("C Sharp", "csharp"),
        ("Data Structures & Algorithms", "dsa"),
        ("Prompt Engineering.", "prompt-engineering"),
    ],
)
def test_known_variants_resolve(variant: str, expected: str | None) -> None:
    resolved = skill_registry.resolve_skill(variant)
    assert (resolved.skill_id if resolved else None) == expected


def test_unknown_skill_is_not_guessed() -> None:
    assert skill_registry.resolve_skill("Underwater Basket Weaving") is None
    assert skill_registry.resolve_skill("") is None


def test_level_ladder_covers_every_category_and_level() -> None:
    ladder = skill_registry.load_level_ladder()

    assert set(ladder) == set(RADIX_CATEGORY_CODES)
    for code, levels in ladder.items():
        assert sorted(levels) == list(range(1, 11)), code
        assert all(topics for topics in levels.values()), code


def test_level_ladder_reads_unicode_csv_without_mojibake() -> None:
    ladder = skill_registry.load_level_ladder()

    assert "Variables and data types" in ladder[CategoryCode.COD][1]


def test_missing_ladder_file_is_reported(tmp_path) -> None:
    with pytest.raises(FileNotFoundError):
        skill_registry.load_level_ladder(tmp_path / "missing.csv")
