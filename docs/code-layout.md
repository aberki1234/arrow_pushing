# ArrowPush code layout

> How the TypeScript under `src/` is arranged (agreed 2026-11-27). Human copy: `docs/code-layout.html`. Keep the two
> in step. `.dependency-cruiser.cjs` enforces every order on this page (`make lint`).

## The one rule

`src/` has three levels: **tiers**, **folders** and, in large folders, **subfolders**. At every level the parts run
in one line, lowest first, and a part may import only the parts before it (and anything in earlier tiers). Files in
the same subfolder, or in a folder without subfolders, may import each other freely. Import cycles are never allowed.

- A folder with 10 or more source files gets subfolders. A folder with subfolders keeps no files of its own: every
  file, including the folder's main file, sits in one of its subfolders.
- Subfolders are split by **role** first (pure, then glue, then components) and by domain concept second.
- Folder names carry no numbers; the order lives in `.dependency-cruiser.cjs`.
- Tests sit beside the code they test. `src/testSupport/` sits outside the tiers and only tests may import it.

## Tiers

| Tier | Folders, lowest first | What it holds |
| --- | --- | --- |
| **core** | arrowNotation, stateGraphs, attemptAssessment, reactionFiles, trackFiles, catalogue | The domain model and the reaction and track file formats. Pure, shared by everything. |
| **drawing** | moleculeDrawing | Turning states into SVG drawings. Pure. |
| **learner** | stepSession, learnerProgress, dailyPuzzle, learnerStatistics, learnTracks, siteData, learnerSite | Everything the learner site needs, from a step session to the Svelte app. Never reaches RDKit.js or Node. |
| **tooling** | chemistryToolkit, reactionLinting, catalogueBuilding, draftSync, buildTools | RDKit.js and the Node tools that check, build and push content. |
| **create** | reactionEditing, reactionEditor, editorFileServer | The authoring decisions and the Create app. |
| **server** | reactionDatabase, backendServer | Postgres and the HTTP server. |

Tooling sits above learner on purpose: the tier order alone keeps RDKit.js, the linter, Create and the server out of
the learner site (the `learner-site-never-loads-node-tools` rule says the same, as a second check).

## Subfolder roles

### In the two apps (`learnerSite/`, `reactionEditor/`)

Lowest first: **model → components → io → workspaces → pages → app**.

| Role | What it holds |
| --- | --- |
| **model** | Pure TypeScript: decisions, view text, routes, and the interfaces that `io` adapters satisfy. No DOM, no fetch, no storage. |
| **components** | Svelte components that render what they are given and report what the user did through callbacks. May use `model`. Do no I/O and own no task. |
| **io** | Modules that talk to the outside world (fetch, storage, cookies, the lint worker, focus): the adapters, and for now files that mix pure logic with I/O. |
| **workspaces** | Svelte components that each own one task (a run through a reaction, a stage of a draft). They combine components and may use `io`. |
| **pages** | What the app routes to. A page loads what it needs and hosts workspaces and components. |
| **app** | The root component, routing, the entry point, `index.html` and the site CSS. |

`components` sits below `io`, so the import rule itself stops a component doing I/O.

### Shared by other folders

| Role | What it holds |
| --- | --- |
| **model** | The pure types, errors and rules of a folder that is mostly I/O (e.g. `reactionDatabase/model/`). |
| **shell** | Command-line parsing and the `runFromShell.ts` entry. |

Every other subfolder is named after its domain concept (`rules/`, `scheme/`, `mechanism/`, …).

## Folders with subfolders

| Folder | Subfolders, lowest first | Status |
| --- | --- | --- |
| create/reactionEditing | draft → mechanism → outline → teaching → publishing → review | planned |
| create/reactionEditor | model → components → io → workspaces → pages → app | planned |
| learner/learnerSite | model → components → io → workspaces → pages → app | planned |
| tooling/reactionLinting | findings → rules → tracks → shell | planned |
| drawing/moleculeDrawing | shared → state → scheme | planned |
| server/reactionDatabase | model → connection → users → reactions → transfer | planned |
| server/backendServer | requests → settings → routes → shell | planned |
| tooling/catalogueBuilding | naming → assembly → output → shell | planned |

What each subfolder holds:

- **reactionEditing** — `draft/` reading and editing the draft document (reactionDraft, startState, reactionSlugs,
  lintPlaces, fieldEdits); `mechanism/` drawing arrows into steps, atoms, regeneration, Show H, deletion, undo,
  structure exchange with Ketcher; `outline/` the mechanism outline and state strip; `teaching/` drawn wrong answers
  and the Teaching checklist; `publishing/` Publish tasks, the progress line, suggestions, Play as learner;
  `review/` the reviewer's diff.
- **reactionEditor** — `model/` editorSession, editorView, createView, fieldText, draftCreation, reviewView and the
  store interfaces; `io/` the file-store and server adapters, contributorClient, batchPublishing, the lint worker,
  fieldFocus; `workspaces/` the four stages, TeachingItemPane, CreateWorkspace, ReviewerNotes, SignInCard; `pages/`
  CreateHome, ReviewQueue, ReviewScreen, UsersPage; `app/` EditorApp and the entry.
- **learnerSite** — `model/` view models and routes; `components/` the tiles, cards, scheme, MoleculeCanvas,
  ArrowControls, RunSummary; `io/` storage, loading, theme cookie; `workspaces/` StepPlay, StepScreen,
  CheckpointRun; `pages/` the routed pages; `app/` App, SiteHeader and the entry.
- **reactionLinting** — `findings/` the finding type and the linter's reading of a reaction; `rules/` the rule
  files and `reactionLint.ts`; `tracks/` track lint; `shell/` the command line.
- **moleculeDrawing** — `shared/` geometry, layout, labels and abbreviated groups; `state/` a state's drawing and
  curved arrows; `scheme/` the catalogue card scheme.
- **reactionDatabase** — `model/` table types, errors, permissions; `connection/` Postgres and migrations;
  `users/` site users and access tokens; `reactions/` versions, drafts, publishing, submissions; `transfer/`
  export and import.
- **backendServer** — `requests/` pure request and refusal answers; `settings/` settings, dependencies, the owner
  account; `routes/` authentication and the HTTP routes; `shell/` the command line.
- **catalogueBuilding** — `naming/` content-hashed names, errors, the daily calendar; `assembly/` reading published
  versions and tracks, assembling the catalogue; `output/` writing the site and the backup; `shell/` the command
  lines.

## Placement notes

- `coordinateSeeding.ts` (laying out a state's 2D coordinates with RDKit.js) lives in `tooling/chemistryToolkit/`:
  both the linter's `seed-coordinates` command and `reactionEditing` use it, so it must sit below both.
- `stateAtomConsistency.ts` lives in `tooling/reactionLinting/` (its only user), so `core/` never needs RDKit.js.
- `lintRequests.ts` (the lint worker's request protocol) lives with the worker in `reactionEditor/`.

## Follow-ups (not done yet)

- Merge `trackFiles` into `reactionFiles`, and `siteData` into `learnerSite`; move `staticFileNaming` out of
  `catalogueBuilding`.
- A rule that code outside a folder imports only that folder's entry file.
- Split the files that mix pure logic with I/O (`io/` holds them for now).
