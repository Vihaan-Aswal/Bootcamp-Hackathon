# Reference data

The `source/` folder contains two copied CSVs from the bootcamp materials:

- `staging_company_skill_levels_fixed.csv` — company skill-level rows. It is a provisional Level 2 source for the three target companies if the official `talent_check_company_skillsets.json` cannot be recovered. Some values combine a numeric level and a Bloom code; parse the numeric level and preserve the code as metadata.
- `staging_skill_topics_fixed.csv` — topic descriptions for the 12 skill categories and levels. Use it to explain the candidate’s self-reported level selection; it is not proof of proficiency.

The project’s `talent_check_company_skillsets.json` is a three-company dataset generated from the company CSV by `backend/scripts/build_company_skillsets.py`. It parses the numeric part of each value, retains the Bloom code and source text, and records the CSV’s SHA-256 in the JSON metadata. Its `source_status` is `provisional_csv_fallback`; it is not a recovered official file. Use it for v1. If the original official JSON is found later, keep it unchanged under `official/`, compare values and structure, and update the canonical JSON and app mapping if anything differs.
