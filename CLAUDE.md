# mech_training

Mechanism-drawing trainer website. **Read `docs/SPEC.md` first**: it records what has been agreed with the user.
Do not change agreed decisions without asking; update `docs/SPEC.md` and `docs/spec.html` together when something changes.

- `mockups/` — throwaway static HTML sketches (done). Open `mockups/index.html`.
- `docs/` — `SPEC.md` (for the assistant) and `spec.html` (for the user); `schema-design.md` / `schema-design.html` =
  reaction file format, Postgres schema, arrow notation and how answers are assessed (mostly agreed). Keep each pair in sync.
- Documents meant for the user to read are written as **HTML** (a `.md` copy for the assistant may sit beside them).
- Real build follows the user's global strict-TDD protocol and global "Code conventions" (naming, lint, complexity).

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
- **Checks**: `make lint` (ruff, mypy, `tools/check_limits.py`, `tools/check_layers.py`), `make test`, `make check`.
  Python import layers are listed lowest first in `pyproject.toml` `[tool.layers]`; add each new package there.
  The TypeScript ESLint setup with the same limits is created together with the TS project.
