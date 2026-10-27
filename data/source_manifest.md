# Data and source manifest

This manifest lists the supplied materials now included in the project and the remaining data gap. Files are copied unchanged. SHA-256 values verify the shared source copies.

## Requirements and milestone materials

| Project path | Purpose | SHA-256 |
|---|---|---|
| `references/requirements/RADIX_Talent_Match_Hackathon_Brief.pdf` | Participant brief and product requirements. | `7FE59F3876FD0502DC8611EC28E18FA084880E2BF3C8D37A4E7C056E9C85B7FE` |
| `references/requirements/TGL_Blitz_Event_Plan.pdf` | Event plan and team expectations. | `4F10D78BE3B0620541FD076E09407E2030DBE4819DB03DAF68EB738CAD557ECE` |
| `references/milestones/RADIX_Talent_Match_Milestone_Checklist.xlsx` | Official 20-item tracker; use its milestone wording and status fields. | `11F973DD5F5C6F9FE2E6C13CB371A044F5A7B0DEC81B7E9A83E7233F8D9B4C13` |

## Reference data

| Project path | Purpose | SHA-256 |
|---|---|---|
| `data/reference/source/staging_company_skill_levels_fixed.csv` | Provisional company-skill fallback, not confirmed as the official JSON. | `A531A188DC2EC1373E986D778F74F868B6CC0A30FAA69A85328CBB9BA3A97E1E` |
| `data/reference/source/staging_skill_topics_fixed.csv` | Descriptions for the 12 skill categories and their levels. | `530219FD1AC1DFCF350A4844697183910F5BA411C1697B68C3AC08D9C17E8A0D` |
| `data/reference/talent_check_company_skillsets.json` | Project-format fallback for the three target companies; generated from the CSV and explicitly marked unconfirmed. | `63075BAB652A31B4234D1F2EDDFFCBACF97C70BFE8ADC826080AA1E3CE7858B4` |
| `backend/scripts/build_company_skillsets.py` | Reproducible standard-library converter for the provisional JSON. | — |

## Official parser samples

The official pack is copied to `data/samples/official/`: six JDs in both PDF and DOCX (12 files total) and four resumes in both PDF and DOCX (8 files total). The local-only `data/samples/official/MANIFEST.local.md` records each exact filename, format, byte size and SHA-256. It is ignored by Git along with the resume files to avoid publishing candidate names or resume contents accidentally.

## Still needed or to confirm

- The original official `talent_check_company_skillsets.json` was not in the supplied folder. Use the generated file at `data/reference/talent_check_company_skillsets.json` for v1. If the original is recovered later, place it unchanged in `data/reference/official/`, compare values and structure, and update the canonical data, mapping and provenance notes if they differ. This does not block implementation.
- The checklist says “Candidate Guide”; the supplied RADIX participant brief and TGL plan are present, but there was no separate file named Candidate Guide in the supplied folder. If it is a separate document, add it to `references/requirements/` and record its hash here.
