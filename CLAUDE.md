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
  learner site's `catalogue.json`.
- `fixtures/` — shared by pytest and Vitest: `reactions/` (example reactions), `schema_cases/` (invalid edits),
  `notation/` (curved-arrow notation cases), `state_graphs/` (SMILES reading and arrow application cases),
  `assessment/` (symmetry, resonance, misconception-pattern and attempt cases), `lint_cases/` (edits that break lint rules),
  `catalogue/` (daily calendar cases, catalogue reading cases).
- `python/` — Python packages (layers in `pyproject.toml`, lowest first): `arrow_notation/` (parse/print curved
  arrows), `state_graphs/` (state graph, SMILES reading with RDKit, applying arrows), `attempt_assessment/`
  (symmetry, resonance, misconception patterns, assessing an attempt), `reaction_files/` (schema validation, RDKit
  atom checks), `reaction_linting/` (the linter CLI: `PYTHONPATH=python python -m reaction_linting lint|seed-coordinates`),
  `catalogue_building/` (the static catalogue and daily calendar: `python -m catalogue_building build`; `make catalogue`).
- `src/` — TypeScript: `arrowNotation/`, `stateGraphs/` (strict mapped-SMILES parser, applying arrows),
  `attemptAssessment/` (the validator's decision),
  `reactionFiles/` (Ajv), `catalogue/` (reading `catalogue.json`: today's daily ref, a version's file path),
  `testSupport/` (fixture reading for tests). Tests sit beside the code as `*.test.ts`.
- `tests/` — pytest tests, mirroring `python/` and `tools/`.
- `tools/` — `check_limits.py`, `check_layers.py`.

## Code conventions specific to this project

- **Terms**: `docs/schema-design.md` §0 fixes each domain term to one meaning (state, step, route preference, locus,
  arrow set, canonical arrows, partial arrow sets, σ skeleton, attempt assessment, step outcome, …). Use those words in
  code, tests and messages, and extend that table when a new term appears. In particular: a step is never called an
  "edge"; `routePreference` (preferred/accepted) is not `submission_status` (draft/…/published); an attempt
  assessment is not a step outcome or a review decision.
- **Case**: JSON keys and TypeScript are camelCase; Python and SQL are snake_case. A JSON key holding a mapping is
  `keyToValue` (`stateIdToState`, `mapNumberToCoordinates`).
- **Git**: branch `main`; `.githooks/pre-push` runs `make check` in the `mech_training` env (enable per clone with
  `git config core.hooksPath .githooks`; already set here).
- **Environment**: `conda activate mech_training` (from `environment.yml`), or prefix with `conda run -n mech_training`.
- **Formatting**: `make format` runs Prettier (100 characters) on the TS/JS code; `make lint` only checks it.
  Fixtures, docs and mockups keep their hand-written layout.
- **Checks**: `make lint` (ruff, mypy, `tools/check_limits.py`, `tools/check_layers.py`, the reaction linter on the examples), `make test`, `make check`.
  Python import layers are listed lowest first in `pyproject.toml` `[tool.layers]`; add each new package there.
  The TypeScript side (`make lint-typescript`): Prettier check, ESLint with the same limits, `tsc`, dependency-cruiser.
