# RADIX Talent Match — Design Brief

**Status:** Approved for build (Phase 3)  
**Author:** Design lead  
**Date:** 2026-10-28  
**Branch:** `design/evidence-ledger`  
**Inputs:** `docs/AUDIT.md`, full code read, baseline screenshots, `prd.md`, the candidate-facing hackathon context.  
**Scope:** the frontend UI/UX. Backend, contract, scoring, persistence and API calls are frozen.

---

## 1. What this app is, and who is looking at it

RADIX Talent Match is a **candidate-side assessment workbench**. A candidate reads one job description, turns a resume and their own edits into a profile, rates themselves 1–10 on twelve RADIX skillsets, compares that against one company's required bar, and sees which required skills match one specific JD.

The people using it:

- **Candidates (students, early-career applicants)** in a hackathon or placement-cell setting. They are not recruiting professionals. They are anxious about being judged, sceptical of black-box scores, and often using a shared laptop or a phone.
- **The hackathon team**, demonstrating five modules live to judges. They need the next action to be obvious under time pressure and the evidence for every claim to be on screen.
- **Facilitators/placement staff** who may open the same screen with a candidate and ask "why does it say that?".

The context is a **bright, noisy room**, often on a projector, often with someone watching over a shoulder, sometimes on a phone at 390 px. The emotional tone should be **calm, exact and non-judgemental**. This app is explicitly *not* a hiring verdict; the interface must not use the visual language of certainty (no pass/fail stamps, no celebratory confetti, no gamified scores).

The core trust promise: **every extracted claim keeps its quote and its source location, and every score explains its formula.** The design must make that promise visible, not bury it in 11 px grey text.

### Constraints

- React 19 + TypeScript + Vite + Vitest + RTL. No router, no CSS framework, no component library.
- Behaviour, data flow, API calls, state ownership and accessible names stay the same unless a UX improvement justifies a deliberate, reported change.
- The page remains one screen with all five modules usable independently.
- Privacy copy and consent behaviour are part of the product, not decoration.
- Light-only decision, explained in §9.
- No new backend assumptions. Provider route, provisional dataset and missing-rating behaviour must be shown honestly.

### Jobs to be done, in order

1. **"Is this role worth my time?"** — read a JD, see what it actually requires and the evidence for each requirement.
2. **"What do I have?"** — get a resume into the profile without surrendering control of the facts.
3. **"How do I rate myself?"** — make twelve honest, guided self-ratings that can drive a comparison.
4. **"Where do I stand against this company?"** — a legible score, the gaps, and the reason.
5. **"Do I match this specific job?"** — matched vs missing, separated from preferred and unclear.
6. **"Can I keep this / show someone?"** — save, export, reload; know where the data lives.

---

## 2. The audit, distilled

The full findings are in `docs/AUDIT.md`. Six drive the design:

1. **No journey.** Five equal panels in a 6,545 px desktop / 9,909 px phone column. The scoring modules — the point of the product — are below the fold. → persistent stage rail, numbered stages, anchors, scroll-spy.
2. **Sign-in is in the way.** A large account form is the second thing a new user sees, despite analysis not requiring it. → move optional auth into the Profile stage.
3. **The profile is a wall.** Twelve 150 px rating rows, seven open empty editors, save only at the bottom, no dirty state. → compact rating sheet, collapsible background sections, sticky save bar with coverage and dirty state.
4. **Dead buttons have no reason.** Run Talent Check / Run Skill Match disable silently. → prerequisite lines with anchors.
5. **Everything looks the same.** One white card, one system font, one pill shape, no focus/hover states, 60 hard-coded colours. → tokens, an evidence-ledger visual language, real control states.
6. **Evidence is beautiful but hidden.** Quotes are small grey blockquotes below forms. → the ledger row is the signature component; quotes, source refs and classification are first-class.

---

## 3. Four directions (genuinely different, not four palettes)

### Direction A — **Evidence Ledger** *(chosen)*

| | |
|---|---|
| **Palette** | Paper `#F1EDE4`, surface `#FBF8F1`, ink `#1B1A15`, muted `#645E50`, hairline `#DDD5C5`; oxide accent `#A33B1B`; moss met `#2E5943`; ochre review `#7A5105`; blue focus `#1D6C99` |
| **Type** | Fraunces (display, optical serif) · IBM Plex Sans (UI) · IBM Plex Mono (codes, source refs, numbers) |
| **Layout** | Three-zone workbench: sticky **stage rail** (248 px) + ruled **reading column** (~736 px) + inline margin metadata. Dense but calm; sections separated by hairlines, not cards. |
| **Motion** | 120–200 ms fades and 6 px rises; score bars grow once over 560 ms; active-rail marker slides. Nothing bounces, nothing loops. |
| **Rationale** | The product's value is an **auditable assessment file**. A ledger — claims, quotes, citations, classifications, a stamped score — makes the trust promise the visual system. Familiar documentary structure lowers explanation cost for anxious first-time users. |

**Signature:** the **ledger row**. Every extracted claim that *has a quote* (JD skill, resume suggestion, matched/missing skill) uses the same anatomy: name + code on the left, classification/status on the right, a roman-serif evidence quote hanging below with a 2 px rule, and a mono citation. Gap rows are a table, not a ledger row. The score is a **ledger stamp**: ruled top and bottom, the arithmetic visible as "6 met · 3 partial · 3 unrated" above a proportional 12-bar coverage chart, with the percentage present but not the only thing in the frame. It is never a trophy or a ring.

### Direction B — **Signal Room**

| | |
|---|---|
| **Palette** | Near-black `#0D1112`, panel `#151C1E`, text `#E6EDEA`, lime `#C8FF4D`, alert `#FF7A45` |
| **Type** | Archivo Expanded display + IBM Plex Mono for almost everything |
| **Layout** | Fixed dark control room; a dense grid of meters, score rings and monospace tables that fits the desktop viewport without scrolling; a permanent left strip of live status. |
| **Motion** | Status pulses, a live ticker for recalculations, rings that count up. |
| **Rationale** | A demo screen that feels instrumented, and the score is unmissable from across a room. |

**Rejected because:** long-form profile editing on a high-contrast dark surface is fatiguing; the trading-terminal tone implies measurement precision the app explicitly does not claim (self-reported levels, no validated threshold). It would also make the honest "incomplete" state feel like a system failure. Dark-only is a poor fit for shared laptops and projectors.

### Direction C — **Campus Studio**

| | |
|---|---|
| **Palette** | Warm white `#FFFDF7`, ink `#17181F`, sun `#F2C14E`, teal `#2A9D8F`, coral `#E76F51` |
| **Type** | Bricolage Grotesque display + DM Sans body |
| **Layout** | Wide rounded cards, a large horizontal step tracker, illustrated icon circles, generous whitespace, low density, one idea per card. |
| **Motion** | Springy card lifts, checkmark pops, progress fills. |
| **Rationale** | Approachable for students, friendly on phones, excellent for a first-run walkthrough. |

**Rejected because:** it reads as a quiz or study app. The app handles a resume and produces a comparison that people may take personally; playfulness undermines the seriousness of the data. Low density would make the already-long profile longer, and the style is the default aesthetic of every student hackathon project — it would not survive comparison with the product's evidence depth.

### Direction D — **Swiss Register**

| | |
|---|---|
| **Palette** | Pure white `#FFFFFF`, pure black `#000000`, grey `#767676`, signal red `#E4002B`, no tints |
| **Type** | Archivo (grotesque, tight) + Roboto Mono, all-black rules |
| **Layout** | Strict 12-column grid, zero radius, hairline rules, oversized numbers, black action blocks, extreme density, **everything always visible** (no disclosures). |
| **Motion** | None; state changes are instant. |
| **Rationale** | Ageless, legible, ruthlessly consistent, trivially accessible. |

**Rejected because:** pure white + black + zero radius reads as a government form, making the 9,000 px profile feel *more* bureaucratic, not less. "Everything visible" worsens the core problem. The red signal also collides with the semantic colours needed for gap / met / review. It optimises consistency at the cost of the one thing this product needs: a readable hierarchy between action, evidence and provenance.

### Why Evidence Ledger wins

- **Fit to the work:** the app is not a dashboard to monitor or a form to rush; it is an evidence review that ends in a comparison. A document metaphor matches the mental model.
- **Fit to the users:** candidates need to feel the score is explainable, not magical. Quotes, citations, classifications and formula notes are the design, not footnotes.
- **Fit to the context:** paper surfaces read well on projectors and in bright rooms; a 736 px reading column is comfortable on a shared laptop; the rail keeps a 9,000 px flow navigable.
- **Ages well:** no gradients, no glass, no huge radii, no decorative illustration. Type, rules and one oxide accent do the work.
- **Stack fit:** plain CSS tokens and grid; no library, no runtime cost, no theming complexity.
- **Accessibility:** ink-on-paper is 14.9:1; all semantic colours are ≥5.5:1 on their tints; one focus colour, 3:1 control borders; no colour-only meaning.

### Could this belong to any app?

Paper + serif + accent is a known editorial look, so the brief must not stop at colour. The specificity is structural:

- the **claim → quote → citation → classification** anatomy repeated on every surface;
- the **stage rail that records the session** (which JD, which profile, which company bar, which dataset provenance);
- the **score stamp** with a 12-segment coverage strip and an explicit "what this is / is not" note;
- the **provisional-data and processing-route disclosures**, which exist because this app refuses to pretend its inputs are official or local.

A generic notes app could borrow the paper, but not those four patterns. To push further: the ledger row is the *only* card-like object allowed, and every number that matters is tabular and paired with the rule that produced it.

---

## 4. Information hierarchy and the primary action per screen

There is one page, four stages plus an appendix. Each stage has exactly **one primary action**:

| Stage | Primary action | Secondary | The question it answers |
|---|---|---|---|
| 01 · Document intelligence | **Analyze job description** / **Parse resume** | Review evidence, reclassify requirements, accept resume facts | What does this role actually require? |
| 02 · Profile Builder | **Save profile** | Import/export, parse resume, rate, add background, delete | What is true about me, in my own words? |
| 03 · Talent Check | **Run Talent Check** | Inspect company bar, read gaps | Where do I stand against this company? |
| 04 · Skill Matching | **Run Skill Match** | Confirm fuzzy pairs, read group evidence | Do I match this specific job? |
| Reference | — | Modules, company snapshots, 12 skillsets, system/contract | What is behind the numbers? |

Stage naming is fixed everywhere: the rail, the overline and the h2 use **Document intelligence, Profile Builder, Talent Check, Skill Matching**. There is no third alias such as "Source" or "Match".

Hierarchy inside a stage: overline "Stage 01" → title → one-sentence purpose → status → controls → result → provenance. Controls never appear below their result. The rail shows the active stage plus only two facts it can state without lying: the analyzed JD filename (if any) and the saved-profile name (if any). Provider, storage and dataset provenance live in the masthead strip and the System appendix, not in the persistent rail.

**Progressive depth:** the default view shows the decision; technical provenance is one disclosure down but never hidden or fabricated. Contract versions, data hashes, Bloom codes, parser paragraph numbers and provider model IDs live in disclosures or the appendix.

---

## 5. Flow, friction and the fixes

| Audit finding | Design response |
|---|---|
| A1 no journey | Stage rail + numbered stage headers + scroll-spy + mobile step bar; appendix marked as reference. |
| A2 sign-in interruption | Auth moves inside Stage 02, above the form, framed truthfully: in Supabase mode it is **required to save**, not optional; analysis remains first. In local mode no auth is shown. |
| A3 profile wall | Compact rating sheet (~72–104 px/row vs ~150), selected-level topic hint, notes only when rated, collapsible background sections with visible Add, a **sticky-top** save bar (not bottom, which would only appear at the end), coverage moved to the rating header. |
| A4 dead buttons | Prerequisite line with anchor under every disabled scoring action: "Needs a saved profile · Go to Profile Builder". `aria-describedby` ties it to the button. |
| A5 two resume paths | Outcome labels: "Review resume suggestions" (Document) vs "Update this profile from a resume" (Profile). One line explains the difference. |
| A6 plumbing as content | Milestones/contract → System appendix. Provider route → "Processing route" disclosure, one provider per line, mono. Panel badges become meaningful status. |
| A7 silent result changes | Result header names profile + company/JD + run time; focus moves to the result heading after a run; score visible in the first line. |
| A8 undesigned loading/error | Branded shell with skeleton stages; error page with plain cause, copyable command, Retry. |
| A9 destructive actions | Inline two-step delete confirmation; "New profile" warns via dirty state. |
| A10 no shared context | Rail context block shows active profile + JD; both selects labelled "Working profile". |
| A11 feedback out of view | Save feedback lives in the sticky save bar; first invalid field focused and marked. |
| C1 mobile table | Gap table becomes stacked ledger rows < 720 px, no horizontal scroll. |
| C2 touch targets | 44 px minimum; dense row actions 40 px with 8 px separation; 20 px checkboxes inside 44 px labels. |
| C3 repeated Remove | Contextual `aria-label`s ("Remove skill 1"), visible label unchanged. Deliberate test updates. |
| C4 tabs | Real tablist: `aria-controls`, one tabpanel, roving tabindex, Arrow/Home/End. |
| C5 live region | Only the score/status line is `role="status"`; table static; focus moves after run. |
| C7 empty states | EmptyState with one line + a real action. |
| C10 colour-only meaning | Status = dot + word; gaps = text + rule + meter; met = word + tint; never colour alone. |
| C15 rating guidance | Level hint for the selected level, 1–10 scale anchor, "8 of 12 rated" progress, explanation of what Talent Check needs. |

**Deliberate flow changes (behavior-adjacent, reported):**
1. Delete requires a second confirmation click; no API change.
2. "New profile" and switching the saved profile ask before discarding unsaved edits; import states that it replaces the draft.
3. In Supabase mode, **Save profile is disabled until signed in** (previously it was enabled and failed with an error). The form stays editable; the save bar says "Sign in above to save to Supabase." This prevents a late, avoidable failure at the end of a long form.
4. Tab keyboard support uses **manual activation** (Arrow keys move focus, Enter/Space activates) so arrowing across tabs cannot wipe an analyzed JD.
5. After a successful score run, focus moves to the result heading; the score line is no longer inside an `aria-live` region (focus plus a live region would double-announce).
6. Validation focuses the first invalid field on submit.
7. The stage scroll-spy derives the active stage from all stage positions, not only the latest IntersectionObserver entries (fast smooth scrolls could leave the wrong stage marked), and the active mobile tab is kept in view after resize or orientation change.
No scoring, validation rules, API payloads, storage or state ownership change.

---

## 6. Layout, spacing, density, responsive strategy

### Shell

```
┌──────────────────────────────────────────────────────────────┐
│ skip link                                                     │
│ ┌───────────────┬──────────────────────────────────────────┐ │
│ │ RAIL          │ workspace (max 1280)                     │ │
│ │ 248 px        │ ┌──────────────────────────────────────┐ │ │
│ │ brand         │ │ masthead + session strip             │ │ │
│ │ 01 Document   │ ├──────────────────────────────────────┤ │ │
│ │ 02 Profile    │ │ stage 01 (measure ~736)              │ │ │
│ │ 03 Talent     │ │ stage 02                             │ │ │
│ │ 04 Match      │ │ stage 03                             │ │ │
│ │               │ │ stage 04                             │ │ │
│ │ session meta  │ │ reference appendix (full width)      │ │ │
│ │ storage       │ │ footer                               │ │ │
│ └───────────────┴──────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

- Shell max `80rem` (1280 px); rail `15.5rem` (248 px), hairline on the right, sticky, full viewport height, its own scroll if needed.
- Reading column `min(46rem, 100% - 2 * var(--gutter))` (max 736 px) for forms and tables; prose blocks are capped at `66ch`. The appendix uses the workspace width but is a single ruled column, not a card grid.
- No centred 64 rem column floating in space; the rail anchors the page.
- Rail contents: brand, four stage links (module names), and the two true context facts (JD filename, saved-profile name). No provider/storage/hash list in the rail — that is masthead/appendix material.

### Density

- Medium. Prose 60–70 characters; form controls at 44 px; data rows at 48–56 px.
- Rules, not boxes: section separation uses a 1 px hairline; only interactive blocks get a surface.
- One surface level. No card inside card inside card. The ledger row is the only repeated bordered object.
- Vertical rhythm from the 4 px scale. Stage padding `--space-8` (40 px), field gaps `--space-4`/`--space-5`, stage gap `--space-16` (96 px).

### Responsive

- **≥ 1120 px:** full rail; two-column field rows; appendix full-width ruled blocks.
- **840–1119 px:** rail becomes a sticky top bar (brand + horizontal step links); main column fluid; field rows can stay 2-col above 720.
- **< 720 px:** single column; stage header stacks; rail nav scrolls horizontally with 44 px targets; table → labelled stacked rows with explicit ARIA roles; buttons full width only for the primary action of the stage; sticky save bar spans the viewport with safe-area padding; evidence rows stack control under claim; provider route wraps per line; no horizontal page scroll at 320 px.
- **720–839 px is explicitly covered:** the measure is fluid (`min(46rem, 100% - 2 * gutter)`), so the 46 rem column never exceeds the viewport; single-column fields switch at 720 px.
- **320 px check:** no fixed min-widths on inputs; code chips wrap; score numeral clamps from 3.25 to 4.5 rem; stage titles clamp 1.65–1.95 rem.

---

## 7. Typography

| Role | Family | Size / line | Weight | Use |
|---|---|---|---|---|
| Display | **Fraunces Variable** | clamp(2.5rem, 6vw, 3.5rem)/1.02 | 500 | Product name, stage numbers? (no — stages are sans) |
| Stage title | Fraunces | clamp(1.6rem, 3vw, 1.9rem)/1.15 | 500 | h2 of each stage, appendix headings |
| Score | Fraunces | clamp(3.25rem, 8vw, 4.5rem)/0.9 | 500 | 92% numeral |
| Body | **IBM Plex Sans** | 1rem/1.6 | 400 | paragraphs, controls |
| Body strong | Plex Sans | 0.9375rem/1.45 | 600 | labels, row titles |
| Small | Plex Sans | 0.875rem/1.5 | 400 | help text, metadata |
| Overline | Plex Sans | 0.75rem/1.2, tracking .12em, uppercase | 600 | stage number, metadata labels |
| Code / citation | system mono (`ui-monospace`, Cascadia/Consolas) | 0.75rem/1.4 | 400/500 | category codes, source refs, hashes, provider route |
| Evidence quote | Fraunces, roman (not italic) | 1rem/1.55 | 400 | JD/resume quotes |

Rules:
- One h1 per page, in Fraunces. h2 per stage, Fraunces. h3/h4 in Plex Sans 600 — never uppercase headings.
- Uppercase is reserved for overlines of ≤4 words and never used for a title.
- `font-variant-numeric: tabular-nums` on scores, levels, counts and tables.
- **No text below 0.75 rem (12 px).** Body-secondary 0.875 rem; controls 0.9375–1 rem. Overlines are 12 px, not 11 px.
- Fraunces optical sizing auto; quotes are roman so verbatim evidence is not confused with editorial voice. No decorative swashes.
- Self-hosted via `@fontsource-variable/fraunces` and `@fontsource/ibm-plex-sans` (400/500/600), latin subsets only. **No mono font package**; the system mono stack is used for citations, which saves a dependency and ~20 kB and looks native on the demo machine. Fallbacks are declared so a failed font request does not shift layout.

---

## 8. Colour roles and contrast

Light-only. A dossier is a paper object; the app is used on shared laptops and projectors where a light surface wins. A real dark theme would require a second full contrast and status-colour pass and would undermine the paper metaphor. `color-scheme: light` prevents mismatched dark native controls, which the old CSS accidentally requested.

| Token | Hex | Role | Contrast measured |
|---|---|---|---|
| `--paper` | `#F1EDE4` | Page background | — |
| `--paper-deep` | `#E8E2D5` | Well, rail footer, code chips | ink 12.9:1 |
| `--surface` | `#FBF8F1` | Panels / sheets | ink 16.4:1 |
| `--surface-bright` | `#FFFDF8` | Inputs, raised rows | ink 17:1 |
| `--ink` | `#1B1A15` | Primary text, primary buttons | 14.9:1 on paper |
| `--ink-2` | `#3B382E` | Secondary headings | 11.0:1 on surface |
| `--muted` | `#645E50` | Help text, metadata | 5.5:1 on paper / 6.1:1 surface |
| `--faint` | `#857D6C` | Decorative only, ≥18 px or non-text | 3.5:1 on paper |
| `--rule` | `#DDD5C5` | Hairlines (decorative) | 1.38:1 (not text) |
| `--control-border` | `#918675` | Input/button boundary | 3.52:1 vs input surface |
| `--accent` | `#A33B1B` | Active stage, links, gap marks, stamp rule | 5.6:1 paper / 6.2:1 surface / paper on accent 6.2:1 |
| `--accent-strong` | `#7E2B12` | Accent hover/pressed | 8.0:1 paper |
| `--accent-soft` | `#F3DFD5` | Accent tint surface | ink 13.5:1 |
| `--moss` | `#2E5943` | Met / saved / success | 7.5:1 surface, 6.7:1 on tint |
| `--moss-soft` | `#E4EDE4` | Met tint | — |
| `--ochre` | `#7A5105` | Review / provisional / consent caution | 6.6:1 surface, 5.8:1 tint |
| `--ochre-soft` | `#F5E8CE` | Caution tint | — |
| `--info` | `#2B4C68` | Informational/neutral status | 7.5:1 tint |
| `--info-soft` | `#E4EBF2` | Info tint | — |
| `--danger` | `#982A22` | Errors, destructive | 7.4:1 surface, 6.3:1 tint |
| `--danger-soft` | `#F6E2DE` | Error tint | — |
| `--focus` | `#1D6C99` | Focus ring only | 4.9:1 on paper; ring is 2 px at ≥3 px offset, and a `--surface` halo separates it from ink buttons |

Usage rules:
- **Oxide is a signal, not a CTA colour, and never a failure colour.** It marks the active stage number, the score rule, links, and the small gap amount. Primary buttons are **ink**. Active stage text and bar are ink; only the two-digit number turns oxide. Gap rows use "2 levels below" in ink-2 plus an ochre arrow; `--danger` is reserved for errors and destructive actions. This keeps "non-judgemental" true in the palette, not just the copy.
- Status is always **dot + word**; the tint is secondary. Gaps use the word "below", the number and an ochre mark; colour is redundant.
- Disabled controls keep readable text (`--muted` on `--paper-deep`, ~4.9:1) with a dashed/faded border instead of opacity. No text below 4.5:1, including placeholders (`--muted`).
- Focus ring: 2 px `--focus` + 2 px offset; where the surface is ink, a 2 px `--surface` halo sits between the control and the ring. Never `outline: none` without the replacement. Contrast of the ring is 4.9:1 against paper and 5.5:1 against surface.
- Gradients: none. Tints are flat. No glow.

---

## 9. Shape, depth, texture, iconography

- **Radius:** `2px` code chips, `3px` inputs/buttons, `4px` sheets. Status dots are circles; nothing else is a pill. This is a deliberate rejection of the rounded-card default.
- **Depth:** almost none. Sheets are flat with a 1 px rule. Only the sticky save bar, the rail (a hairline + paper), and native select popups get a shadow. `--shadow-sheet: 0 1px 0 rgb(27 26 21 / 5%)`; `--shadow-lift: 0 10px 30px rgb(27 26 21 / 12%)` for the save bar only.
- **Texture:** a very faint 1 px ruled line can appear behind the stage number? No — no decorative texture. Paper is conveyed by colour and hairlines. Keep the surface clean for projector legibility.
- **Icons:** a small inline SVG set (16/20 px, 1.5 px stroke, round caps) — file, arrow-right, chevron, check, plus, trash, alert-triangle, info, lock, upload, external, clock. Inline components, no icon dependency. Icons never carry meaning alone; they sit next to text. Decorative icons are `aria-hidden`.
- **Monogram:** a 28 px ink square with a paper Fraunces "R"; used as the rail mark and the favicon (SVG).
- **No illustration, no emoji, no stock imagery.**

---

## 10. Motion

Motion explains change; it never entertains.

| Moment | Motion | Duration / easing |
|---|---|---|
| Hover / pressed | background/border/colour only | 120 ms `ease-out` |
| Focus | ring appears instantly (no fade) | 0 |
| Rail active marker | 2 px bar slides between items | 180 ms `cubic-bezier(.16,1,.3,1)` |
| Results appear | 6 px rise + fade | 200 ms `ease-out` |
| Score coverage bar | each segment scales X from 0 | 560 ms, 16 ms stagger, once per run |
| Score numeral change | no count-up; value swaps with a 120 ms fade | 120 ms |
| Disclosure | native `<details>`; no height animation | 0 |
| Sticky save bar | appears with the form, no entrance animation | 0 |

- **Reduced motion:** `@media (prefers-reduced-motion: reduce)` sets durations to `0.01ms`, removes transforms and stagger, and disables `scroll-behavior: smooth`. Content is identical.
- No parallax, no scroll-jacking, no looping animation, no confetti, no animated numbers. Results are announced with `role="status"`; motion is never the only feedback.
- Keyboard focus movement after a run is instant (`scrollIntoView({ block: "start" })` only if the result is off-screen; the reduced-motion preference forces `behavior: "auto"`).

---

## 11. Components and their states

### 11.1 Button
Variants: `primary` (ink fill, paper text), `secondary` (surface, control border), `ghost` (text only, muted→ink), `danger` (danger text, danger-soft hover), `danger-solid` (confirm delete). Sizes: `md` 44 px, `sm` 40 px for dense row actions (with 8 px separation), `icon` 40×40 with accessible name.
States: default, hover (surface tint / ink-soft), active (1 px translate none; darken), focus-visible (2 px focus ring, 2 px offset), disabled (paper-deep fill, muted text, dashed border, `cursor: not-allowed`, no opacity), busy (spinner + present-participle label + `aria-busy`, still focusable? Disabled while busy to prevent double submit, with `aria-disabled` and explanatory text if needed).
Never remove the label to show a spinner.

### 11.2 Text field / textarea / select
Surface-bright, 1 px control border, 3 px radius, 44 px min height, 16 px text (prevents iOS zoom), 12 px 600 label above, optional hint in muted 14 px, error text in danger with `aria-invalid` + `aria-describedby`. Placeholder is muted (4.5:1), never the only label. Focus: border ink + focus ring. Disabled: paper-deep, muted text, not focusable. Read-only (not used) distinct.
Select uses the native control with a custom chevron background; no custom listbox. It must remain a real `<select>` for tests and screen readers.

### 11.3 File field
A label styled as a bordered drop target: file icon, "Choose a PDF or DOCX", the chosen filename + size in mono below, and "Replace" when a file is selected. The native input remains in the label, visually hidden but focusable; `:focus-within` shows the ring. Helper line states limits and the no-retention promise. Error state: danger border + message. Drag-and-drop is *not* added (would be new behaviour; not asked).

### 11.4 Tabs
Underline tabs, no filled segmented control: active has a 2 px ink underline and ink text; inactive muted; hover ink-2. Real tablist: roving tabindex, **manual activation** (ArrowLeft/Right/Home/End move focus; Enter/Space or click activates), `aria-controls`, one tabpanel. Manual activation is required because switching mode deliberately clears the current file/result; arrowing must not destroy work. 44 px tall. The panel contains the upload form and results.

### 11.5 Status
Dot (8 px) + 12 px uppercase label + optional value. Tones: neutral/info/moss/ochre/danger. Used for provider configured, storage mode, provisional data, evidence verified, module readiness. Never a filled pill. A mono code chip is a different component (surface, rule, 2 px radius).

### 11.6 Stage header
Overline "Stage 01 — Source" in mono/uppercase, h2 in Fraunces, one-sentence purpose in muted 15 px, optional status cluster on the right. A hairline under the header. On mobile everything stacks; status moves below the purpose.

### 11.7 Rail
Brand block (monogram, wordmark, "Candidate workbench"), 4 stage links with two-digit number, full module name, and only two truthful context facts: analyzed JD filename / saved profile name. Active: ink text + ink 2 px left bar, with the number in oxide; inactive: muted; hover: ink. `aria-current="step"` on the active link. No provider/storage/hash list in the rail. On mobile: brand + horizontal step links; the context facts move to the masthead. Activating a link scrolls to the stage and moves focus to the stage heading (`tabIndex={-1}`), so the next Tab enters the stage rather than the next nav item.

### 11.8 Ledger row (signature)
```
┌ claim name  [COD]                         [classification select] ┐
│ “quote text in Fraunces, 2 px oxide rule on the left”              │
│ role.docx · p.4 · exact evidence                                   │
└────────────────────────────────────────────────────────────────────┘
```
Exactly two variants: (a) **read-only evidence** for JD skills and matched/missing groups; (b) **editable suggestion** for resume review, where the fields sit below the quote in a sub-grid. Gap rows are a table, not a ledger row. Border-bottom hairline; no outer card; hover surface tint on interactive rows only.

### 11.9 Score stamp
Ruled top and bottom, generous vertical padding. The **arithmetic is the hero**: a line of counts ("6 met · 3 partial · 3 unrated") above a proportional **12-bar coverage chart**, one thin vertical bar per skillset whose fill is `min(candidate, required) / required` — met bars in moss, partial in ochre, unrated as a dashed empty track. The percentage is present at ~3.25 rem (not 4.5 rem) in Fraunces tabular, with the overline "Self-reported readiness indicator". This keeps the `.readiness-score` text exactly "Self-reported readiness indicator: 92%" for meaning and tests, while the counts and bars carry the explanation. The chart is `aria-hidden` with a text summary beside it. For Skill Match, lead with "3 of 5 required skills confirmed · 1 possible match needs review" before "Required-skill match: 60%", and use a single proportional rule rather than the 12 bars. A 0% result therefore reads as "0 of 1 confirmed", not as a verdict.
The stamp includes a one-line "What this is / is not": equal-weighted, capped coverage of self-reported levels; not a hiring prediction or a validated threshold.

### 11.10 Data table (gaps)
Desktop: `<table>` with a `<caption>` (visually hidden), sticky header, 14 px, tabular numerals, 48 px rows, hairline separators, company level and self level each with a 10-step mini-meter, gap column with "2 levels below" (ink + ochre arrow) or "Meets or exceeds" (moss), Bloom code in mono. Mobile: the same table is laid out as stacked blocks; explicit `role="table"`, `role="row"`, `role="rowheader"`, `role="cell"` are added so Safari/VoiceOver keeps associations when `display` changes, and visual labels are `aria-hidden` pseudo-content. This specific rendering must be checked in the browser pass; if associations misbehave, fall back to a real table in a scroll container (data tables are exempt from the reflow requirement). Unrated rows have a dashed meter and "Not rated" (not zero).
Empty: a designed empty state. Loading: a 4-row skeleton with the same column widths (no layout shift).

### 11.11 Alert / notice
`role="alert"` for errors, `role="status"` for success, `role="note"` for contextual notices. Left 3 px rule + 12 px icon + text, tinted surface; title line in 600 if the message has two parts; technical detail in a secondary mono line. No modal alerts except the native file picker.
Tones map to info/ochre/danger/moss. Error copy leads with what happened, then what to do; never only an HTTP code. The backend-down screen keeps the exact command.

### 11.12 Empty state
A ruled, quiet block: one-line reason + one action (button or anchor). Examples: "No saved profile yet. Fill in your details, then save." / "Analyze a job description in Stage 01." / "No required skills are missing." (success empty, moss dot, no action). Never a dead end.

### 11.13 Save bar
A **sticky-top bar at the top of the profile form** (not a bottom-sticky child, which would only appear once you reach the end of the form): "Unsaved changes" or "Saved" on the left; "8 of 12 ratings" moved to the rating section header; "Save profile" primary on the right; success/error appears here, at the action. In Supabase mode with no session it reads "Sign in above to save" and the submit is disabled (see §5). On mobile it sticks below the stage bar with `top: var(--stagebar-height)` and `scroll-margin-top` on fields so focus is never obscured. The bar has a paper background, a hairline bottom and only `--shadow-sheet`.

### 11.14 Disclosure
Native `<details>`/`<summary>`, 44 px summary, chevron rotates 90°, no height animation. Used for level guides, processing route, company bar preview, rejected claims, JD source evidence, and optional background sections. Summary text is a real sentence with a count.

### 11.15 Auth panel
Rendered only in Supabase mode inside Stage 02, **above the form**, because it is required to save there. A ruled block titled "Sign in to save this profile", one sentence ("You can fill everything in first; saving needs an account."), email/password fields, primary "Sign in", a text toggle to create an account, and a status/error line. On mobile it stacks above the form. It must not block analysis, and it must not claim local saving exists in Supabase mode.

### 11.16 Appendix
Two native disclosures at the end, not a 3-column card wall: **Reference** (the 12 skillsets with codes and names, and the company snapshots already used by the select) and **System & provenance** (module statuses, the exact milestone/contract line, data hash, provider route, privacy notes). Readable, small type, no interaction beyond disclosure. This is where build metadata and the "M3 profile builder · M4 scoring · contract…" string belong.

---

## 12. Feedback, validation and error prevention

- **Submit-time validation** stays where it is (no new schema). On failure: inline message at the field, `aria-invalid`, `aria-describedby`, focus the first invalid control, and a summary in the sticky bar. The existing error strings stay recognisable; leading action first.
- **Destructive actions:** delete requires an inline confirm ("Delete this profile permanently?" + "Delete permanently" / "Cancel"); "New profile" and switching the saved profile warn when the draft is dirty; import says it replaces the current draft. Import still validates before replacing anything (existing behaviour).
- **Focus after loss:** after delete, focus moves to "New profile"; after cancelling, focus returns to "Delete profile". After a stage jump, focus moves to that stage's heading. After a tab switch, focus stays on the tab.
- **Busy:** every async button shows present-participle text + spinner; the form sets `aria-busy`; double submit is blocked. Existing `busy` flags are reused.
- **Consent:** the external-processing checkbox remains required before upload; the blocked state explains *why* (administrator terms review) rather than only disabling. The provider route stays **visible next to the consent** as a short provider summary (e.g. "OpenRouter ×5 → Groq"), with model IDs one disclosure down. The privacy line stays next to the file, not in a footer.
- **Score preconditions:** missing ratings show `incomplete` and withhold the score (existing logic). The UI lists the missing skillset names, not just a count, and links to the ratings section.
- **No optimistic saves:** profile saving is a network action; success is confirmed only from the API response. `useOptimistic` is deliberately not used because a failed Supabase save must not look saved.
- **No dead ends:** every error offers the next step (retry, go to stage, export backup, check backend).

---

## 13. Microcopy and voice

Voice: **plain, precise, non-judgemental, second person.** Short sentences. No exclamation marks. No "unlock", "supercharge", "journey", "AI-powered". No claims the product cannot support. Numbers are exact.

Vocabulary (one term per concept):

| Concept | Term | Not |
|---|---|---|
| The uploaded JD/resume | document | file (in prose), CV (except where the field is named CV) |
| Extracted item | skill / suggestion | claim, insight |
| Supporting text | evidence quote | snippet |
| Where it came from | source · page/paragraph | location data |
| 1–10 rating | self-reported level | score (reserve score for the aggregate) |
| Aggregate | readiness indicator / match | ranking, fit score |
| Company bar | required level | benchmark |
| Fuzzy pair | possible match | suggestion (ambiguous) |
| Dataset | provisional company snapshot | official data |
| Failed verification | "couldn't verify" | rejected claim |
| Gaps | "bar is 2 levels higher" / "2 levels below" | deficit, weakness |
| Withheld score | "score not shown yet" | withheld, blocked |

Key copy:
- Masthead lead: "Read one role. Build a profile from evidence. Compare it with a company's 12-skill bar — and see exactly where you meet it."
- Stage 01 purpose: "Every extracted skill keeps its quote and its page. Reclassify anything the parser read differently."
- Stage 02 purpose: "Your facts, your ratings. Nothing here is inferred from your resume."
- Stage 03 purpose: "Twelve required levels, twelve self-reports. Missing ratings mean the score is not shown yet, rather than guessed."
- Stage 04 purpose: "Only confirmed required skills count. Fuzzy pairs need your decision."
- Score note: "Equal-weighted coverage, capped at each company requirement. Self-reported — not a hiring outcome or a validated threshold."
- Empty score: "The score is not shown until all twelve levels are rated."
- Provisional: "Provisional company snapshot, generated from the supplied CSV. Not the official JSON."
- Unverified: "3 items couldn't be verified against the document text."
- Privacy: keep the existing promises ("processed for this request only", "only its filename is kept", redaction notice).
- Footer: "A self-assessment aid, not a hiring decision."

---

## 14. Accessibility (WCAG 2.2 AA)

- **Landmarks:** skip link → `main`; rail `<nav aria-label="Assessment stages">` outside `main`; each stage a labelled `<section>` with a focusable heading (`tabIndex={-1}`); footer `contentinfo`.
- **Semantics:** one h1, h2 per stage, h3/h4 within; real `<table>` for gaps with a caption and explicit roles when reflowed; real `<details>`; real `<select>`; real tabs with roving tabindex and **manual** Arrow/Home/End activation; `aria-current="step"` on the active rail link.
- **Keyboard:** every action reachable; visible focus at all times; no focus traps; stage links move focus into the stage; delete confirmation moves focus to the confirm action and returns it on cancel; tab order follows visual order; `scroll-margin` keeps focused fields clear of the sticky bars.
- **Names:** repeated Remove actions get context ("Remove skill 1"); icon-only buttons get `aria-label`; the result is announced by moving focus to its heading, and **the outer result container is no longer a live region** (avoids double announcement of a whole table).
- **Concerns check:** 12 px minimum text, 40 px minimum dense actions, fluid measure, status words at 12 px — the three self-contradictions found in review are resolved in §7, §11 and §17.
- **Contrast:** text ≥ 4.5:1, large ≥ 3:1, control boundaries ≥ 3:1, focus ring ≥ 3:1 against adjacent colours; disabled text remains ≥ 4.5:1 by using a darker muted colour instead of opacity.
- **Not colour alone:** status words, gap words, meter shapes, dashed vs solid rules.
- **Targets:** 44×44 minimum for standalone controls; 40×40 dense row actions with 8 px spacing; checkbox 20 px inside a 44 px label.
- **Motion:** reduced-motion honoured; no autoplay; no flashing.
- **Zoom/reflow:** 200% zoom and 320 px width with no horizontal page scroll; long model IDs and hashes wrap; selects do not clip labels.
- **Forms:** labels are explicit and visible; errors are programmatically associated; `autocomplete` retained; no time limits; no CAPTCHA.
- **Language:** `lang="en"`; plain-language copy; abbreviations (JD, CV, RLS) expanded on first use where they appear in prose.
- **Screen-reader announcements:** `role="status"` for score/result summaries and save confirmations; `role="alert"` for errors; no `aria-live` on large tables.

---

## 15. Performance

- No new runtime library. Fonts self-hosted; only 400/500/600 Plex Sans, 400 Plex Mono, variable Fraunces; latin subsets. Target ≤ 120 kB of additional font transfer, cached.
- No images beyond one inline SVG mark/favicon. No icon package.
- CSS stays a single token+base file plus profile styles; no CSS-in-JS runtime.
- No animation on scroll; IntersectionObserver only for rail state (one observer, four targets, disconnected on unmount).
- Lists are small (≤ 20 rows); no virtualisation needed. No new data fetching.
- Production bundle should stay within ~10% of the baseline JS (the existing 481 kB is dominated by Supabase + React); the redesign must not add a charting or icon library.
- Layout stability: reserve heights for stage skeletons, score stamp and meters; fonts have system fallbacks with matched metrics (`size-adjust` not required; use similar widths).

---

## 16. Small details

- Favicon: `public/favicon.svg` ink square + paper "R"; `<link rel="icon">`, `theme-color` = paper, meta description.
- Selection: `::selection { background: var(--accent-soft); color: var(--ink); }`.
- Focus ring: `outline: 2px solid var(--focus); outline-offset: 2px;` on every `:focus-visible`.
- Scrollbar: leave native; `scrollbar-gutter: stable` on the rail only.
- Rules align to the text baseline; the stage number sits on the same optical line as the h2 cap height.
- Score numerals use `font-variant-numeric: tabular-nums` and a thin space before `%` is *not* inserted (keeps text exact; use letter-spacing on the unit span).
- Code chips use uppercase for category codes, sentence case for IDs; hashes truncate at 12 chars with a `title`.
- Page title: "RADIX Talent Match — candidate workbench"; h1 remains "RADIX Talent Match".
- 404/unknown routes do not exist; no change.
- Print: not a target, but the paper layout prints without cards; add `@media print` to hide the rail and sticky bar (cheap, useful for candidates saving a PDF).
- Responsive images: none.

---

## 17. Design tokens — single source of truth

These are implemented in `src/styles.css` `:root`. No component may introduce a raw hex, px radius, shadow or duration outside this block (except 1 px hairlines where a border width is structural).

```css
:root {
  color-scheme: light;

  /* Colour — surfaces */
  --paper: #f1ede4;
  --paper-deep: #e8e2d5;
  --surface: #fbf8f1;
  --surface-bright: #fffdf8;

  /* Colour — text */
  --ink: #1b1a15;
  --ink-2: #3b382e;
  --muted: #645e50;
  --faint: #857d6c;

  /* Colour — lines */
  --rule: #ddd5c5;
  --rule-strong: #c4b9a5;
  --control-border: #918675;

  /* Colour — signal */
  --accent: #a33b1b;
  --accent-strong: #7e2b12;
  --accent-soft: #f3dfd5;
  --moss: #2e5943;
  --moss-soft: #e4ede4;
  --ochre: #7a5105;
  --ochre-soft: #f5e8ce;
  --info: #2b4c68;
  --info-soft: #e4ebf2;
  --danger: #982a22;
  --danger-soft: #f6e2de;
  --focus: #1d6c99;

  /* Type */
  --font-display: "Fraunces Variable", "Iowan Old Style", Georgia, serif;
  --font-body: "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, "Cascadia Code", monospace;

  --text-xs: 0.75rem;      /* 12px floor: overlines, code, citations */
  --text-sm: 0.875rem;     /* 14px secondary */
  --text-base: 1rem;       /* 16px body */
  --text-md: 1.125rem;     /* 18px lead */
  --text-lg: 1.375rem;     /* 22px h3 */
  --text-xl: clamp(1.6rem, 2.6vw, 1.9rem);
  --text-2xl: clamp(2.4rem, 5vw, 3.25rem);
  --text-score: clamp(3.25rem, 8vw, 4.5rem);

  --leading-tight: 1.12;
  --leading-snug: 1.35;
  --leading-body: 1.6;
  --tracking-overline: 0.12em;
  --tracking-tight: -0.02em;

  /* Spacing (4px scale) */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-5: 1.25rem;
  --space-6: 1.5rem;
  --space-7: 2rem;
  --space-8: 2.5rem;
  --space-9: 3rem;
  --space-10: 4rem;
  --space-12: 5rem;
  --space-16: 6rem;

  /* Shape */
  --radius-xs: 2px;
  --radius-sm: 3px;
  --radius-md: 4px;
  --shadow-sheet: 0 1px 0 rgb(27 26 21 / 5%);
  --shadow-lift: 0 10px 30px rgb(27 26 21 / 12%);

  /* Layout */
  --shell-max: 80rem;
  --rail-width: 15.5rem;
  --measure: 46rem;
  --gutter: clamp(1rem, 2.2vw, 2rem);
  --control-height: 2.75rem;

  /* Motion */
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --dur-fast: 120ms;
  --dur: 200ms;
  --dur-bar: 560ms;
}
```

Contrast is verified for every text pair in the palette table. `--faint` is prohibited for body text.

---

## 18. Critic review

A read-only critic agent reviewed this brief and `AUDIT.md` before any UI code was written. It saw no implementation, so its job was to attack the direction, hierarchy and claims, not pixels. The brief was revised where the criticism exposed a real conflict; two notes were declined with reasons.

**Accepted and applied**

| Criticism | Change made |
|---|---|
| Oxide was doing too many jobs (active stage, gaps, links, stamp), so a gap could read as an error and a link as a warning. | Oxide is now a signal only: active stage number, links, the one score rule, and the small gap amount. Gaps use ink-2 text plus an ochre arrow; `--danger` is reserved for errors and destructive actions. |
| "2 levels below" and a 72 px score read as a verdict on the candidate. | The score is a stamp with its arithmetic as the hero: `8 verified · 2 partial · 2 missing` and a 12-segment coverage bar were added above the verdict. Copy says "couldn't verify" and "not rated", never "failed". |
| The rail listed provider, storage and hash plumbing that a candidate cannot act on. | The rail keeps only the four stages and two truthful facts (JD filename, saved-profile name). Provenance moves to the masthead strip and the System appendix. |
| Skill Match led with a percentage, hiding how little evidence sat behind it. | It now leads with confirmed counts and names the missing evidence; the percentage is secondary. |
| A bottom-sticky save bar would not appear until the end of a 9,000 px form. | The save bar is sticky-**top** at the start of the profile form, with dirty state separated from rating coverage (coverage lives in the rating header). |
| Consent to external processing was separated from the provider it consents to. | A plain provider summary now sits next to the consent checkbox; model IDs stay one disclosure down. |
| Tab arrows that activate on focus would silently clear the current file/result. | Tabs use manual activation: arrows move focus, Enter/Space/click activates. |
| 11 px overlines, 36 px/40 px action contradictions and a 3-column appendix were called out as noise. | 12 px is the floor everywhere; dense actions are 40 px with 8 px separation; the appendix is two native disclosures over one ruled column. |
| Live regions wrapped whole panels, so every keystroke could be announced. | The outer `aria-live` is gone; only result/status lines announce, with `role="status"`. |
| Auth was framed as a failure after a long form. | In Supabase mode the form stays editable but Save is disabled until sign-in, with "Sign in above to save to Supabase" in the bar. |
| The per-row 10-level guides added 12 rows of visual noise. | **Declined.** The guides are the supplied ladder content; removing them would hide the scale the rating refers to. The row was compacted to ~72–104 px, which fixes the wall without deleting information. |
| The stage rail itself duplicates a five-item page. | **Declined.** At 6,500–9,900 px the page needs persistent orientation; the rail is the cheapest fix that adds no routing or state. It collapses to a top bar below 1120 px. |

---

## 19. Explicitly skipped, with reasons

- **Dark mode:** skipped. Light-only paper metaphor; a second theme would double contrast/status verification and conflicts with shared-laptop/projector use. `color-scheme: light` fixes the accidental half-dark native controls.
- **A router or URL-per-stage:** skipped. The app has one screen and deep links were not requested; anchors + scroll-spy give orientation without changing routing or test assumptions.
- **Command palette / global search:** skipped. Five stages, all visible; search adds state with no user job.
- **Drag-and-drop upload:** skipped. New behaviour, new error surface (drop outside target, multiple files), and the native file picker is accessible. File input remains.
- **Charts library / radar chart:** skipped. 12 rows and two levels are better read as a table + mini-meters; a radar chart would imply precision and hurt screen-reader access.
- **Toast notifications:** skipped. Feedback belongs next to the action (sticky save bar, result line); toasts would duplicate and can be missed.
- **Illustrations / mascots:** skipped. The evidence is the visual interest.
- **Onboarding tour / coach marks:** skipped. Numbered stages and empty states do the orientation job without a dismissible layer.
- **Optimistic UI for profile save:** skipped. A failed Supabase write must never look saved.
- **Component library:** skipped. The primitives are small and the design is bespoke; a library would add weight and override work.
- **Theme toggle:** skipped with dark mode.
