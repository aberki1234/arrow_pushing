/**
 * Comparing an attempt up to the state's skeleton symmetries: its result against a to-state, and
 * its arrows relabelled for the checks that match arrows (misconceptions, partial progress,
 * reversed flow). Used by attemptAssessment.ts.
 *
 * Speed (issue #1)
 *   A large state has hundreds or thousands of symmetries. The result is compared under each one
 *   without building a relabelled state (resonanceEquivalence.ts relabelledComparison), stopping
 *   at the first identical match; the arrows are relabelled once per symmetry and each different
 *   arrow set kept once, since most symmetries move no atom the arrows touch.
 */
import { type CurvedArrow, formatCurvedArrow } from "../arrowNotation/curvedArrowNotation.js";
import type { StateGraph } from "../stateGraphs/stateGraph.js";
import { type StateComparison, relabelledComparison } from "./resonanceEquivalence.js";
import {
  type MapNumberRelabelling,
  mirrorImageOf,
  relabelCurvedArrow,
} from "./skeletonSymmetry.js";
import { withHydrogensFolded } from "./hydrogenFolding.js";

// Comparisons from best to worst: a better one wins when several symmetries give a match.
const COMPARISONS_BEST_FIRST: readonly StateComparison[] = [
  "identical",
  "resonanceForm",
  "minorResonanceForm",
  "different",
];

/**
 * A state's symmetries; its symmetries with drawn hydrogens folded into counts (except
 * `keptHydrogens`, those a stereo mark tells apart); and its mirror symmetries (item 12d).
 */
export interface StateSymmetries {
  readonly symmetries: readonly MapNumberRelabelling[];
  readonly foldedSymmetries: readonly MapNumberRelabelling[];
  readonly mirrorSymmetries: readonly MapNumberRelabelling[];
  readonly keptHydrogens: ReadonlySet<number>;
}

/** The learner's arrows relabelled by one or more symmetries, with how often each occurs. */
export interface RelabelledArrowSet {
  readonly curvedArrows: readonly CurvedArrow[];
  readonly printedToCount: ReadonlyMap<string, number>;
}

/**
 * The result compared with the target under each symmetry, then folded, worked out lazily.
 * Folding and relabelling give the same state in either order (folded hydrogens are outside the
 * folded symmetries), so the result is folded once.
 */
function* comparisonsOverSymmetries(
  stateSymmetries: StateSymmetries,
  result: StateGraph,
  target: StateGraph,
): Generator<StateComparison> {
  const compare = relabelledComparison(result, target);
  for (const symmetry of stateSymmetries.symmetries) {
    yield compare(symmetry);
  }
  const { keptHydrogens } = stateSymmetries;
  const compareFolded = relabelledComparison(
    withHydrogensFolded(result, keptHydrogens),
    withHydrogensFolded(target, keptHydrogens),
  );
  for (const symmetry of stateSymmetries.foldedSymmetries) {
    yield compareFolded(symmetry);
  }
  // From an achiral start, the mirror-image answer gives the mirror-image result (item 12d).
  const compareMirrored = relabelledComparison(mirrorImageOf(result), target);
  for (const symmetry of stateSymmetries.mirrorSymmetries) {
    yield compareMirrored(symmetry);
  }
}

/**
 * The best comparison of the result with a step's to-state over the state's symmetries, and
 * again with drawn hydrogens folded into counts (so a mirror-image attack on a ring where only
 * one H is drawn still matches).
 */
export function bestComparison(
  stateSymmetries: StateSymmetries,
  result: StateGraph,
  target: StateGraph,
): StateComparison {
  let bestRank = COMPARISONS_BEST_FIRST.length - 1;
  for (const comparison of comparisonsOverSymmetries(stateSymmetries, result, target)) {
    bestRank = Math.min(bestRank, COMPARISONS_BEST_FIRST.indexOf(comparison));
    // Nothing beats identical: the remaining symmetries need not be tried.
    if (bestRank === 0) {
      break;
    }
  }
  return COMPARISONS_BEST_FIRST[bestRank] ?? "different";
}

/** How many times each printed arrow occurs. */
export function arrowMultiset(curvedArrows: readonly CurvedArrow[]): Map<string, number> {
  const printedToCount = new Map<string, number>();
  for (const curvedArrow of curvedArrows) {
    const printed = formatCurvedArrow(curvedArrow);
    printedToCount.set(printed, (printedToCount.get(printed) ?? 0) + 1);
  }
  return printedToCount;
}

/**
 * The learner's arrows relabelled by each symmetry, each different result once, in the order of
 * the first symmetry giving it: a check that tries these finds the same first match as one that
 * tries every symmetry.
 */
export function relabelledArrowSets(
  learnerArrows: readonly CurvedArrow[],
  symmetries: readonly MapNumberRelabelling[],
): RelabelledArrowSet[] {
  const printedToSet = new Map<string, RelabelledArrowSet>();
  for (const symmetry of symmetries) {
    const curvedArrows = learnerArrows.map((curvedArrow) =>
      relabelCurvedArrow(curvedArrow, symmetry),
    );
    const printed = curvedArrows.map(formatCurvedArrow).join("; ");
    if (!printedToSet.has(printed)) {
      printedToSet.set(printed, { curvedArrows, printedToCount: arrowMultiset(curvedArrows) });
    }
  }
  return [...printedToSet.values()];
}
