/**
 * Compare a learner's result state with a target state, accepting resonance forms (decision Q1).
 *
 * Rule (docs/schema-design.md §4, point 4)
 *   Two drawings are resonance forms of each other when everything that π and lone-pair arrows
 *   cannot change is the same: the atoms with their elements and hydrogen counts, which pairs are
 *   σ-bonded, and each molecule's charge and unpaired electrons. Bond orders, lone pairs and the
 *   charges of single atoms may differ. Both drawings already passed the octet check, so the
 *   electrons that differ can only move through conjugated atoms: no list of forms is needed, and
 *   the check is one pass over atoms and bonds.
 *   A form with more charged atoms than the target (e.g. C+ next to O- instead of C=O) is a
 *   minor, charge-separated form: the learner is shown it is not the drawing wanted.
 *
 * Comparisons (StateComparison)
 *   identical           the same drawing
 *   resonanceForm       another resonance form, with no more charged atoms
 *   minorResonanceForm  a resonance form with more charged atoms than the target
 *   different           not a resonance form of the target
 *
 * Stereo (item 12c, docs/stereo-validation.md phase 1)
 *   Every stereocentre mark the result has must be the target's (after relabelling), and so must
 *   every cis/trans relation, where the target's bond has one (a resonance form moves π bonds).
 *   A mark the result lacks belongs to a centre the step made or changed: the target decides it.
 *   Otherwise the result is a different stereoisomer: "different".
 */
import {
  bondOrderBetween,
  bondedNeighbours,
  formalCharge,
  type StateGraph,
  unpairedElectronCount,
} from "../stateGraphs/stateGraph.js";
import { renamedStereo } from "../stateGraphs/stereoMarks.js";
import { type MapNumberRelabelling, relabelledSkeletonMatches } from "./skeletonSymmetry.js";

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
      for (const { mapNumber: neighbour } of bondedNeighbours(graph, current)) {
        if (!molecule.has(neighbour)) {
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

function unpairedAt(graph: StateGraph, mapNumber: number): number {
  const atom = graph.mapNumberToAtom.get(mapNumber);
  return atom === undefined ? 0 : unpairedElectronCount(atom);
}

/** How `result` relates to `target`, with atoms compared by map number (no symmetry). */
export function compareStates(result: StateGraph, target: StateGraph): StateComparison {
  return relabelledComparison(result, target)(new Map());
}

/** Charge and unpaired electrons, the two counts a molecule keeps through resonance. */
interface ElectronCounts {
  readonly charge: number;
  readonly unpaired: number;
}

function countsAt(graph: StateGraph, mapNumber: number): ElectronCounts {
  return { charge: formalCharge(graph, mapNumber), unpaired: unpairedAt(graph, mapNumber) };
}

function hasStereoMarks(graph: StateGraph): boolean {
  return (
    (graph.mapNumberToTetrahedralMark?.size ?? 0) > 0 ||
    (graph.bondToDoubleBondRelation?.size ?? 0) > 0
  );
}

/**
 * Whether the result's stereo, relabelled, agrees with the target's (see the module comment).
 * With `allRelations`, every relation must be in the target (the same drawing); otherwise only
 * those on bonds where the target has one (a resonance form).
 */
function stereoAgreesUnder(
  result: StateGraph,
  relabelling: MapNumberRelabelling,
  target: StateGraph,
  allRelations: boolean,
): boolean {
  const rename = (mapNumber: number): number => relabelling.get(mapNumber) ?? mapNumber;
  const stereo = renamedStereo(result, { atom: rename, neighbour: rename });
  const targetMarks = target.mapNumberToTetrahedralMark;
  const targetRelations = target.bondToDoubleBondRelation;
  return (
    [...stereo.mapNumberToTetrahedralMark].every(
      ([centre, mark]) => targetMarks?.get(centre) === mark,
    ) &&
    [...stereo.bondToDoubleBondRelation].every(([key, relation]) => {
      const targetRelation = targetRelations?.get(key);
      return targetRelation === undefined ? !allRelations : targetRelation === relation;
    })
  );
}

/** Same lone-pair electrons on each atom and same bond orders, once the σ skeletons match. */
function sameElectronsUnder(
  result: StateGraph,
  relabelling: MapNumberRelabelling,
  target: StateGraph,
): boolean {
  const imageOf = (mapNumber: number): number => relabelling.get(mapNumber) ?? mapNumber;
  return [...result.mapNumberToAtom].every(
    ([mapNumber, atom]) =>
      target.mapNumberToAtom.get(imageOf(mapNumber))?.nonbondingElectronCount ===
        atom.nonbondingElectronCount &&
      bondedNeighbours(result, mapNumber).every(
        (neighbour) =>
          bondOrderBetween(target, imageOf(mapNumber), imageOf(neighbour.mapNumber)) ===
          neighbour.bondOrder,
      ),
  );
}

/**
 * compareStates(relabelStateGraph(result, relabelling), target) for many relabellings, without
 * building each relabelled state (issue #1). What does not depend on the relabelling is worked
 * out once: the target's molecules and their counts, each result atom's counts, and both charged
 * atom counts (a relabelling only renumbers atoms). Each relabelling must renumber the result's
 * atoms one to one, as a skeleton symmetry of the state it came from does. Stereo is compared
 * only once the rest matches (see the module comment).
 */
export function relabelledComparison(
  result: StateGraph,
  target: StateGraph,
): (relabelling: MapNumberRelabelling) => StateComparison {
  const targetMolecules = molecules(target);
  const mapNumberToMolecule = new Map<number, number>();
  targetMolecules.forEach((molecule, index) => {
    molecule.forEach((mapNumber) => mapNumberToMolecule.set(mapNumber, index));
  });
  const targetCounts = targetMolecules.map((molecule) => {
    const members = [...molecule].map((mapNumber) => countsAt(target, mapNumber));
    return {
      charge: members.reduce((sum, counts) => sum + counts.charge, 0),
      unpaired: members.reduce((sum, counts) => sum + counts.unpaired, 0),
    };
  });
  const resultCounts = [...result.mapNumberToAtom.keys()].map(
    (mapNumber) => [mapNumber, countsAt(result, mapNumber)] as const,
  );
  const formOtherwise: StateComparison =
    chargedAtomCount(result) > chargedAtomCount(target) ? "minorResonanceForm" : "resonanceForm";
  const resultHasStereo = hasStereoMarks(result);
  const stereoAgrees = (relabelling: MapNumberRelabelling, allRelations: boolean): boolean =>
    !resultHasStereo || stereoAgreesUnder(result, relabelling, target, allRelations);
  const sameCountsPerMolecule = (relabelling: MapNumberRelabelling): boolean => {
    const sums = targetCounts.map(() => ({ charge: 0, unpaired: 0 }));
    for (const [mapNumber, counts] of resultCounts) {
      const sum = sums[mapNumberToMolecule.get(relabelling.get(mapNumber) ?? mapNumber) ?? -1];
      if (sum !== undefined) {
        sum.charge += counts.charge;
        sum.unpaired += counts.unpaired;
      }
    }
    return sums.every(
      (sum, index) =>
        sum.charge === targetCounts[index]?.charge && sum.unpaired === targetCounts[index].unpaired,
    );
  };
  return (relabelling) => {
    if (!relabelledSkeletonMatches(result, relabelling, target)) {
      return "different";
    }
    if (sameElectronsUnder(result, relabelling, target)) {
      return stereoAgrees(relabelling, true) ? "identical" : "different";
    }
    return sameCountsPerMolecule(relabelling) && stereoAgrees(relabelling, false)
      ? formOtherwise
      : "different";
  };
}
