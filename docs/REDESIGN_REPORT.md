# Redesign report — Evidence Ledger

Branch `design/evidence-ledger`. Design rationale, rejected directions and the critic log are in
[`DESIGN_BRIEF.md`](./DESIGN_BRIEF.md). Baseline findings are in [`AUDIT.md`](./AUDIT.md).

## What changed

- New paper-and-ink visual system, self-hosted Fraunces / IBM Plex Sans, stage rail with scroll-spy,
  ledger rows, score stamp, coverage meter, honest empty/loading/error states.
- No data-flow, API, routing, storage or scoring changes. Seven deliberate behavior-adjacent changes are
  recorded in DESIGN_BRIEF §5 (delete confirmation, discard warnings, auth-gated save, manual tab
  activation, focus after scoring, validation focus, scroll-spy/nav fix).
- Dependencies added: `@fontsource-variable/fraunces`, `@fontsource/ibm-plex-sans`. No other packages.

## Baseline vs final

| Measure | Baseline | Final |
|---|---|---|
| `npm run typecheck` | pass | pass |
| Tests | 7 files / 34 tests | 7 files / 38 tests |
| Build JS | 481.19 kB · 136.39 kB gzip | 492.10 kB · 139.41 kB gzip |
| Build CSS | 10.25 kB · 2.66 kB gzip | 42.26 kB · 8.18 kB gzip |
| Empty page height, 1440 px | 6,545 px | 5,812 px |
| Empty page height, 390 px | 9,909 px | 7,101 px |

CSS growth is the design system plus `@font-face` rules; fonts are emitted as separate assets, not in
the JS. A first load requests about 108 kB of latin woff2 (Fraunces 36.6 kB + three Plex weights).

A populated run (saved profile with 11 skills and 12 ratings, analyzed 13-skill JD) renders 16,349 px
at 1440, 16,515 px at 834 and 21,000 px at 390. The profile stage alone is 7,693 px; that total is not
comparable with the empty baseline. The rail makes each stage one tap away; background collections are
collapsed to summaries and rating guides stay closed.

## Phase 5 evidence

Captured and viewed in Chrome at 390, 834 and 1440 px: every stage, full pages, hover, focus,
keyboard focus, validation error, delete confirmation, with-held and 75% Skill Match states, and the
fresh empty state. Automated checks on the final build:

- 881 text nodes checked; no contrast failures, no text below 12 px, no unnamed controls.
- No horizontal overflow at 390 px or 320 px.
- 110 tab stops, every one with a visible ≥2 px focus ring.
- Document tabs: ArrowRight moves focus without activating; Enter activates.
- Stage scroll-spy marks the visible stage; active mobile tab is scrolled into view.
- Zero console errors during the full flow.

Screenshots were captured to a temporary directory and are not committed.

## Post-redesign integration audit

The follow-up product audit changed Supabase access from anonymous sessions to ordinary
email/password sign-in and account creation. The account panel sits in Stage 02; document analysis
remains usable before sign-in, while saving a profile requires a confirmed account. The connected
project reports email sign-up enabled and email confirmation required. The account flow was checked
in the headless browser, but no real account was created or used, so cloud persistence and hosted
two-owner RLS remain unverified.

Offline official-pack parsing with the local mock provider passed 6/6 JDs and 4/4 resumes. The two
authorized external flows are recorded as Flow 1 and Flow 2. Both returned evidence-backed results,
but neither JD had a confirmed required skill and neither produced a Skill Match score. A human
reviewer must confirm requirement labels only where the displayed evidence supports them. The
original official company JSON is still unavailable; the app shows the CSV-derived snapshot as
provisional.

The current branch verification passes 38 frontend tests, frontend typecheck and production build.
Backend tests and Ruff pass. Generated frontend types match the current backend OpenAPI schema.

## Residual gaps

- No frontend linter is configured; `tsc --noEmit` is the static check.
- Dark mode is out of scope; the page declares `color-scheme: light`.
- A loaded profile is long by nature (27 editable rows). Collapsing notes or skills further would hide
  data entry that exists today; the stage rail is the current mitigation.
- jsdom tests do not cover the IntersectionObserver scroll-spy; it was verified in the browser run.
- Live Supabase save/reload, email confirmation and cross-owner RLS still need a signed-in test.
- The two official live model outputs are not scorable until required-skill classifications are
  reviewed against their evidence.
