# RADIX Talent Match

A candidate-facing application for reviewing job requirements, turning resume content into an editable profile, checking self-reported skill levels, and comparing a profile with one job description.

RADIX Talent Match is a standalone project. It does not use the separate Bootcamp company application or its database schema.

## Project status

The five product modules and the Evidence Ledger interface are implemented. As of 2026-10-28:

- The local mock evaluator passed the official extraction thresholds: 6 of 6 job descriptions and 4 of 4 resumes.
- The two authorized official flows, Flow 1 and Flow 2, were processed through the configured external model route with per-upload consent. Both returned evidence-backed results, but neither had a confirmed required skill, so neither produced a Skill Match score.
- Supabase email/password sign-in and account creation are implemented. Live profile save/reload and cross-user RLS isolation have not been verified with signed-in accounts.
- The original official company skillset JSON was unavailable. The app uses a visibly labelled CSV-derived provisional dataset.
- Automated checks passed: 38 frontend tests, frontend typecheck and production build, backend tests and Ruff.

See [the M5 walkthrough](docs/m5_walkthrough.md) for acceptance evidence and remaining actions, and [the redesign report](docs/REDESIGN_REPORT.md) for frontend implementation details. These results do not establish that every live integration is verified.

## What the app does

1. **JD Analytics** — parses PDF and DOCX job descriptions, extracts skills with source evidence, and lets a person review each skill's requirement classification.
2. **Resume Parsing** — extracts supported resume details and skills with evidence and source locations.
3. **Profile Builder** — creates an editable profile from resume suggestions and manual input. The 12 skillset ratings are optional, self-reported values; they are never inferred from the resume.
4. **Talent Check** — compares all 12 self-reported ratings with a selected company's requirement levels and displays the score and per-skillset gaps. The score is withheld when ratings are missing.
5. **Skill Matching** — compares a profile with one JD. Approved aliases are matched automatically; fuzzy suggestions need explicit confirmation. Only confirmed required skills contribute to the score.

The app is an information and self-assessment tool. Its scores are not hiring decisions or measures of proven competence.

## Run locally

### Requirements

- Python 3.12 or later
- [uv](https://docs.astral.sh/uv/)
- Node.js 20 or later and npm

No local language model, Ollama installation, model download, provider API key, or Supabase account is required for a fresh local run. The backend defaults to the deterministic `mock` provider. Without Supabase browser settings, profiles are stored in that browser's local storage; this storage is not synced across browsers or devices.

No shell environment-variable setup is needed to start the app. In an existing checkout, ignored `.env` files may override these defaults.

### First-time setup

Open two PowerShell terminals at the project root.

**Terminal 1 — backend**

```powershell
Set-Location backend
uv sync --extra dev
uv run uvicorn app.main:app --reload
```

**Terminal 2 — frontend**

```powershell
Set-Location frontend
npm install
npm run dev
```

Open the app at [http://localhost:5173](http://localhost:5173). The backend API documentation is at [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs), and its health endpoint is [http://127.0.0.1:8000/api/v1/health](http://127.0.0.1:8000/api/v1/health).

After installing dependencies once, start the app by running only `uv run uvicorn app.main:app --reload` in `backend/` and `npm run dev` in `frontend/`.

## Optional integrations

### External model providers

External processing is disabled by default in `backend/.env.example`. To use an external provider, copy that file to `backend/.env`, configure a supported provider and its server-side credential, and enable the relevant JD or resume processing gate only after reviewing the current terms and data-retention rules for every endpoint in the route. The app still asks for consent for each external upload. Provider credentials must stay in the backend and must never be added to a `VITE_*` variable.

The supported modes are `mock`, `openrouter`, `groq`, `gemini`, `openai_compatible`, and the configured `fallback` route. The mock provider makes no network calls. There is no local LLM fallback.

### Supabase cloud profiles

Supabase is optional. Without Supabase settings, profiles use browser local storage. For cloud profile storage:

1. Use a separate Supabase project for RADIX Talent Match and enable email/password authentication and account creation.
2. Apply [`supabase/migrations/20261028090000_rtm_candidate_profiles.sql`](supabase/migrations/20261028090000_rtm_candidate_profiles.sql) to that project.
3. Put the project URL and publishable key in `frontend/.env.local` as `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, then restart Vite.
4. Sign in or create an account in the app. Confirm the email if the project requires it.

Document analysis remains available before sign-in. Cloud profile load/save requires a signed-in account. The app does not use anonymous sessions or a service-role key. Row-level security must restrict profile rows to their owner; verify this against the hosted project before relying on cloud isolation.

## API and shared contract

The FastAPI service owns parsing, evidence validation and scoring. The versioned Pydantic contract in `backend/app/contracts/v1.py` is the source of truth for the generated TypeScript API types in `frontend/src/lib/api-types.ts`.

| Endpoint | Purpose |
|---|---|
| `POST /api/v1/jds/analyze` | Parse and analyze a job description |
| `POST /api/v1/resumes/parse` | Parse a resume into evidence-backed suggestions |
| `POST /api/v1/profiles/validate` | Validate a profile against the shared contract |
| `POST /api/v1/companies/{company_id}/talent-check` | Calculate readiness and gaps for a company bar |
| `POST /api/v1/skill-matches/score` | Score a profile against reviewed JD requirements |

During development, Vite proxies `/api` requests to the backend on port 8000.

## Verify changes

Run commands from the indicated directory.

**Backend**

```powershell
Set-Location backend
uv run pytest
uv run ruff check .
```

**Frontend**

```powershell
Set-Location frontend
npm test
npm run typecheck
npm run build
```

To regenerate the committed frontend API types after a contract change, run `npm run generate:api-types` from `frontend/`. It exports the backend OpenAPI schema to an ignored generated file and updates `src/lib/api-types.ts`.

The official sample pack is local-only and gitignored. Where it is available, `uv run python scripts/evaluate_document_samples.py` from `backend/` runs the offline extraction evaluation and reports aggregate counts. The evaluator directly uses the no-network mock provider and does not send samples to external services. Synthetic fixtures are useful for tests, but they do not count toward official acceptance.

## Data and privacy

- The supplied official sample documents and their local manifest are excluded from Git. Do not commit sample files or put their contents in logs, screenshots or reports.
- The original company skillset JSON was not supplied. The current dataset is generated from the available CSV and labelled provisional in the app.
- Scanned PDFs without extractable text return an explicit OCR-required result; OCR is not currently configured.
- Uploaded files are processed for the request and are not retained as raw documents. Resume text is redacted for direct identifiers before external processing, but this does not guarantee that the remaining content is non-personal.
- Provider requests require administrator configuration and per-upload user consent. Review provider terms before sending private material.
- Browser local storage stays in that browser. Supabase cloud profiles require authentication and owner-scoped RLS.

## Project layout

```text
backend/      FastAPI service, contracts, parsing, providers, scoring and tests
frontend/     React, TypeScript and Vite application
supabase/     RADIX-specific migration and database tests
data/         Reference data and local-only sample inputs
docs/         Acceptance walkthrough and design/audit reports
references/   Source material and milestone checklist (local-only)
```

## Documentation

- [M5 acceptance walkthrough](docs/m5_walkthrough.md)
- [Evidence Ledger redesign report](docs/REDESIGN_REPORT.md)
- [Design brief](docs/DESIGN_BRIEF.md)
- [Historical UI audit](docs/AUDIT.md)
