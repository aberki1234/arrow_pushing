# mech_training

Mechanism-drawing trainer website. **Read `docs/SPEC.md` first**: it records what has been agreed with the user.
Do not change agreed decisions without asking; update `docs/SPEC.md` and `docs/spec.html` together when something changes.

- `mockups/` — throwaway static HTML sketches (done). Open `mockups/index.html`.
- `docs/` — `SPEC.md` (for the assistant) and `spec.html` (for the user); `schema-design.md` / `schema-design.html` =
  reaction file format, Postgres schema, arrow notation and how answers are assessed (mostly agreed); `curriculum.md` /
  `curriculum.html` = the Learn tracks roadmap, first year to graduate; `code-layout.md` / `code-layout.html` = how
  `src/` is arranged (tiers, subfolder order, subfolder roles). Keep each pair in sync.
- Documents meant for the user to read are written as **HTML** (a `.md` copy for the assistant may sit beside them).
- Real build follows the user's global strict-TDD protocol and global "Code conventions" (naming, lint, complexity).
  Build order and progress: `docs/schema-design.md` §10.

## Layout

- `schema/reaction.schema.json` — JSON Schema of one reaction file (shape only); `schema/track.schema.json` — one
  Learn track file (`content/tracks/<trackSlug>.json`); `schema/catalogue.schema.json` — the learner site's
  `catalogue.json`; `schema/progress.schema.json` — learner progress in `localStorage`.
- `content/` — `published/` (the deploy workflow's backup of every published version), `tracks/` (the live Learn
  tracks), `LICENSE` (CC BY-SA 4.0). `content/drafts/` is gitignored: drafting work (reaction drafts, plans,
  reports) stays local and goes to Create as drafts; the repository is public, so no working notes or local paths
  in tracked files.
- `fixtures/` — shared test cases read by Vitest: `reactions/` (example reactions), `schema_cases/` (invalid edits),
  `notation/` (curved-arrow notation cases), `state_graphs/` (SMILES reading and arrow application cases),
  `assessment/` (symmetry, resonance, misconception-pattern and attempt cases), `lint_cases/` (edits that break lint rules),
  `catalogue/` (daily calendar cases, catalogue reading cases), `tracks/` (the example Learn track and its figure;
  its lint cases are `lint_cases/track_edits.json`), `performance_reactions/` (the slowest published reactions,
  copied as published: the responsiveness budgets in `learner/stepSession/largeReactionResponsiveness.test.ts`,
  issue #1; not linted as examples).
- `src/` — all code is TypeScript (no Python since build item 8.0). **Read `docs/code-layout.md`** before adding or
  moving a file: six tiers, folders in each, and ordered subfolders in folders of 10+ files; at every level a part
  imports only the parts before it (`.dependency-cruiser.cjs`). Tiers and folders, lowest first:
  - `core/`: `jsonValues/` (checks on plain JSON values: `isRecord`), `arrowNotation/`, `stateGraphs/` (strict
    mapped-SMILES parser, applying arrows), `reactionFiles/` (the typed reaction file and its two readers, Ajv, the
    preferred route), `attemptAssessment/` (the validator's decision), `stereoQuestions/` (the stereo question:
    question centres, assessing a drawn arrangement, its lint problems), `trackFiles/` (the track schema and types),
    `catalogue/` (reading `catalogue.json`, reaction version refs).
  - `drawing/`: `moleculeDrawing/` (state → SVG primitives and pick targets, curved-arrow geometry, the scheme).
  - `learner/`: `stepSession/` (taps → arrows, a run through a reaction, scoring, snapshots, feedback text),
    `learnerProgress/` (`localStorage` progress, export / import), `dailyPuzzle/` (today's puzzle, streak, share
    text), `learnerStatistics/` (mastery, history, recurring feedback, the practice list), `learnTracks/` (Learn:
    done and mastered per set item, Next up, Next in set, the concept card's text), `siteData/` (loading the
    catalogue and reaction files), `learnerSite/` (Svelte 5 + Vite app; `make site` → `build/site/`, `make dev`).
  - `tooling/`: `chemistryToolkit/` (RDKit.js: atoms, 2D layout and coordinate seeding, a structure as written),
    `reactionLinting/` (the linter, reactions and tracks; state atom checks; command line
    `npx tsx src/tooling/reactionLinting/shell/runFromShell.ts lint|seed-coordinates|lint-tracks`), `catalogueBuilding/`
    (the static catalogue and daily calendar: `npx tsx src/tooling/catalogueBuilding/shell/runFromShell.ts build`;
    `make catalogue`), `draftSync/` (item 10c: pushing lint-clean reaction files to Create as drafts with an access
    token and pulling them back: `npx tsx src/tooling/draftSync/runFromShell.ts check|push-draft|pull-draft`,
    settings `ARROWPUSH_ACCESS_TOKEN`, `ARROWPUSH_SERVER_URL`; hashes in `.draft-sync.json`, not in git),
    `buildTools/` (`make ketcher`: the pinned Ketcher release, Create's structure editor, into
    `vendor/editor-public/ketcher`, not in git).
  - `create/`: `reactionEditing/` (the editor's decisions: drafts, drawn arrows → steps, change steps, show H,
    regeneration, deletion, undo, the mechanism outline, Play as learner), `reactionEditor/` (Create, item 8d: Your
    mechanisms and the Start / Mechanism / Teaching / Publish stages, Svelte; the lint worker; `make editor` →
    http://localhost:5174/ on `content/reactions/`; built for the Render server), `editorFileServer/` (the dev
    server's reading and saving of `content/reactions/`).
  - `server/`: `reactionDatabase/` (8c: Postgres via Kysely, schema `arrowpush`; SQL migrations, drafts, versions,
    publishing, export, import; tests on PGlite with `testSupport/temporaryDatabase.ts`), `backendServer/`.

  `testSupport/` (fixture reading for tests) sits outside the tiers. Tests sit beside the code as `*.test.ts`; Svelte
  component tests start with `// @vitest-environment jsdom`. Tests that load RDKit.js get it once with
  `loadChemistryToolkit()` in `beforeAll`.

## Code conventions specific to this project

- **Terms**: `docs/schema-design.md` §0 fixes each domain term to one meaning (state, step, route preference, locus,
  arrow set, canonical arrows, partial arrow sets, σ skeleton, attempt assessment, step outcome, …). Use those words in
  code, tests and messages, and extend that table when a new term appears. In particular: a step is never called an
  "edge"; `routePreference` (preferred/accepted) is not `submission_status` (draft/…/published); an attempt
  assessment is not a step outcome or a review decision.
- **Case**: JSON keys and TypeScript are camelCase; SQL is snake_case. A JSON key holding a mapping is
  `keyToValue` (`stateIdToState`, `mapNumberToCoordinates`).
- **Git**: branch `main`; `.githooks/pre-push` runs `make check` in the `mech_training` env (enable per clone with
  `git config core.hooksPath .githooks`; already set here).
- **Environment**: `conda activate mech_training` (from `environment.yml`), or prefix with `conda run -n mech_training`.
  A shell profile may put nvm's older Node first even then: `npx`/`npm` need the environment's `bin` first on `PATH`
  (the Makefile does this from `CONDA_PREFIX`, so with `conda run` set `CONDA_PREFIX` to the environment if needed).
- **Formatting**: `make format` runs Prettier (100 characters) on the TS/JS code; `make lint` only checks it.
  Fixtures, docs and mockups keep their hand-written layout.
- **Test resources**: `make test` runs at `nice -n 19` in a `systemd-run` scope capped at `TEST_MEMORY` (5G, no
  swap), and Vitest runs at most 4 files at once (`vite.config.ts`): a PGlite + RDKit.js worker peaks near 1.1 GB and
  WSL has 8 GB. Run single heavy files the same way: `systemd-run --user --scope -q -p MemoryMax=5G -p
  MemorySwapMax=0 nice -n 19 npx vitest run <file>`. Never run Vitest with its default worker count.
- **Checks**: `make lint` (`make lint-typescript`, then the reaction linter on the examples and `make lint-tracks`), `make test` (Vitest),
  `make check`. `make lint-typescript`: Prettier check (TS/JS, Svelte, `src/**/*.css`), ESLint with the size and
  complexity limits (Svelte files too), `tsc`, `svelte-check`, dependency-cruiser (the tiers, folders and subfolders of
  `src/`; add each new folder or subfolder there and to `docs/code-layout.md`).
