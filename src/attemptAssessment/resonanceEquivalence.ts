/**
 * Compare a learner's result state with a target state, accepting resonance forms (decision Q1).
 *
 * The TypeScript twin of python/attempt_assessment/resonance_equivalence.py, whose docstring
 * states the rule and why no list of resonance forms is needed.
 */
import {
  bondKeyMapNumbers,
  formalCharge,
  type StateGraph,
  stateGraphsEqual,
  unpairedElectronCount,
} from "../stateGraphs/stateGraph.js";

export type StateComparison = "identical" | "resonanceForm" | "minorResonanceForm" | "different";

/** How many atoms have a nonzero formal charge. */
export function chargedAtomCount(graph: StateGraph): number {
  return [...graph.mapNumberToAtom.keys()].filter(
    (mapNumber) => formalCharge(graph, mapNumber) !== 0,
  ).length;
}

/** The map numbers of each molecule (connected fragment). */
function molecules(graph: StateGraph): Set<number>[] {
  const unvisited = new Set(graph.mapNumberToAtom.keys());
  const moleculesFound: Set<number>[] = [];
  for (const startMapNumber of [...unvisited].sort((first, second) => first - second)) {
    if (!unvisited.has(startMapNumber)) {
      continue;
    }
    const molecule = new Set([startMapNumber]);
    const frontier = [startMapNumber];
    for (let current = frontier.pop(); current !== undefined; current = frontier.pop()) {
      for (const key of graph.bondToOrder.keys()) {
        const [firstMapNumber, secondMapNumber] = bondKeyMapNumbers(key);
        const neighbour =
          current === firstMapNumber
            ? secondMapNumber
            : current === secondMapNumber
              ? firstMapNumber
              : undefined;
        if (neighbour !== undefined && !molecule.has(neighbour)) {
          molecule.add(neighbour);
          frontier.push(neighbour);
        }
      }
    }
    molecule.forEach((member) => unvisited.delete(member));
    moleculesFound.push(molecule);
  }
  return moleculesFound;
}

/** Same atoms with the same elements and hydrogen counts, and the same bonded pairs. */
function sameSigmaSkeleton(result: StateGraph, target: StateGraph): boolean {
  if (result.mapNumberToAtom.size !== target.mapNumberToAtom.size) {
    return false;
  }
  for (const [mapNumber, targetAtom] of target.mapNumberToAtom) {
    const resultAtom = result.mapNumberToAtom.get(mapNumber);
    if (
      resultAtom?.element !== targetAtom.element ||
      resultAtom.hydrogenCount !== targetAtom.hydrogenCount
    ) {
      return false;
    }
  }
  return (
    result.bondToOrder.size === target.bondToOrder.size &&
    [...target.bondToOrder.keys()].every((key) => result.bondToOrder.has(key))
  );
}

function unpairedAt(graph: StateGraph, mapNumber: number): number {
  const atom = graph.mapNumberToAtom.get(mapNumber);
  return atom === undefined ? 0 : unpairedElectronCount(atom);
}

function sameChargeAndUnpairedElectronsPerMolecule(
  result: StateGraph,
  target: StateGraph,
): boolean {
  const countFunctions = [formalCharge, unpairedAt];
  return molecules(target).every((molecule) =>
    countFunctions.every((countOf) => {
      const members = [...molecule];
      const resultSum = members.reduce((sum, mapNumber) => sum + countOf(result, mapNumber), 0);
      const targetSum = members.reduce((sum, mapNumber) => sum + countOf(target, mapNumber), 0);
      return resultSum === targetSum;
    }),
  );
}

/** How `result` relates to `target`, with atoms compared by map number (no symmetry). */
export function compareStates(result: StateGraph, target: StateGraph): StateComparison {
  if (stateGraphsEqual(result, target)) {
    return "identical";
  }
  if (
    !sameSigmaSkeleton(result, target) ||
    !sameChargeAndUnpairedElectronsPerMolecule(result, target)
  ) {
    return "different";
  }
  return chargedAtomCount(result) > chargedAtomCount(target)
    ? "minorResonanceForm"
    : "resonanceForm";
}
