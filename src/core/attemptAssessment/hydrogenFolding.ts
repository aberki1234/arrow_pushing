/**
 * Folding drawn hydrogens into implicit counts, for comparing answers where one drawn H makes
 * mirror-image atoms look different (item 10g follow-up), and the hydrogens a stereo mark tells
 * apart, which are never folded (item 12d).
 */
import {
  bondKeyMapNumbers,
  bondedNeighbours,
  type StateAtom,
  type StateGraph,
} from "../stateGraphs/stateGraph.js";
import { IMPLICIT_NEIGHBOUR, renamedStereo } from "../stateGraphs/stereoMarks.js";

/** Each foldable drawn H, with the atom it folds into (see withHydrogensFolded). */
function foldTargets(graph: StateGraph, keptHydrogens: ReadonlySet<number>): Map<number, number> {
  const foldInto = new Map<number, number>();
  for (const [key, order] of graph.bondToOrder) {
    const [first, second] = bondKeyMapNumbers(key);
    const firstAtom = graph.mapNumberToAtom.get(first);
    const secondAtom = graph.mapNumberToAtom.get(second);
    if (order !== 1 || firstAtom === undefined || secondAtom === undefined) {
      continue;
    }
    for (const [hydrogen, other] of [
      [firstAtom, secondAtom],
      [secondAtom, firstAtom],
    ] as const) {
      const isFoldable =
        hydrogen.element === "H" &&
        other.element !== "H" &&
        hydrogen.nonbondingElectronCount === 0 &&
        !keptHydrogens.has(hydrogen.mapNumber);
      if (isFoldable) {
        foldInto.set(hydrogen.mapNumber, other.mapNumber);
      }
    }
  }
  return foldInto;
}

/**
 * The same state with each drawn hydrogen folded into its neighbour's hydrogen count: an H with
 * one single bond to a non-hydrogen atom and no electrons of its own. Hydrogens are drawn only
 * where a step needs them (docs/schema-design.md §2), so one drawn H can make mirror-image atoms
 * look different; compared folded, attack at either is the same compound (item 10g follow-up,
 * 2026-11-26). A bare H⁺, H₂ or a hydride keeps its atom, and so does every H in
 * `keptHydrogens`: those a stereo mark tells apart (stereoDistinguishedHydrogens).
 */
export function withHydrogensFolded(
  graph: StateGraph,
  keptHydrogens: ReadonlySet<number> = new Set(),
): StateGraph {
  const foldInto = foldTargets(graph, keptHydrogens);
  const mapNumberToAtom = new Map<number, StateAtom>();
  for (const [mapNumber, atom] of graph.mapNumberToAtom) {
    if (!foldInto.has(mapNumber)) {
      const folded = [...foldInto.values()].filter((target) => target === mapNumber).length;
      mapNumberToAtom.set(mapNumber, { ...atom, hydrogenCount: atom.hydrogenCount + folded });
    }
  }
  const bondToOrder = new Map(
    [...graph.bondToOrder].filter(([key]) =>
      bondKeyMapNumbers(key).every((mapNumber) => !foldInto.has(mapNumber)),
    ),
  );
  // A folded H becomes its neighbour's implicit H: a centre left with two loses its mark.
  const stereo = renamedStereo(graph, {
    atom: (mapNumber) => mapNumber,
    neighbour: (mapNumber) => (foldInto.has(mapNumber) ? IMPLICIT_NEIGHBOUR : mapNumber),
  });
  return { mapNumberToAtom, bondToOrder, ...stereo };
}

/**
 * The drawn hydrogens bonded to a marked stereocentre (item 12d): the mark tells them apart, so
 * folding them into a count would let either stand for the other.
 */
export function stereoDistinguishedHydrogens(graph: StateGraph): Set<number> {
  const hydrogens = new Set<number>();
  for (const centre of graph.mapNumberToTetrahedralMark?.keys() ?? []) {
    for (const { mapNumber } of bondedNeighbours(graph, centre)) {
      if (graph.mapNumberToAtom.get(mapNumber)?.element === "H") {
        hydrogens.add(mapNumber);
      }
    }
  }
  return hydrogens;
}
