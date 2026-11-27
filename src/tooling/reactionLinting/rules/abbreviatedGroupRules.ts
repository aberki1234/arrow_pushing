/**
 * Lint rules for abbreviated groups: bystander groups drawn as a short label such as "Ph"
 * (docs/schema-design.md §3.1, `abbreviatedGroups`; decided 2026-11-25).
 *
 * Terms
 *   abbreviated group  Atoms (`mapNumbers`) drawn as one label (`groupLabel`) wherever they hang
 *                      off the rest of a molecule by exactly one bond, which leaves the group from
 *                      `attachmentMapNumber`. The learner cannot tap anything in it, so no step may
 *                      need its atoms; validation still uses every atom.
 *
 * Rules
 *   abbreviated-group-atoms-unknown      (error) a map number of the group is in no state
 *   abbreviated-group-not-attached-once  (error) in a state holding all its atoms, the group is
 *                                        not one connected piece joined to the rest by exactly
 *                                        one bond from its attachment atom
 *   arrow-touches-abbreviated-group      (error) a canonical arrow or partial arrow set uses an
 *                                        atom of the group (the attachment bond included)
 *   misconception-in-abbreviated-group   (warning) a misconception pattern names an atom of the
 *                                        group: the learner cannot draw it, so it never fires
 */
import { parseCurvedArrow } from "../../../core/arrowNotation/curvedArrowNotation.js";
import {
  ArrowPatternError,
  parseArrowPattern,
} from "../../../core/attemptAssessment/arrowPatterns.js";
import { stateGraphFromMappedSmiles } from "../../../core/stateGraphs/mappedSmilesReading.js";
import { bondKeyMapNumbers, type StateGraph } from "../../../core/stateGraphs/stateGraph.js";
import type {
  LintedAbbreviatedGroup,
  LintedReaction,
  LintedStep,
} from "../findings/lintedReaction.js";
import {
  type LintFinding,
  lintError,
  lintWarning,
  type PathPart,
} from "../findings/lintFindings.js";

const byNumber = (first: number, second: number): number => first - second;

function bondsOf(graph: StateGraph): [number, number][] {
  return [...graph.bondToOrder.keys()].map(bondKeyMapNumbers);
}

/** The group atoms reached from the attachment atom through bonds inside the group. */
function reachedFromAttachment(
  graph: StateGraph,
  groupAtoms: ReadonlySet<number>,
  attachmentMapNumber: number,
): Set<number> {
  const reached = new Set([attachmentMapNumber]);
  const toVisit = [attachmentMapNumber];
  for (let current = toVisit.pop(); current !== undefined; current = toVisit.pop()) {
    for (const [first, second] of bondsOf(graph)) {
      const neighbour = first === current ? second : second === current ? first : undefined;
      if (neighbour !== undefined && groupAtoms.has(neighbour) && !reached.has(neighbour)) {
        reached.add(neighbour);
        toVisit.push(neighbour);
      }
    }
  }
  return reached;
}

/** Why the group is not one piece joined by one bond from its attachment atom; "" if it is. */
function groupAttachmentProblem(
  graph: StateGraph,
  groupAtoms: ReadonlySet<number>,
  attachmentMapNumber: number,
): string {
  const leavingBonds = bondsOf(graph).filter(
    ([first, second]) => groupAtoms.has(first) !== groupAtoms.has(second),
  );
  const [leavingBond] = leavingBonds;
  if (leavingBonds.length !== 1 || leavingBond === undefined) {
    return `it is joined to the rest by ${String(leavingBonds.length)} bonds, not 1`;
  }
  if (!leavingBond.includes(attachmentMapNumber)) {
    return (
      `the bond joining it is ${String(leavingBond[0])}-${String(leavingBond[1])}, which does ` +
      `not start at attachment atom ${String(attachmentMapNumber)}`
    );
  }
  const reached = reachedFromAttachment(graph, groupAtoms, attachmentMapNumber);
  return reached.size === groupAtoms.size ? "" : "its atoms are not one connected piece";
}

function groupStructureFinding(
  group: LintedAbbreviatedGroup,
  path: readonly PathPart[],
  stateIdToGraph: ReadonlyMap<string, StateGraph>,
  knownAtoms: ReadonlySet<number>,
): LintFinding | undefined {
  const groupAtoms = new Set(group.mapNumbers);
  const unknown = [...groupAtoms].filter((mapNumber) => !knownAtoms.has(mapNumber)).sort(byNumber);
  if (unknown.length > 0) {
    return lintError(
      "abbreviated-group-atoms-unknown",
      path,
      `no state has map numbers [${unknown.join(", ")}]`,
    );
  }
  if (!groupAtoms.has(group.attachmentMapNumber)) {
    return lintError(
      "abbreviated-group-not-attached-once",
      path,
      `attachment atom ${String(group.attachmentMapNumber)} is not one of the group's atoms`,
    );
  }
  for (const [stateId, graph] of stateIdToGraph) {
    if (![...groupAtoms].every((mapNumber) => graph.mapNumberToAtom.has(mapNumber))) {
      continue;
    }
    const problem = groupAttachmentProblem(graph, groupAtoms, group.attachmentMapNumber);
    if (problem !== "") {
      return lintError(
        "abbreviated-group-not-attached-once",
        path,
        `in state ${stateId}, ${problem}`,
      );
    }
  }
  return undefined;
}

/** abbreviated-group-atoms-unknown and abbreviated-group-not-attached-once. */
export function abbreviatedGroupStructureFindings(reaction: LintedReaction): LintFinding[] {
  const stateIdToGraph = new Map(
    [...reaction.stateIdToState].map(([stateId, state]) => [
      stateId,
      stateGraphFromMappedSmiles(state.mappedSmiles),
    ]),
  );
  const knownAtoms = new Set(
    [...stateIdToGraph.values()].flatMap((graph) => [...graph.mapNumberToAtom.keys()]),
  );
  return reaction.abbreviatedGroups.flatMap((group, position) => {
    const finding = groupStructureFinding(
      group,
      ["abbreviatedGroups", position],
      stateIdToGraph,
      knownAtoms,
    );
    return finding === undefined ? [] : [finding];
  });
}

function arrowAtoms(notations: readonly string[]): Set<number> {
  return new Set(
    notations
      .map(parseCurvedArrow)
      .flatMap((curvedArrow) => [...curvedArrow.source.atoms, ...curvedArrow.destination.atoms])
      .map((atom) => atom.mapNumber),
  );
}

/** (path tail, arrow notations) for the step's canonical arrows and each partial arrow set. */
function arrowSetsOfStep(step: LintedStep): [PathPart[], readonly string[]][] {
  return [
    [["canonicalArrows"], step.canonicalArrows],
    ...step.partialArrowSets.map((arrowSet, position): [PathPart[], readonly string[]] => [
      ["partialArrowSets", position],
      arrowSet,
    ]),
  ];
}

function patternMapNumbers(reaction: LintedReaction, patternText: string): Set<number> {
  try {
    const arrowPattern = parseArrowPattern(patternText, reaction.atomRoleToMapNumbers);
    return new Set(
      arrowPattern.singleArrowPatterns
        .flatMap((single) => [...single.source.atomSelectors, ...single.destination.atomSelectors])
        .flatMap((selector) => [...(selector.mapNumbers ?? [])]),
    );
  } catch (error) {
    if (error instanceof ArrowPatternError) {
      return new Set(); // reported by misconception-pattern-invalid
    }
    throw error;
  }
}

function misconceptionFindings(
  reaction: LintedReaction,
  groupAtoms: ReadonlySet<number>,
): LintFinding[] {
  return [...reaction.stateIdToState].flatMap(([stateId, state]) =>
    state.misconceptions.flatMap((misconception, position) => {
      const named = [...patternMapNumbers(reaction, misconception.arrowPattern)]
        .filter((mapNumber) => groupAtoms.has(mapNumber))
        .sort(byNumber);
      return named.length === 0
        ? []
        : [
            lintWarning(
              "misconception-in-abbreviated-group",
              ["stateIdToState", stateId, "misconceptions", position],
              `the pattern names abbreviated atoms [${named.join(", ")}]; the learner cannot ` +
                "draw it",
            ),
          ];
    }),
  );
}

/** arrow-touches-abbreviated-group and misconception-in-abbreviated-group. */
export function abbreviatedGroupArrowFindings(reaction: LintedReaction): LintFinding[] {
  const groupAtoms = new Set(reaction.abbreviatedGroups.flatMap((group) => group.mapNumbers));
  if (groupAtoms.size === 0) {
    return [];
  }
  const arrowFindings = reaction.steps.flatMap((step, stepPosition) =>
    arrowSetsOfStep(step).flatMap(([pathTail, notations]) => {
      const touched = [...arrowAtoms(notations)]
        .filter((mapNumber) => groupAtoms.has(mapNumber))
        .sort(byNumber);
      return touched.length === 0
        ? []
        : [
            lintError(
              "arrow-touches-abbreviated-group",
              ["steps", stepPosition, ...pathTail],
              `these arrows use abbreviated atoms [${touched.join(", ")}], which the learner ` +
                "cannot tap",
            ),
          ];
    }),
  );
  return [...arrowFindings, ...misconceptionFindings(reaction, groupAtoms)];
}
