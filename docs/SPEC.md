# ArrowPush — agreed spec (v0.1)

> Source of truth for what has been **agreed with the user** (design grilling, 2026-11-24). Do not silently change
> anything under "Agreed"; if it needs to change, ask the user and edit this file in the same change.
> Items under "Open" are NOT decided. A human-readable copy is `docs/spec.html` — keep both in sync.
> Working name "ArrowPush" is a placeholder used in the mockups, not a decision.

## 1. Product

A website to practise and learn **reaction mechanisms of named reactions** by **drawing curved arrows**, with the system
validating the arrows and giving guided feedback. Comparable in spirit to nrochemistry.com's advanced chemistry quiz and
chemdle.com, but with arrow-pushing input and dynamic guidance. `~/synkit/synkit-mechanism` (esp. `review-app-design.md`)
is a conceptual reference only: it chose "correct by choosing, not by drawing"; this product deliberately does the opposite
(free arrow input + validation). Reusable ideas from it: state → arrow group → next state data model, origin/verdict tracking.

- **Audience:** undergrad → grad students revising named reactions; each reaction has a difficulty tier (●○○ … ●●●).
- **Core loop:** show a state; learner draws the arrows for **one elementary step**; app validates; shows resulting
  intermediate; continue. (A whole-mechanism-at-once mode is deferred.)
- **Modes** (shared engine):
  - **Daily puzzle:** one reaction/day, name hidden until finished; **3 attempts per step**; wrong check = −1 pt; hint = −1 pt;
    share grid per step: 🟩 first try / 🟨 retry or hint / 🟥 missed; tiles also carry glyphs (✓ ~ ✕), not colour alone.
    Seeded by date (no server needed).
  - **Practice:** untimed, unlimited attempts, free hints; filter by type/difficulty/status; search.

## 2. Content scope v1

~15 named reactions, **polar** first: SN1, SN2, E1, E2, aldol, Claisen, Grignard addition, Wittig, Diels–Alder,
pinacol, Beckmann, Fischer esterification, Michael addition, Friedel–Crafts acylation.
**Plus a few radical entries** (radical bromination: initiation/propagation/termination; Barton–McCombie).
Diels–Alder needs a concerted multi-arrow step (3 arrows) — the model must support it from day one.

## 3. Interaction

- **Input = click/tap source, then click/tap target.** Source: lone pair, bond (σ/π) or unpaired electron.
  Target: atom or bond. The app draws the curved arrow. Not freehand strokes. Works with touch, mouse, keyboard
  (Tab to element, Enter to pick, Esc to cancel). Touch is first-class (large hit targets).
  Decided 2026-11-25 (item 7a): **one pick target per bond**; picked as a source it gives its **π electrons first**,
  then σ once this arrow set has used the π electrons (so a bond broken completely is two arrows from it). Every
  lone pair is its own target. When a bond's electrons could form a new bond from either of its atoms, a small
  **"which atom forms the bond?"** menu opens by the tapped atom.
- **Drawing (decided 2026-11-25):** every heavy atom is **labelled** with its implicit H and charge (CH₃, OH⁻) in v1;
  skeletal display may come later as a setting. **Every lone pair is drawn**, spread evenly through the free space
  round the atom (showing only the relevant ones would give the answer away). One **scale per reaction** (56 px per
  bond, from the start state), so bonds keep their length between steps. **Abbreviated groups** (decided 2026-11-25):
  the author may list bystander groups (`abbreviatedGroups`, e.g. the three Ph on P in the Wittig), drawn as their
  label wherever intact and never tapped; lint rules keep steps and misconceptions off them
  (`docs/schema-design.md` §3.5).
- **Step screen (practice, item 7a):** after a correct check the arrows stay and the step's explanation shows; **Next
  step** moves on with a short cross-fade (none under reduced motion). A change step is an **event card** with
  Continue (no tile, no score). Hints are free; the **third hint shows the canonical arrows as ghost arrows**, which
  the learner draws over and checks (no separate reveal). Outcome per step: first try / after retry / after hint.
- **Arrow types in the data model from the start:** full arrow = electron **pair** (2 e⁻); half-headed **fish-hook** = 1 e⁻.
  A step is a list of typed arrows (so concerted steps work).
- **Accessibility:** touch first-class, keyboard operable, colour-blind-safe palette, shape+colour in share grid, light/dark theme,
  `prefers-reduced-motion` respected.

## 4. Validation & feedback

- **Strictness (c):** arrows must be valid pushing (real source with electrons, sink that can accept them, electron
  bookkeeping balances) **and** the resulting state must match the to-state of a step leaving the current state
  (up to symmetry and resonance). Right product via nonsense arrows must NOT pass.
  Decided 2026-11-24 (schema pass, details in `docs/schema-design.md`):
  - **Acceptance is by result, checked in the browser on the fly.** Legal, non-redundant arrows whose result matches a
    to-state are correct, so nothing is listed for acceptance. **Symmetry-equivalent** atoms (either water H, any α-H) and
    **resonance forms** (incl. the other Kekulé form) are both handled by comparing σ skeletons under skeleton symmetry.
    That is one linear pass, with no enumeration of resonance forms and nothing precomputed in the file. A result with more
    charged atoms than the to-state is partial progress (`minor-resonance-form`). The next step continues from the curated drawing.
  - **A mechanism is a graph of states** (revised 2026-11-24, replacing "no branching in v1"). Each step goes from one state
    to another and is `preferred` (the textbook route, used for hints and reveal) or `accepted` (also correct). Several
    correct routes may branch from a state and **must rejoin** at a single product. The graph has no cycles, and there is
    exactly one all-preferred route. Example: Wittig, concerted [2+2] or stepwise via the betaine. A valid route the
    reaction does not accept (e.g. O-attack) is a `plausible` misconception. Misconceptions and hints belong to the state;
    the explanation belongs to the step.
  - **`partialArrowSets`** (optional, per step) lists other complete arrow sets for that step, **only** so that
    "right so far" is recognised for them. It replaces the earlier `alternatives`.
  - **Fish-hooks need full bookkeeping:** H-abstraction is 3 fish-hooks; the 2-arrow shorthand is not accepted (it shows
    as partial progress).
- **Feedback layers** (precedence decided 2026-11-24: when an authored misconception matches, it **beats** a generic rule;
  only "meaningless arrow" errors such as an empty source come first. **Also decided 2026-11-24 (build item 4):**
  partial progress comes **before** the generic chemistry rules, and shows **both** parts: the progress ("right so
  far, N more" or the authored message) **plus** any rule the incomplete arrows break ("… but carbon would have 10
  electrons"). Full order: correct → meaningless arrows → misconceptions → partial progress → generic rules → wrong;
  `docs/schema-design.md` §5.1): (1) **generic rules in code**: octet violation, charge imbalance, reversed flow (sink→source),
  source with no electrons, sink that cannot accept electrons, wrong arrow type (pair vs fish-hook);
  (2) **declarative per-state misconception entries** in content, each with a `severity`:
  `wrong` | `plausible` (valid but not the favoured pathway); (3) **tiered hint ladder** (conceptual → narrowing → reveal
  as ghost arrows). Also partial-progress messages ("right so far, N more arrows").
- **Chemistry conventions v1:**
  - Hydrogens that participate in a step are drawn explicitly in that step; others implicit.
  - Stereo (wedge/dash) is **stored and displayed** but **not validated** (validator checks connectivity, formal charges,
    lone-pair/radical counts). SN2 inversion is an explanatory note. Stereo validation (CIP) is a v2 feature.
  - Reagents/conditions are labels over the reaction arrow (context, not drawable species).
  - Counterions (Na⁺, MgBr⁺) drawn faded, not validated as participants.

## 5. Architecture

- **Validator runs in the browser**: our own arrow-application layer, in a **separate module** (so a Python/synkit-backed
  validator remains possible later). **Decided 2026-11-24 (build item 3):** the browser reads state SMILES with our own
  **strict mapped-SMILES parser** (every atom bracketed and mapped, Kekulé, no aromatic atoms), not RDKit.js; Python builds
  the same graph with real RDKit and shared fixtures require identical graphs. RDKit.js stays an option for later editor needs. Learner site is **static** (CDN-hostable).
- **Rendering:** structures drawn in our own **SVG layer** using **precomputed 2D coordinates per state** (seed from RDKit,
  hand-adjust; stored in content). RDKit is for chemistry, not layout. Avoids layout reshuffles between steps.
- **Learner site (decided 2026-11-25):** **Svelte 5 + Vite, no SvelteKit**: a static single-page app with hash routes
  (`#/`, `#/play/<slug>@<version>`), reading `catalogue.json` and the hashed reaction files. All decisions live in
  pure TypeScript (`src/moleculeDrawing/`, `src/stepSession/`, `src/siteData/`), tested first; Svelte components
  (`src/learnerSite/`) stay thin, with a few component tests. `make site` builds it into `build/site/`; `make dev`
  serves it. Item 7 is split: **7a** step screen in practice mode (built 2026-11-25), **7b** daily mode, completion
  page and `localStorage` progress, **7c** home, practice list and progress page.
- **Learner progress:** `localStorage` only, with export/import; **no learner accounts in v1**. Built in item 7b
  (`src/learnerProgress/`, `schema/progress.schema.json`; export/import arrives with the progress page in 7c).
- **Daily mode (decided 2026-11-25, item 7b):** each step is worth **3 points**, −1 per wrong check, −1 per hint, never
  below 0. After the 3rd wrong check the step is **missed** (0 points, 🟥): its arrows are shown dashed and the puzzle
  continues from the textbook step's result. Hints cost a point (the third shows ghost arrows). The name and subtitle
  are hidden until the end. An unfinished puzzle is **saved after every check and resumed** after a reload; it counts
  for the day it was started. **Streak:** consecutive days with a finished daily. **Share text:**
  `ArrowPush #142 🟩🟨🟥 5/9` (no link yet). The **finished view** (both modes) names the reaction and shows the
  tiles, step by step with the arrows in words, the mechanism summary and the attribution; daily adds points, Copy,
  streak and the time to the next puzzle.
- **Home, practice, progress (decided 2026-11-25, item 7c):** **mastery** of a reaction = points of its most recent
  finished run (either mode, same scoring) ÷ that run's maximum, grouped by slug so a new version does not reset it;
  **mastered** = 100%; class mastery averages every catalogue reaction of the class (untried = 0%). **First-try rate**:
  share of steps taken in the last 7 days that were first try, with the change from the week before. The **progress
  page** shows streak and best streak, first-try rate, mastered count, the last 28 days of dailies, mastery by type,
  the top 5 recurring misconceptions (rules by plain heading; misconceptions grouped by tag with their authored
  message), the reaction library weakest first, and **export / import (merged) / reset**. The **practice list**
  filters by type, difficulty and status (new / practised / mastered) and searches titles; filters live in the hash.
  The **home** page has today's puzzle, continue practising, mastery in brief and browse by type. The finished view
  adds "Watch out for", up to 3 related reactions (a shared class) and the mastery change.
- **Content format:** **one JSON file per reaction version** (schema: `docs/schema-design.md`). Per reaction: metadata, a graph of
  states (atom-mapped SMILES + coordinates, learner prompt, 3 hint tiers, misconceptions) joined by steps (canonical
  arrows, route preference, optional partial arrow sets, explanation), mechanism summary, version, author, licence.
- **Dev tooling:** a Python CLI linter checks that arrows applied to each state reproduce the next one and seeds
  coordinates from RDKit. **The JS validator and Python linter share the same test fixtures** (cannot drift apart).
  Built (item 5, 2026-11-24): `python/reaction_linting/`, rules and ids in `docs/schema-design.md` §3.5.
- **Catalogue build** (item 6, built 2026-11-25): `python/catalogue_building/` turns published reaction files into
  `catalogue.json` (with the daily calendar) and content-hashed reaction files; the browser reads it with
  `src/catalogue/`. The calendar is frozen and append-only, filled in whole cycles 60 days ahead, and the daily
  puzzle follows the **learner's local date**. Rules: `docs/schema-design.md` §6.
- **Visual editor from the start** (needed for community content):
  1. author draws/pastes start state (embedded sketcher — e.g. Ketcher, Apache-2.0 — for **initial structures only**; it has no curved arrows);
  2. author draws arrows with our own SVG layer; editor **applies them to generate the next state** (no hand-drawing every intermediate);
  3. author tidies layout (drag atoms; coords stored per state);
  4. per state: hints and misconceptions; per step: route preference, partial arrow sets, explanation; via form fields;
  5. "Play as learner" preview runs the **same code** as the learner screen;
  6. live lint panel (✕ blocks submission, ⚠ is advice).
  The editor reuses the validator's arrow-application code.
- **Backend (for editor/submissions only):** **TypeScript + Svelte** frontend; **FastAPI + Postgres** (reaction as JSONB
  document, version table, status column); learner site built from published JSON and served from a static host
  (e.g. Cloudflare Pages). The Python linter can also run server-side on submission.

## 6. Community content & moderation

- Contributors sign in via OAuth (e.g. GitHub/Google); learners don't need accounts.
- Submission gated on linter passing (arrows reproduce each state; every step has ≥ 1 hint — mockup shows a 3-tier minimum as advice).
- Status flow: **draft → submitted → changes requested | published**. Only the owner (later, named reviewers) publishes.
- **Published versions are immutable**; an edit creates a new version, old versions stay reachable (learner progress points at a version).
- Reviewer sees a play-through plus a diff against the previous version.
- **Licence:** CC BY-SA 4.0, contributor's name shown on the reaction page, agreed at submission.

## 7. Mockups (done 2026-11-24)

Static HTML/CSS/vanilla JS in `mockups/` (no build step; open `mockups/index.html`). Clean, slightly playful; light/dark.
Pages: `index` (home), `daily` (before/in progress/finished), `practice` (filters + 16 reaction cards), `step` (clickable
arrow drawing; SN2, 3-step aldol, radical fish-hook step; mock-state forcing bar; `?mode=daily|practice`), `complete`
(summary + attribution), `progress` (streak, history, mastery, misconceptions, library, export/import), `editor`
(timeline, canvas, lint/hints/alternatives/misconceptions/submit tabs). Validation in the mockup is hard-coded in
`mockups/scenes.js` (shape of future content: states, coords, arrows, diag entries, partials, hints). Verified in headless
Chromium: no console errors. Emoji (💡) may render as tofu in headless only.

## 8. Process rules

- User's global protocol: **strict TDD** — plan (file stubs + test cases) → stubs + tests (pytest for Python, Vitest/Jest for TS)
  → red run → minimal implementation → refactor; do not report done until 0 failures. This applies to the **real build**
  (validator, schema, linter), not to throwaway HTML sketches.
- **Naming standard** (user, 2026-11-24): every name must be unambiguous to a reader new to that part of the code. The
  reference level is `aberki1234/eyring-uncertainty` `eyring.py` and RetrosynthWeb's
  `python/retro/transform_proposals/`. The rules are in the project `CLAUDE.md` ("Code conventions"). Terms are fixed
  in `docs/schema-design.md` §0.
- **Lint and complexity checks** (user, 2026-11-24), the same as RetrosynthWeb's: ruff (incl. annotations, max 6
  arguments, max 40 statements, McCabe complexity ≤ 12), mypy strict-ish, `tools/check_limits.py` (function ≤ 50 lines,
  file ≤ 500 lines, dataclass ≤ 6 fields), `tools/check_layers.py` (import layers, no cycles); `make lint`, `make test`,
  `make check`. The TS side has the same limits in ESLint (plus `tsc --strict`, dependency-cruiser), and Prettier
  formats TS/JS at 100 characters (`make format`; checked in `make lint`).
- Documents meant for the user to read are written as **HTML**.
- Treat user details as private; don't send them to external services.

## 9. Open (not yet decided)

- The **JSON schema**, **Postgres schema** and misconception pattern syntax: `docs/schema-design.md` (2026-11-24),
  "mostly fine" per the user; the decisions in §4 are settled, and details may still be refined.
- Final product name / branding / domain.
- Hosting specifics, OAuth providers, reviewer roles beyond the owner.
- Which exact reactions beyond the list above; authoring order of the first content set.
- Deferred features: whole-mechanism mode, stereo validation, learner accounts/leaderboards/sync, visual editor polish (v2),
  synkit-assisted drafting of mechanisms.
