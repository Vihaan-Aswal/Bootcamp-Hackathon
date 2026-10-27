"""Build the provisional Talent Check company data from the supplied CSV.

The output is a project-specific JSON contract, not a recovered copy of the
official hackathon JSON. Its metadata records the CSV provenance explicitly.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
from pathlib import Path
from typing import Any


SKILL_COLUMNS = (
    ("COD", "Coding", "coding"),
    ("DSA", "Data Structures and Algorithms", "data_structures_and_algorithms"),
    ("OOD", "Object-Oriented Programming and Design", "object_oriented_programming_and_design"),
    ("APTI", "Aptitude and Problem Solving", "aptitude_and_problem_solving"),
    ("COMM", "Communication Skills", "communication_skills"),
    ("AI", "AI-Native Engineering", "ai_native_engineering"),
    ("CLOUD", "DevOps and Cloud", "devops_and_cloud"),
    ("SQL", "SQL and Design", "sql_and_design"),
    ("SWE", "Software Engineering", "software_engineering"),
    ("SYSD", "System Design and Architecture", "system_design_and_architecture"),
    ("NETW", "Computer Networking", "computer_networking"),
    ("OS", "Operating System", "operating_system"),
)

TARGET_COMPANIES = {
    "Google LLC (Subsidiary of Alphabet Inc.)": ("google", "Google"),
    "Microsoft Corporation": ("microsoft", "Microsoft"),
    "Oracle Financial Services Software Limited": (
        "oracle_fss",
        "Oracle Financial Services Software",
    ),
}

LEVEL_AND_BLOOM = re.compile(r"(\d+)\s*-\s*([A-Z]{2})\Z")


def build_dataset(source_csv: Path) -> dict[str, Any]:
    """Read and validate the three target-company rows from the source CSV."""
    source_bytes = source_csv.read_bytes()
    with source_csv.open("r", encoding="utf-8-sig", newline="") as source_file:
        reader = csv.DictReader(source_file)
        required_columns = {"id", "companies", *(column for _, _, column in SKILL_COLUMNS)}
        missing_columns = required_columns.difference(reader.fieldnames or ())
        if missing_columns:
            raise ValueError(f"Source CSV is missing columns: {sorted(missing_columns)}")
        rows = list(reader)

    by_name: dict[str, list[dict[str, str]]] = {}
    for row in rows:
        by_name.setdefault(row["companies"].strip(), []).append(row)

    companies: list[dict[str, Any]] = []
    for source_name, (company_id, display_name) in TARGET_COMPANIES.items():
        matching_rows = by_name.get(source_name, [])
        if len(matching_rows) != 1:
            raise ValueError(
                f"Expected exactly one CSV row for {source_name!r}; found {len(matching_rows)}"
            )

        row = matching_rows[0]
        skillsets: list[dict[str, Any]] = []
        for category_code, category_name, column in SKILL_COLUMNS:
            raw_value = row[column].strip()
            match = LEVEL_AND_BLOOM.fullmatch(raw_value)
            if not match:
                raise ValueError(
                    f"Invalid value for {source_name!r}/{column}: {raw_value!r}"
                )
            required_level = int(match.group(1))
            if not 1 <= required_level <= 10:
                raise ValueError(
                    f"Level must be 1–10 for {source_name!r}/{column}: {required_level}"
                )
            skillsets.append(
                {
                    "category_code": category_code,
                    "category_name": category_name,
                    "required_level": required_level,
                    "bloom_code": match.group(2),
                    "source_value": raw_value,
                }
            )

        if len(skillsets) != 12 or len({item["category_code"] for item in skillsets}) != 12:
            raise ValueError(f"Expected 12 unique categories for {source_name!r}")

        companies.append(
            {
                "company_id": company_id,
                "display_name": display_name,
                "source_company_id": int(row["id"]),
                "source_company_name": source_name,
                "skillsets": skillsets,
            }
        )

    return {
        "schema_version": "1.0.0",
        "dataset": {
            "source_status": "provisional_csv_fallback",
            "official_json_confirmed": False,
            "source_file": "data/reference/source/staging_company_skill_levels_fixed.csv",
            "source_sha256": hashlib.sha256(source_bytes).hexdigest().upper(),
            "source_company_count": len(rows),
            "included_target_company_count": len(companies),
            "note": (
                "Generated from the supplied Level 2 CSV by parsing the numeric level "
                "and preserving the Bloom code. This is not a recovered copy of the "
                "official hackathon JSON."
            ),
        },
        "companies": companies,
    }


def main() -> None:
    project_root = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input",
        type=Path,
        default=project_root / "data/reference/source/staging_company_skill_levels_fixed.csv",
        help="Source CSV (defaults to the copied bootcamp file).",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=project_root / "data/reference/talent_check_company_skillsets.json",
        help="Output JSON path (defaults to the project reference-data folder).",
    )
    args = parser.parse_args()

    dataset = build_dataset(args.input)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(dataset, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(
        f"Wrote {args.output}: {len(dataset['companies'])} companies, "
        f"{sum(len(company['skillsets']) for company in dataset['companies'])} skillsets; "
        "status=provisional_csv_fallback"
    )


if __name__ == "__main__":
    main()
