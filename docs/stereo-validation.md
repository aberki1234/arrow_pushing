# Stereo validation: design

> **Agreed 2026-11-26**: the owner chose every recommendation (SMILES marks; a product question for face choice;
> one enantiomer + "racemic"; phases 1–2 now). Build item 12 in `schema-design.md` §10; SPEC §4 "Chemistry
> conventions" revised. Human copy: `docs/stereo-validation.html`.

## 1. What "stereo validation" can mean in ArrowPush

Learners draw **arrows**, never products: the app applies the arrows and compares the result with the authored
to-state (`schema-design.md` §4). So stereochemistry can go wrong in only three places:

| Kind | Example | Learner's choice? | What is needed |
|---|---|---|---|
| **A. Outcome only** | SN2 inversion; anti opening of a bromonium ion; syn hydroboration; thermal con/disrotatory | No: the arrows are the same whatever the stereo | The *authored* states must carry stereo and be right; the learner sees it drawn correctly |
| **B. Atom choice** | E2: the H anti-periplanar to Br (cyclohexane axial H; E vs Z from 2-bromobutane); which of two diastereotopic groups migrates | Yes: *which atom* the arrow starts from | Diastereotopic atoms must stop counting as equivalent |
| **C. Face choice** | Nucleophile adding to one face of C=O (Felkin); Diels–Alder endo vs exo; SN2 front vs back (as a question) | Yes, but curved arrows cannot express a face | A new interaction |

Today: states cannot hold stereo at all (the strict reader refuses `@`, `@@`, `/`, `\`); wedges
(`bondToWedgeStyle`) are display only and nothing checks them; and **kind B answers are wrongly accepted**:
skeleton symmetry (`attemptAssessment/skeletonSymmetry.ts`) maps any H onto any other H of the same carbon, so
removing the syn H in an E2 counts as correct.

## 2. Proposal

### Phase 1: stereo in states (kind A)

- **Stereo lives in `mappedSmiles`** as SMILES tetrahedral marks (`@`, `@@`) and double-bond marks (`/`, `\`). The
  strict reader and writer (`stateGraphs/`) read and write them into the state graph as a parity per stereocentre
  and a cis/trans flag per stereo double bond, defined on map numbers so they survive relabelling.
- **Wedges stay the drawing** and the linter checks they agree with the SMILES (RDKit.js, linter and editor only;
  the learner site never needs CIP). The editor fills wedges from the SMILES when it regenerates a state.
- **Arrow application** keeps the configuration of every stereocentre and stereo double bond the arrows do not
  touch. A centre or double bond the step makes or changes takes its configuration from the to-state (the author
  decides inversion, anti addition, …).
- **Comparison** (§4 "correct") becomes stereo-aware for untouched centres: a result whose untouched centre has the
  wrong configuration is not the to-state.
- **New lint rules**: `wedges-disagree-with-smiles` (error), `stereocentre-changes-without-arrows` (error: a centre
  no arrow touches changes configuration between from- and to-state), `stereocentre-unspecified` (warning: RDKit
  finds a stereocentre with no mark in a state that has other marks).
- **Graph rule 3** is widened: an alternative product may be a stereoisomer (E/Z, a diastereomer), with a caption.
  Graph rule 5 compares stereo-aware.
- **Racemic outcomes** (SN1, addition to a flat C=O with no other centre): one enantiomer drawn, the caption says
  "racemic". No marks needed where there is nothing to tell apart.

### Phase 2: stereo-aware symmetry (kind B)

- A skeleton symmetry must also **keep every parity and cis/trans flag** (after relabelling). Diastereotopic atoms
  (the two H on C3 of 2-bromobutane, the axial and equatorial H in a drawn chair) are then different atoms, and
  choosing the wrong one gives a different result: assessed as wrong, or as an authored misconception
  ("this H is syn to Br: E2 needs it anti-periplanar").
- Enantiotopic atoms (the two H of a CH₂ in an achiral molecule) stay equivalent when the result is the other
  enantiomer of an achiral-start racemic outcome; the rule is "equivalent if the results are the same or mirror
  images and the start state is achiral". To be fixed in fixtures before coding.
- The arrow picking needs no change: diastereotopic H are already separate drawn atoms.

### Phase 3: face choice (kind C), needs a UX decision

Recommended: **a product question after the arrows**. When a step's to-state has stereoisomeric siblings authored
as `stereoAlternatives` (each a to-state, with a feedback message), the learner who drew the right arrows is shown
the candidate products drawn side by side ("Which product forms?") and picks one. Wrong pick → the authored
message, counted as a hint-free wrong check. It reuses the drawing code and needs no 3D input. Alternatives: an
approach-side toggle on the arrow ("from the front / from behind": hard to show on a 2D drawing), or explanation
only (today's behaviour).

## 3. Build order (each strictly TDD; fixtures first)

1. `fixtures/state_graphs/`: stereo SMILES cases (parity, cis/trans, invalid marks); reader and writer.
2. Arrow application carries untouched stereo; fixtures of SN2 inversion, bromonium anti opening, E2.
3. Stereo-aware comparison and lint rules (RDKit for wedges); the editor fills wedges.
4. Stereo-aware skeleton symmetry; attempt cases for E2 anti-periplanar (right H correct, syn H wrong, a
   misconception on the syn H).
5. Content: add marks to F2 SN2 / F3 E2 / F4 bromination drafts as the first users.
6. Phase 3 after a UX decision and a mockup.

## 4. Questions for the owner (answered 2026-11-26: the recommended option each time)

1. Stereo stored in `mappedSmiles` marks, with wedges checked against them (recommended), or wedges + coordinates
   as the only truth (no SMILES change, but every comparison needs geometry)?
2. Phase 3: product question after the arrows (recommended), approach-side toggle, or explanation only for now?
3. Racemic outcomes: one enantiomer drawn with a "racemic" caption (recommended), or both enantiomers as products?
4. Scope now: phases 1–2 (recommended), with phase 3 after a mockup?
