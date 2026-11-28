/**
 * Stereo lint rules (item 12c, docs/stereo-validation.md phase 1; levels in schema-design.md §3.5).
 *
 * Rules
 *   wedges-disagree-with-smiles (error)        A state's drawing must show its SMILES marks: each
 *                                              marked stereocentre has a wedge or dash starting at
 *                                              it that shows the same configuration, no wedge
 *                                              starts at an unmarked atom, and each cis/trans
 *                                              double bond is drawn that way round.
 *   wedges-without-stereo-marks (warning)      A state with wedges but no stereocentre marks at
 *                                              all: drawn before item 12, when wedges were display
 *                                              only (Create now turns drawn wedges into marks).
 *                                              Kept a warning so published files from then still
 *                                              build; the fix is to give the SMILES its marks.
 *   stereocentre-changes-without-arrows (error) Between a step's from- and to-state, a centre or
 *                                              double bond that no canonical arrow touches, with
 *                                              the same neighbours in both, keeps its mark (or
 *                                              lack of one). A change step touches nothing. A mark
 *                                              may appear on (or leave) an atom that is not a
 *                                              stereocentre on the other side: a step can make a
 *                                              centre without touching it, when two alike groups
 *                                              next to it become different.
 *   stereocentre-unspecified (warning)         In a state that marks some stereocentre, RDKit
 *                                              finds another with no mark. Found by marking the
 *                                              atom and asking RDKit whether the mark survives
 *                                              (RDKit drops marks on atoms that are not
 *                                              stereocentres), with the other map numbers
 *                                              removed (RDKit would rank atoms by them).
 */
import { parseCurvedArrow } from "../../../core/arrowNotation/curvedArrowNotation.js";
import { withHydrogensFolded } from "../../../core/attemptAssessment/hydrogenFolding.js";
import { skeletonSymmetries } from "../../../core/attemptAssessment/skeletonSymmetry.js";
import {
  graphOf,
  type PreparedReaction,
} from "../../../core/attemptAssessment/preparedReaction.js";
import { stereoCarriedOver } from "../../../core/stateGraphs/arrowApplication.js";
import { mappedSmilesFromStateGraph } from "../../../core/stateGraphs/mappedSmilesWriting.js";
import {
  bondKeyMapNumbers,
  type StateGraph,
  type TetrahedralMark,
} from "../../../core/stateGraphs/stateGraph.js";
import { stereocentreNeighbours } from "../../../core/stateGraphs/stereoMarks.js";
import {
  drawnDoubleBondRelation,
  drawnTetrahedralMark,
} from "../../../drawing/moleculeDrawing/shared/stereoDrawing.js";
import {
  type ChemistryToolkit,
  smilesKeepingMapNumbers,
} from "../../chemistryToolkit/chemistryToolkit.js";
import type { LintedReaction, LintedState, LintedStep } from "../findings/lintedReaction.js";
import { type LintFinding, lintError, lintWarning } from "../findings/lintFindings.js";

/** "C6" for map number 6: the atom as arrows name it. */
function atomName(graph: StateGraph, mapNumber: number): string {
  return `${graph.mapNumberToAtom.get(mapNumber)?.element ?? "atom "}${String(mapNumber)}`;
}

/** What is wrong with one state's wedges and dashes, as messages. */
function wedgeProblems(graph: StateGraph, state: LintedState): string[] {
  const marks = graph.mapNumberToTetrahedralMark ?? new Map<number, TetrahedralMark>();
  const wedges = state.bondToWedgeStyle;
  const problems: string[] = [];
  for (const [centre, mark] of [...marks].sort(([first], [second]) => first - second)) {
    const drawn = drawnTetrahedralMark(graph, centre, state.mapNumberToCoordinates, wedges);
    if (drawn === undefined) {
      problems.push(
        `${atomName(graph, centre)} has a stereo mark in the SMILES but no wedge or dash ` +
          "starting at it shows it",
      );
    } else if (drawn !== mark) {
      problems.push(
        `the wedges at ${atomName(graph, centre)} show the other configuration from its ` +
          "SMILES mark",
      );
    }
  }
  const unmarkedStarts = new Set(
    Object.keys(wedges)
      .map((key) => bondKeyMapNumbers(key)[0])
      .filter((start) => !marks.has(start)),
  );
  for (const start of [...unmarkedStarts].sort((first, second) => first - second)) {
    problems.push(
      `a wedge or dash starts at ${atomName(graph, start)}, which has no stereo mark in the SMILES`,
    );
  }
  return problems;
}

/** What is wrong with one state's double bonds, as messages. */
function doubleBondProblems(graph: StateGraph, state: LintedState): string[] {
  return [...(graph.bondToDoubleBondRelation ?? [])].flatMap(([key, relation]) => {
    const drawn = drawnDoubleBondRelation(graph, key, state.mapNumberToCoordinates);
    if (drawn === relation) {
      return [];
    }
    const [first, second] = bondKeyMapNumbers(key);
    const bond = `${atomName(graph, first)}=${atomName(graph, second)}`;
    return [
      drawn === undefined
        ? `the ${bond} double bond is marked ${relation} but drawn with a neighbour in line`
        : `the ${bond} double bond is marked ${relation} in the SMILES but drawn ${drawn}`,
    ];
  });
}

/** wedges-disagree-with-smiles (and wedges-without-stereo-marks), for every state. */
export function stereoDrawingFindings(
  reaction: LintedReaction,
  prepared: PreparedReaction,
): LintFinding[] {
  return [...reaction.stateIdToState].flatMap(([stateId, state]) => {
    const graph = graphOf(prepared, stateId);
    const hasWedges = Object.keys(state.bondToWedgeStyle).length > 0;
    if (hasWedges && (graph.mapNumberToTetrahedralMark?.size ?? 0) === 0) {
      return [
        lintWarning(
          "wedges-without-stereo-marks",
          ["stateIdToState", stateId, "bondToWedgeStyle"],
          "the state has wedges but its SMILES has no stereo marks: give the SMILES the marks " +
            "the wedges show (redraw the wedges in the structure editor)",
        ),
      ];
    }
    return [
      ...wedgeProblems(graph, state).map((message) =>
        lintError(
          "wedges-disagree-with-smiles",
          ["stateIdToState", stateId, "bondToWedgeStyle"],
          message,
        ),
      ),
      ...doubleBondProblems(graph, state).map((message) =>
        lintError(
          "wedges-disagree-with-smiles",
          ["stateIdToState", stateId, "mapNumberToCoordinates"],
          message,
        ),
      ),
    ];
  });
}

/** The atoms a step's canonical arrows touch (none for a change step). */
function touchedAtoms(step: LintedStep): Set<number> {
  return new Set(
    step.canonicalArrows.flatMap((notation) => {
      const curvedArrow = parseCurvedArrow(notation);
      return [...curvedArrow.source.atoms, ...curvedArrow.destination.atoms].map(
        (atom) => atom.mapNumber,
      );
    }),
  );
}

/** The keys of `carried` whose value differs from the other state's (or is missing there). */
function differingKeys<Key, Value>(
  carried: ReadonlyMap<Key, Value>,
  other: ReadonlyMap<Key, Value> | undefined,
): Key[] {
  return [...carried].filter(([key, value]) => other?.get(key) !== value).map(([key]) => key);
}

/** The atoms and double bonds whose stereo changes across the step without an arrow. */
function changedWithoutArrows(
  [from, to]: readonly [StateGraph, StateGraph],
  touched: Set<number>,
  toolkit: Pick<ChemistryToolkit, "canonicalStereoSmiles">,
): string[] {
  const forward = stereoCarriedOver(from, to, touched);
  const backward = stereoCarriedOver(to, from, touched);
  // A mark missing on one side counts only where that side's atom is a stereocentre.
  const missingCounts = (graph: StateGraph, centre: number): boolean =>
    graph.mapNumberToTetrahedralMark?.has(centre) === true ||
    isStereocentreForRdkit(graph, centre, toolkit);
  const changedCentres = new Set([
    ...differingKeys(forward.mapNumberToTetrahedralMark, to.mapNumberToTetrahedralMark).filter(
      (centre) => missingCounts(to, centre),
    ),
    ...differingKeys(backward.mapNumberToTetrahedralMark, from.mapNumberToTetrahedralMark).filter(
      (centre) => missingCounts(from, centre),
    ),
  ]);
  const changedBonds = new Set([
    ...differingKeys(forward.bondToDoubleBondRelation, to.bondToDoubleBondRelation),
    ...differingKeys(backward.bondToDoubleBondRelation, from.bondToDoubleBondRelation),
  ]);
  const centreNames = [...changedCentres]
    .sort((first, second) => first - second)
    .map((centre) => atomName(from, centre));
  const bondNames = [...changedBonds].sort().map((key) => {
    const [first, second] = bondKeyMapNumbers(key);
    return `${atomName(from, first)}=${atomName(from, second)}`;
  });
  return [...centreNames, ...bondNames];
}

/** stereocentre-changes-without-arrows, for every step. */
export function stereoChangeFindings(
  reaction: LintedReaction,
  prepared: PreparedReaction,
  toolkit: Pick<ChemistryToolkit, "canonicalStereoSmiles">,
): LintFinding[] {
  return reaction.steps.flatMap((step, stepIndex) => {
    const changed = changedWithoutArrows(
      [graphOf(prepared, step.fromStateId), graphOf(prepared, step.toStateId)],
      touchedAtoms(step),
      toolkit,
    );
    if (changed.length === 0) {
      return [];
    }
    const what =
      step.stepKind === "change" ? "a change step moves no electrons" : "no arrow touches it";
    return [
      lintError(
        "stereocentre-changes-without-arrows",
        ["steps", stepIndex],
        `the configuration of ${changed.join(", ")} changes from "${step.fromStateId}" to ` +
          `"${step.toStateId}", but ${what}`,
      ),
    ];
  });
}

/**
 * Whether `centre` is a stereocentre, worked out on the state with its drawn hydrogens folded
 * (a drawn H must not make two methyls different): not when some skeleton symmetry fixing it
 * swaps two of its neighbours (alike groups, or two oxygens that differ only by resonance);
 * otherwise when RDKit keeps a mark put on it (it drops marks on atoms that are not centres).
 */
// Worked out once per state graph: the lint asks about many atoms of the same state.
const graphToFolding = new WeakMap<
  StateGraph,
  { folded: StateGraph; symmetries: readonly ReadonlyMap<number, number>[] }
>();

function foldingOf(graph: StateGraph): {
  folded: StateGraph;
  symmetries: readonly ReadonlyMap<number, number>[];
} {
  const known = graphToFolding.get(graph);
  if (known !== undefined) {
    return known;
  }
  const folded = withHydrogensFolded(graph);
  const folding = { folded, symmetries: skeletonSymmetries(folded) };
  graphToFolding.set(graph, folding);
  return folding;
}

function isStereocentreForRdkit(
  graph: StateGraph,
  centre: number,
  toolkit: Pick<ChemistryToolkit, "canonicalStereoSmiles">,
): boolean {
  const { folded, symmetries } = foldingOf(graph);
  const neighbours = stereocentreNeighbours(folded, centre);
  if (!folded.mapNumberToAtom.has(centre) || neighbours.length !== 4) {
    return false;
  }
  const swapsNeighbours = symmetries.some(
    (symmetry) =>
      symmetry.get(centre) === centre &&
      neighbours.some((neighbour) => (symmetry.get(neighbour) ?? neighbour) !== neighbour),
  );
  if (swapsNeighbours) {
    return false;
  }
  const marked: StateGraph = {
    ...folded,
    mapNumberToTetrahedralMark: new Map([[centre, "@"]]),
  };
  const written = smilesKeepingMapNumbers(mappedSmilesFromStateGraph(marked), new Set([centre]));
  const canonical = toolkit.canonicalStereoSmiles(written) ?? "";
  return new RegExp(`\\[[^\\]]*@[^\\]]*:${String(centre)}\\]`).test(canonical);
}

/** stereocentre-unspecified, for every state that marks some stereocentre. */
export function unspecifiedStereocentreFindings(
  reaction: LintedReaction,
  prepared: PreparedReaction,
  toolkit: Pick<ChemistryToolkit, "canonicalStereoSmiles">,
): LintFinding[] {
  return [...reaction.stateIdToState.keys()].flatMap((stateId) => {
    const graph = graphOf(prepared, stateId);
    const marks = graph.mapNumberToTetrahedralMark ?? new Map<number, TetrahedralMark>();
    if (marks.size === 0) {
      return [];
    }
    const unmarked = [...graph.mapNumberToAtom.keys()]
      .sort((first, second) => first - second)
      .filter(
        (mapNumber) =>
          !marks.has(mapNumber) &&
          stereocentreNeighbours(graph, mapNumber).length === 4 &&
          isStereocentreForRdkit(graph, mapNumber, toolkit),
      );
    if (unmarked.length === 0) {
      return [];
    }
    const names = unmarked.map((mapNumber) => atomName(graph, mapNumber)).join(", ");
    return [
      lintWarning(
        "stereocentre-unspecified",
        ["stateIdToState", stateId, "mappedSmiles"],
        `RDKit finds a stereocentre at ${names} with no mark, in a state that marks others`,
      ),
    ];
  });
}
