# RADIX Talent Match — UI/UX Audit

**Date:** 2026-10-28  
**Commit under audit:** `9daaf35` (branch `master`, before redesign branch)  
**Scope:** `frontend/` only. Backend, API contract, scoring logic and profile storage untouched.  
**Method:** full read of `src/App.tsx`, `src/DocumentIntelligence.tsx`, `src/ProfileBuilder.tsx`, `src/TalentCheckPanel.tsx`, `src/SkillMatchPanel.tsx`, `src/SupabaseSignIn.tsx`, `src/styles.css`, `src/profile-builder.css`, all tests and `index.html`; baseline runs of `npm run typecheck`, `npm test`, `npm run build`; full-page screenshots at 390 px, 834 px and 1440 px via Playwright (Chrome), plus DOM/ARIA inspection.

**Baseline checks**

| Check | Result |
|---|---|
| `npm run typecheck` | Pass, exit 0 |
| Frontend linter | None configured (only backend `ruff`; no frontend lint script or config) |
| `npm test` (`vitest run`) | Pass — 7 files, 34 tests, 18.7 s |
| `npm run build` | Pass — 77 modules, JS 481.19 kB (gzip 136.39 kB), CSS 10.25 kB (gzip 2.66 kB) |
| Rendered page height | 6,545 px at 1440 px wide; 9,909 px at 390 px wide |

The app works. Every finding below is about whether a candidate can see what to do next, understand why a number exists, and trust the result — not about broken logic.

---

## A. UX and flows

### A1 — The product has no visible journey, only a stack of panels
**Severity: High** · `App.tsx` render order; all five panels
The intended journey is sequential (read a JD → review a resume → build profile → check a company bar → match the JD), but the page renders five equally weighted panels in one column. On a 1440 px screen the Talent Check score begins around 5,300 px down; on a phone the page is 9,909 px tall. There is no navigation, no step numbering and no summary of what has been completed. A first-time candidate sees an upload form, then an account form, then an enormous profile form, and may never reach the two scoring modules that are the point of the product.
**Fix:** a persistent stage rail (desktop) / sticky step bar (mobile) with four numbered anchors — Document, Profile, Talent Check, Skill Match — plus a Reference appendix. Each stage gets a numbered header, one-sentence purpose and status. Scroll-spy marks the current stage.

### A2 — Sign-in is the second thing a new user sees
**Severity: High** · `App.tsx` lines 240–252
The Supabase prompt and full sign-in form sit immediately after the upload panel, before Profile Builder. The copy says analysis works without signing in, but the layout says the opposite: a large account form occupies the prime second screen. Sign-in is only needed to save cloud profiles.
**Fix:** move the auth prompt into the Profile stage, directly above the form, framed as optional ("Save this profile to your account"). Keep the promise copy and the existing form component.

### A3 — The profile form is a 4,000 px wall
**Severity: High** · `ProfileBuilder.tsx` lines 423–847
Twelve self-rating rows, seven collection editors, resume upload and basic details all render open at once. Each rating row is ~150 px tall at desktop and stacks to three fields plus a level guide at mobile. "Save profile" is only at the very bottom, with no dirty state, so a candidate who edits one field must scroll thousands of pixels to commit, and cannot tell whether their change is saved.
**Fix:** (a) compact rating sheet with the select, optional note only when rated, current-level topic hint and the ladder in a disclosure; (b) progressive disclosure for empty optional collections (Education, Projects, Experience, Hackathons, Internships, Certifications, Preferred roles) with count in the summary; (c) a sticky save bar showing dirty state and the "all 12 ratings needed for Talent Check" rule; (d) "8 of 12 rated" progress.

### A4 — Disabled scoring buttons do not say what is missing
**Severity: High** · `TalentCheckPanel.tsx` lines 201–208; `SkillMatchPanel.tsx` lines 219–234
"Run Talent Check" disables when there is no profile or company bar; "Run Skill Match" disables when there is no JD. The only explanation is a small muted sentence below the controls, visually detached from the button, and nothing for the company-bar loading case. Dead controls without a reason are the most common demo failure in a booth setting.
**Fix:** a prerequisite line directly under each control group that names the missing inputs and links to the stage that supplies them. Keep the button disabled, add `aria-describedby`.

### A5 — Two resume entry points with different outcomes
**Severity: Medium** · `DocumentIntelligence.tsx` (Resume tab) vs `ProfileBuilder.tsx` (Resume fieldset)
One flow parses a resume into suggestions the candidate must accept; the other parses and merges immediately into the draft. The labels ("Resume suggestions", "Parse resume", "Parse and merge suggestions") do not make the difference obvious, so users can reasonably expect the same result from both.
**Fix:** label by outcome — "Review resume suggestions" in Document intelligence and "Update this profile from a resume" in Profile Builder — and add one line explaining that the review path lets you accept facts one by one.

### A6 — Technical plumbing is rendered as primary content
**Severity: Medium** · `App.tsx` header line 214; `DocumentIntelligence.tsx` lines 483–487; `ProfileBuilder.tsx` lines 568–572
The header exposes "M3 profile builder · M4 scoring · contract v1.0.0, skill registry v1.0.0". The provider fallback chain prints six `provider/model:free` identifiers separated by arrows and wraps mid-token at mobile. "M3"/"M4" badges repeat on panels. This is build metadata, not candidate information.
**Fix:** move milestone/contract text to a System appendix; collapse the processing route into a disclosure labelled "Processing route" with one line per provider; replace M3/M4 panel badges with meaningful status.

### A7 — Results appear without a change of focus or a "what changed" summary
**Severity: Medium** · `TalentCheckPanel.tsx` 223; `SkillMatchPanel.tsx` 237
Results render far below the controls. `aria-live` announces them but sighted users get no anchor, and when a fuzzy decision is recalculated the score changes silently in place. There is no timestamp or "for Profile X against Company Y" line, which matters when demonstrating two candidates.
**Fix:** each result gets a header stating profile, company/JD and run time; after a run, focus moves to the result heading (programmatic, not scroll-jacking), and the score delta is visible in the result itself.

### A8 — Foundation loading and backend failure are undesigned endpoints
**Severity: Medium** · `App.tsx` lines 184–203
Loading is a bare `h1` and "Loading foundation data…"; failure is the same bare heading plus a red sentence telling the user to run a terminal command. Both are real first impressions during a demo.
**Fix:** branded loading shell with skeleton structure and a status line; error page with the same shell, a plain explanation, the exact command in a copyable code block, and a Retry button.

### A9 — New profile and delete are destructive without confirmation
**Severity: High (data loss)** · `ProfileBuilder.tsx` lines 279–287, 359–377, 456, 481–485
"New profile" immediately replaces the draft; "Delete profile" immediately deletes the saved record. Neither asks, and there is no dirty-state warning.
**Fix:** two-step inline confirmation for delete; "New profile" warns only when the draft has unsaved changes. No new modal library.

### A10 — Duplicate profile selectors and no shared working context
**Severity: Low** · `TalentCheckPanel.tsx` 170–185; `SkillMatchPanel.tsx` 203–218
Both panels repeat the same "Saved profile" select. They stay in sync through `selectedProfileId`, but a user cannot see which profile is active without scrolling to a panel.
**Fix:** show the active profile in the stage rail status ("Ada Lovelace · saved") and label both selects "Working profile" for consistency. State flow unchanged.

### A11 — Success and error messages collide with the form
**Severity: Low** · `ProfileBuilder.tsx` 496–497
Alerts render in normal flow between the toolbar and the form; a validation error at the top of a 4,000 px form can be off-screen when the user submits from the bottom. Errors are not linked to fields.
**Fix:** put save feedback in the sticky save bar (visible where the action is), focus the first invalid field, and set `aria-invalid` on it.

---

## B. Visual system and consistency

### B1 — No design tokens; the palette is hard-coded in two files
**Severity: High** · `styles.css`, `profile-builder.css`
There are ~60 hex literals. Near-identical greys coexist (`#55554f`, `#5c5c56`, `#393a34`, `#292d24`, `#6a6a62`), the same border is `#deded6`, `#dedeD6`, `#e2e2dc`, `#e4e4dd`, and primary black is both `#292d24` and `#2b3025`. Any future change means hunting literals, and contrast cannot be reasoned about centrally.
**Fix:** one `:root` token layer for colour, type, spacing, radius, shadow, motion. No component-level hex values.

### B2 — Uniform white cards flatten the hierarchy
**Severity: High** · `.document-panel`, `.profile-builder`, `.auth-panel`, `.profile-fieldset`
Upload, the entire profile form, scoring panels and the auth form are all white 0.75 rem-radius cards with the same faint shadow. The eye has no reason to stop at the JD upload or the score. Nested cards (fieldset inside panel, item card inside fieldset) add three levels of the same surface.
**Fix:** a paper workspace with ruled sections; panels only for interactive blocks; one strong surface for results; no card-inside-card-inside-card.

### B3 — Typography is one system font and one heading style
**Severity: High** · `styles.css` 1–37, `profile-builder.css`
`system-ui` at 1.5 line-height everywhere; every section heading is 1.05 rem uppercase with 0.08 em tracking, so "DOCUMENT INTELLIGENCE", "PROFILE BUILDER" and "THE 12 SKILLSETS" have identical weight. The 92% score is only 1.5 rem. Numbers that matter (scores, levels, counts) are not tabular.
**Fix:** a display serif for the product and scores, a grotesque for UI, a mono for codes and source refs; a real type scale; tabular numerals for every score/level; overlines reserved for metadata, not for every h2.

### B4 — One pill shape carries four meanings
**Severity: Medium** · `.badge`, `.badge-ready`, `.profile-storage-badge`, `.profile-origin`, `.chips li`
Status, category code, milestone, storage mode and evidence origin are all rounded pills with the same padding. A "COD" category and a "ready" module read as the same kind of object.
**Fix:** distinct primitives: status dot + text, monospace code chip, storage note, origin label. Reserve the filled pill for a single semantic role (status).

### B5 — Spacing is ad hoc
**Severity: Medium** · both stylesheets
Values include 0.15, 0.2, 0.25, 0.3, 0.4, 0.45, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 1.1, 1.25, 1.5, 2.25, 2.5 rem. Vertical rhythm changes every few elements, which reads as "unfinished" even when each gap is acceptable in isolation.
**Fix:** 4 px scale (`--space-1` … `--space-16`) used for every margin, padding and gap.

### B6 — Declared dark mode is not implemented
**Severity: Medium** · `styles.css` line 2
`color-scheme: light dark` tells the browser to render dark native controls while the app stays light. On a dark-OS machine, form controls, scrollbars and select popups mismatch the paper surface, and text inside native selects can become unreadable.
**Fix:** commit to the light dossier (`color-scheme: light`) because the product is used on shared laptops and projectors where a light surface reads better, and dark mode would need a full second contrast pass. State the decision in the brief.

### B7 — Interactive states are nearly absent
**Severity: High** · global `button`, inputs, selects
There is no `:hover`, no custom `:focus-visible`, no `:active`, and disabled is opacity 0.55. Keyboard focus is whatever Chrome draws on a borderless white control. A mouse user cannot tell a button is clickable; a keyboard user loses their place in a 9,000 px form.
**Fix:** designed hover/active/disabled/focus states for every control; a 2 px accent focus ring with 2 px offset; never remove focus without replacement.

### B8 — Button hierarchy does not exist
**Severity: Medium** · all panels
Every button is the same white, 1 px-border, 0.45 rem-radius rectangle. Primary actions are patched to dark per panel (`.upload-form > button`, `.auth-form button`, `.m4-controls > button`, `.profile-form button[type=submit]`) with three different near-blacks. Destructive actions are neutral buttons with red text.
**Fix:** primary (ink fill), secondary (outline), ghost (text), danger (red text, red hover surface) variants, using the same tokens everywhere.

### B9 — Shared field styling is duplicated and drifts
**Severity: Medium** · `styles.css` 355–365; `profile-builder.css` 159–171
Inputs and textareas are defined twice with different radius (0.4 rem) and select styling is defined a third time in `.m4-controls`. File inputs are a fourth style.
**Fix:** one field recipe applied through shared classes; all inputs, selects, textareas and file inputs share border, radius, height and focus.

### B10 — The 64 rem max width wastes the workbench
**Severity: Medium** · `.app`
At 1440 px the content occupies 1024 px and sits centred with wide empty margins. A three-zone workbench can use 1200–1280 px without long line lengths because the reading column stays ~720 px.
**Fix:** 1280 px shell with a 248 px rail and a ~760 px main column; the appendix may use the full width.

### B11 — No favicon and a bare document head
**Severity: Low** · `index.html`
No icon, no description, no theme colour. Browser tabs in a demo show a generic page.
**Fix:** SVG monogram favicon, meta description, theme colour matching paper.

### B12 — Tables are the only data visualisation
**Severity: Medium** · `.m4-table`, `.readiness-score`
A 92% score and 12 gaps are rendered as a plain table and a bold number. The score is the emotional centre of the product and currently looks like a debug readout. Bars, gap marks and comparison ticks would make the pattern visible before reading numbers.
**Fix:** score presented as a large tabular numeral with a coverage bar; each gap row gets a two-track level meter (company bar vs self-report) while keeping the accessible table.

---

## C. States, content and accessibility

### C1 — Mobile tables force sideways scrolling
**Severity: High** · `styles.css` 529–533
`.m4-table { min-width: 38rem }` inside `.table-scroll` means the gap table is 608 px wide in a 390 px viewport. The candidate column and gap result — the reason for the screen — are off-screen, and horizontal scroll inside a page is easy to miss.
**Fix:** stacked row layout under 720 px with explicit labels; no horizontal scrolling for primary data.

### C2 — Touch targets are below 44 px
**Severity: High** · `.mode-tabs button`, `.profile-remove-button`, checkboxes, `.auth-mode-toggle`
Tab buttons are ~38 px tall, remove buttons ~34 px, native checkboxes 13 px with a text label. On a phone, these are error-prone, especially "Remove" next to "Accept".
**Fix:** 44 px minimum for standalone controls; 40 px for dense row actions with 8 px separation; 20 px checkbox with a 44 px label hit area.

### C3 — Repetitive controls have non-specific accessible names
**Severity: High** · `ProfileBuilder.tsx` (multiple `Remove`), `DocumentIntelligence.tsx` (multiple `Remove`), `CollectionEditor`
A screen-reader user hears "Remove, button" dozens of times. Context is only available by browsing the surrounding group.
**Fix:** "Remove skill 1", "Remove education Example University", "Remove project Talent Match", etc. Keep the visible label "Remove" and add `aria-label`. Tests that query by exact "Remove" need deliberate updates.

### C4 — Tab semantics are incomplete and keyboard-inert
**Severity: Medium** · `DocumentIntelligence.tsx` 489–506
`role="tablist"` with `role="tab"` buttons but no `tabpanel`, no `aria-controls`, no roving tabindex, no Arrow/Home/End handling. Screen readers announce a tab interface that does not behave like one.
**Fix:** proper tablist with `aria-controls`, one tabpanel wrapping the form and results, roving tabindex, ArrowLeft/Right/Home/End. Preserve visible labels so existing tests keep working.

### C5 — The entire result region is an `aria-live` region
**Severity: Medium** · `TalentCheckPanel.tsx` 36; `SkillMatchPanel.tsx` 73
`aria-live="polite"` wraps the score, a paragraph and a 12-row table. On recalculation a screen reader may announce the whole table. Important changes are not isolated.
**Fix:** keep the score summary in `role="status"`; the table stays static; move focus to the result heading after a run so both keyboard and screen-reader users land in the result.

### C6 — Disabled states and validation are visual-only
**Severity: Medium** · `ProfileBuilder.tsx` 306–356; all disabled buttons
Validation errors appear as one alert; fields are not marked `aria-invalid`, have no inline message and are not focused. Disabled buttons have no `aria-describedby` explaining why.
**Fix:** validate, set `aria-invalid` and `aria-describedby`, focus the first invalid field; prerequisite text for disabled actions.

### C7 — Empty states do not offer the next action
**Severity: Medium** · Profile collections, Talent Check, Skill Match
Examples: "No education entries added.", "Create and save a profile…", "Analyze a job description above…". They state absence but are visually indistinct from normal text and offer no control.
**Fix:** an empty-state block with a one-line explanation and a direct action (anchor or existing button) — "Add education", "Go to Profile Builder", "Read a job description".

### C8 — Errors expose internals and vary in tone
**Severity: Medium** · `api.ts`, `TalentCheckPanel.tsx`, `SkillMatchPanel.tsx`, `ProfileBuilder.tsx`
Messages mix user language with HTTP codes, table names, "Pydantic", "row-level ownership rules" and "profile-table RLS policies". Some are actionable; others are implementation notes. Tests depend on a few strings, so this needs careful editing.
**Fix:** keep the underlying detail (so support is possible) but lead with what happened and what to do; put technical detail in a secondary line. Do not hide the backend-down command, which is genuinely the fix.

### C9 — Small text below a comfortable reading size
**Severity: Medium** · `.muted` 0.85 rem, `.badge` 0.7 rem, table 0.88 rem, `.profile-field` 0.85 rem
At default zoom much of the UI is 11–14 px. Combined with 9,000 px of scrolling, it is tiring on a laptop at a demo table.
**Fix:** 14 px minimum for secondary text, 16 px body, 12 px only for overlines/codes; increase table size to 14 px and give rows more height.

### C10 — Contrast and colour reliance
**Severity: Medium** · `.gap-row`, `.badge-ready`, `.profile-success`, `.notice`
The existing palette mostly passes for text (muted grey ~6.5:1, badge grey ~6.3:1), but gaps are conveyed mainly by a pale yellow row background, module status by a green pill, and errors by a red left border. Several 0.7–0.75 rem labels sit at the edge of comfortable contrast. Disabled opacity 0.55 can fall below 4.5:1. Colour is carrying meaning alone.
**Fix:** every status gets text and an icon/shape, not only colour; re-check all pairs against the new tokens; do not reduce text opacity for disabled (use a neutral surface and keep label readable).

### C11 — Long strings overflow or break ugly
**Severity: Low** · `.provider-route` 100–103, selects, profile name
`overflow-wrap: anywhere` breaks model IDs mid-word; long profile names overflow selects (native truncation is inconsistent); the data hash is truncated with an ellipsis which is fine.
**Fix:** provider route as a list with monospace and wrapping at separators; profile select has a `title`; evidence/source refs use `overflow-wrap: anywhere` only where appropriate.

### C12 — No skip link, rail, or labelled navigation
**Severity: Medium** · `App.tsx`
The page has one `main` landmark and no navigation. Keyboard users tab through 60+ controls to reach Talent Check. There is no skip target for the scoring stages.
**Fix:** skip link to `#main`, labelled stage navigation with anchor links, and each stage as a labelled `section`.

### C13 — Reduced motion is not considered
**Severity: Low** · new motion
No motion exists today, so nothing is broken; the redesign adds bar growth and fade/slide reveals, which must be disabled under `prefers-reduced-motion: reduce`.
**Fix:** `@media (prefers-reduced-motion: reduce)` zeroes durations and removes transforms; no scroll-behavior smooth.

### C14 — Content voice is inconsistent
**Severity: Medium** · across panels
"Candidate", "user", "you" and the imperative alternate; "Readiness" is never defined in the place it appears; "Bloom context" is unexplained; "not assessed" and "Not rated" describe the same state. The privacy copy is strong and specific and should be kept.
**Fix:** one voice: second person, plain verbs, one term per concept. Define readiness and Bloom once, in place, with the appendix as reference. Keep all privacy promises verbatim in meaning.

### C15 — No first-use guidance for the 12 ratings
**Severity: Medium** · `ProfileBuilder.tsx` rating fieldset
The most consequential input in the product (self-ratings that drive both scores) has a one-line explanation and 12 identical rows. First-time users do not know what "level 1 vs level 10" means without opening 12 separate disclosures.
**Fix:** show the topic hint for the currently selected level, a compact "how to rate" note, and average/coverage feedback ("8 of 12 rated · Talent Check needs all 12"). No change to what is stored.

---

## Quick wins (low risk, high visible return)

1. Token layer; delete every hard-coded hex from components.
2. Visible `:focus-visible` ring on every control; skip link.
3. Numbered stage rail with anchors and scroll-spy.
4. Move auth prompt into the Profile stage and shrink it.
5. Collapse the provider route into a disclosure.
6. Replace "M3/M4" panel badges; move the milestone line to an appendix.
7. Compact rating rows and show the selected level's topics.
8. Sticky save bar with dirty state.
9. Responsive gap rows instead of a 38 rem table.
10. Confirm delete; warn on discarding a dirty draft.
11. Empty states with an action.
12. Prerequisite copy next to disabled scoring buttons.

## Bigger opportunities

- **A single "evidence ledger" design language** for JD review, resume review, matched skills and gap rows. Every claim keeps its quote, source and classification; the visual system should make that promise legible rather than hiding it in small grey text.
- **A score that explains itself:** large numeral, coverage bar, met/partial/missing counts, and the formula in plain words near the number.
- **Progressive depth:** the default view shows what a candidate must decide; technical provenance (contract version, hashes, parser locations, Bloom codes) lives one level down but is never fabricated.
- **Demo mode clarity:** when showing two candidates, the active profile, JD and company should be visible in a persistent context strip so the audience can follow which comparison is on screen.

---

## What already works and should be kept

- The privacy and consent model: explicit external-processing consent, redaction notice, "raw uploads are not saved", storage-mode badge and RLS copy. Preserve wording and behaviour.
- Evidence-first results: every skill carries a quote and a parser location. This is the product's trust anchor; the redesign should make it more prominent, not prettier at its expense.
- Transparent scoring: readiness formula explained, no ready/not-ready verdict, incomplete state withholds the score, missing ratings never coerced to zero.
- Module independence: each panel works on its own, and the shared `selectedProfileId` keeps the flow connected.
- The existing accessible names are largely good; where they are not (repeated "Remove"), fix them deliberately and update tests.
