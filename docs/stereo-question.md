# Stereo question: schema and lint (proposal, for review)

> **Status: agreed 2026-11-28** (the owner's answers to §6 are folded in: a racemic mixture can be the right answer;
> "plausible, but not the major product"; no hints in v1). Follows the agreed UX: design C, second round
> (`mockups/stereo-choice/build2.html`) and the authoring screen (`mockups/stereo-choice/author.html`).
> Phase 3 of `docs/stereo-validation.md`. Human copy: `docs/stereo-question.html`.

## 1. What it adds

After correct arrows, a step may ask the learner to **draw the product's stereochemistry**: the atoms whose
configuration the step sets are shown as "?" and the learner taps each one to a wedge or a dash (a new C=C flips
between its two geometries). "Check product" compares the drawing with the step's to-state. Only steps an author has
given a stereo question ask; a wrong drawing counts as a wrong attempt.

## 2. Terms (to add to `schema-design.md` §0)

| Term | Meaning |
|---|---|
| **stereo question** | A step's optional request to draw the product's stereochemistry after correct arrows (`step.stereoQuestion`). |
| **question centre** | An atom (stereocentre) or double bond whose configuration the step sets: marked in the to-state, and not carried over unchanged from the from-state. Derived, never stored. The learner taps these. |
| **arrangement** | One configuration of all the question centres of a step. The right arrangement is the to-state's; others are authored as `otherArrangements`. (Not "alternative": that word means an alternative product, §3.5 rule 3.) |
| **drawn arrangement** | The arrangement the learner has drawn, given to the assessment as the to-state with the learner's marks. |
| **stereo answer assessment** | The verdict on one drawn arrangement: right, an authored arrangement (with its severity and message), the racemic-mixture answer, or "any other arrangement". Not an attempt assessment (that judges arrows). |

## 3. Schema

New optional property on an **arrow step** (not allowed on a change step):

```jsonc
{
  "stepKey": "hydroboration",
  "fromStateId": "reactants", "toStateId": "alkylborane",
  "stepKind": "polar", "routePreference": "preferred",
  "canonicalArrows": ["π C1-C2 -> σ C2-B8", "σ H9-B8 -> σ C1-H9"],
  "stereoQuestion": {
    "acceptEnantiomer": true,
    "otherArrangements": [
      {
        "mappedSmiles": "[C@:1]1([H:9])([CH3:7])[C@@H:2]([BH2:8])[CH2:3][CH2:4][CH2:5][CH2:6]1",
        "severity": "wrong",
        "feedbackMessage": "H and B are on opposite faces here (anti). They are delivered together by one B–H bond, so they arrive on the same face."
      }
    ],
    "otherArrangementMessage": "Not this arrangement. Think about which face each new bond forms on."
  }
}
```

SN2 on (R)-2-bromobutane (a single enantiomer, so its mirror image is a wrong arrangement):

```jsonc
"stereoQuestion": {
  "acceptEnantiomer": false,
  "otherArrangements": [
    { "mappedSmiles": "[OH:1][C@H:2]([CH3:5])[CH2:6][CH3:7].[Br-:3].[Na+:4]", "severity": "wrong",
      "feedbackMessage": "That keeps the configuration (retention). The nucleophile comes in from the back, so the centre inverts." }
  ],
  "racemicMixture": { "isRight": false,
    "feedbackMessage": "A racemic mixture comes from a flat carbocation (SN1). SN2 is one step from one face." }
}
```

SN1 (a flat carbocation, attacked from either face), where the racemic mixture is the answer:

```jsonc
"stereoQuestion": {
  "acceptEnantiomer": true,
  "otherArrangements": [],
  "racemicMixture": { "isRight": true,
    "feedbackMessage": "Water attacks the flat cation equally from either face, so both enantiomers form in equal amounts." }
}
```

| Field | Type | Meaning |
|---|---|---|
| `acceptEnantiomer` | boolean, required | Whether the mirror image of the right arrangement is right too, and each other arrangement also stands for its own mirror image. Mirror image = every question centre inverted (cis/trans double bonds unchanged). Only possible when every stereocentre of the product molecule is a question centre; otherwise inverting the question centres gives a diastereomer, so it must be false. |
| `otherArrangements[]` | array, may be empty | Authored arrangements to explain. |
| `….mappedSmiles` | text | The **whole to-state** written with this arrangement's marks: same atoms and bonds as the to-state, different marks at question centres only. |
| `….severity` | `wrong` \| `plausible` | Same words and meaning as a misconception's severity. The learner sees `plausible` as **"Plausible, but not the major product"**. Either way the try counts as wrong and the learner goes on to the major product. |
| `….feedbackMessage` | text | What the learner is told. |
| `racemicMixture` | object, optional | Present = the learner may answer "both enantiomers form, 50 : 50" (a tick box beside the drawing). |
| `racemicMixture.isRight` | boolean | `true`: the racemic mixture **is** the answer (SN1, addition to a flat C=O); ticking it answers the question, and drawing only one enantiomer (the product or its mirror image) is answered "Plausible, but not the whole answer: its mirror image forms just as much" and counts as a wrong try. `false`: a distractor (an SN2, a stereospecific addition). |
| `racemicMixture.feedbackMessage` | text | What the learner is told on choosing it (when right: added to the step's explanation). |
| `otherArrangementMessage` | text, optional | For an arrangement nobody listed; a fixed default is used when absent. |

The right arrangement and its message are **not** repeated here: the right answer is the to-state, and the learner is
told the step's `explanationAfterStep`. No `formatVersion` change: the property is optional and old readers never saw it.

### Derived, not stored (one source of truth each)

* **Question centres**: from the from- and to-state marks (`stereoCarriedOver`, item 12b). Storing them would let them
  drift from the drawing.
* **The right arrangement**: the to-state.
* **The mirror image**: every question centre's mark inverted.
* **Where the wedge goes** when the learner taps: the to-state's wedge bond at that centre (`wedgesForMarks`), so the
  "?" drawing and the answer drawing look alike.

### Options considered for storing an arrangement

| Option | Why not chosen |
|---|---|
| **Whole to-state SMILES** (chosen) | Reuses the strict reader, writer, comparison and drawing as they are. If someone later changes the right answer, a stale arrangement that now equals it is caught by lint. |
| Flips relative to the answer (`"invert": [2]`) | Short, but its meaning silently reverses if the right answer is redrawn: "invert C2" of retention is inversion, and the message about retention would now sit on the right answer, with nothing to catch it. |
| A map of marks (`{"2": "@@"}`) | A mark means something only with the canonical neighbour order: unreadable by people, and invalid if the neighbours change. |
| CIP labels (`{"2": "S"}`) | Readable, but CIP needs RDKit, which the learner site does not load, and the label of an unchanged centre can change when a neighbour changes. |

## 4. Lint rules (to add to `schema-design.md` §3.5)

Run after the existing stereo rules. Each points at `/steps/<i>/stereoQuestion…`.

| Rule id | Level | Rule | Why |
|---|---|---|---|
| `stereo-question-without-question-centres` | error | The step sets no stereocentre or cis/trans double bond. | Nothing to tap. |
| `arrangement-not-the-product` | error | An arrangement's SMILES is not the to-state's atoms and bonds (ignoring stereo), or cannot be read. | The learner only re-marks the product; also catches an arrangement left behind after the mechanism changed. |
| `arrangement-changes-other-centres` | error | An arrangement differs from the to-state at an atom or bond that is not a question centre. | The learner cannot tap it, so the arrangement can never be drawn. |
| `arrangement-is-the-answer` | error | An arrangement equals the to-state, or (with `acceptEnantiomer`) its mirror image. | It would hide a right answer. |
| `arrangement-repeated` | error | Two arrangements are equal, or (with `acceptEnantiomer`) mirror images of each other. | Only the first could ever be reached. |
| `arrangement-has-unset-centre` | error | An arrangement leaves a question centre unmarked. | Every centre must be set before "Check product". |
| `enantiomer-accepted-with-fixed-centres` | error | `acceptEnantiomer` is true but the product molecule also has stereocentres the step does not set (Felkin–Anh's C6; bromination step 2's C2, set by the bromonium ion). | Inverting only the question centres gives a diastereomer, not the enantiomer: in bromination it would accept cis. |
| `enantiomer-rejected-for-racemic-product` | error | `acceptEnantiomer` is false, the to-state is marked racemic, and every stereocentre of the product molecule is a question centre. | A right drawing of the other enantiomer would be marked wrong. (With fixed centres the racemate is already drawn as one enantiomer, so false is right.) |
| `enantiomer-accepted-for-single-enantiomer` | warning | `acceptEnantiomer` is true but the to-state is not marked racemic. | Usually the racemic label is missing; fine when only the relative configuration is asked. |
| `racemic-mixture-right-for-single-enantiomer` | error | `racemicMixture.isRight` is true but the to-state is not marked racemic. | The drawing and the answer would say different things. |
| `racemic-mixture-right-with-fixed-centres` | error | `racemicMixture.isRight` is true but the product molecule has stereocentres the step does not set. | "Both enantiomers" is then not what the learner can mean by the tick box (it would be two diastereomers). |

Non-empty messages and the enums are the JSON Schema's job (`nonEmptyText`), not lint rules.

## 5. Modules (deep modules, one implementation each)

New folder **`core/stereoQuestions/`** (after `attemptAssessment` in the core tier; add to `.dependency-cruiser.cjs`
and `docs/code-layout.md`). Its whole interface is two functions:

```ts
/** Everything about one step's question, worked out once: centres, the right arrangement, its mirror image,
 *  the authored arrangements as state graphs. Throws only on unreadable SMILES (lint reports those first). */
prepareStereoQuestion(step: ReactionStep, fromState: StateGraph, toState: StateGraph): PreparedStereoQuestion

/** The verdict on one answer. `drawn` is the to-state with the learner's marks at the question centres. */
assessStereoAnswer(question: PreparedStereoQuestion, answer: { drawn: StateGraph } | { racemicMixture: true }): StereoAnswerAssessment
// StereoAnswerAssessment = { kind: "right"; feedbackMessage? } | { kind: "authored", severity, feedbackMessage }
//                        | { kind: "racemicMixtureWrong", feedbackMessage } | { kind: "singleEnantiomerOfRacemate" }
//                        | { kind: "otherArrangement", feedbackMessage }
```

Behind it: finding question centres, mirror images, comparing arrangements, the default message. Callers:

* **learner/stepSession**: a new phase after correct arrows when the step has a question; each answer that is not right
  (wrong or plausible) adds 1 to the step's `attemptCount`, so `stepScoring` and step outcomes need no change. No hints
  in v1: the step's hint ladder stays about the arrows.
* **tooling/reactionLinting**: the nine rules above, built on `prepareStereoQuestion` (equal, mirror, centres).
* **create**: the authoring screen's live checks are the lint findings for that step (no second copy of the rules);
  "Try it as a learner" uses the learner's own control.

Taps become marks with the existing `drawnTetrahedralMark` (drawing tier), so the learner control needs no new chemistry.

**Create regeneration** (`stateRegeneration.ts`): when the to-state is regenerated, each arrangement is rewritten as
the new to-state with the same question centres inverted as before. If the question centres change, the arrangement is
left as it was and `arrangement-not-the-product` / `arrangement-changes-other-centres` tell the author.

**Unchanged:** database (the step is stored inside the reaction JSON), catalogue, draft sync, progress format.
**Changed:** schema, `reactionFile.ts` types, the session snapshot (it stores the phase and the drawn arrangement),
version changes (the question is a compared entry), and Create's teaching items.

## 6. Decisions (the owner, 2026-11-28)

1. A racemic mixture can be the right answer (SN1): `racemicMixture.isRight`.
2. `plausible` is shown as "Plausible, but not the major product"; it counts as a wrong try.
3. No hints for the stereo question in v1.
