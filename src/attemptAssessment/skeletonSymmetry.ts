/**
 * Skeleton symmetries of a state, and relabelling a state or an arrow by one of them.
 *
 * The TypeScript twin of python/attempt_assessment/skeleton_symmetry.py, whose docstring defines
 * the sigma skeleton and the search. A symmetry maps old map number -> new map number; the
 * identity comes first; above MAXIMUM_SKELETON_SYMMETRIES only the identity is returned.
 */
import type {
  AtomLabel,
  BondLocus,
  CurvedArrow,
  ElectronLocus,
} from "../arrowNotation/curvedArrowNotation.js";
import {
  bondKey,
  bondKeyMapNumbers,
  type StateAtom,
  type StateGraph,
} from "../stateGraphs/stateGraph.js";

/** A safety cap, not a chemistry number: above it, answers are compared without symmetry. */
export const MAXIMUM_SKELETON_SYMMETRIES = 10_000;

export type MapNumberRelabelling = ReadonlyMap<number, number>;

/** What the backtracking search shares while it places atoms one by one. */
interface SymmetrySearch {
  readonly mapNumbers: readonly number[];
  readonly mapNumberToNeighbours: ReadonlyMap<number, ReadonlySet<number>>;
  /** Element, hydrogen count and number of bonds: a symmetry keeps all three. */
  readonly mapNumberToSignature: ReadonlyMap<number, string>;
  readonly maximumSymmetries: number;
  readonly symmetriesFound: Map<number, number>[];
}

function neighboursOf(search: SymmetrySearch, mapNumber: number): ReadonlySet<number> {
  return search.mapNumberToNeighbours.get(mapNumber) ?? new Set();
}

/** Mapping `atom` onto `candidate` keeps every bond (and non-bond) to the atoms placed so far. */
function keepsBonds(
  search: SymmetrySearch,
  atom: number,
  candidate: number,
  placed: ReadonlyMap<number, number>,
): boolean {
  const atomNeighbours = neighboursOf(search, atom);
  const candidateNeighbours = neighboursOf(search, candidate);
  return [...placed].every(
    ([placedAtom, image]) => atomNeighbours.has(placedAtom) === candidateNeighbours.has(image),
  );
}

function canPlace(
  search: SymmetrySearch,
  atom: number,
  candidate: number,
  placed: ReadonlyMap<number, number>,
  usedImages: ReadonlySet<number>,
): boolean {
  return (
    !usedImages.has(candidate) &&
    search.mapNumberToSignature.get(candidate) === search.mapNumberToSignature.get(atom) &&
    keepsBonds(search, atom, candidate, placed)
  );
}

/** Place the next atom in every possible way. Returns false once the cap is passed. */
function extend(
  search: SymmetrySearch,
  placed: Map<number, number>,
  usedImages: Set<number>,
): boolean {
  const atom = search.mapNumbers[placed.size];
  if (atom === undefined) {
    search.symmetriesFound.push(new Map(placed));
    return search.symmetriesFound.length <= search.maximumSymmetries;
  }
  // Trying the atom itself first makes the identity the first symmetry found.
  const candidates = [atom, ...search.mapNumbers.filter((other) => other !== atom)];
  for (const candidate of candidates) {
    if (!canPlace(search, atom, candidate, placed, usedImages)) {
      continue;
    }
    placed.set(atom, candidate);
    usedImages.add(candidate);
    const withinCap = extend(search, placed, usedImages);
    placed.delete(atom);
    usedImages.delete(candidate);
    if (!withinCap) {
      return false;
    }
  }
  return true;
}

/** Element, hydrogen count and number of bonds, e.g. "C/2/2": a symmetry keeps all three. */
function atomSignature(atom: StateAtom, bondCount: number): string {
  return `${atom.element}/${String(atom.hydrogenCount)}/${String(bondCount)}`;
}

/** Every skeleton symmetry of `graph`, the identity first; only the identity above the cap. */
export function skeletonSymmetries(
  graph: StateGraph,
  maximumSymmetries: number = MAXIMUM_SKELETON_SYMMETRIES,
): MapNumberRelabelling[] {
  const mapNumbers = [...graph.mapNumberToAtom.keys()].sort((first, second) => first - second);
  const mapNumberToNeighbours = new Map(
    mapNumbers.map((mapNumber) => [mapNumber, new Set<number>()]),
  );
  for (const key of graph.bondToOrder.keys()) {
    const [firstMapNumber, secondMapNumber] = bondKeyMapNumbers(key);
    mapNumberToNeighbours.get(firstMapNumber)?.add(secondMapNumber);
    mapNumberToNeighbours.get(secondMapNumber)?.add(firstMapNumber);
  }
  const mapNumberToSignature = new Map(
    [...graph.mapNumberToAtom].map(([mapNumber, atom]) => [
      mapNumber,
      atomSignature(atom, mapNumberToNeighbours.get(mapNumber)?.size ?? 0),
    ]),
  );
  const search: SymmetrySearch = {
    mapNumbers,
    mapNumberToNeighbours,
    mapNumberToSignature,
    maximumSymmetries,
    symmetriesFound: [],
  };
  const withinCap = extend(search, new Map(), new Set());
  const identity = new Map(mapNumbers.map((mapNumber) => [mapNumber, mapNumber]));
  return withinCap ? search.symmetriesFound : [identity];
}

function relabelled(mapNumber: number, relabelling: MapNumberRelabelling): number {
  return relabelling.get(mapNumber) ?? mapNumber;
}

/** The same state with every atom renumbered; electrons and bond orders move with the atoms. */
export function relabelStateGraph(
  graph: StateGraph,
  relabelling: MapNumberRelabelling,
): StateGraph {
  const mapNumberToAtom = new Map<number, StateAtom>();
  for (const [mapNumber, atom] of graph.mapNumberToAtom) {
    const newMapNumber = relabelled(mapNumber, relabelling);
    mapNumberToAtom.set(newMapNumber, { ...atom, mapNumber: newMapNumber });
  }
  const bondToOrder = new Map<string, number>();
  for (const [key, order] of graph.bondToOrder) {
    const [firstMapNumber, secondMapNumber] = bondKeyMapNumbers(key);
    bondToOrder.set(
      bondKey(relabelled(firstMapNumber, relabelling), relabelled(secondMapNumber, relabelling)),
      order,
    );
  }
  return { mapNumberToAtom, bondToOrder };
}

function relabelAtom(atom: AtomLabel, relabelling: MapNumberRelabelling): AtomLabel {
  return { element: atom.element, mapNumber: relabelled(atom.mapNumber, relabelling) };
}

function isBondLocus(locus: ElectronLocus): locus is BondLocus {
  return locus.locusKind === "sigmaBond" || locus.locusKind === "piBond";
}

/** Atoms not in the relabelling keep their map numbers; bond atoms are re-sorted. */
function relabelLocus(locus: ElectronLocus, relabelling: MapNumberRelabelling): ElectronLocus {
  if (!isBondLocus(locus)) {
    return { locusKind: locus.locusKind, atoms: [relabelAtom(locus.atoms[0], relabelling)] };
  }
  const firstAtom = relabelAtom(locus.atoms[0], relabelling);
  const secondAtom = relabelAtom(locus.atoms[1], relabelling);
  const atomsInOrder: readonly [AtomLabel, AtomLabel] =
    firstAtom.mapNumber < secondAtom.mapNumber ? [firstAtom, secondAtom] : [secondAtom, firstAtom];
  return { locusKind: locus.locusKind, atoms: atomsInOrder };
}

/** The same arrow with its atoms renumbered (bond atoms re-sorted by map number). */
export function relabelCurvedArrow(
  curvedArrow: CurvedArrow,
  relabelling: MapNumberRelabelling,
): CurvedArrow {
  return {
    source: relabelLocus(curvedArrow.source, relabelling),
    destination: relabelLocus(curvedArrow.destination, relabelling),
    electronsMoved: curvedArrow.electronsMoved,
  };
}
