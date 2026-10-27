# RADIX Talent Match

Standalone candidate-facing app for the RADIX Talent Match hackathon: analyse one job
description, build a profile from a resume plus manual edits, compare self-reported levels
with one company's 12-skillset bar, and match skills against that one JD.

This is a new project, separate from the `Bootcamp company` codebase. No application code,
database schema or secret was copied from it.

## Current state

Milestones **M1 — foundation and shared contract**, **M2 — document intelligence**,
**M3 — Profile Builder and persistence**, and **M4 — Talent Check and Skill Matching** have
local implementations. M5 integration checks and walkthrough preparation are in place. The team
has confirmed the guide, role ownership, shared contract and demo rehearsal. Official acceptance
still needs two human-reviewed JD/role flows using official JD samples. See
[`docs/m5_walkthrough.md`](docs/m5_walkthrough.md) for evidence and exact next steps.

- independent FastAPI backend and React/Vite/TypeScript frontend, both runnable;
- versioned Pydantic v2 contract (`backend/app/contracts/v1.py`) plus a flat provider DTO;
- generated frontend API types (`frontend/src/lib/api-types.ts`) from the backend OpenAPI schema;
- versioned skill registry: 12 RADIX categories, the supplied 10-level topic ladder and an
  approved skill/alias list used for deterministic matching;
- single company-data loader for the local 12-skill snapshot, with provenance and hash.
- one shared PDF/DOCX parser with page/paragraph locations, scanned-PDF OCR-required errors,
  upload/archive limits, evidence-quote verification, and guaranteed request upload cleanup;
- JD Analytics and Resume Parsing endpoints returning the shared contract with source evidence;
- a no-network local mock provider, plus single-provider OpenRouter, Groq, Gemini and
  OpenAI-compatible HTTP adapters; all model output is validated locally with Pydantic;
- a candidate screen for document uploads, evidence review and per-upload consent before external
  JD or resume processing.
- a local JD evidence-review control so a person can classify each extracted skill as required,
  preferred, mentioned or unclear before scoring;
- an editable profile form for resume suggestions, education, projects, experience, activities,
  preferred roles and all 12 optional self-reported ratings;
- JSON import/export, a local browser-storage adapter, and a browser Supabase repository protected
  by per-session row-level ownership policies.
- a Talent Check that requires all 12 self-reported ratings, shows missing ratings without a score,
  and calculates capped equal-weighted readiness with per-skillset gaps;
- deterministic JD skill matching with approved aliases, separate required/preferred/mentioned/
  unclear groups, missing requirements, and explicit confirmation for fuzzy suggestions.
- API and single-screen integration coverage across all five modules, plus labelled synthetic DOCX
  fixtures that exercise two roles and two distinct candidate results with the local mock provider.

`GET /api/v1/health` reports the implemented modules as `ready`. Official-sample parsing currently
meets the local mock thresholds (6/6 JDs and 4/4 resumes). The mock conservatively leaves
ambiguous JD requirements unconfirmed; use the visible evidence review to classify them locally.
Two official JD/role flows still need to be scored and recorded. Synthetic fixtures are a demo
fallback, not official acceptance data.
The local `prd.md` and `implementation_plan.md` hold planning details and are intentionally
excluded from Git.

```text
backend/     FastAPI service: contracts, registry, company-data loader, tests
frontend/    React/Vite/TypeScript candidate application
supabase/    App-specific migrations, local CLI config and RLS checks
data/        Reference data and local sample inputs
references/  Source PDFs and the checklist workbook (local only)
```

## Run it

Python 3.12+ and Node 20+ are required.

```powershell
# Backend, from backend/
uv venv
uv pip install -e ".[dev]"
uv run uvicorn app.main:app --reload      # http://127.0.0.1:8000/docs
uv run pytest
uv run ruff check .
uv run python scripts/evaluate_document_samples.py # Local offline acceptance check
uv run python scripts/evaluate_synthetic_demo.py   # Two-role offline demo score check

# Frontend, from frontend/
npm install
npm run dev                               # http://localhost:5173, proxies /api to the backend
npm test
npm run typecheck
npm run build
npm run generate:api-types                # re-export OpenAPI and regenerate src/lib/api-types.ts
```

`npm run generate:api-types` runs the backend export script with `uv`, writes the ignored
`frontend/openapi.json` and regenerates the committed TypeScript types.

The document endpoints are `POST /api/v1/jds/analyze` and `POST /api/v1/resumes/parse`.
`POST /api/v1/profiles/validate` validates profile saves and imports through the canonical
Pydantic v2 contract. `POST /api/v1/companies/{company_id}/talent-check` scores a validated
profile against the selected local company bar. `POST /api/v1/skill-matches/score` accepts the
validated profile, a JD Analytics result and any explicit fuzzy-match decisions.
The offline official-sample evaluator reads the ignored sample pack locally and prints only
aggregate skill-extraction counts; it never sends documents to a provider or prints sample
contents. Current mock results are 6/6 JD pairs and 4/4 resume pairs with evidence-backed skills.
Run `uv run python scripts/evaluate_synthetic_demo.py` from `backend/` for two scoreable offline
roles and two synthetic candidate profiles. These synthetic results do not count toward the
official JD/role acceptance item.

## Shared contract (v1)

`backend/app/contracts/v1.py` is the only source of truth. Boundaries are validated with
`extra="forbid"`, bounded fields, strict 1-10 levels, and a major-version check on
`schema_version` (unknown majors are rejected).

| Object | Purpose |
|---|---|
| `Skill`, `SourceRef`, `SourceElement` | Skill with verified evidence and parser-created location |
| `ExtractionResult` | JD or resume extraction, metadata and rejected claims |
| `CandidateProfile`, `SkillsetLevel` | Editable profile with 12 optional self-reported ratings |
| `CompanySkillBar`, `CompanyDataset` | One company's 12 required levels, with provenance |
| `TalentCheckResult`, `GapRow` | Readiness state, score (or withheld) and per-skill gaps |
| `SkillMatchResult`, `PossibleMatch` | Matched, missing, preferred and unconfirmed possible matches |
| `MatchConfirmation` | Candidate decision on a fuzzy match, input to scoring |

`backend/app/contracts/dto.py` holds the flat provider DTO. A model only returns quotes and
parser element ids; the backend attaches locations and builds the domain objects.

## Data

- The official `talent_check_company_skillsets.json` was not supplied. v1 uses
  `data/reference/talent_check_company_skillsets.json`, generated by
  `backend/scripts/build_company_skillsets.py` from the supplied company CSV. Its metadata
  labels it `provisional_csv_fallback`; the app shows that label. A recovered official file
  placed in `data/reference/official/` is loaded automatically and must be marked confirmed.
- `data/reference/source/staging_skill_topics_fixed.csv` provides the 10-level rating ladder
  shown next to each self-reported level. It explains a rating; it does not measure ability.
- The official six-JD/four-resume pack and `MANIFEST.local.md` are local-only and gitignored.
  Do not publish resume contents; check the selected provider's current terms before sending
  any document text to a model.

## Privacy and secrets

- Provider keys live only in `backend/.env` (`backend/.env.example` lists the variables) and
  are never exposed through `VITE_*` variables.
- `LLM_PROVIDER=mock` is the no-credential default. It performs deterministic local registry-term
  extraction and makes no network calls; it is useful for offline demos, not a substitute for a
  live model's broader extraction ability.
- `LLM_PROVIDER=fallback` optionally tries the comma-separated OpenRouter models in
  `LLM_OPENROUTER_FALLBACK_MODELS`, then `LLM_GROQ_FALLBACK_MODEL`, then the configured loopback
  model in `LLM_LOCAL_FALLBACK_MODEL`. Each model gets one attempt; the next is used only after a
  provider error, invalid structured output, or a fallback response whose claims all fail local
  evidence verification. Partial evidence failures remain visible in the review result. This does
  not detect every semantically poor extraction.
- The fallback route is shown in the upload screen. Review the terms for every external endpoint
  before enabling either external-processing flag. OpenRouter requests disable upstream provider
  fallback and require a no-training, zero-data-retention endpoint. Models with documented JSON
  Schema support use strict mode; other configured models use JSON-object mode and are validated
  locally. Incompatible free endpoints are skipped. The route can therefore fall through to Groq
  or local when no eligible OpenRouter endpoint is available. Groq's hosted GPT-OSS model may incur
  charges beyond account-specific free limits; set provider spending limits. A local fallback
  requires an already-running OpenAI-compatible server such as Ollama; Docker is not required.
- External JD and resume processing are blocked by default. After checking the current retention
  and training terms for every provider in the configured route, an administrator may separately set
  `LLM_JD_PROCESSING_ALLOWED=true` and/or `LLM_RESUME_PROCESSING_ALLOWED=true`; each upload still
  requires a separate user consent checkbox. Names, email addresses and phone patterns are
  redacted locally before resume requests. Evidence is checked against the original parser
  elements, which remain in memory only for that request.
- Provider adapters use no tools or database access and do not log document content. A fallback
  route logs only provider/model identifiers and safe error codes. Direct provider mode allows at
  most one bounded structural retry; waterfall mode tries each configured route entry once.
  Provider credentials, timeouts and missing models produce safe errors without response-body
  details.
- Groq constrained JSON Schema mode is used only for model IDs currently documented for strict
  output; other Groq models use JSON-object mode and the same local Pydantic validation.
- `frontend/.env.example` holds only the separate Supabase project's browser-safe URL and
  publishable/anon key. The service-role key is never used by this app.

## Profile storage

With both Supabase values empty, profiles stay in this browser's local storage. Use the profile
JSON export for a portable backup. When both values are configured, the browser starts a persistent
anonymous Auth session and stores profile JSON in `public.rtm_candidate_profiles`; RLS scopes every
operation to `auth.uid()`. A configured Supabase error is shown to the user and does not silently
fall back to local storage.

To enable cloud storage, create a **separate Supabase project for RADIX Talent Match**, enable
anonymous sign-ins in its Auth settings, and apply
`supabase/migrations/20261028090000_rtm_candidate_profiles.sql` through that project's SQL Editor.
Put its project URL and publishable key in `frontend/.env.local` as
`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, then restart Vite. Never add a service-role
key to the frontend. The project has not been linked to a live Supabase account in this workspace.

Hosted Supabase setup and verification do not require Docker. After configuring the project above,
verify persistence and ownership in two independent browser sessions. The repository also has an
optional local database test; that separate test requires Docker Desktop and the Supabase CLI:

```powershell
supabase start
supabase test db
supabase stop
```

The SQL test covers two anonymous owners and an unauthenticated `anon` role. This optional local
test has not run in this workspace.

## Local planning files

`prd.md`, `implementation_plan.md`, the supplied PDFs, the checklist workbook and the official
sample pack are excluded by `.gitignore` and stay local. `data/source_manifest.md` records the
hashes of the supplied materials.
