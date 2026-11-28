/**
 * A stereo question's arrangements after Create regenerates the step's product
 * (docs/stereo-question.md §5, "Create regeneration"; caller: stateRegeneration.ts).
 *
 * Rule: an arrangement keeps which question centres it inverts (and which double bonds it flips)
 * relative to the product, so a message about "retention" stays on the retention arrangement.
 * When the question centres change, nothing is rewritten: the lint rules
 * arrangement-not-the-product and arrangement-changes-other-centres tell the author.
 */
import type { ArrowStep, OtherArrangement } from "../reactionFiles/reactionFile.js";
import { stateGraphFromMappedSmiles } from "../stateGraphs/mappedSmilesReading.js";
import { mappedSmilesFromStateGraph } from "../stateGraphs/mappedSmilesWriting.js";
import type { StateGraph } from "../stateGraphs/stateGraph.js";
import { stereoQuestionCentres } from "./stereoQuestions.js";

/** A step's from- and to-state graphs. */
export interface StepStates {
  readonly fromState: StateGraph;
  readonly toState: StateGraph;
}

/** `graph` with `centres` inverted and `doubleBonds` flipped, relative to `product`. */
function invertedFrom(
  product: StateGraph,
  centres: readonly number[],
  doubleBonds: readonly string[],
): StateGraph {
  const marks = new Map(product.mapNumberToTetrahedralMark ?? []);
  for (const centre of centres) {
    marks.set(centre, marks.get(centre) === "@" ? "@@" : "@");
  }
  const relations = new Map(product.bondToDoubleBondRelation ?? []);
  for (const key of doubleBonds) {
    relations.set(key, relations.get(key) === "cis" ? "trans" : "cis");
  }
  return { ...product, mapNumberToTetrahedralMark: marks, bondToDoubleBondRelation: relations };
}

/**
 * The step's arrangements rewritten for a regenerated product (Create, stateRegeneration.ts): each
 * becomes the new product with the same question centres inverted (and double bonds flipped)
 * relative to the product as before. When the question centres change, or an arrangement cannot
 * be read or leaves a centre unset, the arrangements are returned as they were, and the lint tells
 * the author.
 */
export function arrangementsForNewProduct(
  step: ArrowStep,
  before: StepStates,
  after: StepStates,
): readonly OtherArrangement[] {
  const arrangements = step.stereoQuestion?.otherArrangements ?? [];
  const old = stereoQuestionCentres(step, before.fromState, before.toState);
  const current = stereoQuestionCentres(step, after.fromState, after.toState);
  const sameCentres =
    JSON.stringify([old.centres, old.doubleBonds]) ===
    JSON.stringify([current.centres, current.doubleBonds]);
  if (!sameCentres) {
    return arrangements;
  }
  try {
    return arrangements.map((arrangement) => {
      const graph = stateGraphFromMappedSmiles(arrangement.mappedSmiles);
      const oldMarks = before.toState.mapNumberToTetrahedralMark;
      const oldRelations = before.toState.bondToDoubleBondRelation;
      if (
        old.centres.some((centre) => graph.mapNumberToTetrahedralMark?.get(centre) === undefined)
      ) {
        throw new Error("an unset centre");
      }
      const inverted = old.centres.filter(
        (centre) => graph.mapNumberToTetrahedralMark?.get(centre) !== oldMarks?.get(centre),
      );
      const flipped = old.doubleBonds.filter(
        (key) => graph.bondToDoubleBondRelation?.get(key) !== oldRelations?.get(key),
      );
      const rewritten = invertedFrom(after.toState, inverted, flipped);
      return { ...arrangement, mappedSmiles: mappedSmilesFromStateGraph(rewritten) };
    });
  } catch {
    return arrangements;
  }
}
