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
| **arrow** | One curved arrow: source locus → destination locus. `->` moves a pair (2 e⁻), `~>` (fish-hook) one electron. |
| **arrow set** | The arrows drawn for one step, unordered. |
| **canonical arrows** | The step's arrow set used for the hint reveal and as the reference answer. |
| **partial arrow sets** | Other complete arrow sets for the same step, listed only so that partial progress is recognised (§5.3). They are not needed for acceptance. |
| **σ skeleton** | What π/lone-pair arrows cannot change: atoms, elements, which pairs are σ-bonded, H count per atom. |
| **resonance-equivalent** | Two states with the same σ skeleton, the same charge per molecule and the same unpaired-electron count per molecule. |
| **skeleton symmetry** | A permutation of a state's atoms that maps its σ skeleton onto itself (an automorphism). It covers both equivalent atoms and resonance-equivalent atoms (both carboxylate O). |
| **attempt assessment** | The validator's answer to one check of the learner's arrows (§5.1). Not to be confused with a step outcome or a review decision. |
| **step outcome** | What the learner's progress records for a step: first try, after retry, after hint, or missed. |
| **misconception** | An authored arrow pattern on a state with a feedback message (§5.2). |
| **generic rule** | A check built into the code (octet, reversed flow, …) with a fixed id. |
| **change step** | A step with no arrows that adds or removes molecules (a reagent arrives, a work-up). |
| **spectator** | An atom drawn faded and never validated (Na⁺, MgBr⁺). |
| **reaction slug / reaction version / reaction version ref** | `aldol-addition-base` / `3` / `aldol-addition-base@3`. |
| **format version** | The version of the file format itself, separate from a reaction version. |

Abbreviations: `lp` = lone pair; `rad` = radical (unpaired electron); SMILES = simplified molecular-input line-entry
system; e⁻ = electron.

## 1. Identifiers and versioning

| Thing | Form | Rule |
|---|---|---|
| Reaction slug | `aldol-addition-base` (`^[a-z0-9]+(-[a-z0-9]+)*$`) | chosen at first submit, **never changes** after first publish (the title can) |
| Reaction version | integer 1, 2, 3 … per slug | a new draft gets `max+1`; a published version's document never changes |
| Reaction version ref | `aldol-addition-base@3` | what learner progress, share links and the daily calendar store |
| Content hash | `sha256` of canonical JSON (sorted keys, no whitespace) | in the catalogue; static file name `r/<slug>/<version>.<first 8 hex of hash>.json` for cache-busting; lets progress detect a changed file |
| Format version | `"formatVersion": 1` | bumped by a format migration |
| State id | short slug, e.g. `s0`, `betaine` | unique within the reaction |
| Step key | short slug, e.g. `enolate` | unique within the reaction; kept **across** reaction versions where the step means the same thing, so statistics aggregate by `reactionSlug/stepKey` |
| Misconception id | slug unique within the reaction, plus optional `misconceptionTag` from a controlled list (`attack-leaving-group`, `pi-to-own-atom`, …) | the progress page groups by tag |
| Generic rule id | fixed in code: `no-electrons-at-source`, `destination-full`, `reversed-flow`, `octet-exceeded`, `charge-not-conserved`, `wrong-arrow-type`, `redundant-arrow`, `minor-resonance-form` | also counted on the progress page |

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

**From a learner's tap to a destination locus.** The learner taps a source locus, then an atom or a bond. One pure
function, `tapToDestinationLocus(state, sourceLocus, tappedAtomOrBond, arrowType)`, used by both the learner screen and
the editor, returns the destination locus:

| Source locus | Tapped | Destination locus |
|---|---|---|
| lp/rad on X | atom X itself | none (refused: an arrow to itself) |
| lp/rad on X | atom Y, not bonded to X | `σ X-Y` |
| lp/rad on X | atom Y bonded to X, or bond X–Y | `π X-Y` |
| bond A–B | atom A or B | `lp A` / `lp B` (`rad` for a fish-hook) |
| bond A–B | bond B–C | `π B-C` |
| bond A–B | atom Y, neither A nor B | **ambiguous** if both A and B could bond to Y (alkene + H–Br, Markovnikov). The screen asks "which atom forms the bond?". If only one of A or B is next to Y, that one is used. |

So content and validation only ever see destination loci.

**Step kind** (`stepKind`): `polar` (all `->`) | `radical` (all `~>`) | `change` (no arrows, §3.4). The generic rule
`wrong-arrow-type` fires when the learner's arrow type fits **no** step leaving the current state.

## 3. Reaction file (JSON, one file per reaction version)

JSON keys are camelCase (the browser reads them as they are); Python reads the same keys. A key holding a mapping is
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
  "reactionClasses": ["substitution"],   // filter facets; controlled list
  "difficultyTier": 1,                   // 1..3, shown as ●○○ … ●●●
  "conditionsLabel": "NaOH · EtOH/H₂O · 25 °C",   // text over the reaction arrow only
  "dailyPuzzleEligible": true,
  "atomRoleToMapNumbers": { "nucleophile": [1], "electrophile": [2], "leavingGroup": [3] },  // optional
  "spectatorMapNumbers": [4],            // drawn faded, never validated
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
  "bondToWedgeStyle": { "2-5": "wedge" },     // key "<map number>-<map number>", wide end at the second; display only
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
3. **Exactly one product state** (no steps leave it). Every route ends there, so **branches must rejoin**.
   Branches that end in different products (regioisomers, E/Z) are out of scope for v1.
4. **Exactly one route made only of preferred steps.** At most one preferred step leaves each state.
5. Two steps leaving one state must not reach resonance-equivalent states (up to skeleton symmetry).
6. Each step's canonical arrows and partial arrow sets, applied to its from-state, reproduce its to-state (§4).
7. No misconception on a state matches an arrow set that §4 would accept (it would hide a correct answer).

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
   period ≥ 3 up to 12), electrons conserved, total charge conserved.
3. **No redundant arrows**: removing any one arrow must change `R`. Otherwise the generic rule `redundant-arrow` fires.
   This stops a correct answer padded with a pair of arrows that cancel out.
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

**Skeleton symmetry** is found by enumerating the automorphisms of `S`'s σ skeleton, with elements and H counts as
labels. The molecules here are small: a tert-butyl group with every H explicit is about 1,300 permutations, and most H are
implicit. Above `MAXIMUM_SKELETON_SYMMETRIES = 10_000` (a safety cap, not a chemistry number), the linter warns and the
browser compares without symmetry.

A right product reached by nonsense arrows fails at 1, 2 or 3. Point 4 compares the whole mapped skeleton, so
arrows that give the right formula but move the wrong atoms also fail.

## 5. Feedback

### 5.1 Order (Q3: an authored misconception beats a generic rule)

The validator returns an **attempt assessment**: `correct` (with the step key), `misconception:<id>`,
`rule:<generic rule id>`, `partial:<arrows still missing>` or `wrong`. Checks, first match wins:

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

`catalogue.json`, built from the published versions:

```jsonc
{ "formatVersion": 1, "builtAt": "2026-12-01T…",
  "reactions": [{ "reactionSlug": "…", "latestReactionVersion": 2,
                  "reactionVersionToContentHash": { "1": "a1b2c3d4…", "2": "e5f6a7b8…" },
                  "title": "…", "reactionClasses": ["…"], "difficultyTier": 1, "dailyPuzzleEligible": true }],
  "dateToDailyReactionVersionRef": { "2026-12-01": "sn2-hydroxide-bromomethane@2", … } }
```

The **daily calendar is a list in the build that only grows**. It is not `hash(date) mod N`, which would reshuffle past
and future days whenever a reaction is added. The build fills about 60 days ahead (`DAILY_CALENDAR_DAYS_AHEAD = 60`)
with a date-seeded shuffle of eligible reactions and never rewrites a past date.

## 7. Learner progress (`localStorage`, key `arrowpush.progress`)

```jsonc
{ "formatVersion": 1,
  "runs": [{ "reactionVersionRef": "aldol-addition-base@3", "mode": "practice", "startedAt": "2026-12-01T…",
             "stepResults": [{ "stepKey": "enolate",
                               "stepOutcome": "firstTry",   // firstTry | afterRetry | afterHint | missed
                               "attemptCount": 2, "hintsUsed": 1,
                               "feedbackIdsShown": ["misconception:aldol-addition-base/oh-adds-carbonyl",
                                                    "rule:octet-exceeded"] }] }],
  "dateToDailyResult": { "2026-12-01": { "reactionVersionRef": "…@2", "shareGrid": "🟩🟨🟩", "score": 4 } },
  "settings": { "theme": "auto" } }
```

* A run's `stepResults` are the steps the learner actually took, in order, so a run records its route. A failed or
  revealed state is recorded under its preferred step's key.
* The daily share grid has **one tile per step taken**, so its length depends on the route. A preferred or accepted
  step on the first try both give 🟩.
* Mastery and the misconception history are computed from `runs`, grouped by slug, step key and tag, so a new
  reaction version does not reset them. Export/import is this JSON. Import merges runs, deduplicated by
  `reactionVersionRef + startedAt`.

## 8. Postgres (editor and submissions only)

```sql
users(id uuid pk, display_name text, oauth_provider text, oauth_subject text,
      site_role text check (site_role in ('contributor','reviewer','owner')), created_at timestamptz,
      unique(oauth_provider, oauth_subject))

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
```

* The whole document, mechanism graph included, lives in `reaction_document`. Columns duplicate only what queries need.
* Publishing sets the hash and `published_at`, then triggers the static build.
* The reviewer's diff compares version n with n−1. A diff that understands steps comes later.

## 9. Shared fixtures (JS ↔ Python)

`fixtures/` at the repo root, read by both Vitest and pytest. The browser validator and the Python linter must give
identical results on all of them.

* `notation/*.json`: arrow strings → parsed loci, plus the error cases.
* `apply/*.json`: state + arrow set → expected state, or the expected generic rule id.
* `resonance/*.json`: pairs of states → resonance-equivalent or not (enolate forms, both Kekulé benzenes, carboxylate,
  allyl radical, a charge-separated carbonyl, two molecules swapping a charge (not equivalent)).
* `assess/*.json`: reaction + state id + learner arrow set → expected attempt assessment.
* `graph/*.json`: graphs breaking the rules of §3.5 → expected lint error ids.
* `reactions/*.json`: SN2, aldol, radical bromination and the Wittig, end to end.

## 10. Proposed build order (each strictly TDD)

1. JSON Schema file (`schema/reaction.schema.json`) plus the four example reactions, validated in both languages.
2. Arrow notation parser and printer (TS + Python).
3. Mapped-graph model and applying arrows.
4. Skeleton symmetry, resonance equivalence and the attempt-assessment pipeline (§4–5).
5. Python linter CLI (states reproduce, graph rules, coordinate seeding, unreachable-misconception warnings).
6. Catalogue build and daily calendar.
7. Then the UI (learner screen first), the editor and the backend.

## 11. Corrections to the mockup content

* **Radical H-abstraction needs 3 fish-hooks**, not 2 (Q4). The 2-arrow attempt is partial progress ("1 more"),
  and an authored message can add "one fish-hook per electron — the C–H bond has two".
* **Aldol step 2 needs 3 arrows**, not 2. With the enolate drawn C=C–O⁻, attacking from the C=C π bond alone leaves
  C⁺ next to O⁻, a charge-separated form of the aldehyde. That attempt now gets `minor-resonance-form`. The
  canonical arrows are `lp O⁻ → π O–C`, `π C=C → σ C–C′`, `π C′=O′ → lp O′`.
* The aldol's second acetaldehyde appears only in state 1 in the mockup. With map numbers shared across the
  reaction, it arrives through a change step or is present from the start.
* The editor's timeline becomes a graph: it needs "add branch from this state" and a way to show a fork. Since
  branches rejoin, it can start as one list per branch.
