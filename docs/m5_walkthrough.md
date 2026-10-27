# M5 integration status and walkthrough

## Checklist status

| Item | Status | Evidence or remaining action |
|---|---|---|
| 15 — Modules talk to each other | Done locally | `backend/tests/test_workflow_integration.py` runs JD parsing, resume parsing, profile validation, Talent Check and Skill Match back to back through the API. |
| 16 — One shared screen | Done in automated UI coverage | `frontend/src/App.test.tsx` runs the same screen through JD upload, resume merge, save, Talent Check and Skill Match for two candidate scenarios. |
| 17 — Two JD/role combinations | Pending official-sample review | Official parsing meets 6/6 JD and 4/4 resume skill-extraction counts with the mock provider. Its conservative output leaves ambiguous requirements unconfirmed; review the source evidence and classify two official JDs in the local UI, then score them against reviewed profiles. The synthetic fallback proves the scoring flow, but does not count for this official checklist item. |
| 18 — Bugs triaged | Done | See the priority list below. |
| 19 — Walkthrough ready | Done | The six-to-seven-minute script below is ready to rehearse. |
| 20 — Demo rehearsed | Done by team confirmation | The team confirmed the demo rehearsal is complete. |

The team confirmed items 1, 2, 3 and 20. Item 17 remains open until two official JD/role flows are
reviewed and scored. No live model or resume text was sent externally during this run. The separate
Supabase project is not connected, so hosted persistence and RLS isolation remain unverified.

## Triage

| Priority | Finding | Disposition |
|---|---|---|
| P1 | The default mock provider leaves ambiguous official JD requirement types unconfirmed, so the automatic evaluator cannot score official roles by itself. | Review each skill's source evidence in the local UI and set the appropriate requirement type. Score at least two official JD/role flows; do not present synthetic scores as official results. |
| P1 | Cloud persistence and two-owner RLS isolation are not verified against a live project. | Create a separate RADIX Talent Match Supabase project, enable anonymous Auth, apply the app migration, and verify isolation in two browser sessions. This hosted check does not require Docker. |
| P2 | Scanned PDFs do not have OCR. | Keep the explicit `OCR_REQUIRED` state and use text PDFs or DOCX in the walkthrough. |
| P2 | The original official company skillset JSON was not supplied. | Use the provisional CSV-derived three-company snapshot and keep its source warning visible. Reconcile only if the official JSON is recovered. |
| P2 | Live-provider extraction quality and current vendor terms were not checked. | Use `LLM_PROVIDER=mock` for offline work. Review provider terms before enabling external processing; both JD and resume uploads require per-file consent. |
| P3 | Local checklist still records team-confirmed guide, role, contract and rehearsal items as pending. | Update the local checklist tracker to reflect the team's confirmation before sharing it. |

The follow-up audit found and covered two flow gaps with regression tests: reviewed resume
suggestions now merge into the shared Profile Builder draft, and external JD processing now needs
both an administrator terms-review setting and per-upload user consent. The UI also lets a reviewer
classify JD requirements from the displayed evidence. Automated checks cover these paths; official
two-role scoring and live Supabase isolation remain unverified.

## Six-to-seven-minute walkthrough

Use the labelled fixtures under `data/samples/synthetic/` for the no-network score demo. They are
fictional examples and do not count as official-sample acceptance evidence.

1. **0:00–0:45 — Problem and outcome.** Explain that the app gives candidates evidence-backed
   resume suggestions, a transparent self-reported skillset gap, and a specific JD skill match.
   It is not a hiring verdict or a prediction of hiring success.
2. **0:45–1:30 — Architecture.** Show the React screen and FastAPI service. Point out that the
   versioned Pydantic contract connects document extraction, profile validation and the two
   scoring endpoints. The mock provider stays local and needs no credentials.
3. **1:30–2:30 — JD Analytics.** Upload `role_alpha.docx`, analyze it, and show the evidence quotes
   and parser-created paragraph locations. Use the requirement selector to review each quote and
   confirm whether the skill is required, preferred, mentioned or unclear.
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
   the official two-role check and optional Supabase verification still in progress.

For an official acceptance run, select at least two of the six official JDs. Analyze them with the
local mock provider, review the evidence and choose a requirement type for each skill. Build a
candidate profile manually or parse an official resume locally with the mock provider; resume text
is not sent externally. Complete Talent Check and Skill Match for both roles and record aggregate
outcomes only. Do not count the synthetic walkthrough as item 17.

## Manual setup and verification

1. **Official role checks (offline):** start the frontend and backend in mock mode. Upload two
   official JD files, review evidence and choose the correct requirement type for each skill. Build
   a test profile manually or parse an official resume locally with the mock provider, then fill 12
   self-reported ratings. Save the profile, run Talent Check and Skill Match for both roles, and
   record aggregate outcomes without copying sample contents into logs or notes.
2. **Optional external provider:** only if broader extraction is needed, review the current terms
   for all five OpenRouter models, Groq and any local server before using this route. Put
   `OPENROUTER_API_KEY` and `GROQ_API_KEY` in `backend/.env`, set `LLM_PROVIDER=fallback`, and keep
   the ordered model list in `LLM_OPENROUTER_FALLBACK_MODELS`. A local final fallback requires an
   installed, running OpenAI-compatible model server and `LLM_LOCAL_FALLBACK_MODEL`. Keep keys out
   of all `VITE_*` settings. Set `LLM_JD_PROCESSING_ALLOWED=true` and/or
   `LLM_RESUME_PROCESSING_ALLOWED=true` only after terms review; each external upload also requires
   the user's per-file consent in the UI. Do not send supplied documents externally for this run.
3. **Separate Supabase setup:** create a separate project for RADIX Talent Match. In its Dashboard,
   open **Authentication → Providers** and enable anonymous sign-ins as described in the
   [Supabase anonymous sign-ins guide](https://supabase.com/docs/guides/auth/auth-anonymous).
   Anonymous Auth users access rows as the Postgres `authenticated` role, with ownership enforced
   by the profile table's `auth.uid()` RLS policies. Apply
   `supabase/migrations/20261028090000_rtm_candidate_profiles.sql` in that project's SQL Editor.
   Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `frontend/.env.local`, restart
   Vite, and verify save/load in two independent browser sessions.
4. **Hosted RLS verification:** open two independent browser sessions. Save a different test profile
   in each session. Confirm each session can reload and update its own profile, but cannot see or
   change the profile created in the other session. Confirm unauthenticated access is denied. This
   required hosted check does not need Docker.

   An optional local database test is also available if you want it. That separate check requires
   Docker Desktop and the Supabase CLI; it is not part of hosted-project setup:

   ```powershell
   supabase start
   supabase test db
   supabase stop
   ```

   Supabase's [`test db` command](https://supabase.com/docs/guides/local-development/cli/testing-and-linting)
   runs the SQL pgTAP tests against the local database after `supabase start`.

5. **Rehearsal:** the team confirmed the interactive demo rehearsal is complete. Repeat the
   official two-role flow after item 17 passes, then update the local checklist tracker.
