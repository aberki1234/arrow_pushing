# ArrowPush — agreed spec (v0.1)

> Source of truth for what has been **agreed with the user** (design grilling, 2026-11-24). Do not silently change
> anything under "Agreed"; if it needs to change, ask the user and edit this file in the same change.
> Items under "Open" are NOT decided. A human-readable copy is `docs/spec.html` — keep both in sync.
> The product is named **ArrowPush** (decided 2026-11-26), at `arrowpushing.com`.

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
  - **Learn (decided 2026-11-25, item 9):** guided **tracks** of **problem sets**, each teaching one concept
    (§5 "Learn"). Practice is the library, organised by reaction; Learn is the path, organised by concept.

## 2. Content scope v1

~15 named reactions, **polar** first: SN1, SN2, E1, E2, aldol, Claisen, Grignard addition, Wittig, Diels–Alder,
pinacol, Beckmann, Fischer esterification, Michael addition, Friedel–Crafts acylation.
**Plus a few radical entries** (radical bromination: initiation/propagation/termination; Barton–McCombie).
Diels–Alder needs a concerted multi-arrow step (3 arrows) — the model must support it from day one.

**First Learn track (decided 2026-11-25): "Aromatic chemistry"**, which adds SEAr (electrophilic aromatic
substitution) reactions to the list above. Problem set **"The arenium ion"**: bromination of benzene (FeBr₃),
nitration, sulfonation, Friedel–Crafts alkylation (with its carbocation rearrangement trap), Friedel–Crafts acylation.
Problem set **"Directing effects"**: nitration of anisole (ortho/para) against nitrobenzene (meta) as a contrast pair,
then a halobenzene (deactivating but ortho/para). The track ends with a checkpoint.

**The first SEAr batch (decided 2026-11-26; drafted by the assistant, §6 "Drafting with an assistant"):** about 21
reactions, track `aromatic-chemistry`, problem sets in this order:
  1. **Making the electrophile**, each its own reaction: nitronium from HNO₃/H₂SO₄; Br₂/FeBr₃; the acylium ion from
     RCOCl/AlCl₃; the carbocation from RCl/AlCl₃ (with the n-propyl → isopropyl rearrangement); SO₃ in H₂SO₄.
  2. **The arenium ion**: nitration, bromination, Friedel–Crafts alkylation and acylation, sulfonation of benzene.
  3. **Directing effects**: toluene, anisole, phenol (Br₂, no Lewis acid), acetanilide (ortho/para);
     chlorobenzene (deactivating but ortho/para); nitrobenzene, methyl benzoate or benzaldehyde (meta).
  4. **Predict the position**: bromination of acetanilide, nitration of methyl benzoate, Friedel–Crafts acylation
     of anisole, chlorination of toluene (new substrates, so the checkpoint can test transfer while still only
     reviewing earlier problem sets, §5 "Learn").
  5. **Checkpoint**, mixing reactions from sets 1–4.
- **Each SEAr reaction starts from the activated electrophile, its real counter-anion and the arene** (NO₂⁺ + HSO₄⁻ +
  benzene); the counter-anion (HSO₄⁻, FeBr₄⁻, AlCl₄⁻) takes the proton in the last step and regenerates the catalyst.
  No bare H⁺ or unnamed "base".
- **Selectivity** is mostly taught one reaction per substrate, attacking at the observed position, with the Wheland
  resonance argument in hints and explanations. Toluene, anisole, nitrobenzene and chlorobenzene also draw the key
  Wheland resonance forms as steps (polar steps moving only π bonds and lone pairs; there is no resonance step kind).
- **Para is the `preferred` route; ortho is an `accepted` route where it is a real product** (toluene, ~60:40 o:p);
  para only where sterics make it dominant (anisole, acetanilide). **Meta attack on an o/p director is never an
  accepted route**; it is answered with feedback.
- `difficultyTier`: 1 making the electrophile and benzene SEAr, 2 directing effects, 3 reactions with drawn resonance
  steps. `dailyPuzzleEligible: true` for all (the checkpoint only reuses earlier reactions, so none is kept unseen).
- **A pilot comes first**: nitronium formation, nitration of benzene, nitration of anisole (with resonance steps);
  reviewed by the owner before the remaining reactions are drafted.
- **Heteroaromatics** (pyrrole/furan at C2, pyridine at C3, harsh) are a second, short batch; naphthalene and indole
  are left out.

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
    exactly one all-preferred route. **Revised 2026-11-26 (item 10e): an accepted route may instead end at an
    alternative product** (a minor regioisomer, e.g. ortho beside para); the all-preferred route ends at the main
    product. Reaching an alternative product is full marks (step outcomes are about the arrows); the accepted step's
    explanation and the product's caption (the linter warns without one) say what was made; the finished view is
    unchanged. Only regioisomers, by authoring convention (E/Z and others wait until a reaction needs them). Example: Wittig, concerted [2+2] or stepwise via the betaine. A valid route the
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
- **Learn: tracks and problem sets (decided 2026-11-25, item 9; terms in `docs/schema-design.md` §0, format §6.1):**
  - **Structure:** a **track** (e.g. Aromatic chemistry) holds ordered **problem sets**; a problem set holds ordered
    **set items**. A problem set is an **authored, ordered** list of reactions with a stated learning goal, not a class
    filter: it may cross reaction classes, and one reaction may sit in several problem sets. A set item names a
    **reaction slug** (always the latest published version) and a one-line "why this one" note. Each problem set
    opens with a **concept card**: a small Markdown subset (paragraphs, bold/italic, lists; Unicode sub/superscripts)
    and optional SVG figures. Worked-example items (a reaction played back with its arrows shown) are a later,
    cheap addition; single-question drills are not planned.
  - **Nothing is locked:** a suggested order only. **Next up** = the first set item, in track order, that is not done.
  - **Done / mastered:** a set item is **done** once its reaction has a finished run in any mode (practice, daily,
    from Learn or Practice); **mastered** is the existing 100% rule. A problem set shows done / total and its
    mastery. Difficulty tier is shown but does not set the order; problem-set membership does not affect daily
    eligibility.
  - **Checkpoint:** each track ends with a checkpoint problem set (`checkpoint: true`) mixing reactions from its
    earlier problem sets, shuffled once per attempt, **names hidden** until finished. It is a third run mode,
    **`checkpoint`**, scored by the **daily rules** (3 attempts per step, −1 per wrong check or hint, missed steps).
    Daily and checkpoint runs start on electron-pair arrows and show no "radical" tag (decided 2026-11-26), so
    telling radical from polar is left to the learner; practice keeps the fish-hook start and the tag.
    A checkpoint item is done only by a run in that checkpoint (runs record an optional `problemSetRef`,
    `"<trackSlug>/<problemSetSlug>"`, since problem-set slugs are unique only within a track); its runs count
    towards mastery like any other. **An attempt is one sitting on the checkpoint's own page** (built 2026-11-26,
    item 9c): Start checkpoint shuffles the reactions not yet done there (all of them once every one is done) and
    plays them one after another; the order is not stored and no URL names a reaction. Names stay hidden in its
    list until done there.
  - **Authoring:** one hand-written JSON file per track, `content/tracks/<trackSlug>.json` (shape
    `schema/track.schema.json`), in git; the reaction linter checks it and the catalogue build compiles it into
    `catalogue.json`. A set item whose reaction is not published gives a lint **warning** and is left out of the
    build; a problem set with no published item is hidden. A push changing `content/tracks/` also rebuilds the
    site. Tracks move into Postgres with an editor screen only when contributors author problem sets.
  - **Pages:** header order Home · Daily · **Learn** · Practice · Progress. `#/learn`: one card per track (title,
    one-line goal, done / total bar, **Continue** to Next up). `#/learn/<track>`: its problem sets as a vertical
    numbered path (title, concept in a line, done count, mastery ring; Next up highlighted).
    `#/learn/<track>/<set>`: the concept card (open until one of its set items is done, then folded; agreed
    2026-11-26 instead of "after the first visit", so no visits are stored), then the numbered set items
    (title, difficulty tier, "why this one", done / mastered mark) and a **Start / Next up** button.
  - **Playing from a problem set** (`#/learn/<track>/<set>/<reaction>`): the step screen shows a breadcrumb
    ("Aromatic chemistry › The arenium ion · 2 of 5"); the finished view replaces the related reactions with
    **Next in set: …** and a link back, or **Problem set complete** with a link to the next problem set. The same
    reaction opened from Practice behaves as before.
  - **Home** gains a **Continue learning** card (last problem set touched and its Next up), beside today's puzzle
    and above continue practising. **Progress** gains a **Tracks** section (each track's done / total and mastery,
    problem set by problem set). The only new stored field is the last problem set touched.
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
    diff) and "changes requested" are **8e** (renumbered 2026-11-26: 8d is now the Create flow, below).
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
  - **Sign-in:** GitHub OAuth, with an allow-list (numeric GitHub user ids) holding only the owner's account.
    Sessions: a random token in an httpOnly, SameSite=Lax cookie, signed, stored in Postgres, 30 days.
    **Changed 2026-11-25 (8c part 2, agreed with the user):** sign-in uses the library **Better Auth** rather than
    hand-written OAuth; its tables `users`, `sessions`, `accounts`, `verifications` replace the hand-written users
    and sessions tables (schema-design §8), GitHub tokens stored encrypted.
  - **Publishing:** one **Publish** action: the full lint runs on the server and any error refuses it (warnings
    shown); a one-time CC BY-SA 4.0 agreement is recorded with its date; submitted → published in one transaction;
    then a `repository_dispatch` starts a GitHub Actions workflow that exports the published versions from a
    read-only endpoint, commits the backup files, builds the site with the live `catalogue.json` as
    `--previous-catalogue`, and deploys to **Cloudflare Pages**.
  - **Defaults chosen with the 8c part 1 plan (2026-11-25):** the licence is agreed **once per author**: the
    first Publish needs the tick, later versions record the date of that first agreement. The **server numbers
    versions**: on every save it sets the stored document's `reactionVersion` and `previousReactionVersion` to
    the row's, whatever the editor sent. Saving a reaction whose versions are all published is refused ("use
    Edit"); only the reaction's owner saves or edits it; the owner or a reviewer publishes.
  - **Defaults chosen with 8c part 3 (2026-11-25):** the first deploy is run by hand with "start a new
    calendar"; every later deploy must fetch the live `catalogue.json`, so a failed fetch never resets the
    calendar. The weekly dump leaves out session, account and verification rows (sign-in tokens). Publish in
    the editor saves the draft first.
  - **Read-only role (decided 2026-11-25):** the dump connects as `arrowpush_readonly`, which migration 0002
    gives SELECT and one read policy per table (`--enable-row-security`), not BYPASSRLS. The server's role owns
    the tables (it runs the migrations), so row-level security does not restrict it; every other role sees no
    rows. On Supabase the owner makes `arrowpush_readonly` first (LOGIN, password) as `postgres`.
  - **Addresses:** the hosts' own (`*.onrender.com`, `*.pages.dev`) until the name and domain are chosen, before the
    site is announced to learners (a new domain resets learners' saved progress; Export / Import carries it).
- **Create (item 8d, decided 2026-11-26 from the mockup `mockups/create.html`):** the editor is **reskinned** into a
  staged flow that shows only the fields the current stage needs (the 8b editor showed every field at once). It is
  **for the owner alone**, built so that opening it to contributors (8e) is a small step.
  - **What stays:** every decision in `src/reactionEditing/`, the server's API, the database, Play as learner, live
    lint in a worker, and `make editor`'s file mode (the new pages work on `content/reactions/` too). Mostly the
    Svelte pages in `src/reactionEditor/` change.
  - **Create home ("Your mechanisms"):** each reaction with a thumbnail, its status (draft / submitted / changes
    requested / published) and a progress line ("mechanism done, teaching 4 of 9"); **New mechanism**; **Improve a
    published one** (Edit → version n+1, as in 8c).
  - **Four stages**, shown as a stepper; a suggested order, never locked:
    1. **Start:** the reaction's name, the starting materials (SMILES, with a few example chips; the sketcher stays
       deferred) with a live drawing, and optional conditions. Nothing else; the slug is made from the name.
    2. **Mechanism:** the drawing with **Arrow**, **Fish-hook**, **Move atoms** and **⋯ More** (Show H, Add a
       molecule = a change step, Wedges, Shorten a group = abbreviated groups, Edit as SMILES with regenerate); a
       **row of state thumbnails** under the drawing; **Make the step**, refused at once with the reason when the
       validator refuses the arrows; after it, one optional "Why does this step happen?" (the explanation), **Another
       step from here** and **Another correct route** (a branch).
    3. **Teaching:** a **to-do list** built from the draft's fields (lint findings shown on their item; a new
       draft fails the schema, so lint alone cannot drive it), grouped by step, each item marked needed,
       recommended or optional: the question the learner sees (prompt), hints (one needed, three best; the third
       shows ghost arrows), why it happens, common wrong answers (drawn on the molecule, then the message and
       wrong / plausible; loosening the pattern and atom roles under "Match more than this exact drawing"), and the
       summary at the end (needed: the schema requires it; the mockup showed it optional). One item open at a time beside a small drawing of its state.
    4. **Publish:** Play as learner; the checks written as tasks with **Fix →** (going to the stage and item);
       reaction type and difficulty (suggested from the mechanism, changeable), a one-line description; **More
       details** (authors, references, caption); **Advanced** (step keys, state ids, partial arrow sets and partial
       progress messages, spectators, annotations, the mapped SMILES); the licence tick; **Publish** for the owner
       (**Submit for review** for a contributor, 8e).
  - **Hosting: one domain**, **`arrowpushing.com`** (bought by the owner 2026-11-26; set up in 8d part 3). The learner site at `<domain>` on Cloudflare Pages; Create at
    **`create.<domain>`, served by the Render server** with its API, so the editor and API share an origin (no
    CORS, the sign-in cookie unchanged). RDKit.js and the editor stay off the learner host. Until the domain is
    bought, Create stays at the `onrender.com` address. The Create pages reuse the learner site's header and styles
    and link back to it.
  - **One top bar for both (changed 2026-11-26 by the owner, replacing "learners see no Create tab"):**
    Home · Daily · Learn · Practice · Progress · **Create** on the learner site and on Create alike
    (`learnerSite/siteNavigation.ts`, `SiteHeader.svelte`), so they read as one site. The learner site's Create
    tab links to `VITE_CREATE_ADDRESS` (the deploy workflow passes the `BACKEND_URL` variable); Create's other
    tabs link to `VITE_LEARNER_SITE_ADDRESS`. (Until 8e, anyone not on the allow-list who signed in saw
    "Creating is invite-only for now"; since 8e anyone signs in as a contributor.)
  - **The theme is shared by both sites (fixed 2026-11-26 at the owner's report):** the light/dark choice is
    kept in a cookie on the parent domain (`arrowpush_theme`, Domain=`arrowpushing.com`, a year) as well as in
    the learner's progress, and each site reads the cookie first at start (`learnerSite/sharedTheme.ts`);
    `localStorage` alone is per origin, so the two sites never saw each other's choice.
  - **Defaults chosen while building the pages (2026-11-26):** the draft **saves by itself** about 1.5 s
    after the last change to it, and at once on going back to Your mechanisms (no Save button; Download the
    JSON file stays on Publish); a new draft names the signed-in user as its author; Publish's checks list
    the needed teaching items still missing as well as the lint findings; the Create home lists reactions
    without thumbnails (its list has no documents); "Submit for review" waits for 8e, so a role that may
    not publish sees no button; hint tiers left empty at the end are dropped.
    A check clicked on Publish goes to its stage, opens the folded section holding its field, scrolls to
    it, focuses it and flashes it briefly (`fieldFocus.ts`; each field carries `data-field`).
  - **Ready for contributors:** every "may this user …" decision on the server sits in one module, by site role
    (owner / reviewer / contributor, already a column of `users`); the editor asks the server for the signed-in
    user's role and shows Publish or Submit for review from it. 8e then adds sign-up beyond the allow-list,
    Submit, the review screen (play-through + diff), changes requested and the header tab.

## 6. Community content & moderation

- Contributors sign in via OAuth (e.g. GitHub/Google); learners don't need accounts. (8c: the owner only, by GitHub;
  contributors arrive in 8e.)
- Submission gated on linter passing (arrows reproduce each state; every step has ≥ 1 hint — mockup shows a 3-tier minimum as advice).
- Status flow: **draft → submitted → changes requested | published**. Only the owner (later, named reviewers) publishes.
- **Published versions are immutable**; an edit creates a new version, old versions stay reachable (learner progress points at a version).
- Reviewer sees a play-through plus a diff against the previous version.
- **Licence:** CC BY-SA 4.0, contributor's name shown on the reaction page, agreed at submission.
- **Contributors (item 8e, decided 2026-11-26):**
  - **Anyone who signs in is a contributor** (site role `contributor`): they draft and submit; nothing goes live
    without a review. The GitHub allow-list stops deciding who may sign in (it keeps naming the owner).
  - **Sign-in with GitHub or Google** (Better Auth's two providers; the owner sets up a Google OAuth app).
  - **Reviewers:** the owner and the contributors the owner promotes on a small Users page. Reviewers review and
    publish; only the owner changes roles.
  - **Improving someone else's published reaction** is allowed: the contributor's copy goes to review as the
    reaction's next version, credited to both authors; the original author is not asked first. (The rule "only
    the reaction's owner saves or edits it" becomes: the author of the unpublished version saves it; anyone may
    start the next version of a published reaction, while no other unpublished version exists.)
  - **Agreed 2026-11-26 from the mockup `mockups/review.html`:**
    - **Sign-in page** with GitHub and Google; Create gains a sub-navigation **Your mechanisms · Review (n) ·
      Users** (Review for reviewers, Users for the owner).
    - **Contributor:** Your mechanisms shows a banner when changes are requested and the reviewer's overall note
      on the reaction; the Publish stage shows the reviewer's notes (each with "Go there →"), an optional note to
      the reviewer, the licence tick and **Submit for review**. "Improve a published one" lists every published
      reaction ("Suggest version n+1").
    - **Review queue**, oldest first, each marked new reaction / improvement / resubmitted. **Review screen:**
      Play as learner; by default **only what changed** against the previous published version (text with
      deletions and insertions, a changed state as before / after drawings, a new wrong answer as its drawing;
      a new reaction shows everything); notes pinned to a change plus an overall note; **Publish** or **Request
      changes**.
    - **Users page** (owner only): name, sign-in provider, reactions, joined, and a role menu Contributor /
      Reviewer / **Blocked** (a blocked user can sign in and see their drafts but not save or submit; their
      submissions leave the queue).
    - **Notifications in the site only** for now (the Review count, the contributor's banner); email later.
    - **At most 5 open drafts per contributor** (draft, submitted or changes requested).
    - **Submitted drafts stay editable**; saving one takes it out of review (back to draft).
    - **Review notes** clear when the contributor submits again.
    - **A reviewer cannot review their own submission**; the owner may still publish their own directly.
  - **Defaults chosen while building 8e (2026-11-26; open to change):**
    - Only the **owner** publishes directly; a reviewer's own versions go through review like anyone's (read
      from "a reviewer cannot review their own submission; the owner may still publish their own"). A reviewer's
      own submissions are left out of their queue.
    - The owner is made by the GitHub allow-list when that GitHub account is created or linked; Google
      accounts are linked to a GitHub one only when both providers verified the same email.
    - Your mechanisms lists the reactions whose newest version the user wrote, and their own published ones;
      someone else's published reactions are only under "Improve a published one" ("Suggest version n").
    - An author is added to the next version's `authors` once (not if they wrote a version of it before, or
      own it). Saving the same document again leaves a submitted version in review (only a changed draft is
      taken out); Create skips an autosave already done by Submit or Publish.
    - What changed is listed per item: each reaction field, each state's structure, prompt, caption, labels,
      each hint, each wrong answer (by its id), each partial answer, each step's arrows, partial arrow sets,
      caption, explanation and details. A changed or removed text shows deletions and insertions word by word;
      a new wrong answer is drawn with its arrows when they are exact.

- **Drafting with an assistant (decided 2026-11-26).** To speed up content, an assistant drafts reactions and the
  owner only reviews them (and corrects conditions) in Create before publishing.
  - **Phase 1 (build item 10):** the assistant (Claude Code in this repository) writes reaction files locally,
    lints them, and pushes them to `create.arrowpushing.com` **as drafts owned by the owner's account**.
    - **Personal access tokens:** stored hashed, revocable, with an expiry; minted by a server command
      (`create-token --user <email>`); no token page in Create until phase 2. The backend accepts
      `Authorization: Bearer <token>` beside the cookie session.
    - **A token may only read its user's reactions and save drafts**: never submit, review, publish, start a next
      version or change roles, whatever its user's site role. Publishing stays a person's click in Create.
    - **Draft sync** (one module, a command line on top): `check` (the linter), `push-draft <file|dir>` (refuses a
      file with lint errors; sends the content hash of the draft it last saw, and the server refuses the save when
      the draft changed since or the slug is published), `pull-draft <slug>` (fetches the owner's edited draft to work on).
      The owner's edits in Create are never silently overwritten.
    - **What the assistant writes:** every learner text (prompt, hints, misconception and partial-progress
      messages, explanations, summary), the textbook `conditionsLabel` (the owner corrects it), tiers and daily
      eligibility, and the track file. **`authors` is the owner alone** for now; no "drafted with an assistant"
      mark.
  - **Phase 2 (after the SEAr batch; detailed design deferred):** a remote **MCP server** on the same Render service
    (`/mcp`), with the same tokens, so other people's agents can draft too: a format brief, check, apply arrows,
    pull, save draft; no publish tool; rate-limited; a token page in Create.
  - **Reused:** the design of RetrosynthWeb's `refinement_mcp` (checking separate from saving, no confirming tool,
    a token tied to an account, rate limits), not its Python code. **Not used:** synkit's `mechsearch` (A* search
    trained on USPTO; weak on SEAr: a Kekulé-dependent Wheland replay bug, hand-fixed nitration and Friedel–Crafts
    records; a heavy Python stack). Its arrow notation is the same as ours (`lp O1 -> σ O1-C2`), so its reviewed
    routes could be imported one day.

## 7. Mockups (done 2026-11-24)

Static HTML/CSS/vanilla JS in `mockups/` (no build step; open `mockups/index.html`). Clean, slightly playful; light/dark.
Pages: `index` (home), `daily` (before/in progress/finished), `practice` (filters + 16 reaction cards), `step` (clickable
arrow drawing; SN2, 3-step aldol, radical fish-hook step; mock-state forcing bar; `?mode=daily|practice`), `complete`
(summary + attribution), `progress` (streak, history, mastery, misconceptions, library, export/import), `editor`
(timeline, canvas, lint/hints/alternatives/misconceptions/submit tabs). Validation in the mockup is hard-coded in
`mockups/scenes.js` (shape of future content: states, coords, arrows, diag entries, partials, hints). Verified in headless
Chromium: no console errors. Emoji (💡) may render as tofu in headless only.
**`create` (added 2026-11-26, agreed as the design of item 8d):** the Create home ("Your mechanisms") and the four
stages (Start, Mechanism, Teaching, Publish); the SN2 step can be drawn by clicking (`#start`, `#mech`, `#teach`,
`#publish` open a stage). It supersedes `editor.html` as the editor's design.
**`review` (added 2026-11-26, item 8e):** sign-in, a contributor's Your mechanisms and
Publish stage, the review queue, the review screen (only what changed, notes) and the owner's Users page
(`#signin`, `#contrib`, `#submit`, `#queue`, `#review`, `#users`); agreed 2026-11-26.

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
- Branding beyond the name (logo, colours). Name and domain decided 2026-11-26: ArrowPush, `arrowpushing.com`.
- Which exact reactions beyond the list above; authoring order of the first content set.
- Tracks after "Aromatic chemistry" (e.g. Zaitsev versus Hofmann, kinetic versus thermodynamic enolates) and their
  problem sets. (Problem sets themselves were scoped on 2026-11-25: §1, §2, §5 "Learn".)
- Deferred features: whole-mechanism mode, stereo validation, learner accounts/leaderboards/sync, visual editor polish (v2).
- The phase-2 MCP server's detailed design (§6 "Drafting with an assistant").
