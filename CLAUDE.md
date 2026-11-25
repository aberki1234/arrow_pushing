# mech_training

Mechanism-drawing trainer website. **Read `docs/SPEC.md` first**: it records what has been agreed with the user.
Do not change agreed decisions without asking; update `docs/SPEC.md` and `docs/spec.html` together when something changes.

- `mockups/` — throwaway static HTML sketches (done). Open `mockups/index.html`.
- `docs/` — `SPEC.md` (for the assistant) and `spec.html` (for the user); `schema-design.md` / `schema-design.html` =
  reaction file format, Postgres schema, arrow notation and how answers are assessed (mostly agreed). Keep each pair in sync.
- Documents meant for the user to read are written as **HTML** (a `.md` copy for the assistant may sit beside them).
- Real build follows the user's global strict-TDD protocol and global "Code conventions" (naming, lint, complexity).
  Build order and progress: `docs/schema-design.md` §10.

## Layout

- `schema/reaction.schema.json` — JSON Schema of one reaction file (shape only); `schema/catalogue.schema.json` — the
  learner site's `catalogue.json`; `schema/progress.schema.json` — learner progress in `localStorage`.
- `fixtures/` — shared test cases read by Vitest: `reactions/` (example reactions), `schema_cases/` (invalid edits),
  `notation/` (curved-arrow notation cases), `state_graphs/` (SMILES reading and arrow application cases),
  `assessment/` (symmetry, resonance, misconception-pattern and attempt cases), `lint_cases/` (edits that break lint rules),
  `catalogue/` (daily calendar cases, catalogue reading cases).
- `src/` — all code is TypeScript (no Python since build item 8.0). Layers lowest first (`.dependency-cruiser.cjs`):
  `arrowNotation/`, `stateGraphs/` (strict mapped-SMILES parser, applying arrows), `chemistryToolkit/` (RDKit.js:
  atoms, 2D layout, a structure as written; never reachable from the learner site), `attemptAssessment/` (the
  validator's decision), `reactionFiles/` (Ajv, state atom checks), `reactionLinting/` (the linter; command line
  `npx tsx src/reactionLinting/runFromShell.ts lint|seed-coordinates`), `catalogue/` (reading `catalogue.json`),
  `catalogueBuilding/` (the static catalogue and daily calendar: `npx tsx src/catalogueBuilding/runFromShell.ts
  build`; `make catalogue`), `moleculeDrawing/` (state → SVG primitives and pick targets, curved-arrow
  geometry), `stepSession/` (taps → arrows, a run through a reaction, scoring, snapshots, feedback text),
  `learnerProgress/` (`localStorage` progress, export / import), `dailyPuzzle/` (today's puzzle, streak, share text),
  `learnerStatistics/` (mastery, history, recurring feedback, the practice list), `siteData/` (loading the
  catalogue and reaction files), `learnerSite/` (Svelte 5 + Vite app; `make site` → `build/site/`, `make dev`).
  `testSupport/` (fixture reading for tests). Tests sit beside the code as `*.test.ts`; Svelte component tests start
  with `// @vitest-environment jsdom`. Tests that load RDKit.js get it once with `loadChemistryToolkit()` in
  `beforeAll`.

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
- **Checks**: `make lint` (`make lint-typescript`, then the reaction linter on the examples), `make test` (Vitest),
  `make check`. `make lint-typescript`: Prettier check (TS/JS, Svelte, `src/**/*.css`), ESLint with the size and
  complexity limits (Svelte files too), `tsc`, `svelte-check`, dependency-cruiser (layers of `src/`; add each new
  folder there).
