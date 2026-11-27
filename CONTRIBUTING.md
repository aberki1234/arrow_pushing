# Contributing

Thank you for helping. There are two kinds of contribution, and they go in by different routes:

- **Reactions** (mechanisms, hints, misconceptions, explanations): write them in **Create**, the site's reaction
  editor, and submit them for review there. Don't open pull requests that edit `content/published/`: it is a backup
  that the deploy workflow writes from the database.
- **Code, tests and docs**: fork, branch and open a pull request against `main`, as described below.

Security problems: please don't open a public issue; see [`SECURITY.md`](SECURITY.md).

## Setting up

You need **Node.js 24** and npm. Nothing else is installed globally: RDKit.js, Svelte, Vite and the rest come
from npm.

```bash
git clone <your fork>
cd mech_training
npm ci
git config core.hooksPath .githooks   # the pre-push hook: runs `make check` before every push
make check                            # lint and the whole test suite: should pass on a fresh clone
```

- **Node from conda (optional).** `environment.yml` pins Node 24 the way the maintainer runs it:
  `conda env create -f environment.yml`, then `conda activate mech_training`. Without conda, use any Node 24
  (nvm, fnm, your package manager) and set `PREPUSH_CONDA_ENV=active` so the pre-push hook uses the Node on your
  `PATH`.
- **`npm ci` refuses an older Node** (`.npmrc` has `engine-strict=true`). If you use nvm and conda together,
  nvm's Node may come first on `PATH`; put Node 24's `bin` folder first.
- **No secrets or databases are needed** for `make check`, `make site`, `make dev` or `make editor`. The
  database tests use PGlite, Postgres compiled to WebAssembly, in memory. Only running the backend server needs
  settings: see [`.env.example`](.env.example).
- **Linux and WSL** are what the maintainer and CI use; macOS should work too (nothing is Linux-only except an
  optional memory cap). `make test` runs at low priority and, where systemd's user manager runs, in a
  memory-capped scope (`TEST_MEMORY`, 5G by default); elsewhere it runs without the cap.

## Everyday commands

| Command | What it does |
| --- | --- |
| `make check` | `make lint` then `make test`: what CI and the pre-push hook run |
| `make lint` | Prettier check, ESLint (with size and complexity limits), `tsc`, `svelte-check`, dependency-cruiser, the reaction linter on the examples, the track linter |
| `make test` | Vitest, at most 4 test files at once |
| `make format` | Rewrite the TypeScript, JavaScript, Svelte and CSS files in Prettier's layout (100 columns) |
| `make site` / `make dev` | Build the learner site with the example reactions into `build/site/` / serve it with Vite |
| `make editor` | Create on your machine, at http://localhost:5174/, reading and saving `content/reactions/` |
| `make server` | The backend (sign-in, the reaction API, the built editor); needs Postgres and the settings in `.env.example` |

**One test file:** `npx vitest run src/core/arrowNotation/curvedArrowNotation.test.ts`. Never run Vitest with its default
worker count on a small machine: a worker that loads PGlite and RDKit.js uses about 1.1 GB.

## How we write code

### Tests first

Every change to behaviour starts with a test that fails:

1. Write the test for the behaviour you want, beside the code (`thing.ts` → `thing.test.ts`).
2. Run it and **watch it fail for the reason you expect**: an assertion, not a typo or a missing import.
3. Write the least code that makes it pass.
4. Refactor with the tests green, then run `make check`.

A bug fix starts with a test that reproduces the bug. Pull requests that change behaviour without a test that
covers it will be asked for one. Shared test cases (reactions, notation cases, lint cases) live in `fixtures/`.
Svelte component tests start with `// @vitest-environment jsdom`. Tests that need RDKit.js load it once with
`loadChemistryToolkit()` in `beforeAll`.

### Where code goes

Read [`docs/code-layout.md`](docs/code-layout.md) before adding or moving a file. `src/` has six tiers, lowest
first: `core`, `drawing`, `learner`, `tooling`, `create`, `server`. Each tier holds folders, and folders of 10 or
more files are split into ordered subfolders. At every level a part may import only the parts before it.
dependency-cruiser enforces this (`.dependency-cruiser.cjs`); a new folder or subfolder must be added there and to
`docs/code-layout.md`.

### Words

[`docs/schema-design.md`](docs/schema-design.md) §0 gives each domain term exactly one meaning: state, step,
locus, arrow set, canonical arrows, route preference, attempt assessment, step outcome and the rest. Use those words
in code, tests and messages; add a row when you need a new one. For example, a step is never an "edge", and
`routePreference` (preferred / accepted) is not `submissionStatus` (draft / … / published).

### Style

- TypeScript throughout, `camelCase` in TypeScript and JSON, `snake_case` in SQL. A JSON key that holds a mapping
  is named `keyToValue` (`stateIdToState`).
- Names say what a thing is, in full words: `reactionVersion`, not `rv`.
- ESLint's limits: complexity 12, 6 parameters, 40 statements and 50 lines per function, 500 lines per file.
  Split rather than disable a rule.
- Fixtures, docs and mockups keep their hand-written layout; Prettier formats only code.

### Docs

`docs/` holds the design: [`SPEC.md`](docs/SPEC.md) (what has been decided), `schema-design.md` (file format,
database, arrow notation, assessment), `curriculum.md` and `code-layout.md`. Each has an `.html` twin for reading
in a browser; **change both together**. If your change alters a decision recorded in `SPEC.md`, say so in the pull
request, so the maintainer can agree to it first.

## Pull requests

- One change per pull request, on a branch of your fork.
- `make check` passes; CI runs the same checks on every pull request.
- The description says what changed and why, and how you checked it (which tests you added, what you tried in
  the browser).
- Commit messages: a short summary line, then the reason in the body.

## Licences

Code contributions are licensed under the project's code licence ([`LICENSE`](LICENSE)). Reaction content is
licensed CC BY-SA 4.0 (each reaction file has `"licence": "CC-BY-SA-4.0"`); Create asks you to agree to that when
you submit a reaction, and names you as an author.
