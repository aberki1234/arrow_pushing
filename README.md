# ArrowPush

**Learn organic reaction mechanisms by drawing the curved arrows yourself.** Live at
**[arrowpushing.com](https://arrowpushing.com)**.

You tap a source of electrons (a lone pair, a bond or an unpaired electron), then where they go. The site works out
what your arrows actually do to the molecules and checks whether that reaches the next intermediate. If it doesn't,
it tells you what went wrong and why: an overfull octet, a reversed arrow, or a known misconception for that step.

- **Learn:** tracks of problem sets from first-year organic chemistry upwards, each with short concept cards
  (29 tracks so far; see [`docs/curriculum.md`](docs/curriculum.md)).
- **Daily:** one mystery named reaction a day, 3 attempts per step, points and a streak.
- **Practice:** any reaction, untimed, with hints that end in the answer drawn as faint arrows.
- **Progress:** mastery, streaks and recurring mistakes, kept in your browser only (no accounts), with export and
  import.
- **Create** ([create.arrowpushing.com](https://create.arrowpushing.com)): sign in with GitHub or Google to write
  a reaction or improve a published one. Contributions are reviewed before they go live.

About 240 reactions are published. Reaction content is CC BY-SA 4.0, and each reaction names its authors.

## How it works

- **One JSON file per reaction version** ([`schema/reaction.schema.json`](schema/reaction.schema.json)). A reaction
  is a graph of *states* (atom-mapped Kekulé SMILES plus 2D coordinates, prompts, hints, misconceptions) joined by
  *steps* (canonical curved arrows, explanation). Branches are allowed if they rejoin, such as the Wittig's concerted
  route and its betaine route.
- **Arrows are judged by their result.** The browser applies your arrows to the state and compares the result with
  the next state, allowing for symmetry and resonance. A correct product reached by nonsense arrows does not pass.
  Authored misconceptions, partial progress and general rules give the feedback.
- **One implementation, in TypeScript.** The same code checks attempts in the browser, lints reactions in Create
  and on the command line, and builds the catalogue, so the linter accepts exactly what the learner site accepts.
  RDKit.js (RDKit compiled to WebAssembly) reads ordinary SMILES and lays out molecules for the tools. The learner
  site never loads it: it reads states with its own strict parser, which the tests check against RDKit.
- **The learner site is static.** A build turns the published reactions and Learn tracks into `catalogue.json`
  (with a daily calendar that only ever grows) and content-hashed reaction files. The app (Svelte 5, built with
  Vite) reads them, so the site can be served from any static host.
- **Create has a small backend.** A Node server (Hono, Better Auth for GitHub and Google sign-in, Kysely on
  PostgreSQL) stores drafts and versions, runs review and publishing, and serves the editor. The editor uses
  [Ketcher](https://github.com/epam/ketcher) to draw structures. Publishing starts a GitHub Actions workflow that
  rebuilds and deploys the learner site.

## Getting started

You need **Node.js 24**. Everything else, RDKit.js included, comes from npm. You don't need a database or any
secrets to run the tests, the learner site or the editor.

```bash
git clone https://github.com/aberki1234/mech_training.git
cd mech_training
npm ci
git config core.hooksPath .githooks   # run `make check` before every push
make check                            # lint and the whole test suite
```

If you use conda, `conda env create -f environment.yml && conda activate mech_training` provides Node 24.
[`CONTRIBUTING.md`](CONTRIBUTING.md) covers setup in more detail, the test-first rule and pull requests.

**The learner site**, with the example reactions in `fixtures/`:

```bash
make catalogue   # catalogue.json and reaction files into build/site/
make dev         # http://localhost:5173/
```

**Create, the editor**, on reaction files in `content/reactions/` (no server, no sign-in):

```bash
make editor      # fetches the pinned Ketcher release once, then http://localhost:5174/
```

**The backend server** needs a PostgreSQL database and a GitHub OAuth app of your own. Copy
[`.env.example`](.env.example) to `.env`, fill it in, then:

```bash
set -a; . ./.env; set +a
make editor-build   # the editor the server serves, into build/editor/
make server         # applies migrations, then http://localhost:3000/
```

## Commands

| Command | What it does |
|---|---|
| `make check` | `make lint`, then `make test`. CI and the pre-push hook run it. |
| `make lint` | Prettier, ESLint (with size and complexity limits), `tsc`, `svelte-check`, dependency-cruiser (the code layout), the reaction linter on the examples, the track linter. |
| `make test` | Vitest (at most 4 files at once; database tests use PGlite, in memory). |
| `make format` | Rewrite TypeScript, JavaScript, Svelte and CSS in Prettier's layout. |
| `make catalogue` | Build the catalogue from the example reactions and track into `build/site/`, starting a new calendar. |
| `make site` | `make catalogue`, then the Vite build, merged into `build/site/` (serve it with `npx vite preview --outDir build/site`). |
| `make dev` | The learner site's development server, reading `build/site/`. |
| `make editor` | Create's development server on `content/reactions/`. |
| `make editor-build` | Create built for the backend server, into `build/editor/`. |
| `make ketcher` | Fetch the pinned, checksum-checked Ketcher release into `vendor/` (not in git). |
| `make server` | The backend server; settings from the environment (`.env.example`). |

Command-line tools (TypeScript, run by `tsx`):

```bash
npx tsx src/tooling/reactionLinting/shell/runFromShell.ts lint FILE... [--json]
npx tsx src/tooling/reactionLinting/shell/runFromShell.ts seed-coordinates FILE...   # RDKit coordinates for states missing them
npx tsx src/tooling/reactionLinting/shell/runFromShell.ts lint-tracks TRACK... --published-folder DIR
npx tsx src/tooling/catalogueBuilding/shell/runFromShell.ts build FILE... --out DIR (--previous-catalogue FILE | --start-new-calendar)
npx tsx src/tooling/draftSync/runFromShell.ts check|push-draft|pull-draft ...   # files ↔ drafts on a Create server
```

## Repository layout

| Path | Contents |
|---|---|
| [`src/`](src/) | All the code, in six tiers, lowest first: `core` (arrow notation, state graphs, assessment, file formats), `drawing` (molecules and arrows as SVG), `learner` (the step session, progress, daily puzzle, Learn, and the Svelte app in `learnerSite/`), `tooling` (RDKit.js, the linter, the catalogue build, draft sync), `create` (the editor's logic and its Svelte app), `server` (the database and the backend). Each tier imports only from the tiers before it; see [`docs/code-layout.md`](docs/code-layout.md). Tests sit beside the code as `*.test.ts`. |
| [`content/`](content/) | `published/`: every published reaction version, backed up from the database by the deploy workflow. `tracks/`: the Learn tracks. `drafts/`: reactions being written. |
| [`schema/`](schema/) | JSON Schemas: a reaction file, a Learn track, `catalogue.json`, learner progress. |
| [`fixtures/`](fixtures/) | Example reactions and track, and the shared test cases. |
| [`docs/`](docs/) | The design. [`SPEC.md`](docs/SPEC.md): every product decision so far. [`schema-design.md`](docs/schema-design.md): the reaction format, arrow notation, how attempts are assessed, lint rules, the database. [`curriculum.md`](docs/curriculum.md): the Learn roadmap. [`code-layout.md`](docs/code-layout.md): how `src/` is arranged. Each has an HTML copy for reading in a browser. |
| [`mockups/`](mockups/) | The HTML sketches the site was designed from. Open `mockups/index.html`. |
| `.github/workflows/` | CI on every pull request; deploying the learner site; database upkeep. |
| `render.yaml`, `deploy/` | The backend's hosting on Render. |

## Adding a reaction

The easiest way is **[Create](https://create.arrowpushing.com)**. Sign in, draw the states and arrows, and submit
for review. Create lints the reaction as you go, and you can play it as a learner before you submit.

To write reaction files by hand instead:

1. Follow the format in [`docs/schema-design.md`](docs/schema-design.md) §3. The files in `fixtures/reactions/`
   are complete references; the Wittig example shows branches and abbreviated groups.
2. Seed missing coordinates with `seed-coordinates`, then tidy them so the molecules are laid out along the
   reaction, with the reacting atoms facing each other.
3. Lint until clean with `lint`: errors block publishing, warnings are advice.
4. Put the file in `content/reactions/` and open it in `make editor` to check it and play it. You can also push
   it to Create as a draft with draft sync.

## Deploying

The live site runs on three services:

- **The learner site:** Cloudflare Pages.
  - `.github/workflows/deploy-site.yml` rebuilds it after every publish, and when `content/tracks/` changes.
  - It backs up the published versions to `content/published/`, then continues the live daily calendar.
- **Create and its backend:** Render (`render.yaml`).
- **The database:** Supabase Postgres.
  - It's kept awake daily, and dumped weekly with the dump encrypted (`.github/workflows/database-upkeep.yml`).

A fork needs its own accounts, secrets and repository variables for these; each workflow's header comment lists
them. The learner site alone is static, so any static host works: build with `make site` and upload
`build/site/`.

Before building and uploading it yourself, note:

- **Pass the live `catalogue.json` to every build** as `--previous-catalogue`, so the daily calendar keeps its past
  and planned days. Only the first deploy uses `--start-new-calendar`.
- **Rebuild at least every few weeks.** Each build plans the calendar about 60 days ahead.
- **Progress is stored per site address.** After a move to a new domain, learners carry their progress over with
  Export and Import on the Progress page.

## Contributing

Contributions are welcome:
- **Reactions:** write them through Create.
- **Code and docs:** open a pull request; see [`CONTRIBUTING.md`](CONTRIBUTING.md).
- **Security problems:** report them privately, as described in [`SECURITY.md`](SECURITY.md).

[`CLAUDE.md`](CLAUDE.md) is the same guidance written for coding assistants.

## Licence

Reaction content (`content/`, and the reactions in `fixtures/`) is published under
**[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)**, with each author named on the reaction.
The code's licence has not been added yet.
