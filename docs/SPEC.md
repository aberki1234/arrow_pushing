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
- **One implementation, in TypeScript (decided 2026-11-25, item 8 grilling; replaces "Python builds the same
  graph with real RDKit" above and the Python linter below).** The chemistry logic (arrow notation, state graphs,
  attempt assessment), the reaction linter and the catalogue build exist **once, in TypeScript**. The linter and
  catalogue build run as Node command-line tools. **RDKit.js** (the official WebAssembly build) does what Python
  RDKit did: reading ordinary SMILES, 2D coordinate seeding, the state atom checks. It loads only in the editor and
  the Node tools, **never on the learner site**, which keeps its strict mapped-SMILES parser. Tests compare that
  parser with RDKit.js on the shared fixtures. After the port (build item **8.0**) the Python packages, `tools/*.py`
  and pytest are deleted; the conda environment stays only to provide Node. **Done 2026-11-25**:
  `src/chemistryToolkit/`, `src/reactionLinting/`, `src/catalogueBuilding/`; the agreement test is
  `src/chemistryToolkit/strictReaderAgreement.test.ts`.
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
- **Dev tooling:** a command-line linter checks that arrows applied to each state reproduce the next one and seeds
  coordinates from RDKit. Built in item 5 (2026-11-24) in Python, ported to TypeScript in item 8.0:
  `src/reactionLinting/` (`npx tsx src/reactionLinting/runFromShell.ts lint|seed-coordinates`), using the validator
  itself; rules and ids in `docs/schema-design.md` §3.5.
- **Catalogue build** (item 6, built 2026-11-25; ported to TypeScript in item 8.0): `src/catalogueBuilding/` turns published reaction files into
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
  **Decided 2026-11-25 (item 8 grilling).** Item 8 is split: **8.0** the TypeScript port (above), **8a** editor
  core, **8b** form fields and live lint, **8c** backend.
  - The editor is a **second Vite page** (`src/reactionEditor/index.html`, `make editor` on port 5174), never
    deployed to the learner host:
    its decisions in plain TypeScript in `src/reactionEditing/`, the thin Svelte app in `src/reactionEditor/`, the
    dev-server file plugin in `src/editorFileServer/` (agreed 2026-11-25 with the 8a plan). "Play as learner" runs the unsaved document in the real step screen (practice
    mode), from the start or the selected state, once every step reproduces its to-state.
  - Until 8c, authored reactions live in **`content/reactions/`** (the test examples stay in `fixtures/reactions/`);
    the catalogue build reads from there. A Vite dev-server plugin lists, opens and saves files there; Download /
    Open file also work without it. Git is the version history. A draft is `content/reactions/<slug>.json`, with
    `reactionVersion` inside; versions arrive with 8c. Generated names are `state-N` and `step-N` (renamed in 8b).
  - A drawn step is kept only if the **validator accepts its arrows** for that step (so redundant arrows are refused
    too): 8a cannot make a step that lint rule 6 rejects.
  - **Start state:** paste any SMILES RDKit.js reads (aromatic, charges, radicals); it is kekulized and heavy
    atoms are numbered 1…n in SMILES order; hydrogens stay implicit. **Ketcher is deferred** (later in item 8 or v2).
  - **Generated states keep every atom's coordinates** from the from-state; atoms added by a change step get
    RDKit.js coordinates clear of the others. The author tidies by dragging.
  - A result **identical** to an existing state (up to skeleton symmetry) **joins it automatically** ("joins state
    X"); a resonance form of one is a lint error, not a join.
  - **"Show H"** on any atom of any state turns one implicit H into a mapped H, spread to every state containing
    that atom.
  - States stay stored in full. After changing an earlier state, **"regenerate the states after this one"** (on
    request only) reapplies later steps' canonical arrows, keeps coordinates of atoms still present, and lists the
    steps whose arrows no longer apply, leaving their states unchanged.
  - **Undo/redo** over every edit; deleting a step also deletes states left unreachable, after a confirm naming them.
  - **Mechanism panel:** a list in route order, the preferred route first, each branch indented under the state it
    leaves and ending "joins X"; "add step / add branch from here". A drawn graph comes later.
  - **8a** covers structures and the mechanism (paste, draw arrows, drag, show H, change steps, branches,
    regenerate). **8b** adds every form field (prompt, hint tiers, misconceptions, partial progress messages,
    partial arrow sets, explanation, route preference, step key, caption, annotations, spectators, abbreviated
    groups, wedge style by tapping a bond, reaction metadata) and the **live lint panel**: the full linter about
    300 ms after the last edit, in a Web Worker; clicking a finding jumps to its place. **Misconceptions and partial
    arrow sets are added by drawing** them on the state (a misconception is saved as the exact pattern, then
    loosened by editing its text); a partial arrow set is kept only if it reaches the step's to-state as the
    validator would. Pinning lone-pair angles waits for v2.
  - **Built 2026-11-25 (8b):** as above, plus these defaults: clearing an optional text removes its key (required
    text stays empty for lint); making a step preferred makes the other preferred step from its state accepted;
    a drawn misconception is refused at once if its arrows are a correct answer or would hide one; tapping a bond
    in Wedges mode cycles plain → wedge → reversed → dash → reversed; state ids and step keys are renamed
    everywhere.
- **Backend (for editor/submissions only):** **TypeScript + Svelte** frontend; **TypeScript on Node + Postgres**
  (decided 2026-11-25, replacing FastAPI: the linter runs in the same process) (reaction as JSONB
  document, version table, status column); learner site built from published JSON and served from a static host
  (e.g. Cloudflare Pages). The linter runs server-side on submission.
  **Decided 2026-11-25 (8c grilling):**
  - **Scope:** 8c is for the owner alone, end to end. Contributor sign-up, the reviewer's screen (play-through +
    diff) and "changes requested" are **8d**.
  - **Content:** Postgres is the source of truth; each published version is also committed to `content/published/`
    in the repo as a backup. The four examples are imported as published version 1 (they stay test fixtures), local
    drafts as drafts. "Edit" on a published reaction makes version n+1 a draft (refused if an unpublished version
    exists).
  - **Server:** **Hono** on Node (tests through `app.request()`), **Kysely** over node-postgres with plain SQL
    migrations matching schema-design §8, hosted on **Render Starter** ($7/month). It serves the built editor at the
    same address; the editor saves through the API there, and `make editor` keeps the local file mode.
  - **Database:** **Supabase free**, used as plain Postgres through its pooler (IPv4); tables in their own schema
    `arrowpush`, the Data API off, row-level security on with no policies, the server on its own role. A scheduled
    GitHub Actions workflow runs a daily keep-awake query and a weekly `pg_dump` with a read-only role. Tests use
    **PGlite** (a fresh database per test file); an optional run against Docker Postgres before a deploy.
  - **Sign-in:** GitHub OAuth, with an allow-list holding only the owner's account. Sessions: a random id in an
    httpOnly, SameSite cookie, stored in Postgres, 30 days.
  - **Publishing:** one **Publish** action: the full lint runs on the server and any error refuses it (warnings
    shown); a one-time CC BY-SA 4.0 agreement is recorded with its date; submitted → published in one transaction;
    then a `repository_dispatch` starts a GitHub Actions workflow that exports the published versions from a
    read-only endpoint, commits the backup files, builds the site with the live `catalogue.json` as
    `--previous-catalogue`, and deploys to **Cloudflare Pages**.
  - **Addresses:** the hosts' own (`*.onrender.com`, `*.pages.dev`) until the name and domain are chosen, before the
    site is announced to learners (a new domain resets learners' saved progress; Export / Import carries it).

## 6. Community content & moderation

- Contributors sign in via OAuth (e.g. GitHub/Google); learners don't need accounts. (8c: the owner only, by GitHub;
  contributors arrive in 8d.)
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

- User's global protocol: **strict TDD** — plan (file stubs + test cases) → stubs + tests (Vitest)
  → red run → minimal implementation → refactor; do not report done until 0 failures. This applies to the **real build**
  (validator, schema, linter), not to throwaway HTML sketches.
- **Naming standard** (user, 2026-11-24): every name must be unambiguous to a reader new to that part of the code. The
  reference level is `aberki1234/eyring-uncertainty` `eyring.py` and RetrosynthWeb's
  `python/retro/transform_proposals/`. The rules are in the project `CLAUDE.md` ("Code conventions"). Terms are fixed
  in `docs/schema-design.md` §0.
- **Lint and complexity checks** (user, 2026-11-24), the same limits as RetrosynthWeb's: complexity ≤ 12, at most 6
  parameters, at most 40 statements, functions ≤ 50 lines, files ≤ 500 lines, import layers with no cycles. Since
  item 8.0 (no Python left) they are checked by ESLint (plus `tsc --strict`, `svelte-check`), dependency-cruiser
  (layers of `src/`) and Prettier (100 characters; `make format`); `make lint`, `make test`, `make check`.
- Documents meant for the user to read are written as **HTML**.
- Treat user details as private; don't send them to external services.

## 9. Open (not yet decided)

- The **JSON schema**, **Postgres schema** and misconception pattern syntax: `docs/schema-design.md` (2026-11-24),
  "mostly fine" per the user; the decisions in §4 are settled, and details may still be refined.
- Final product name / branding / domain.
- Contributors and reviewers (item 8d): OAuth providers beyond GitHub (e.g. Google for students), reviewer roles
  beyond the owner, the review screen.
- Which exact reactions beyond the list above; authoring order of the first content set.
- **Problem sets (to scope after item 8, added 2026-11-25):** sets of reactions that teach one chemistry concept
  (e.g. Zaitsev's rule, kinetic versus thermodynamic enolates), so learners can practise that concept. Not yet
  scoped: format, how sets are authored and shown, and how they relate to the catalogue are all open.
- Deferred features: whole-mechanism mode, stereo validation, learner accounts/leaderboards/sync, visual editor polish (v2),
  synkit-assisted drafting of mechanisms.
