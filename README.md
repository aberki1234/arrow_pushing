# mech_training

A website for practising **reaction mechanisms of named reactions by drawing curved arrows**. The learner taps a
source of electrons (a lone pair, a bond or an unpaired electron) and then where they go. The site checks that the
arrows are valid and that they lead to the next intermediate, then explains what went wrong and why. "ArrowPush",
the name used on the site, is a placeholder.

- **Daily puzzle:** one mystery named reaction a day, 3 attempts per step, points and a shareable result grid.
- **Practice:** any reaction, untimed, with free hints that end in the answer drawn as faint arrows.
- **Progress:** mastery, streaks, recurring misconceptions and export/import, stored in the browser only (no
  accounts).

Status: the learner site is built (build items 1–7 in [`docs/schema-design.md`](docs/schema-design.md) §10) with
four example reactions: SN2, base-catalysed aldol addition, radical bromination and the Wittig reaction. All code is
TypeScript since item 8.0. The editor for contributed reactions (items 8a, 8b) and its backend (8c) are next.

## How it works

- **One JSON file per reaction version** ([`schema/reaction.schema.json`](schema/reaction.schema.json)). A reaction
  is a graph of *states* (atom-mapped Kekulé SMILES plus 2D coordinates, prompts, hints, misconceptions) joined by
  *steps* (canonical curved arrows, explanation). Branches are allowed if they rejoin, e.g. the Wittig's concerted
  route and its betaine route.
- **Arrows are judged by their result.** The browser applies the learner's arrows to the state and compares the
  result with the next state, allowing for symmetry and resonance. A correct product reached by nonsense arrows does
  not pass. Authored misconceptions, partial progress and generic rules (octet, reversed flow, arrow type, …) give
  the feedback.
- **One implementation, in TypeScript.** The same code validates attempts in the browser, lints reactions and
  builds the catalogue (as Node command-line tools), so the linter accepts exactly what the learner site accepts.
  RDKit.js (RDKit compiled to WebAssembly) reads ordinary SMILES and seeds coordinates for the tools; the learner
  site never loads it and reads states with its own strict parser, which the tests check against RDKit.
- **The learner site is static.** A build step turns published reaction files into `catalogue.json` (including a
  daily calendar that only ever grows) and content-hashed reaction files. The app (Svelte 5, built with Vite) reads
  them, so the whole site can be served from any static host.

## Getting started

You need [conda](https://docs.conda.io) (Miniconda or Miniforge). The environment provides Node.js 24; everything
else, RDKit.js included, comes from npm.

```bash
conda env create -f environment.yml
conda activate mech_training
export PATH="$CONDA_PREFIX/bin:$PATH"   # if nvm or a system Node.js would otherwise come first
npm ci
git config core.hooksPath .githooks     # run `make check` before every push
```

Run the site locally:

```bash
make catalogue    # catalogue.json and reaction files from fixtures/reactions into build/site/
make dev          # http://localhost:5173/
```

`make site` builds the deployable site into `build/site/`. Serve that folder with any static server, for example
`npx vite preview --outDir build/site`.

## Commands

| Command | What it does |
|---|---|
| `make check` | `make lint`, then `make test`. The pre-push hook runs it. |
| `make lint` | Prettier, ESLint (with the size and complexity limits), `tsc`, `svelte-check`, dependency-cruiser (import layers); the reaction linter on the example reactions. |
| `make test` | Vitest. |
| `make format` | Rewrite TypeScript, JavaScript, Svelte and the site's CSS in Prettier's layout. |
| `make catalogue` | Build the catalogue from the example reactions into `build/site/`, starting a new calendar. |
| `make site` | `make catalogue`, then the Vite build, merged into `build/site/`. |
| `make dev` | The Vite development server, reading the catalogue from `build/site/`. |

Tools on the command line (TypeScript, run by `tsx`):

```bash
npx tsx src/tooling/reactionLinting/shell/runFromShell.ts lint fixtures/reactions/*.json [--json]
npx tsx src/tooling/reactionLinting/shell/runFromShell.ts seed-coordinates FILE...   # RDKit coordinates for states missing them
npx tsx src/tooling/catalogueBuilding/shell/runFromShell.ts build FILE... --out DIR (--previous-catalogue FILE | --start-new-calendar)
```

## Repository layout

| Path | Contents |
|---|---|
| [`docs/`](docs/) | [`SPEC.md`](docs/SPEC.md): every product decision agreed so far, with a readable copy in `spec.html`. [`schema-design.md`](docs/schema-design.md): the reaction format, arrow notation, how attempts are assessed, lint rules, progress format and build order, also with an HTML copy. |
| [`schema/`](schema/) | JSON Schemas: a reaction file, `catalogue.json`, learner progress. |
| [`src/`](src/) | TypeScript, layered lowest first: arrow notation, state graphs, the RDKit.js adapter, attempt assessment, schema and atom checks, the reaction linter, catalogue reading and building, molecule drawing, the step session, progress, daily puzzle, statistics, site data, and the Svelte app in `learnerSite/`. Tests sit beside the code as `*.test.ts`. |
| [`fixtures/`](fixtures/) | Example reactions and the shared test cases. |
| [`mockups/`](mockups/) | The throwaway HTML sketches the site was designed from. Open `mockups/index.html`. |

[`CLAUDE.md`](CLAUDE.md) holds the working conventions: the fixed meaning of each domain term, naming, case
(camelCase JSON and TypeScript, snake_case SQL), and the strict test-first process.

## Adding a reaction

1. Write the reaction file in the format of [`docs/schema-design.md`](docs/schema-design.md) §3. The examples in
   `fixtures/reactions/` are complete references, and the Wittig example shows branches and abbreviated groups.
2. Seed missing coordinates with `npx tsx src/tooling/reactionLinting/shell/runFromShell.ts seed-coordinates FILE`, then tidy them by hand: lay the
   molecules out along the reaction, with the reacting atoms facing each other.
3. Lint until it is clean: `npx tsx src/tooling/reactionLinting/shell/runFromShell.ts lint FILE`. Errors block publishing; warnings are advice.
4. Play it with `make catalogue && make dev`.

A visual editor for this is items 8a and 8b.

## Deploying

The learner site is static, so any static host works, and none needs a custom domain to try it out:
GitHub Pages (`<user>.github.io/<repo>/`, for public repositories or paid plans), Cloudflare Pages
(`*.pages.dev`), Netlify (`*.netlify.app`) or Vercel (`*.vercel.app`). Routes use the URL hash and asset paths are
relative, so no rewrite rules or base-path settings are needed.

Points to plan for:

- **The build needs Node.js 24 and `npm ci`** (the catalogue build lints with RDKit.js). Either build locally with
  `make site` and upload `build/site/`, or build in GitHub Actions and deploy from there.
- **Pass the live `catalogue.json` to every build** as `--previous-catalogue`, so the daily calendar keeps its past
  and planned days. Only the first deploy uses `--start-new-calendar`.
- **Rebuild at least every few weeks.** Each build plans the daily calendar about 60 days ahead.
- **Progress is stored per site address.** Moving to a new domain later starts learners afresh; they can carry
  their progress over with Export and Import on the Progress page.

The editor's backend (TypeScript on Node + PostgreSQL, item 8c) will need a server host.

## Licence

Reaction content is published under **CC BY-SA 4.0**, with the author's name shown on each reaction. The code has
no licence yet.
