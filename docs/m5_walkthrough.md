# M5 integration status and walkthrough

## Checklist status

| Item | Status | Evidence or remaining action |
|---|---|---|
| 15 — Modules talk to each other | Done locally | `backend/tests/test_workflow_integration.py` runs JD parsing, resume parsing, profile validation, Talent Check and Skill Match back to back through the API. |
| 16 — One shared screen | Done in automated UI coverage | `frontend/src/App.test.tsx` runs the same screen through JD upload, resume merge, save, Talent Check and Skill Match for two candidate scenarios. |
| 17 — Two JD/role combinations | Pending official-sample run | Official parsing meets 6/6 JD and 4/4 resume skill-extraction counts with the mock provider. Its conservative output does not mark any official JD skills as required, so official Skill Match reports are not scorable (0/6 roles in the local check). Reproduce the aggregate-only check with `uv run --directory backend python scripts/evaluate_end_to_end_samples.py`; it exits nonzero while the two-role threshold is unmet. The synthetic fallback proves the scoring flow, but does not count for this official checklist item. |
| 18 — Bugs triaged | Done | See the priority list below. |
| 19 — Walkthrough ready | Done | The six-to-seven-minute script below is ready to rehearse. |
| 20 — Demo rehearsed | Pending human action | A person still needs to rehearse the full interactive flow once without mentor help. |

The M5 code work is in place, but items 17 and 20 remain open. No live model or resume text was
sent externally during this run. The separate Supabase project is not connected, and its RLS SQL
test could not run because the Docker engine was unavailable.

## Triage

| Priority | Finding | Disposition |
|---|---|---|
| P1 | The default mock provider leaves all extracted official JD skills as mentioned or unclear, so official roles have no scoreable required skills. | Keep the mock conservative. After checking a selected provider's current data terms, configure it and verify two official JD/role flows. Do not present synthetic scores as official results. |
| P1 | Cloud persistence and two-owner RLS isolation are not verified against a live project. | Create a separate RADIX Talent Match Supabase project, enable anonymous Auth, apply the app migration, and run the local SQL test when Docker is available. |
| P2 | Scanned PDFs do not have OCR. | Keep the explicit `OCR_REQUIRED` state and use text PDFs or DOCX in the walkthrough. |
| P2 | The original official company skillset JSON was not supplied. | Use the provisional CSV-derived three-company snapshot and keep its source warning visible. Reconcile only if the official JSON is recovered. |
| P2 | Live-provider extraction quality and current vendor terms were not checked. | Use `LLM_PROVIDER=mock` for offline work. Review the selected vendor's current terms before enabling external resume processing; the UI requires consent for each resume. |
| P3 | The demo has not been rehearsed by a person. | Rehearse the script below and then mark checklist item 20 complete. |

No other in-scope code defect surfaced in the backend, frontend, parser-sample, or lint checks run
for this milestone.

## Six-to-seven-minute walkthrough

Use the labelled fixtures under `data/samples/synthetic/` for the no-network score demo. They are
fictional examples and do not count as official-sample acceptance evidence.

1. **0:00–0:45 — Problem and outcome.** Explain that the app gives candidates evidence-backed
   resume suggestions, a transparent self-reported skillset gap, and a specific JD skill match.
   It is not a hiring verdict or a prediction of hiring success.
2. **0:45–1:30 — Architecture.** Show the React screen and FastAPI service. Point out that the
   versioned Pydantic contract connects document extraction, profile validation and the two
   scoring endpoints. The mock provider stays local and needs no credentials.
3. **1:30–2:30 — JD Analytics.** Upload `role_alpha.docx`, analyze it, and show the required
   Python/SQL evidence quotes and parser-created paragraph locations. Explain that only verified
   required skills enter the score.
4. **2:30–3:45 — Resume and profile.** Upload `candidate_alpha.docx`, merge its editable skill
   suggestions, enter the candidate's name and email, and fill all 12 ratings as explicit
   self-reports. Save the profile. Point out that the resume does not supply proficiency ratings
   and the raw upload is not retained.
5. **3:45–5:15 — Talent Check and Skill Match.** Run Talent Check for the first company shown and
   identify the provisional CSV source banner. Run Skill Match for the selected JD and review its
   matched/missing groups and evidence.
6. **5:15–6:15 — Different candidate and role.** Start a second profile with
   `candidate_beta.docx`, enter its own self-ratings, and use `role_beta.docx`. The offline
   evaluator checks both roles against both profiles and confirms the scores change by candidate.
7. **6:15–6:45 — Challenge and close.** Explain the evidence boundary: models return quotes and
   parser element IDs, while the backend verifies quotes and attaches locations. Close by naming
   the open official-provider and human-rehearsal checks from the table above.

For an official acceptance run, select at least two of the six official JDs that the configured
provider classifies with evidence-backed required skills. Use the official resume samples only
after reviewing the provider's current terms and obtaining the consent required by the app. Do not
count the synthetic walkthrough as item 17.

## Manual setup and verification

1. **Provider terms and configuration:** choose a provider whose current retention and training
   terms permit the intended document text. If needed, copy `backend/.env.example` to
   `backend/.env` without overwriting an existing file. Set `LLM_PROVIDER` to `openrouter`,
   `groq`, `gemini`, or `openai_compatible`, set `LLM_MODEL`, and fill the matching backend-only
   key (`OPENROUTER_API_KEY`, `GROQ_API_KEY`, `GOOGLE_API_KEY`, or
   `OPENAI_COMPATIBLE_API_KEY`). For `openai_compatible`, also set `LLM_BASE_URL`. Keep keys out
   of all `VITE_*` settings. Start the backend and check `GET /api/v1/health` for
   `provider.configured: true`. Set
   `LLM_RESUME_PROCESSING_ALLOWED=true` only after the terms review; candidates still need to
   consent in the resume form.
2. **Official role checks:** start the frontend, upload two official JD files, and confirm each
   produces at least one evidence-backed `required` skill. Create a test profile with manually
   entered skills and 12 explicitly self-reported ratings, or parse an official resume only after
   the required provider review and candidate consent. Save the edited profile, run Talent Check
   and Skill Match for both roles, and record the aggregate outcomes without copying resume
   contents into logs or notes.
3. **Separate Supabase setup:** create a separate project for RADIX Talent Match. In its Dashboard,
   open **Authentication → Providers** and enable anonymous sign-ins as described in the
   [Supabase anonymous sign-ins guide](https://supabase.com/docs/guides/auth/auth-anonymous).
   Anonymous Auth users access rows as the Postgres `authenticated` role, with ownership enforced
   by the profile table's `auth.uid()` RLS policies. Apply
   `supabase/migrations/20261028090000_rtm_candidate_profiles.sql` in that project's SQL Editor.
   Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `frontend/.env.local`, restart
   Vite, and verify save/load in two independent browser sessions.
4. **Local RLS test:** start Docker Desktop, then run these commands from the repository root:

   ```powershell
   npx supabase start
   npx supabase test db
   npx supabase stop
   ```

   Supabase's [`test db` command](https://supabase.com/docs/guides/local-development/cli/testing-and-linting)
   runs the SQL pgTAP tests against the local database after `supabase start`.

5. **Rehearsal:** run the interactive synthetic walkthrough from start to finish once without
   mentor help. Then repeat the official two-role flow after item 17's provider check passes.
