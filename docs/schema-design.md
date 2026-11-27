# Schema design pass — DRAFT (2026-11-24)

> Status: **mostly agreed.** The user reviewed the draft and agreed it "mostly"; the decisions below are settled.
> Human-readable copy: `docs/schema-design.html` (keep both in sync). Summary decisions are also in SPEC §4.
>
> Decided 2026-11-24:
> - **Q1** A resonance form of the expected state is accepted automatically, **checked in the browser** on the σ
>   skeleton (§4). Nothing about resonance is stored in the reaction file.
> - **Q2 (revised)** A mechanism is a **graph of states**. Several correct routes may branch from a state and must
>   rejoin at the product (Wittig: concerted [2+2] or stepwise via the betaine).
> - **Q3** An authored misconception beats a generic rule.
> - **Q4** Fish-hook steps need full bookkeeping (3 arrows for H-abstraction).
> - **Acceptance is by result.** Any legal, non-redundant arrow set whose result matches the target state (up to
>   symmetry and resonance) is correct. The old per-step `alternatives` list is gone. In its place,
>   `partialArrowSets` (optional) lists other complete arrow sets **only so partial progress is recognised**.
> - **Naming standard**: names are unambiguous to a reader new to the code (see `CLAUDE.md`, "Code conventions").
>   Every JSON key below follows it, and §0 fixes each term to one meaning.

## 0. Terms

Each term below means exactly one thing in the docs, the JSON and the code.

| Term | Meaning |
|---|---|
| **map number** | The atom-map number of an atom in a mapped SMILES. Unique within a reaction; an atom keeps it in every state. |
| **atom label** | Element + map number, e.g. `O1`. The element is checked against the state. |
| **state** | One drawn mixture of molecules: a mapped SMILES plus how it is drawn and what the learner is told there. |
| **step** | One elementary move from one state (`fromStateId`) to another (`toStateId`). In graph terms a step is an edge; the docs and code always say "step". |
| **mechanism graph** | All states of a reaction and the steps between them. |
| **route** | A path of steps from the start state to the product state. |
| **route preference** | Per step: `preferred` (the textbook route) or `accepted` (also correct). Not to be confused with a reaction version's **submission status** (draft, submitted, …). |
| **locus** | Where electrons sit: a lone pair (`lp`), an unpaired electron (`rad`), a σ bond or a π bond. |
| **source locus / destination locus** | Where an arrow's electrons come from / end up. |
| **arrow** | One curved arrow: source locus → destination locus. `->` moves a pair (2 e⁻), `~>` (fish-hook) one electron. In code: `CurvedArrow` (never bare "arrow", which in TypeScript means an arrow function), with `electronsMoved` 2 or 1; a locus is an `ElectronLocus`. |
| **arrow set** | The arrows drawn for one step, unordered. |
| **canonical arrows** | The step's arrow set used for the hint reveal and as the reference answer. |
| **partial arrow sets** | Other complete arrow sets for the same step, listed only so that partial progress is recognised (§5.3). They are not needed for acceptance. |
| **σ skeleton** | What π/lone-pair arrows cannot change: atoms, elements, which pairs are σ-bonded, H count per atom. |
| **state graph** | A state read into atoms and bonds (`StateGraph`). Each atom stores its element, implicit hydrogen count and **nonbonding electron count** (lone-pair electrons plus any unpaired one); each bond its order. Formal charge, lone pairs and unpaired electrons are derived, never stored. |
| **resonance-equivalent** | Two states with the same σ skeleton, the same charge per molecule and the same unpaired-electron count per molecule. |
| **skeleton symmetry** | A permutation of a state's atoms that maps its σ skeleton onto itself (an automorphism). It covers both equivalent atoms and resonance-equivalent atoms (both carboxylate O). |
| **attempt assessment** | The validator's answer to one check of the learner's arrows (§5.1). Not to be confused with a step outcome or a review decision. |
| **step outcome** | What the learner's progress records for a step: first try, after retry, after hint, or missed. |
| **misconception** | An authored arrow pattern on a state with a feedback message (§5.2). |
| **lint finding** | One broken lint rule at one place in a reaction file: rule id, lint level, JSON pointer, message (§3.5). |
| **lint level** | `error` (blocks submission, ✕ in the editor) or `warning` (advice, ⚠). Not a misconception's `severity`. |
| **generic rule** | A check built into the code (octet, reversed flow, …) with a fixed id. |
| **change step** | A step with no arrows that adds or removes molecules (a reagent arrives, a work-up). |
| **spectator** | An atom drawn faded and never validated (Na⁺, MgBr⁺). |
| **abbreviated group** | Bystander atoms drawn as one short label (Ph, OMe) at their attachment atom wherever they hang off the rest by one bond. Never tapped; validation still uses every atom. |
| **reaction slug / reaction version / reaction version ref** | `aldol-addition-base` / `3` / `aldol-addition-base@3`. |
| **format version** | The version of the file format itself, separate from a reaction version. |
| **track** | A top-level Learn path (e.g. Aromatic chemistry): an ordered list of problem sets, one file `content/tracks/<trackSlug>.json` (§6.1). |
| **problem set** | An authored, ordered list of set items teaching one concept, with a concept card. Always written in full: never bare "set", which would clash with **arrow set**. Not a reaction class filter. |
| **set item** | One entry of a problem set: a reaction slug (always its latest published version) and a "why this one" note. |
| **concept card** | The short text (small Markdown subset, optional SVG figures) that opens a problem set. |
| **Next up** | The first set item, in track order, that is not done. |
| **done (set item)** | Its reaction has a finished run in any mode; in a checkpoint, a finished run in that checkpoint. Not the same as **mastered** (most recent run at 100%). |
| **checkpoint** | A problem set marked `checkpoint: true` that ends a track: earlier reactions shuffled, names hidden, played in the `checkpoint` run mode with the daily rules. |
| **run mode** | How a run is played and scored: `practice`, `daily` or `checkpoint` (§7). |
| **access token** | A personal token (`Authorization: Bearer …`) standing for one user, stored hashed, revocable, expiring; it may only read that user's reactions and save drafts (item 10). Not a session, which a browser holds. |
| **draft sync** | Pushing a local, lint-clean reaction file to the server as a draft (`push-draft`) and fetching a draft back (`pull-draft`), refused when the draft changed since it was last seen (item 10). |
| **creation stage** | One of Create's four stages: `start`, `mechanism`, `teaching`, `publish` (SPEC §5 "Create"). |
| **teaching item** | One entry of the Teaching to-do list (a state's learner prompt, hint tiers or misconceptions, a step's explanation or caption, the mechanism summary), with its need (needed / recommended / optional) and status (missing / started / done). Built from the draft's fields, not from lint. |
| **check task** | A lint finding as Create's Publish stage shows it: plain words, the creation stage that fixes it, and its place. |
| **site role / site action** | A user's role (`owner`, `reviewer`, `contributor`, `blocked`) and what it allows (`createReactions`, `seeEveryReaction`, `submitForReview`, `publish` (directly, the owner only), `review`, `manageUsers`); decided only in `reactionDatabase/model/sitePermissions.ts`. |
| **version author** | The user who wrote a reaction version (`reaction_versions.author_user_id`); only they save it. Not the reaction's owner, who made version 1. |
| **review decision** | A reviewer's `publish` or `changes_requested` on a submitted version, stored in `reviews` with an overall comment and **pinned notes**. Not an attempt assessment. |
| **compared entry / change key / version change** | What the review screen compares between two versions: one reaction field, a state's structure or one of its learner texts, a step's arrows or texts (`reactionEditing/review/versionChanges.ts`). Its **change key** names it in both versions (`state:reactants hintTiers:1`) and is what a pinned note points at; a **version change** is one added, removed or changed. |

Abbreviations: `lp` = lone pair; `rad` = radical (unpaired electron); SMILES = simplified molecular-input line-entry
system; e⁻ = electron.

## 1. Identifiers and versioning

| Thing | Form | Rule |
|---|---|---|
| Reaction slug | `aldol-addition-base` (`^[a-z0-9]+(-[a-z0-9]+)*$`) | chosen at first submit, **never changes** after first publish (the title can) |
| Reaction version | integer 1, 2, 3 … per slug | a new draft gets `max+1`; a published version's document never changes |
| Reaction version ref | `aldol-addition-base@3` | what learner progress, share links and the daily calendar store |
| Content hash | `sha256` of canonical JSON (keys sorted at every depth, no whitespace, UTF-8, non-ASCII as is, numbers as JavaScript writes them) | full 64 hex in the catalogue; static file name `r/<slug>/<version>.<first 8 hex of hash>.json` for cache-busting; lets progress detect a changed file |
| Format version | `"formatVersion": 1` | bumped by a format migration |
| State id | short slug, e.g. `s0`, `betaine` | unique within the reaction |
| Step key | short slug, e.g. `enolate` | unique within the reaction; kept **across** reaction versions where the step means the same thing, so statistics aggregate by `reactionSlug/stepKey` |
| Misconception id | slug unique within the reaction, plus optional `misconceptionTag` from a controlled list (`attack-leaving-group`, `pi-to-own-atom`, …) | the progress page groups by tag |
| Generic rule id | fixed in code. Applying arrows (build item 3, §4 point 2): `atom-not-in-state`, `destination-not-adjacent-to-source`, `no-electrons-at-source`, `destination-bond-already-exists`, `destination-bond-missing`, `fish-hook-to-lone-pair`, `odd-electrons-in-bond`, `bond-order-above-three`, `octet-exceeded`. Assessing an attempt (build item 4): `wrong-arrow-type`, `redundant-arrow`, `minor-resonance-form`, `reversed-flow` | also counted on the progress page. Charge is conserved by construction (§4), so it has no rule |

## 2. Atoms, loci and the arrow notation

**State SMILES** (`mappedSmiles`): one dot-separated, **fully atom-mapped, Kekulé** SMILES (no aromatic lower-case;
arrows act on drawn π bonds). Each heavy atom has a map number. A hydrogen is an explicit mapped atom `[H:n]` **iff it
takes part in some step** (or the author wants it drawn, e.g. for a wedge). All other H are implicit. Lone-pair counts
follow from valence and charge. Radicals are bracket atoms with missing H (`[CH3:4]`, `[Br:1]`).

**Locus notation:**

| Notation | Meaning |
|---|---|
| `lp O1` | a lone pair on O1 (pairs on one atom are equivalent; no index) |
| `rad C3` | the unpaired electron on C3 |
| `σ C2-Br3` / `sigma C2-Br3` | the σ bond (either atom order) |
| `π C5-O6` / `pi C5-O6` | a π bond (the 2nd or 3rd order of a multiple bond) |

**Arrow** = `<source locus> -> <destination locus>` (2 e⁻), or `~>` (fish-hook, 1 e⁻). Borrowed from synkit's
`parse_arrows`. The destination locus is where the electrons **end up**:

* `lp X` — a lone pair on X (a bond breaks toward X)
* `σ X-Y` — a new bond (X and Y were not bonded)
* `π X-Y` — the existing X–Y bond gains one order
* `rad X` — fish-hook only: the electron becomes unpaired on X

Examples: SN2 is `lp O1 -> σ O1-C2`, `σ C2-Br3 -> lp Br3`. H-abstraction is `rad Br1 ~> σ Br1-H2`,
`σ C3-H2 ~> σ Br1-H2`, `σ C3-H2 ~> rad C3`.

**Parser and printer** (build item 2:
`src/core/arrowNotation/curvedArrowNotation.ts`, shared cases in `fixtures/notation/curved_arrows.json`):
* **Printed form**: `σ`/`π` symbols (`sigma`/`pi` accepted on input), bond atoms in ascending map-number order
  (`σ C3-H2` prints as `σ H2-C3`), single spaces. Equal arrows parse to equal structures.
* **Error codes**, checked in this order: `malformed-arrow`, `malformed-locus`, `malformed-atom-label`,
  `conflicting-atom-labels` (one map number, two elements), `bond-to-same-atom`, `arrow-to-itself`,
  `unpaired-electron-in-pair-arrow`. The first three are syntax, and the schema's arrow regex refuses exactly
  those (a test keeps them in step). Checks that need the molecule belong to applying arrows (build item 3).
* Misconception *patterns* (wildcards, roles, §5.2) are a separate grammar, parsed in build item 4.

**Where the electrons can go** (the arrow layer's one model; rewritten 2026-11-26 in the coherence pass). The learner
picks a source locus, then a **place**: an atom, a bond, or a **new bond** (drawn dashed between two atoms). One pure
function, `tapToDestinationLocus(state, source, place, arrowType, drawnArrows)` in `src/learner/stepSession/arrowPicking.ts`,
says what a place means, **however it was chosen** (tap, keyboard, or pointing: `destinationTargets.ts` lays the
same places out on the drawing and picks the nearest to the pointer). Learner screen and Create share it.

| Source | Place | Destination |
|---|---|---|
| lp/rad on X | atom X | refused (an arrow to itself) |
| lp/rad on X | atom Y not bonded to X | `σ X-Y` (no new-bond place needed: the atom says it) |
| lp/rad on X | atom Y bonded to X, or bond X–Y | `π X-Y` |
| bond A–B | atom A or B | `lp A` / `lp B` (`rad` for a fish-hook) |
| bond A–B | bond B–C | `π B-C` |
| bond A–B | atom Y bonded to exactly one end (A) | **the 1,2-shift `σ B-Y`** if one is offered onto Y; otherwise `π A-Y` |
| bond A–B | atom Y bonded to neither or both | refused: point at the new bond (or the bond) instead |
| bond A–B | new bond A–Y or B–Y | `σ`, if offered (below); otherwise refused |

**Which new bonds are offered** (`newBondDestinations.ts`; only for bond sources), from A (or B) to Y:
* Y must be able to take a bond: electron-poor (C, N, O, B, Al short of an octet, or losing a σ bond to an arrow
  already drawn), positively charged, with a π bond, a radical, bonded to O/S/halogen, or an H that can pass across
  (on O, N, S, a halogen, or an acidic C–H next to a π bond or a positive atom).
* Y in another molecule: offered. Y two bonds away: only as a **1,2-shift** (Y bonded to the other end) onto an
  electron-poor Y or one with a **single** bond to a leaving group (C–Br, C–OH₂⁺, O–O; not C=O). Three bonds away:
  never. Four or more: a ring closure.
* Nothing from an H a drawn arrow already bonds elsewhere; no bond a drawn arrow already gave its pair.
* On the drawing (`destinationTargets.ts`): new bonds to another molecule, to an H, and 1,2-shifts are always shown;
  ring closures only within 2.1 bond lengths. A place is anchored at its atom, its bond's midpoint, or a new bond's
  midpoint and far atom; the nearest within 0.8 bond lengths wins, atoms and bonds before new bonds.

**Guards.** The order the arrows are drawn in never matters: a test tries every order of every step of the examples,
and the drawability check (`check_drawable.ts --all-orders`, used when drafting) does the same for all content.
Tests pin what common places mean: the cation in a hydride shift means the shift, the carbonyl carbon in enolate
formation means the C=C π bond.

A bond picked as a source gives `π` while the arrows drawn so far leave π electrons in it, then `σ` (decided
2026-11-25); an atom is not a source; a tapped lone pair or unpaired electron counts as its atom.

So content and validation only ever see destination loci.

**Step kind** (`stepKind`): `polar` (all `->`) | `radical` (all `~>`) | `change` (no arrows, §3.4). The generic rule
`wrong-arrow-type` fires when the learner's arrow type fits **no** step leaving the current state.

## 3. Reaction file (JSON, one file per reaction version)

JSON keys are camelCase (the code reads them as they are). A key holding a mapping is
named `keyToValue`.

### 3.1 Top level

```jsonc
{
  "formatVersion": 1,
  "reactionSlug": "sn2-hydroxide-bromomethane",
  "reactionVersion": 2,
  "previousReactionVersion": 1,          // null for version 1
  "title": "SN2 substitution",
  "subtitle": "Hydroxide displaces bromide from bromomethane",
  "reactionClasses": ["substitution"],   // filter facets; controlled list (+ "aromatic substitution", item 10; + "acid-base", "addition", 2026-11-26 for F1/F4)
  "difficultyTier": 1,                   // 1..3, shown as ●○○ … ●●●
  "conditionsLabel": "NaOH · EtOH/H₂O · 25 °C",   // text over the reaction arrow only
  "dailyPuzzleEligible": true,
  "atomRoleToMapNumbers": { "nucleophile": [1], "electrophile": [2], "leavingGroup": [3] },  // optional
  "spectatorMapNumbers": [4],            // drawn faded, never validated
  "abbreviatedGroups": [                 // optional; drawn as the label wherever intact, never tapped
    { "groupLabel": "Ph", "attachmentMapNumber": 11, "mapNumbers": [11, 12, 13, 14, 15, 16] }],
  "startStateId": "s0",
  "stateIdToState": { "s0": { … }, "s1": { … } },   // §3.2
  "steps": [ … ],                        // §3.3; order carries no meaning
  "mechanismSummary": "Backside attack …",          // shown on the completion page
  "references": ["Clayden, Organic Chemistry, ch. 15"],
  "authors": [{ "name": "…", "url": null }],
  "licence": "CC-BY-SA-4.0",
  "publishedAt": "2026-12-01T10:00:00Z"  // set by the server; absent in drafts
}
```

### 3.2 State

```jsonc
{
  "mappedSmiles": "[OH-:1].[CH3:2][Br:3].[Na+:4]",
  "mapNumberToCoordinates": { "1": [-3.0, 0.0], "2": [0.0, 0.0], "3": [1.9, 0.0], "4": [-4.5, 0.8] },
  "mapNumberToLonePairAnglesDegrees": { "1": [90, 210, 330] },   // optional; otherwise placed automatically
  "bondToWedgeStyle": { "2-5": "wedge" },     // key "<map number>-<map number>", wide end at the second; the drawing (item 12: must agree with the SMILES marks)
  "annotations": [{ "text": "nucleophile", "nearMapNumber": 1 }],
  "caption": "hydroxide + bromomethane",

  // What the learner sees BEFORE choosing a route, so it belongs to the state, not to a step.
  // Only needed on states that have arrow steps leaving them.
  "learnerPrompt": "Draw the arrows for the next step.",
  "hintTiers": ["Which species is the nucleophile …?",     // position 0: conceptual
                "… at the same time. How many arrows?",   // position 1: narrowing
                "Arrow 1: …"],                            // position 2: reveal (optional text)
  "misconceptions": [ … ],              // §5.2
  "partialProgressMessages": [ … ]      // §5.3, optional
}
```

* Coordinates are in RDKit units (C–C ≈ 1.5) with y pointing up, as RDKit gives them, so seeding needs no conversion.
  The renderer scales and flips. Only mapped atoms have coordinates. Implicit H are drawn as labels such as `CH₃`.
* A mapped H is drawn in a state if it takes part in the step just before or after that state, or if the author pinned it.
* Hints steer toward the **preferred** step out of the state. Hint tier 3 always also shows that step's canonical
  arrows as ghost arrows. A learner on an `accepted` branch reaches that branch's own state, with its own hints.

### 3.3 Step

```jsonc
{
  "stepKey": "substitution",
  "fromStateId": "s0",
  "toStateId": "s1",
  "stepKind": "polar",
  "routePreference": "preferred",        // preferred | accepted
  "canonicalArrows": ["lp O1 -> σ O1-C2", "σ C2-Br3 -> lp Br3"],   // order carries no meaning
  "partialArrowSets": [],                // optional, §5.3
  "explanationAfterStep": "Backside attack and leaving-group departure happen in one concerted step …"
}
```

* A concerted step is several arrows (Diels–Alder: 3).
* **A branch** is another step leaving the same state toward a **different** state. Different arrow sets that reach
  the **same** state need no listing: acceptance is by result (§4).
* **Route preference.** `preferred`: the textbook route; hints steer to it and the reveal shows it. `accepted`: also
  correct; its explanation can say which route is favoured and why. A valid route the reaction does *not* accept is
  a `plausible` misconception on the state (§5.2) and counts as a wrong attempt.
* A linear reaction is a chain of preferred steps.

### 3.4 Change steps

```jsonc
{ "stepKey": "workup", "fromStateId": "s3", "toStateId": "s4", "stepKind": "change", "routePreference": "preferred",
  "addedSpecies": "[OH3+:20].[OH2:21]",       // mapped SMILES, new map numbers only
  "removedFragmentMapNumbers": [7, 8],         // any map number in a molecule removes that whole molecule
  "caption": "Aqueous acid work-up" }
```

The learner sees the event and continues. Uses: the aldol's second aldehyde arriving, a Grignard work-up, clearing HBr
off the screen. A change step must be the only step leaving its state.

### 3.5 Graph rules (checked by the linter)

1. Every state is reachable from `startStateId`, and every step's `fromStateId`/`toStateId` exists.
2. **No cycles.** A reversible dead end (hydrate formation) is a `plausible` misconception, not a step.
3. **Product states** (no steps leave them). The preferred route ends at the **main product**. Other routes rejoin it,
   or end at an **alternative product**, reached only by accepted steps: a minor regioisomer, such as ortho beside
   para (revised 2026-11-26, item 10e; before, branches had to rejoin). An alternative product needs a caption saying
   what it is (warning). Only regioisomers by authoring convention; E/Z and others wait until a reaction needs them.
   (Item 12: once states carry stereo, an alternative product may also be a stereoisomer.)
4. **Exactly one route made only of preferred steps.** At most one preferred step leaves each state.
5. Two steps leaving one state must not reach resonance-equivalent states (up to skeleton symmetry).
6. Each step's canonical arrows and partial arrow sets, applied to its from-state, reproduce its to-state (§4).
7. No misconception on a state matches an arrow set that §4 would accept (it would hide a correct answer).

**Built (item 5; in TypeScript since item 8.0):** `src/tooling/reactionLinting/`, run as
`npx tsx src/tooling/reactionLinting/shell/runFromShell.ts lint FILE... [--json]`
(exit status 1 on any error) and `... seed-coordinates FILE...` (RDKit layout for every state whose coordinates are not
exactly its atoms; the file is rewritten as 2-space JSON). `make lint` lints the example reactions. Each case in
`fixtures/lint_cases/reaction_edits.json` breaks rules on purpose. Rule ids, in the order checked (a group stops the
lint when the rest could not run):

| Lint rule id | Level | Rule |
|---|---|---|
| `file-not-readable` | error | not JSON (command line only); stops |
| `schema-violation` | error | the JSON Schema; stops |
| `state-atoms-inconsistent`, `mapped-smiles-not-supported` | error | build item 1's atom checks, then the strict SMILES subset; stops |
| `step-state-id-unknown` | error | rule 1 (ids); stops |
| `duplicate-step-key` | error | step keys are unique (progress records use them) |
| `state-unreachable`, `mechanism-has-cycle` | error | rules 1–2 |
| `several-preferred-steps-leave-state`, `preferred-route-does-not-reach-product` | error | rule 4 (the preferred route ends at a state no step leaves) |
| `alternative-product-without-caption` | warning | rule 3: a product other than the main one has no caption |
| `change-step-not-alone` | error | §3.4 |
| `learner-prompt-missing`, `hint-tiers-missing` | error | on states with an arrow step leaving them (SPEC: ≥ 1 hint) |
| `fewer-than-three-hint-tiers` | warning | the full conceptual / narrowing / reveal ladder |
| `duplicate-misconception-id`, `misconception-pattern-invalid` | error | ids are unique in the reaction; §5.2 grammar and roles |
| `step-does-not-reproduce-to-state` | error | rule 6. The **canonical arrows must give the to-state exactly as drawn** (a resonance form of it is an error: the learner moves on to the drawing). A partial arrow set must be accepted for its step as the validator would (identical or resonance form, up to symmetry). A change step must give its to-state exactly. |
| `leaving-steps-reach-equivalent-states` | error | rule 5 |
| `misconception-hides-correct-answer` | error | rule 7, checked against the canonical arrows and partial arrow sets that are accepted, up to symmetry (every accepted arrow set cannot be listed) |
| `misconception-never-fires` | warning | an earlier entry on the state covers it (§5.2); the coverage test is sound but not complete |
| `too-many-skeleton-symmetries` | warning | above `MAXIMUM_SKELETON_SYMMETRIES` (§4) on a state where arrows are drawn |
| `abbreviated-group-atoms-unknown` | error | a map number of an abbreviated group is in no state |
| `abbreviated-group-not-attached-once` | error | in a state holding all its atoms, the group is not one connected piece joined to the rest by exactly one bond from `attachmentMapNumber` |
| `arrow-touches-abbreviated-group` | error | canonical arrows or a partial arrow set use an atom of a group (the attachment bond included): the learner could not tap it |
| `misconception-in-abbreviated-group` | warning | a misconception pattern names an atom of a group, so it can never fire |

**Abbreviated groups** (decided 2026-11-25): listed explicitly by the author (no automatic detection), `groupLabel`
at most 6 characters. A group is drawn as its label wherever it is intact (all its atoms present, one bond from the
attachment atom joining it to the rest) and in full elsewhere. Nothing in it can be tapped, the attachment bond
included. Screen readers read the label. Drawing: `src/drawing/moleculeDrawing/shared/abbreviatedGroups.ts`; lint:
`src/tooling/reactionLinting/rules/abbreviatedGroupRules.ts`.

Arrow sets are checked with the validator itself (`assess_attempt`, with the step being checked as the only one
leaving its state), so the linter accepts exactly what the browser accepts.

### 3.6 Example: Wittig with two accepted routes

Map numbers: P1 (ylide P⁺), C2 (ylide C⁻), C3 (carbonyl C), O4.

```jsonc
"startStateId": "s0",
"stateIdToState": { "s0": {…}, "betaine": {…}, "oxaphosphetane": {…}, "product": {…} },
"steps": [
  { "stepKey": "cycloaddition", "fromStateId": "s0", "toStateId": "oxaphosphetane", "stepKind": "polar",
    "routePreference": "preferred", "canonicalArrows": ["lp C2 -> σ C2-C3", "π C3-O4 -> σ O4-P1"],
    "explanationAfterStep": "Under Li-free conditions, current evidence favours a direct [2+2] cycloaddition." },
  { "stepKey": "betaine-formation", "fromStateId": "s0", "toStateId": "betaine", "stepKind": "polar",
    "routePreference": "accepted", "canonicalArrows": ["lp C2 -> σ C2-C3", "π C3-O4 -> lp O4"],
    "explanationAfterStep": "The stepwise betaine route is the classic textbook picture." },
  { "stepKey": "ring-closure", "fromStateId": "betaine", "toStateId": "oxaphosphetane", "stepKind": "polar",
    "routePreference": "accepted", "canonicalArrows": ["lp O4 -> σ O4-P1"] },
  { "stepKey": "retro-2+2", "fromStateId": "oxaphosphetane", "toStateId": "product", "stepKind": "polar",
    "routePreference": "preferred", "canonicalArrows": ["σ P1-C2 -> π C2-C3", "σ C3-O4 -> π O4-P1"] }
]
```

Both routes rejoin at the oxaphosphetane. The betaine route takes 3 steps instead of 2, and both count as correct.

## 4. What counts as correct (checked in the browser, on the fly)

Input: the current state `S`, the steps leaving it, and the learner's arrow set `A` (destination loci).

1. **Each arrow is legal** on `S`: the source locus exists and holds the electrons, the destination locus is well
   formed, and the arrow type fits some step leaving `S`.
2. **Apply** `A` to `S`, giving the result `R`, and check the bookkeeping: octet/duet (H ≤ 2 e⁻, period 2 ≤ 8,
   period ≥ 3 up to 12). **Built (item 3):** `src/core/stateGraphs/`. All arrows of a step move
   their electrons at once. Electrons are counted, and formal charge is derived as valence electrons − nonbonding −
   bond orders − H, so electrons and charge are conserved by construction. The rules, in the order checked, are
   listed in `src/core/stateGraphs/arrowApplication.ts`; an even nonbonding count is read as lone pairs, an odd one
   as one unpaired electron (triplet carbenes are out of scope).
3. **No redundant arrows**: no group of the learner's arrows may together move no electrons (an arrow and its reverse,
   or a longer cycle). Removing such a group leaves `R` unchanged, so a correct answer padded with it is not accepted;
   the generic rule `redundant-arrow` names the group. (Corrected 2026-11-24 in build item 4: the first wording,
   "removing any one arrow must change `R`", cannot catch a cancelling pair, since removing either one alone changes `R`.)
4. **Compare `R` with each leaving step's to-state `T`.** `R` matches `T` when some skeleton symmetry `g` of `S` gives
   `g(R)` resonance-equivalent to `T`:
   * the same atoms and elements, the same σ-bonded pairs, the same H count per atom;
   * the same total charge and the same number of unpaired electrons per molecule;
   * **and** `R` has no more charged atoms than `T`.

   If everything holds except the last point, the result is a minor, charge-separated resonance form. The
   assessment is partial progress with the generic rule `minor-resonance-form` ("right bonds, but this leaves C⁺ next
   to O⁻: push the O lone pair in too").
5. On a match, the learner moves to that step's to-state, drawn as the author drew it, and the assessment records
   which step was taken (`preferred` or `accepted`). If `R` is not identical to `T`, the learner is told
   "valid resonance form — the next step uses this drawing".

**Why the resonance test needs no list of forms.** π and lone-pair arrows cannot change the σ skeleton. Conversely,
take two drawings with the same σ skeleton, charge and unpaired electrons per molecule, which both pass the octet
check. The electrons that differ between them flow along existing bonds, so the difference breaks down into paths
of π/lone-pair arrows. No path can pass through an sp³ atom: it has no π bond or spare capacity in either drawing.
So the test is a single pass over atoms and bonds (microseconds), with no RDKit and no enumeration. Enumerating forms
instead grows exponentially in the worst case (fused aromatics).

**Drawn hydrogens (2026-11-26):** a step's result is also compared with every drawn H (one single bond to a
non-hydrogen, no electrons of its own) folded into its neighbour's hydrogen count, under the symmetries of the
from-state folded the same way (`withHydrogensFolded`, `foldedSymmetriesOf`). Hydrogens are drawn only where a step
needs them, so a single drawn H made mirror-image ring carbons differ: attack at C13 instead of C14 of benzene was
wrong. Arrow patterns (misconceptions, partial progress) keep the unfolded symmetries.

**Skeleton symmetry** is found by enumerating the automorphisms of `S`'s σ skeleton, with elements and H counts as
labels. The molecules here are small: a tert-butyl group with every H explicit is about 1,300 permutations, and most H are
implicit. Above `MAXIMUM_SKELETON_SYMMETRIES = 10_000` (a safety cap, not a chemistry number), the linter warns and the
browser compares without symmetry.

A right product reached by nonsense arrows fails at 1, 2 or 3. Point 4 compares the whole mapped skeleton, so
arrows that give the right formula but move the wrong atoms also fail.

## 5. Feedback

### 5.1 Order (Q3: an authored misconception beats a generic rule; partial progress before generic rules, decided 2026-11-24)

The validator returns an **attempt assessment** (`assessmentKind`): `correct` (step key, route preference,
`isDifferentDrawing`), `misconception` (id, tag, severity, message), `genericRule` (rule id, message),
`partialProgress` (see §5.3) or `wrong`. Built in build item 4:
`src/core/attemptAssessment/`, shared cases in `fixtures/assessment/`. **Decided 2026-11-24 (user):** partial progress comes
**before** the generic chemistry rules, because a correct but incomplete concerted step nearly always breaks one (the
first SN2 arrow alone gives carbon 10 electrons). The new order replaces the list below it. Checks, first match wins:

1. correct: the arrow type fits the step kind, the arrows apply, none are redundant, and the result matches (§4);
2. meaningless arrows: `atom-not-in-state`, `destination-not-adjacent-to-source`, `no-electrons-at-source`;
3. **authored misconceptions**, in list order, up to symmetry;
4. **partial progress** (§5.3), carrying any rule the incomplete arrows break;
5. generic rules, in this order: `wrong-arrow-type`, `redundant-arrow`, `reversed-flow` (a learner arrow whose source
   and destination atoms are those of a known arrow, swapped), then the other arrow-application rules;
6. `wrong`.

The original list, kept for the record:

1. a match with a step leaving the state (§4): correct is correct;
2. arrows that mean nothing (`no-electrons-at-source`, an arrow to itself);
3. **authored misconceptions**, in list order;
4. generic chemistry rules (`octet-exceeded`, `reversed-flow`, `wrong-arrow-type`, `charge-not-conserved`,
   `redundant-arrow`);
5. partial progress, including `minor-resonance-form` (§5.3);
6. `wrong`, with a generic "not this pathway" message.

### 5.2 Misconceptions (on a state)

```jsonc
{ "misconceptionId": "attack-on-br", "misconceptionTag": "attack-leaving-group", "severity": "wrong",
  "arrowPattern": "lp O1 -> Br3",
  "feedbackMessage": "Both HO⁻ and Br carry negative character …" }
```

Arrow-pattern grammar: the arrow notation with wildcards and shorthands.

```
arrowPattern        := singleArrowPattern ( ";" singleArrowPattern )*    all must be among the learner's arrows
singleArrowPattern  := sourcePattern ( "->" | "~>" | "*>" ) destinationPattern     *> = either arrow type
sourcePattern       := locusKind atomSelector | locusKind atomSelector "-" atomSelector | "*"
destinationPattern  := a locus pattern, or a bare atomSelector = "the electrons end on, or bond to, this atom"
locusKind           := lp | rad | σ | π | bond | *                   bond = σ or π
atomSelector        := O1 | O* (any O) | @nucleophile (a role from atomRoleToMapNumbers) | *
```

* Patterns **refer to chemistry**: `lp @nucleophile -> @leavingGroup`, `π C5-O6 -> C5` (a π pair onto its own carbon).
* Patterns are expanded over the same skeleton symmetries as §4, so an entry written for H4 also fires for H5 and H6.
* `severity`: `wrong` | `plausible` (valid pushing, not a route this reaction accepts; costs an attempt in daily
  mode, gentler wording).
* The editor's "Add misconception" (tap source → target) writes a concrete pattern; the author may widen it.
* Matching is "contains", so extra correct arrows do not hide a misconception. The linter warns when an entry can never
  fire because an earlier, wider one always matches first.

### 5.3 Partial progress

**Both parts are shown (user, 2026-11-24):** the assessment carries the progress *and* any generic rule the incomplete
arrows break: `arrowsStillMissing` (null if not part of a known set), `authoredMessage` (null if none),
`brokenRuleId` and `brokenRuleMessage` (null if none; an arrow-application rule, or `minor-resonance-form`). The screen
shows "Right so far — 1 more arrow, **but** carbon would have 10 electrons". It is partial progress when the arrows
match an authored message, are a strict part of a known arrow set, or give a minor resonance form of a to-state.

* **Automatic**: every learner arrow (up to skeleton symmetry) belongs to the canonical arrows or to one of the
  partial arrow sets of some leaving step. The learner sees "Right so far — N more arrows", with N counted for the
  closest such set.
* **Why `partialArrowSets` exists.** Acceptance needs no list (§4). But partial progress compares the learner's arrows with *known*
  complete sets, so a learner half-way through a different valid set would be told "wrong" too early. The author lists
  such sets on the step. The linter checks each one reproduces the step's to-state.
* **Authored messages** (`partialProgressMessages` on the state, optional):
  `{ "learnerArrows": ["lp O1 -> σ O1-C2"], "feedbackMessage": "Octet check: carbon would have 10 electrons …" }`.
  It fires when the learner's arrow set equals `learnerArrows` (up to symmetry) and replaces the automatic text.

## 6. Catalogue and daily puzzle (static files)

`catalogue.json`, built from the published versions (shape: `schema/catalogue.schema.json`):

```jsonc
{ "formatVersion": 1, "builtAt": "2026-12-01T10:00:00Z",
  "reactions": [{ "reactionSlug": "…", "latestReactionVersion": 2,      // sorted by slug
                  "reactionVersionToContentHash": { "1": "<64 hex>", "2": "<64 hex>" },
                  "title": "…", "subtitle": "…",                        // subtitle null if absent
                  "reactionClasses": ["…"], "difficultyTier": 1, "dailyPuzzleEligible": true,
                  // item 11, for the cards (all optional in the schema: older catalogues lack them)
                  "conditionsLabel": "NaOH · EtOH/H₂O · 25 °C",
                  "startState": { "mappedSmiles": "…", "mapNumberToCoordinates": { … },
                                  "bondToWedgeStyle": { … } },   // only when the state has wedges
                  "abbreviatedGroups": [ … ] }],                 // only when the reaction has them
  "tracks": [{ "trackSlug": "…", …, "level": "foundations", "curriculumCode": "F2",
               "showcaseReactionSlug": "…", "showcaseProductState": { "mappedSmiles": "…", … }, … }],
  "dateToDailyReactionVersionRef": { "2026-12-01": "sn2-hydroxide-bromomethane@2", … } }
```

The cards' fields (item 11) come from each slug's latest version; a track's `showcaseProductState` is the state where
its showcase reaction's preferred route ends (`reactionFiles/preferredRoute.ts`). About 2 kB per reaction.

The **daily calendar is a list in the build that only grows**. It is not `hash(date) mod N`, which would reshuffle past
and future days whenever a reaction is added. Built (item 6, 2026-11-25; in TypeScript since item 8.0) as `src/tooling/catalogueBuilding/`
(`npx tsx src/tooling/catalogueBuilding/runFromShell.ts build FILE... --out DIR (--previous-catalogue FILE |
--start-new-calendar)`); the
browser reads it with `src/core/catalogue/`. Decided 2026-11-25:

* **Files in, files out.** The build reads published reaction files (later exported from Postgres) and writes into a
  new or empty folder: `catalogue.json` plus `r/<slug>/<version>.<first 8 hex>.json` for every published version. A
  reaction file holds exactly its **canonical JSON** (keys sorted at every depth, no whitespace, UTF-8, non-ASCII as
  is, numbers as JavaScript's `JSON.stringify` writes them, so `1.0` is `1`), so the content hash (full 64 hex in the
  catalogue) is the sha256 of the served file. Only the catalogue build computes hashes.
* **The calendar's memory is the previous `catalogue.json`** (`--previous-catalogue`). Without one the build refuses
  unless `--start-new-calendar` is given; a new calendar starts on the build date (UTC unless `--build-date`).
* **Frozen, append only.** Every date already in the calendar is kept, past or future, and a ref there is never
  upgraded to a newer version. Dates are appended after the last one, with no gap.
* **Whole cycles.** The build appends whole cycles until the last date is at least build date + 60
  (`DAILY_CALENDAR_DAYS_AHEAD`), so each build starts a fresh cycle and no cycle boundary is stored. A cycle shows
  each eligible reaction once, ordered by the sha256 hex digest of `"<cycle start date>:<slug>"`; if the reaction
  that ended the calendar would come first, the first two swap (no repeat on consecutive days, unless only one
  reaction is eligible). Appended dates use each slug's latest version; a slug is eligible when its **latest**
  version is `dailyPuzzleEligible`. No eligible reaction with dates to fill is an error.
* **The learner's local date** picks the daily puzzle (each learner's own midnight); a date outside the calendar
  has no puzzle (`null`). The slug in the catalogue reveals the daily reaction's name to anyone reading the network
  traffic; accepted for v1.
* **The build refuses** (error codes in `src/tooling/catalogueBuilding/catalogueBuildErrors.ts`, nothing written) on:
  a schema failure or lint error in any input (warnings are printed); a slug/version given twice or versions not
  1..n; a version in the previous catalogue missing from the inputs; a published version whose content hash changed;
  a calendar ref to a version not given; a non-empty output folder.

### 6.1 Tracks and problem sets (decided 2026-11-25, item 9; SPEC §5 "Learn")

One hand-written file per track, `content/tracks/<trackSlug>.json` (shape: `schema/track.schema.json`), in git:

```jsonc
{ "formatVersion": 1, "trackSlug": "aromatic-chemistry", "title": "Aromatic chemistry",
  "goal": "How arenes react with electrophiles, and where.",
  "level": "foundations",                                  // foundations | core | advanced | graduate (item 11)
  "curriculumCode": "F7",                                  // docs/curriculum.md: the level's letter + place
  "showcaseReactionSlug": "nitration-of-benzene",          // one of its set items, drawn whole on its card
  "problemSets": [                                         // in the suggested order
    { "problemSetSlug": "arenium-ion", "title": "The arenium ion",
      "conceptInOneLine": "An electrophile adds, the arenium ion loses H⁺, aromaticity returns.",
      "conceptCard": "Paragraphs in a small **Markdown** subset…",   // paragraphs, bold/italic, lists
      "conceptFigurePaths": ["figures/arenium-ion.svg"],            // optional, beside the track file
      "checkpoint": false,
      "setItems": [ { "reactionSlug": "bromination-benzene", "whyThisOne": "The simplest SEAr: Br⁺ from FeBr₃." }, … ] },
    { "problemSetSlug": "aromatic-checkpoint", "title": "Checkpoint", …, "checkpoint": true, "setItems": [ … ] } ] }
```

* Set items are ordered by hand; the difficulty tier is shown but does not order them. A reaction may appear in
  several problem sets, at most once in each. Problem-set membership does not affect `dailyPuzzleEligible`.
* `checkpoint` is required (`false` on an ordinary problem set). `conceptFigurePaths` are `figures/<name>.svg`,
  relative to the track file's folder (so `content/tracks/figures/`).
* **Lint** (built in 9a: `src/tooling/reactionLinting/tracks/trackLint.ts`, `conceptFigureChecks.ts`, `trackFileLint.ts`;
  `npx tsx src/tooling/reactionLinting/shell/runFromShell.ts lint-tracks FILE... --published-folder FOLDER`, where the published
  reactions are the reaction files anywhere under FOLDER; `make lint-tracks`). Rule ids:
  `schema-violation` (error; nothing else is checked then), `problem-set-slug-repeated` (error),
  `set-item-reaction-repeated` (error, at the second appearance), `set-item-not-published` (**warning**),
  `checkpoint-not-last` (error), `checkpoint-reaction-not-earlier` (error: a checkpoint reaction in no earlier
  problem set), `concept-figure-missing` (error), `file-not-readable` (error), and since item 11
  `curriculum-code-wrong-level` (error: the code's letter F / C / A / G is not the level's) and
  `showcase-not-in-track` (error: the showcase reaction is no set item of the track). Cases:
  `fixtures/lint_cases/track_edits.json` on the example track `fixtures/tracks/first-mechanisms.json`.
* **Catalogue build** (built in 9a: `src/tooling/catalogueBuilding/trackCompiling.ts`; `build … --tracks-folder FOLDER`):
  every `*.json` in the folder is linted (an error refuses the build: `track-file-not-readable`,
  `track-file-has-lint-errors`; warnings are printed), then compiled into the catalogue's optional **`tracks`**:
  each track without `formatVersion`, set items with no published reaction left out, then empty problem sets,
  then empty tracks, and a showcase whose reaction is not published; listed by level, then by the number of
  the curriculum code (since item 11; before it, by `trackSlug`). Two files with one slug refuse the build
  (`track-slug-duplicated`), as do two with one curriculum code (`curriculum-code-duplicated`). Concept figures
  are copied to **`t/<trackSlug>/figures/<name>.svg`** (`conceptFigureFilePath` in `src/core/catalogue/`). Without the
  option, or if the folder does not exist, `tracks` is `[]`; catalogues built before item 9 have no `tracks` key,
  read as none (`catalogueTracks`). A push to `main` changing `content/tracks/` also runs the deploy workflow.
* Tracks move into Postgres, with an editor screen, only once contributors author problem sets.

## 7. Learner progress (`localStorage`, key `arrowpush.progress`)

```jsonc
{ "formatVersion": 1,
  "runs": [{ "reactionVersionRef": "aldol-addition-base@3", "mode": "practice", "startedAt": "2026-12-01T…",
             "stepResults": [{ "stepKey": "enolate",
                               "stepOutcome": "firstTry",   // firstTry | afterRetry | afterHint | missed
                               "attemptCount": 2, "hintsUsed": 1,
                               "feedbackIdsShown": ["misconception:aldol-addition-base/oh-adds-carbonyl",
                                                    "rule:octet-exceeded"] }] }],
  "dateToDailyResult": { "2026-12-01": { "reactionVersionRef": "…@2", "puzzleNumber": 142,
                                         "runStartedAt": "2026-12-01T…", "shareGrid": "🟩🟨🟩", "score": 4 } },
  "settings": { "theme": "auto" } }
```

Built in item 7b (2026-11-25): `src/learner/learnerProgress/`, checked against `schema/progress.schema.json` when read.
A daily result also stores its `puzzleNumber` and `runStartedAt` (with the ref, that identifies its run). If the saved
text cannot be read, the site starts afresh and keeps the old text under `arrowpush.progress.unreadable`. An unfinished
daily puzzle is kept under **`arrowpush.dailyInProgress`** (`$defs/dailyInProgress` in the same schema): the local
date it was started on, its number, ref, `startedAt`, and a snapshot of the session (state, steps taken, and at the
current state the wrong checks, hints and feedback shown; not the arrows being drawn), saved after every check and step.

* A run's `stepResults` are the steps the learner actually took, in order, so a run records its route. A failed or
  revealed state is recorded under its preferred step's key. Runs are saved when they complete, in both modes.
* **Daily rules (decided 2026-11-25):** 3 attempts per step (every check that is not correct counts; a check with no
  arrows does not). After the third the step is **missed**: the preferred step's arrows are shown dashed with its
  explanation, and the run continues from its to-state. **Points:** 3 per step, −1 per wrong check, −1 per hint, never
  below 0; missed = 0; the maximum is 3 × steps taken. Hints work as in practice (the third shows ghost arrows) but
  cost a point. The puzzle belongs to the local date it was started on; an unfinished one from an earlier day is
  dropped. **Streak:** consecutive local days with a finished daily, ending today or yesterday. **Share text:**
  `ArrowPush #<n> 🟩🟨🟥 <points>/<maximum>`, no link yet. Code: `src/learner/dailyPuzzle/`, `src/learner/stepSession/stepScoring.ts`.
* The daily share grid has **one tile per step taken**, so its length depends on the route. A preferred or accepted
  step on the first try both give 🟩.
* **Item 7c (decided 2026-11-25, `src/learner/learnerStatistics/`):** a reaction's **mastery** is the points of its most recent
  finished run ÷ that run's maximum (both modes, same scoring), **mastered** at 100%; class mastery averages all
  catalogue reactions of the class, untried as 0%. The first-try rate covers steps of runs started in the last 7 days.
  Recurring feedback is counted from `feedbackIdsShown`: a rule id is one row, misconceptions are grouped by
  `misconceptionTag` (else id) and shown with the authored message from the reaction's latest version. **Import**
  merges: runs deduplicated by `reactionVersionRef + startedAt`, a daily result added only for a date the browser has
  none for, settings kept; an invalid file changes nothing.
* Mastery and the misconception history are computed from `runs`, grouped by slug, step key and tag, so a new
  reaction version does not reset them. Export/import is this JSON. Import merges runs, deduplicated by
  `reactionVersionRef + startedAt`.
* **Item 9 (decided 2026-11-25):** a run's `mode` gains **`checkpoint`** (daily scoring rules, names hidden), and a
  run gains an optional **`problemSetRef`** (`"<trackSlug>/<problemSetSlug>"`, set for checkpoint runs; built in
  9c). Done and mastered for set items are derived
  from `runs`, nothing new stored, except **`lastProblemSetRef`** (`"<trackSlug>/<problemSetSlug>"`, the last
  problem set touched, for Home's Continue learning card).

## 8. Postgres (editor and submissions only)

```sql
users(id uuid pk, name text, email text unique, email_verified boolean, image text,   -- Better Auth's user
      site_role text check (site_role in ('contributor','reviewer','owner')), created_at, updated_at timestamptz)

reactions(id uuid pk, reaction_slug text unique, owner_user_id uuid → users, created_at timestamptz)

reaction_versions(reaction_id uuid → reactions, reaction_version int, pk(reaction_id, reaction_version),
      submission_status text check (submission_status in ('draft','submitted','changes_requested','published')),
      reaction_document jsonb not null, format_version int not null,
      content_hash text,                              -- set at publish
      author_user_id uuid → users, licence_agreed_at timestamptz,
      latest_lint_report jsonb,
      created_at, updated_at, submitted_at, published_at timestamptz)
  -- at most one unpublished version per reaction:
  unique index on (reaction_id) where submission_status <> 'published'
  -- trigger: refuse UPDATE/DELETE of a row whose OLD.submission_status = 'published'

reviews(id uuid pk, reaction_id, reaction_version → reaction_versions, reviewer_user_id → users,
        review_decision text check (review_decision in ('publish','changes_requested')), comment text, created_at)

-- Sign-in tables, Better Auth's (changed 2026-11-25, 8c part 2; replace the hand-written sessions table):
sessions(id uuid pk, token text unique,               -- token = the cookie's value before signing
         user_id uuid → users, expires_at, ip_address, user_agent, created_at, updated_at)
accounts(id uuid pk, account_id text, provider_id text, -- GitHub's numeric user id where provider_id = 'github'
         user_id uuid → users, access_token, refresh_token, id_token (encrypted), …_expires_at, scope,
         password (unused), created_at, updated_at, unique(provider_id, account_id))
verifications(id uuid pk, identifier, value, expires_at, created_at, updated_at)   -- OAuth state
```

* Decided 2026-11-25 (8c): every table lives in the schema `arrowpush` (not `public`), with row-level security on
  and no policies, and Supabase's Data API off; the server connects as its own role. `reviews` is unused until 8e.
  Migration 0002 (2026-11-25) adds the role `arrowpush_readonly` for the weekly dump: SELECT and a read policy
  (`read_only_select`) on every table, nothing else. A new table needs its policy in the same migration.

* The whole document, mechanism graph included, lives in `reaction_document`. Columns duplicate only what queries need.
* Publishing sets the hash and `published_at`, then triggers the static build.
* The reviewer's diff compares version n with n−1. A diff that understands steps comes later.

## 9. Shared fixtures

`fixtures/` at the repo root, read by the Vitest tests. Since item 8.0 there is one implementation (TypeScript), so the
fixtures pin its behaviour rather than keep two languages in step. Our strict SMILES reader is still checked against
RDKit (RDKit.js) on every valid SMILES case and every example state (`src/tooling/chemistryToolkit/strictReaderAgreement.test.ts`).

* `notation/*.json`: arrow strings → parsed loci, plus the error cases.
* `apply/*.json`: state + arrow set → expected state, or the expected generic rule id.
* `resonance/*.json`: pairs of states → resonance-equivalent or not (enolate forms, both Kekulé benzenes, carboxylate,
  allyl radical, a charge-separated carbonyl, two molecules swapping a charge (not equivalent)).
* `assess/*.json`: reaction + state id + learner arrow set → expected attempt assessment.
* `lint_cases/reaction_edits.json`: edits of the example reactions breaking the rules of §3.5 → expected lint rule ids
  (the linter, in Node; in the editor from item 8b).
* `reactions/*.json`: SN2, aldol, radical bromination and the Wittig, end to end.
* `catalogue/daily_calendar_cases.json`: previous calendar + eligible refs + build date → expected calendar, worked
  out by hand with `sha256sum` (the catalogue build only).
* `catalogue/catalogue_reading_cases.json`: an example catalogue, invalid edits (with the violation path each must give), the daily ref per local date and the file path per ref.

## 10. Proposed build order (each strictly TDD)

1. **Done 2026-11-24.** JSON Schema file (`schema/reaction.schema.json`) plus the four example reactions
   (`fixtures/reactions/`), validated in both languages (`python/reaction_files/schema_violations.py`,
   `src/core/reactionFiles/schemaViolations.ts`) against shared invalid cases (`fixtures/schema_cases/`). Also
   `python/reaction_files/state_atom_consistency.py` (RDKit): SMILES readable, fully mapped, map numbers keep their
   element across states, coordinates exactly for the mapped atoms. Notes: `reactionClasses` is the mockups'
   list (substitution, elimination, carbonyl, pericyclic, rearrangement, radical); `learnerPrompt`/`hintTiers` are
   optional in the schema and will be required by the linter on states with arrow steps leaving them;
   coordinates in the examples were tidied by hand on 2026-11-25 (laid out along the reaction,
   reacting atoms facing each other, atoms kept in place between states where possible, no two atoms closer
   than about 1.3 units; the three phenyls round P are the tightest).
2. **Done 2026-11-24.** Arrow notation parser and printer (TS + Python); see §2.
3. **Done 2026-11-24.** Mapped-graph model and applying arrows (§4 point 2). Every step of the four examples
   reproduces its to-state in both languages. TypeScript reads SMILES with its own strict parser (SPEC §5).
4. **Done 2026-11-24.** Skeleton symmetry, resonance equivalence, misconception patterns and the attempt-assessment
   pipeline (§4–5); 32 shared attempt cases on the four examples pass in both languages.
5. **Done 2026-11-24.** Python linter CLI (`python/reaction_linting/`, §3.5): states reproduce, graph rules,
   learner text, misconception rules including never-firing warnings, the symmetry cap, coordinate seeding. The four
   examples lint clean (`make lint`); 26 shared edit cases break each rule.
6. **Done 2026-11-25.** Catalogue build and daily calendar (§6): `python/catalogue_building/` (CLI, `make
   catalogue` into `build/site/`), `schema/catalogue.schema.json`, and the browser reader `src/core/catalogue/`
   (Ajv check, daily ref for a local date, file path for a ref). 10 shared calendar cases and the shared reading
   cases pass.
7. The learner UI, split in three (decided 2026-11-25; Svelte 5 + Vite, SPEC §5):
   * **7a. Done 2026-11-25.** The step screen in practice mode: `src/drawing/moleculeDrawing/` (layout, labels, electron
     dots, bonds, pick targets, curved-arrow geometry), `src/learner/stepSession/` (taps to arrows, the session, feedback
     text), `src/learner/siteData/` (loading), `src/learner/learnerSite/` (Svelte; `make site`, `make dev`). All four examples
     play end to end in the browser (checked in headless Chromium).
   * **7b. Done 2026-11-25.** Daily mode (`#/daily`: before / in progress / finished; 3 attempts, points, missed
     steps, share text, streak; resumes after a reload), the finished view in both modes, `localStorage` progress
     and the remembered theme: `src/learner/learnerProgress/`, `src/learner/dailyPuzzle/`, `schema/progress.schema.json`.
     Checked in headless Chromium on a one-step and a three-step daily.
   * **7c. Done 2026-11-25.** Home, practice list (filters by type, difficulty, status, search; kept in the hash),
     progress page (streaks, first-try rate, 28-day history, mastery by type, recurring misconceptions, library,
     export / import / reset), and the finished view's "Watch out for", related reactions and mastery change:
     `src/learner/learnerStatistics/`, `src/learner/learnerProgress/progressTransfer.ts`. Checked in headless Chromium.
8. The editor and the backend, split in four (decided 2026-11-25, SPEC §5):
   * **8.0 Done 2026-11-25.** One implementation in TypeScript: port the linter (`src/tooling/reactionLinting/`) and catalogue build
     (`src/tooling/catalogueBuilding/`) to Node command-line tools, with RDKit.js for reading ordinary SMILES, coordinate
     seeding and the state atom checks; move the Python-only fixtures to Vitest; delete `python/`, `tests/`,
     `tools/*.py` and pytest. Starts with a trial of RDKit.js on those three jobs.
     Built: `src/tooling/chemistryToolkit/` (RDKit.js 2026.9.2: atoms, 2D layout, a structure as written),
     `src/tooling/reactionLinting/` and `src/tooling/catalogueBuilding/` (each with `runFromShell.ts`, run by `tsx`). Before the
     Python was deleted, both linters gave the same rule ids, places and messages on every lint case (only the
     schema validator's and strict reader's own wording differs). Content hashes changed once, since canonical
     JSON now writes numbers as JavaScript does (nothing was published yet). The Python paths named in items 1–6
     above are now the `src/` folders of the same names in camelCase.
   * **8a Done 2026-11-25.** Editor core (`make editor`; logic `src/create/reactionEditing/`, app `src/create/reactionEditor/`, file plugin
     `src/create/editorFileServer/`). Part 1 done 2026-11-25: `stateGraphs/mappedSmilesWriting.ts` (round trip on every
     fixture and example state), `chemistryToolkit` `readStructure` and the browser wasm location,
     `reactionEditing/draft/startState.ts` (pasted SMILES → state) and `reactionDraft.ts` (new draft, add state/step).
     Part 2 done 2026-11-25, all in `src/create/reactionEditing/`: `stepGeneration.ts` (drawn arrows → step; replaying the
     SN2, radical and Wittig examples gives their states, joins and route preferences; a new step is preferred only
     on the preferred route), `changeSteps.ts` + `atomPlacement.ts` (the aldol replays through its change step),
     `explicitHydrogens.ts` (show H; the examples still lint clean), `stateRegeneration.ts` (edit a state's mapped
     SMILES, regenerate after it; edited SN2, Wittig and aldol still lint clean), `stepDeletion.ts`,
     `editHistory.ts`, `mechanismOutline.ts`, `atomDragging.ts`, `learnerPreview.ts`.
     Part 3 done 2026-11-25: `reactionEditing/mechanism/arrowDrawing.ts` (taps → arrows on any state),
     `editorFileServer/reactionFileRequests.ts` (list/read/save in `content/reactions/`; the Vite plugin is in
     `vite.editor.config.ts`), and the page in `src/create/reactionEditor/` (`editorSession.ts`, `editorView.ts`,
     `draftCreation.ts`, Svelte components reusing the learner's `MoleculeCanvas` and `StepPlay`). Checked in
     headless Chromium: a new SN2 from SMILES, the step drawn by clicking, saved, an atom dragged, played as a
     learner and checked correct, with no console errors. `make catalogue` still builds from `fixtures/reactions/`
     until the first reaction is authored in `content/reactions/`. paste SMILES, draw arrows → generated state, drag,
     show H, change steps, branches and automatic joins, regenerate, undo/redo, mechanism panel, Play as learner,
     saving to `content/reactions/`.
   * **8b Done 2026-11-25.** Form fields, misconceptions and partial arrow sets by drawing, live lint panel. Part 1
     (`src/create/reactionEditing/`): `fieldEdits.ts` (every form field; clearing optional text removes the key, required
     text stays empty for lint; making a step preferred makes the other preferred step from its state accepted;
     renaming states and steps everywhere; wedge style cycle plain → wedge → reversed → dash → reversed),
     `drawnAnswers.ts` (misconception from drawn arrows as the exact pattern, refused at once if a correct answer
     or if it would hide one; partial progress messages; partial arrow sets kept only if the validator accepts
     them), `lintPlaces.ts` (finding → reaction / state / step and field), `lintRequests.ts` (the lint worker's
     core). Each edit of an example that keeps it valid still lints clean.
     Part 2: the page's tabs (Reaction, State, Step, Lint), step selection, a Wedges mode, "Save the arrows as…" a
     misconception, partial progress message or another arrow set; list fields as lines of text
     (`reactionEditor/model/fieldText.ts`); live lint in a Web Worker (`reactionEditor/io/lintWorker.ts`,
     `workerLinter.ts`) about 300 ms after the last edit, each finding showing its place and going there on a
     click. Checked in headless Chromium (lint from the worker, a finding fixed, a misconception saved, a wedge).
   * **8c** Backend for the owner (decided 2026-11-25, SPEC §5): Hono + Kysely on Render, Supabase Postgres (schema
     `arrowpush`), GitHub sign-in for one account, the editor saving through the API, one Publish action (server
     lint, licence, submitted → published), a GitHub Actions workflow that backs up, builds and deploys to
     Cloudflare Pages, and a scheduled keep-awake + weekly dump. In four parts: **1** the database layer,
     **2** the Hono server (sign-in, sessions, the API, the export endpoint, serving the editor), **3** the editor
     saving and publishing through the API, the workflows and `render.yaml`, **4** setting up the accounts
     (Supabase, Render, the GitHub OAuth app, Cloudflare), which only the owner can do.
     Part 1 done 2026-11-25, `src/server/reactionDatabase/`: `migrations/0001_arrowpush_tables.sql` (§8, with the
     one-unpublished-version index, the trigger keeping published rows immutable, row-level security) run by
     `migrationRunning.ts`; `reactionVersions.ts` (save a draft, "Edit" → version n+1, list, read),
     `publishing.ts` (server lint, licence, submitted → published, content hash as the static build's),
     `publishedExport.ts`, `contentImport.ts` (examples as published version 1, drafts, safe to rerun),
     (`userAccounts.ts`, replaced by Better Auth in part 2). Tests on PGlite (`testSupport/temporaryDatabase.ts`; PGlite is pinned to 0.5.x, the
     newest `kysely-pglite-dialect` supports).
     Part 2 done 2026-11-25, `src/server/backendServer/`: `authentication.ts` (Better Auth, GitHub only, the allow-list
     of numeric GitHub ids checked at every sign-in, 30-day sessions, tokens encrypted), `reactionRoutes.ts`
     (`/api/reactions…`: list, read, save a draft, next version, publish; `/api/published-versions`, public),
     `refusalAnswers.ts` (refusal code → 400/403/404/409/422), `deployDispatch.ts` (`repository_dispatch`
     `reaction-published`; a failed start never undoes a publish), `serverApplication.ts` (csrf check, `/api/me`,
     the built editor's files), `serverSettings.ts` (environment variables), `commandLine.ts` + `runFromShell.ts`
     (`serve | migrate | import`; `make server`), `ownerAccount.ts`; `reactionDatabase/connection/postgresConnection.ts`
     (node-postgres, untested until the Docker Postgres run). Tests sign in through a fake GitHub
     (`testSupport/serverTesting.ts`).
     Part 3 done 2026-11-25: the built editor (`make editor-build` → `build/editor/`, served by the backend) keeps
     reactions on the server (`reactionEditor/io/serverReactionStore.ts`, `GET /api/reactions/:slug` = the newest
     version): Sign in with GitHub, each reaction's status, "Edit as version n+1", and Publish (saves first, the
     licence tick, the outcome message) (`PublishControls.svelte`); `make editor` keeps content/reactions/.
     `catalogueBuilding/publishedBackup.ts` + `backupFromShell.ts` (export → `content/published/<slug>/<n>.json`,
     hashes checked); `.github/workflows/deploy-site.yml` (backup commit, build with the live catalogue,
     Cloudflare Pages), `.github/workflows/database-upkeep.yml` (daily query, weekly `pg_dump`), `render.yaml`.
     Checked in headless Chromium against the server on PGlite (sign-in, open, lint, Publish, Edit offered).
     Part 4 done 2026-11-25 by the owner: Supabase (Sydney), the Render web service, the GitHub OAuth app,
     Cloudflare Pages, the repository's Actions variables and secrets; the examples imported, the first deploy
     run with a new calendar, the upkeep workflow run, and an Edit → Publish → automatic deploy end to end.
     Facts for setting it up again: make `arrowpush_server` (LOGIN) and `arrowpush_readonly` (LOGIN) as
     `postgres` before the first start, and `GRANT CREATE ON DATABASE postgres TO arrowpush_server`
     (`CREATE SCHEMA IF NOT EXISTS` checks that right even when the schema exists); the pooler's user is
     `<role>.<project-ref>`, Session mode (5432); both connection strings end in
     `?sslmode=verify-full&sslrootcert=deploy/supabase-root-ca.crt` (Node does not trust Supabase's root CA);
     whichever role first runs the migrations owns the tables.
   * **8d Done 2026-11-26.** Create: the editor reskinned as a staged flow for the owner (decided 2026-11-26, SPEC §5 "Create";
     design `mockups/create.html`). Proposed in three parts:
     - **Part 1, decisions. Done 2026-11-26.** Built: `reactionEditing/draft/reactionSlugs.ts` (the slug from the
       name), `stateStrip.ts` (strip rows; state names Start / Intermediate N / Product), `teachingChecklist.ts`,
       `difficultySuggestion.ts` (3 if another route is accepted or ≥ 5 preferred arrow steps; 1 for at most one
       arrow step of at most two arrows; else 2: the four examples' tiers), `creationProgress.ts` (opening stage,
       progress line), `checkTasks.ts`; `reactionDatabase/model/sitePermissions.ts`, used by Publish and the reaction
       list (only one's own without `seeEveryReaction`); `/api/me` answers `siteActions`; the server's and the
       file server's reaction lists give each reaction's `creationProgress`. The Teaching list is built from the
       draft's fields with lint findings attached (a new draft fails the schema, so lint stops before its
       learner-text rules); the mechanism summary is **needed** (the schema requires it). Planned as: in `src/create/reactionEditing/`, the stage a draft opens on and
       each stage's completeness; the Teaching to-do list from the draft and its lint findings (item, place,
       needed / recommended / optional, done); the suggested difficulty; the rows of the state thumbnail strip
       (preferred route, branches under the state they leave, "joins X"); the progress line on the Create home.
       On the server (`src/server/backendServer/`), one module deciding what a site role may do (save, edit, publish,
       submit, review), used by every route, and the signed-in user's role in the API.
     - **Part 2, the pages. Done 2026-11-26.** Built in `src/create/reactionEditor/`: `EditorApp` (Your mechanisms,
       a new mechanism's Start stage, a draft, Play as learner; **autosave** about 1.5 s after the last edit
       to the draft, and at once on going back to Your mechanisms), `CreateHome`, `CreateHeader`,
       `StageStepper`, `CreateWorkspace` (top row, live lint), `StartStage`, `MechanismStage` (with
       `DrawingCanvas`, `StateStrip`, `StepCard`, `MorePanel`, `StateAdvanced`), `TeachingStage`
       (`TeachingItemPane`, `WrongAnswers`), `PublishStage` (`PublishDetails`); the words in
       `createView.ts`; the session's stage and open teaching item, `setStage`, `selectTeachingItem` and
       `goToPlace` by stage in `editorSession.ts`; `draftCreation.ts` makes the slug from the name and
       records the signed-in author. The 8b tab panels are gone. Publish's checks add the needed teaching
       items still missing (`checkTasks.publishChecks`). `/api/me`'s site actions decide whether Publish
       shows. "Back to the site" links to `VITE_LEARNER_SITE_ADDRESS` when the build sets it. Checked in
       headless Chromium (new SN2 → step → question, hint, a wrong answer → Publish's checks → saved and
       listed → reopened, light and dark; no console errors). Planned as (`src/create/reactionEditor/`): Create home, the stepper and the four stages, reusing the
       learner site's header and styles and the existing components where they fit; component tests for the
       stage switching; a walkthrough in headless Chromium (new SN2 from SMILES → step → teaching → Publish).
     - **Part 3, the domain. Done 2026-11-26** (`arrowpushing.com`: DNS moved from Porkbun to Cloudflare, the
       learner site on Pages at the bare domain, Create on Render at `create.`; the owner signed in there and the
       deploy workflow ran; both top bars carry the Create tab). Planned as (the owner sets up the accounts): the learner site on `<domain>` (Cloudflare Pages)
       and Create on `create.<domain>` (Render), the GitHub sign-in app's callback and the server's public
       address moved there; checked end to end.
   * **8e** Contributors (decided 2026-11-26, SPEC §6; design `mockups/review.html`). Proposed in four parts:
     - **Part 1, database and server. Done 2026-11-26.** Built: migration 0003; `reactionDatabase/users/siteUsers.ts`
       (`requireSiteAction`, the Users page's list and roles), `submissions.ts` (Submit, the queue, a review,
       the author's notes, what a reviewer compares), the new rules in `reactionVersions.ts` (version author,
       open-drafts limit (5; 20 since 2026-11-26), blocked, authors added on a next version, `listReactionsFor`, an unchanged save keeping
       a submission in review) and `publishing.ts` (direct publish: the owner, on their own version;
       `publishNewestVersion` shared with a review); `sitePermissions.ts` with `manageUsers`, `blocked`, and
       reviewers without direct `publish`; `backendServer/routes/authentication.ts` (open sign-in as contributor, the
       allow-listed GitHub account made owner in an after-create hook, Google when `GOOGLE_CLIENT_ID`/`SECRET`
       are set, linking by verified email), `contributorRoutes.ts`, `/api/sign-in-providers`, `/api/me`'s
       `userId`; a fake Google in `testSupport/serverTesting.ts`. The refusal `not-reaction-owner` is gone
       (now `not-version-author`). Planned as (TDD on PGlite): migration 0003 (site role `blocked`; `reviews.pinned_notes`
       jsonb beside its overall `comment`; `reaction_versions.submission_note`); sign-in open to anyone as
       `contributor`, the GitHub ids of `ALLOWED_GITHUB_USER_IDS` becoming `owner`; Google as a second provider
       (optional settings `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`), one person's GitHub and Google accounts
       linked by the same verified email; the new ownership rule (the author of the unpublished version saves
       it; anyone starts a published reaction's next version, the server adding them to its `authors`); the
       5-open-drafts limit; Submit (server lint, licence), saving a submitted version returning it to draft;
       the review queue, a review (publish or request changes, never one's own), the Users page's roles; all
       through `sitePermissions.ts` (new actions `manageUsers`, `reviewOthers`), with routes and refusals.
     - **Part 2, decisions. Done 2026-11-26.** Built: `reactionEditing/review/textDiff.ts` (word-level diff),
       `versionChanges.ts` (the change list and `placeOfChangeKey`), `reactionEditor/model/reviewView.ts` (Your
       mechanisms and Improve lists, the banner, the queue's lines, the sub-navigation, the Users page's
       words), `editorView.patternArrowsOn`. Planned as (pure TypeScript): the change list between two versions of a reaction (states,
       steps, every learner text, misconceptions, metadata) with a word-level text diff; the review notes and
       where they point; the contributor's banner and queue labels.
     - **Part 3, the pages. Done 2026-11-26.** Built in `src/create/reactionEditor/`: `contributorClient.ts` (the
       API), `SignInCard`, `CreateSubnav`, `CreateHome` (banner, open drafts, Suggest version n),
       `ReviewerNotes` and `SubmitForReview` on the Publish stage, `ReviewQueue`, `ReviewScreen` (`ChangeCard`,
       `ReviewDrawing`), `UsersPage`, wired in `EditorApp`. Checked in headless Chromium with two accounts
       (GitHub owner, Google contributor) on PGlite: suggest version 2 → submit → changes requested with a
       pinned note → banner, notes, Go there → resubmit → published → role changed; light and dark; only the
       signed-out 401 in the console. Planned as: the sign-in page, Create's sub-navigation, the contributor's Publish stage and Your
       mechanisms, the review queue and review screen (Play as learner on the submitted version), the Users page;
       checked in headless Chromium with a second account.
     - **Part 4, the owner's setup (to do, by the owner):** a Google OAuth app (callback
       `https://create.arrowpushing.com/api/auth/callback/google`), its two settings on Render, and an end-to-end
       check: a second account submits, the owner requests changes, it is resubmitted and published.
9. Learn: tracks and problem sets (scoped 2026-11-25, SPEC §5 "Learn", §6.1 here), before 8d. In three parts:
   * **9a Done 2026-11-26.** The track file: `schema/track.schema.json` (`src/core/trackFiles/`), the example track
     and lint cases, the lint checks and `lint-tracks`, compiling into `catalogue.json` (`--tracks-folder`, the
     catalogue schema and reader), and the deploy workflow running on a push to `content/tracks/` (§6.1).
   * **9b Done 2026-11-26.** The Learn, track and problem set pages, Next up, the breadcrumb and Next in set, the
     Home Continue learning card and the Progress Tracks section, `lastProblemSetRef`. Logic in
     `src/learner/learnTracks/` (`trackProgress.ts`, `learnPlayContext.ts`, `continueLearning.ts`, `conceptCardText.ts`:
     the Markdown subset read into blocks, never inserted as HTML); pages in `src/learner/learnerSite/` (`LearnPage`,
     `TrackPage`, `ProblemSetPage`, `ConceptCard`, `LearnPlay`; `StepScreen` takes the Learn context). Routes
     `#/learn[/<track>[/<problem set>[/<reaction slug>]]]`; a reaction plays its latest version. The concept card
     is open while none of the problem set's items is done and folded after (no visit is stored). Until 9c a
     checkpoint's items are never done and play as ordinary practice. Checked in headless Chromium on the example
     track (every page, the breadcrumb, the figure; no console errors).
   * **9c Done 2026-11-26.** Checkpoints: the `checkpoint` run mode (`hasLimitedAttempts` in `stepSession.ts`:
     3 attempts per step, points), `problemSetRef` on runs, a checkpoint item done only by a checkpoint run with
     its ref (`slugsDoneInCheckpoint`), `learnTracks/checkpointAttempt.ts` (an attempt shuffles the items not
     yet done there, or all once every one is done; Fisher–Yates with the random source passed in), and
     `learnerSite/workspaces/CheckpointRun.svelte` on the checkpoint's page (names hidden, revealed in each finished view).
     Next up links to a checkpoint go to its page; a checkpoint has no `#/learn/…/<reaction>` play route.
   Alongside: authoring the "Aromatic chemistry" reactions in the editor (SPEC §2).
10. Drafting with an assistant (decided 2026-11-26, SPEC §2 "The first SEAr batch", §6 "Drafting with an assistant").
   Phase 1, in parts:
   * **10a Done 2026-11-26.** `"aromatic substitution"` added to `reactionClasses` (schema, catalogue schema, the editor's and the
     learner site's class labels and filters, fixtures).
   * **10b Done 2026-11-26.** Personal access tokens: a migration (`arrowpush.access_tokens`: id, user id, a name, the token's
     SHA-256, created, expires, last used, revoked); `reactionDatabase/users/accessTokens.ts` (mint: the plain token
     returned once; find the user of a token; revoke); the backend taking `Authorization: Bearer` beside the cookie
     session for reading the user's reactions and saving drafts only (a site action that a token-authenticated
     request never gets for anything else); the server command `create-token --user <email> [--days n]` and
     `revoke-token`. Built: migration 0004, `reactionDatabase/users/accessTokens.ts`,
     `backendServer/requests/accessTokenRequests.ts` (the routes open to a token: GET /api/me, GET /api/reactions[/…],
     PUT …/draft; elsewhere 403), `requireSignIn(authentication, database)`, the two commands (default name
     "drafting", 90 days).
   * **10c Done 2026-11-26.** Draft sync: saving a draft may name the content hash (§1, canonical JSON) of the draft the client last
     saw, or `null` for "no unpublished version yet"; the save is refused (`draft-changed`) when the stored draft's
     hash differs. Create's own saves leave it out and behave as now. A new module (`src/tooling/draftSync/`, logic beside a command line
     `npx tsx src/tooling/draftSync/runFromShell.ts check|push-draft|pull-draft`; the server URL and the token from the
     environment) that lints before pushing, remembers the hash of each draft pushed or pulled, and writes a pulled draft back to
     `content/reactions/`. Built: `reactionDatabase/reactions/draftChangeCheck.ts` (`saveDraftIfUnchanged`, refusal
     `draft-changed` 409; `If-None-Match: *` / `If-Match: <hash>` on PUT …/draft, which now answers
     `draftContentHash`), `src/tooling/draftSync/` (`draftSync.ts`, `commandLine.ts`, `runFromShell.ts`); end to end in
     `backendServer/routes/draftSyncThroughServer.test.ts`.
   * **10e Done 2026-11-26.** Alternative products (rule 3 revised, §3.5): `not-exactly-one-product-state` gone,
     `alternative-product-without-caption` (warning) added in `mechanismGraphRules.ts` (`LintedState.hasCaption`);
     Create names the main product "Product" and the others "Other product" (numbered when several;
     `stateStrip.stateDisplayNames`). The learner side needed nothing: a run is complete at any state no step leaves.
   * **10f Done 2026-11-26.** 1,2-shifts are drawable (SPEC §3): `arrowPicking.tapToDestinationLocus` takes the drawn
     arrows and, for a bond A–B tapped then an electron-poor atom Y bonded to A, offers π A-Y or σ B-Y; the menu
     reads "forms a π bond" / "shifts across". Also: open-draft limit 20 (§SPEC 6).
   * **10g Done 2026-11-26.** Point and snap (SPEC §3, decided 2026-11-26; prototype `mockups/prototype-new-bonds.html` variant C, kept
     on the local branch `prototype/new-bond-arrows`). Planned: `stepSession/arrowPicking.ts` lists every destination
     of a source (atoms, bonds, possible new bonds with the filter of SPEC §3) and picks the nearest to a point;
     `moleculeDrawing` draws the ghost arrow, dashed new bonds and touch ghosts; `MoleculeCanvas.svelte` previews on
     pointer move, commits on click, uses the nearest target for touch taps, and puts new bonds in the Tab order;
     the bond-source menu, the 10f shift menu and `choiceMenuLayout.ts` go. Learner site and Create alike.
     Built: `stepSession/newBondDestinations.ts` (the chemistry filter), `stepSession/destinationTargets.ts`
     (places with their preview arrow and dashed line; `NEW_BOND_REACH` 2.1 bond lengths; nearest by centre within
     0.8 bond lengths), the `newBond` pick target and tapped place, `MoleculeCanvas.svelte` (pointer listeners on
     the drawing, faint lines after a touch, new bonds in the Tab order), `stepScreenView.destinationsOf`; the menu
     state (`pendingDestinationOptions`, `chooseDestination`) is gone from the session and Create's arrow drawing.
     Checked in headless Chromium on the aldol: hover preview with the dashed C3–C9, a touch tap on its middle
     drawing "π C3=C5 → new bond C3–C9", faint lines after a touch.
   * **10h Done 2026-11-26.** Structure editor: Ketcher in Create (decided 2026-11-26 from the prototype comparing Ketcher 3.21,
     Apache-2.0, with Kekule.js 1.0.4, MIT: only Ketcher kept the map numbers through a round trip; it kept wedges,
     coordinates and our mapped SMILES too; about 29 MB, loaded only in Create). Chemweave (GPL-3.0) for ideas only.
     Planned, test-first:
     - **Files:** the pinned Ketcher standalone release, checksum-checked, fetched at build time into the editor's
       public folder (not in git), served by Create's server at `/ketcher/` (same origin, so Create can talk to it).
     - **Exchange** (`reactionEditing/mechanism/structureExchange.ts`): a state → V2000 molfile (map numbers in the atom-map
       column, coordinates, wedges as bond stereo); a Ketcher molfile → mapped Kekulé SMILES (RDKit.js for hydrogen
       counts and charges, our writer), coordinates rescaled to our bond length, `bondToWedgeStyle`; new atoms get
       new map numbers.
     - **What may change:** the start state freely; every later state only its layout and wedges (its bonds come
       from the arrows): a save that changes atoms, bonds, charges or hydrogens there is refused.
     - **Create:** "⋯ More → Edit structure" opens Ketcher in a dialog on the selected state; Save or Cancel.
       The learner site is unchanged.
     Built: `src/tooling/buildTools/` (`make ketcher`, also in Render's build command; `fflate` unzips), Vite's editor
     `publicDir` `vendor/editor-public/`, `chemistryToolkit.readMolblock`, `reactionEditing/mechanism/structureExchange.ts`
     (`stateToMolfile`, `molfileToStructure`, `applyEditedStructure`, `saveStructureFromEditor`; a saved layout keeps
     the state's old centre), `reactionEditor/components/StructureEditorDialog.svelte`. Checked in headless Chromium on the dev
     editor: Ketcher ready in about 2 s with the state and its map numbers, Save writes the state.
   * **10i Done 2026-11-26.** A push can propose a new version (owner, 2026-11-26): `If-None-Match: *` on PUT …/draft
     also accepts a reaction whose versions are all published when the document's `previousReactionVersion` is the
     newest; the server starts version n+1 (`startNextVersionIn`, one transaction with the save) and saves the file
     into it. Built: `reactionDatabase/reactions/draftChangeCheck.ts` (`buildsOnPublished`), `reactionVersions.startNextVersionIn`;
     tests in `draftChangeCheck.test.ts` and end to end in `backendServer/routes/draftSyncThroughServer.test.ts`.
   * **10d** The SEAr pilot (nitronium formation, nitration of benzene, nitration of anisole with resonance steps)
     drafted and pushed; reviewed by the owner; then the rest of the batch and `content/tracks/electrophilic-aromatic-substitution.json` (renamed from `aromatic-chemistry`, 2026-11-26).
   Phase 2 (design deferred until after the batch): the MCP server at `/mcp` over the same module and tokens, and a
   token page in Create.

11. Layout tidy-up (decided 2026-11-26, SPEC §5 "Learn", "Reaction cards", "Drawing in the cards"; design
   `mockups/layout.html`). In four parts, each test-first:
   * **11a Done 2026-11-26.** Track `level`, `curriculumCode` and `showcaseReactionSlug` (§6.1): the track schema; lint rules
     `curriculum-code-wrong-level` (the code's letter F/C/A/G is not the level's) and `showcase-not-in-track` (the
     showcase reaction is no set item of the track); the build refuses two tracks with one code
     (`curriculum-code-duplicated`) and lists tracks by level, then code number; the catalogue track carries
     `level`, `curriculumCode` and, when its reaction is published, `showcase` (§6). The six tracks and the example
     track get the fields.
   * **11b Done 2026-11-26.** Scheme data in the catalogue (§6): each entry gains `conditionsLabel` and `startState`
     (`mappedSmiles`, `mapNumberToCoordinates`, `bondToWedgeStyle` when set) and `abbreviatedGroups` when the
     reaction has them; a track's `showcase` is `{ reactionSlug, productState }`, the product being where the
     preferred route from the start state ends (`reactionFiles/preferredRoute.ts`). All optional in the schema, so
     the previous catalogue still validates.
   * **11c Done 2026-11-26.** `moleculeDrawing/scheme/schemeDrawing.ts`: a state as the cards draw it (SPEC §5 "Drawing
     in the cards"): species split and placed left to right, skeletal labels, bonds cut at label boxes, ring double
     bonds inside, wedges and hashes, text runs with sub- and superscripts; `conditionsLabelParts` (above / below).
     Built in four files: `schemeText.ts` (runs, shifts, Arial widths, the conditions split), `schemeStructure.ts`
     (pixels at 20 px per median bond, species, explicit hydrogens folded into their atom), `schemeLabels.ts`
     (which atoms are labelled, placement, the box a bond stops at, charge included), `schemeBonds.ts` (lines,
     double-bond side, wedges); metal counter-ions are left out (the conditions name the salt).
   * **11d Done 2026-11-26.** The pages (`src/learner/learnerSite/`): `ReactionScheme` and `ReactionCard` components; Learn by level
     (`learnTracks/trackLevels.ts`: levels in order, their tracks, the planned tracks of `docs/curriculum.md`);
     Practice and problem sets as card lists; the Home daily card with the scheme and result tiles; the finished
     view without share text or Copy (`dailyPuzzle.shareText` goes). Checked in headless Chromium.
     Built: `ReactionScheme.svelte`, `ReactionCard.svelte`, `ResultTiles.svelte` (also Home's Continue practising and
     the Progress library, replacing the coloured-square text), `LearnPage`, `PracticePage`, `ProblemSetPage`, the
     Home and Daily cards, `RunSummary`; `learnTracks/trackLevels.ts`. Checked in headless Chromium on a preview
     built from `content/published` and `content/tracks` (Learn F1 → F7 with showcases, Practice, a problem set, Home,
     Daily before a run); a solved daily and the finished view are covered by component tests only.

12. **Stereo validation** (decided 2026-11-26, SPEC §4 "Chemistry conventions"; design in `docs/stereo-validation.md`).
    Phases 1–2 now, phase 3 (face choice as a product question) after a mockup:
    * **12a Done 2026-11-27.** Stereo marks (`@`, `@@`, `/`, `\`) in the strict reader and writer, kept on map
      numbers (`stateGraphs/stereoMarks.ts`): `StateGraph.mapNumberToTetrahedralMark` holds each stereocentre's
      mark for its neighbours in canonical order (an implicit H or lone pair first, then mapped neighbours by
      ascending map number); `bondToDoubleBondRelation` holds `cis`/`trans` between each end's lowest-numbered
      other neighbour. New error `invalid-stereo-mark`; direction marks on ring closures stay unsupported. The
      fixture JSON gains `tetrahedralMarks` and `doubleBondStereo` only when a state has stereo. Checked against
      RDKit (`canonicalStereoSmiles`): reading and rewriting keeps every fixture's stereoisomer. Until 12b, arrow
      application drops stereo, so content should not use marks yet.
    * **12b** Arrow application keeps untouched stereo; centres the step makes or changes come from the to-state.
    * **12c** Stereo-aware comparison; lint `wedges-disagree-with-smiles`, `stereocentre-changes-without-arrows`,
      `stereocentre-unspecified`; the editor fills wedges from the marks.
    * **12d** Stereo-aware skeleton symmetry (diastereotopic atoms distinct): E2 anti-periplanar assessed.
    * **12e** First content: SN2, E2 and bromination drafts with marks.

## 12. Corrections to the mockup content

* **Radical H-abstraction needs 3 fish-hooks**, not 2 (Q4). The 2-arrow attempt is partial progress ("1 more"),
  and an authored message can add "one fish-hook per electron — the C–H bond has two".
* **Aldol step 2 needs 3 arrows**, not 2. With the enolate drawn C=C–O⁻, attacking from the C=C π bond alone leaves
  C⁺ next to O⁻, a charge-separated form of the aldehyde. That attempt now gets `minor-resonance-form`. The
  canonical arrows are `lp O⁻ → π O–C`, `π C=C → σ C–C′`, `π C′=O′ → lp O′`.
* The aldol's second acetaldehyde appears only in state 1 in the mockup. With map numbers shared across the
  reaction, it arrives through a change step or is present from the start.
* The editor's timeline becomes a graph: it needs "add branch from this state" and a way to show a fork. Since
  branches rejoin, it can start as one list per branch.
