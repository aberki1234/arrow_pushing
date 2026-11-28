/**
 * Stereo lint rules (item 12c, docs/stereo-validation.md phase 1; levels in schema-design.md §3.5).
 *
 * Rules
 *   wedges-disagree-with-smiles (error)        A state's drawing must show its SMILES marks: each
 *                                              marked stereocentre has a wedge or dash starting at
 *                                              it that shows the same configuration, no wedge
 *                                              starts at an unmarked atom, and each cis/trans
 *                                              double bond is drawn that way round.
 *   stereocentre-changes-without-arrows (error) Between a step's from- and to-state, a centre or
 *                                              double bond that no canonical arrow touches, with
 *                                              the same neighbours in both, keeps its mark (or
 *                                              lack of one). A change step touches nothing.
 *   stereocentre-unspecified (warning)         In a state that marks some stereocentre, RDKit
 *                                              finds another with no mark. Found by marking the
 *                                              atom and asking RDKit whether the mark survives
 *                                              (RDKit drops marks on atoms that are not
 *                                              stereocentres).
 */
import { parseCurvedArrow } from "../../../core/arrowNotation/curvedArrowNotation.js";
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
import type { ChemistryToolkit } from "../../chemistryToolkit/chemistryToolkit.js";
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

/** wedges-disagree-with-smiles, for every state. */
export function stereoDrawingFindings(
  reaction: LintedReaction,
  prepared: PreparedReaction,
): LintFinding[] {
  return [...reaction.stateIdToState].flatMap(([stateId, state]) => {
    const graph = graphOf(prepared, stateId);
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
function changedWithoutArrows(from: StateGraph, to: StateGraph, touched: Set<number>): string[] {
  const forward = stereoCarriedOver(from, to, touched);
  const backward = stereoCarriedOver(to, from, touched);
  const changedCentres = new Set([
    ...differingKeys(forward.mapNumberToTetrahedralMark, to.mapNumberToTetrahedralMark),
    ...differingKeys(backward.mapNumberToTetrahedralMark, from.mapNumberToTetrahedralMark),
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
): LintFinding[] {
  return reaction.steps.flatMap((step, stepIndex) => {
    const changed = changedWithoutArrows(
      graphOf(prepared, step.fromStateId),
      graphOf(prepared, step.toStateId),
      touchedAtoms(step),
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

/** Whether RDKit keeps a mark put on `centre` (it drops marks on atoms that are not centres). */
function isStereocentreForRdkit(
  graph: StateGraph,
  centre: number,
  toolkit: Pick<ChemistryToolkit, "canonicalStereoSmiles">,
): boolean {
  const marked: StateGraph = {
    ...graph,
    mapNumberToTetrahedralMark: new Map([
      ...(graph.mapNumberToTetrahedralMark ?? []),
      [centre, "@"],
    ]),
  };
  const canonical = toolkit.canonicalStereoSmiles(mappedSmilesFromStateGraph(marked)) ?? "";
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
