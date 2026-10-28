# M5 integration status and walkthrough

## Checklist status

| Item | Status | Evidence or remaining action |
|---|---|---|
| 15 — Modules talk to each other | Verified complete | `backend/tests/test_workflow_integration.py` runs JD parsing, resume parsing, profile validation, Talent Check and Skill Match through the shared contract. |
| 16 — One shared screen | Verified complete | Flow 1 and Flow 2 ran through the shared browser app. Document analysis remains available before sign-in. |
| 17 — Two JD/role combinations | Partially complete | Both authorized official flows ran with the external route and per-file consent. Neither JD had a confirmed required skill, so Skill Match returned no score. |
| 18 — Bugs triaged | Verified complete | See the priority list below. |
| 19 — Walkthrough ready | Verified complete | The script below reflects the current UI and the score state. |
| 20 — Demo rehearsed | Complete by team confirmation | The team confirmed the demo rehearsal is complete. |

The team confirmed items 1, 2, 3 and 20. The offline official-pack evaluator passed 6/6 JDs and 4/4 resumes with the no-network mock provider. Flow 1 and Flow 2 were also processed through the configured external route after per-file consent. Both produced evidence-backed results, but neither JD contained a confirmed required skill; both Skill Match responses were correctly not scorable.

The browser flow saved and reloaded profiles in browser storage for the audit, not through Supabase. All 12 ratings were completed and Talent Check displayed scores and gaps. Supabase email/password auth and sign-up are enabled; email confirmation is required. The account screen was checked in a headless browser, but no account was created or used. Cloud save/reload and hosted RLS remain unverified. Document analysis is not blocked by this sign-in requirement.

Current code verification: 38 frontend tests, typecheck, production build, backend pytest and Ruff pass. Generated frontend API types match the current backend OpenAPI schema. The original official company skillset JSON is still missing; the app labels the CSV-derived 12-skill snapshot as provisional.

## Triage

| Priority | Finding | Disposition |
|---|---|---|
| P1 | Flow 1 and Flow 2 had no confirmed required skills in the provider output, so Skill Match returned no score. | A human reviewer can classify a skill as required only when its evidence supports that label. Do not invent an official score. |
| P1 | Cloud persistence and two-owner RLS isolation have not been verified against the live project. | Create or sign into an account in the app, confirm email, save/reload a harmless profile, then test isolation with a second existing account. The audit made no account, schema or policy changes. |
| P2 | The original official company skillset JSON was not supplied. | Keep the CSV-derived source banner visible and reconcile only if the official JSON is recovered. |
| P2 | The Groq account's ZDR setting was not checked. | OpenRouter requests require ZDR and deny data-collecting endpoints. Groq may temporarily log inference content for reliability or abuse investigation unless account-level ZDR is enabled. Keep per-file consent enabled. |
| P2 | Scanned PDFs do not have OCR. | Keep the explicit `OCR_REQUIRED` result and use text PDFs or DOCX for the demo. |
| P3 | Item 4 includes a teammate-by-teammate hello-world check. | This workspace runs; the team must verify the other members' local setup separately. |

The follow-up audit added resume-suggestion merge coverage, external JD per-file consent, safe provider fallback, and normal Supabase email/password sign-in and account creation. No local LLM is required; offline extraction uses the deterministic mock provider. The official pack is local-only and gitignored. The labelled synthetic DOCX fixtures are not official acceptance data.

## Six-to-seven-minute walkthrough

Use Flow 1 and Flow 2 for the official acceptance story. A labelled synthetic fixture may be used only for an offline score demonstration and does not count as an official role/JD combination.

1. **0:00–0:45 — Problem and outcome.** Explain that the app gives candidates evidence-backed resume suggestions, a transparent self-reported skillset gap, and a specific JD skill match. It is not a hiring verdict or prediction.
2. **0:45–1:30 — Architecture.** Show the React screen and FastAPI service. Explain how the versioned Pydantic contract connects extraction, profile validation and scoring. The mock provider is local and makes no network call.
3. **1:30–2:30 — JD Analytics.** Open Flow 1. Show extracted evidence quotes and source locations; explain that each requirement label can be reviewed against its evidence.
4. **2:30–3:45 — Resume and profile.** Parse the Flow 1 resume, merge editable suggestions, fill profile fields and all 12 self-reported ratings. Explain that the resume does not set proficiency ratings and the raw upload is not retained.
5. **3:45–5:15 — Talent Check and Skill Match.** Run Talent Check and identify the provisional CSV company source. Run Skill Match. For the current output, explain that the score is not shown because no skill was confirmed as required.
6. **5:15–6:15 — Flow 2.** Repeat the extraction and review steps for Flow 2. If its evidence supports a required classification, confirm it in the UI and show the resulting score; otherwise leave it not scorable.
7. **6:15–6:45 — Challenge and close.** Explain that models return quotes and parser element IDs, while the backend verifies quotes and attaches source locations. Note that cloud profile persistence and two-owner RLS still need a signed-in test.

The online provider authorization covered Flow 1 and Flow 2 only. Do not send other supplied documents to external providers. Record aggregate outcomes only. The local official-sample evaluator uses the mock provider and sends no documents externally.

## Manual setup and verification

1. **Normal start:** use the backend and frontend commands in the root README, in separate terminals. This workspace already has ignored local provider and Supabase settings; never paste secret values into logs or frontend variables.
2. **External provider:** the authorized route is configured as OpenRouter attempts followed by Groq. Each external JD/resume upload still requires per-file consent. Offline extraction uses the no-network mock provider; there is no local LLM fallback.
3. **Supabase account:** use the app's Stage 02 email/password form to sign in or create an account, then confirm the email. This audit did not create an account or change remote schema/policies. If profile save reports a missing table, an administrator must apply `supabase/migrations/20261028090000_rtm_candidate_profiles.sql` to the RADIX project.
4. **Hosted persistence/RLS:** after signing in, save and reload a harmless profile; then use a second existing account to verify each account can access only its own rows. This hosted check does not require Docker. The optional local pgTAP test does require Docker Desktop and the Supabase CLI.
5. **Rehearsal:** the team confirmed the demo rehearsal is complete. If neither official flow has evidence supporting a required-skill label, explain why the score is not shown rather than manufacturing one.
