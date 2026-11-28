/**
 * Skeleton symmetries of a state, and relabelling a state or an arrow by one of them.
 *
 * Purpose
 *   Equivalent atoms must not need listing in content: either hydrogen of water, any of three
 *   alpha hydrogens, either carboxylate oxygen. A skeleton symmetry is a reordering of a state's
 *   atoms that maps its sigma skeleton onto itself; relabelling a learner's result (or arrows) by
 *   each symmetry and comparing again accepts every equivalent answer.
 *
 * Terms (docs/schema-design.md §0)
 *   sigma skeleton     atoms, each with its element and implicit hydrogen count, and which pairs
 *                      are bonded (bond orders, charges and lone pairs ignored, so atoms that
 *                      differ only by resonance count as equivalent)
 *   skeleton symmetry  a mapping old map number -> new map number that keeps every atom's element
 *                      and hydrogen count and maps bonded pairs to bonded pairs (an automorphism)
 *
 * Steps
 *   1. skeletonSymmetriesWithinCap() lists them by backtracking over atoms breadth first through
 *      each molecule, trying for each atom the unused atoms with the same element, hydrogen count
 *      and number of bonds next to its placed neighbour's image, and keeping bonds to atoms
 *      already placed. The list is sorted so the identity comes first.
 *   2. relabelStateGraph() and relabelCurvedArrow() apply one symmetry.
 *   Stereo (item 12d, docs/stereo-validation.md phase 2): a symmetry must also keep every stereo
 *   mark, so diastereotopic atoms (the two drawn H of a marked CH2) are not swapped. A reordering
 *   that inverts every stereocentre instead is a mirror symmetry (mirrorSymmetries()): the state
 *   is achiral, and an answer at the mirror-image atom gives the mirror-image result.
 * Molecules here are small (the Wittig reactants have 96 symmetries). Above
 * MAXIMUM_SKELETON_SYMMETRIES, a safety cap rather than a chemistry number, skeletonSymmetries()
 * returns only the identity, so answers are then compared without symmetry (the linter warns).
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
  bondedNeighbours,
  bondOrderBetween,
  type StateAtom,
  type StateGraph,
} from "../stateGraphs/stateGraph.js";
import { renamedStereo } from "../stateGraphs/stereoMarks.js";

/** A safety cap, not a chemistry number: above it, answers are compared without symmetry. */
export const MAXIMUM_SKELETON_SYMMETRIES = 10_000;

export type MapNumberRelabelling = ReadonlyMap<number, number>;

/** What the backtracking search shares while it places atoms one by one. */
interface SymmetrySearch {
  /**
   * Atoms in the order they are placed: breadth first through each molecule, so every atom after
   * a molecule's first has a neighbour placed before it (placing in map-number order left most
   * atoms with nothing placed to check them against: issue #1).
   */
  readonly placingOrder: readonly number[];
  readonly mapNumbersAscending: readonly number[];
  readonly mapNumberToNeighbours: ReadonlyMap<number, readonly number[]>;
  readonly mapNumberToNeighbourSet: ReadonlyMap<number, ReadonlySet<number>>;
  /** Element, hydrogen count and number of bonds: a symmetry keeps all three. */
  readonly mapNumberToSignature: ReadonlyMap<number, string>;
  readonly signatureToMapNumbers: ReadonlyMap<string, readonly number[]>;
  readonly maximumSymmetries: number;
  readonly symmetriesFound: Map<number, number>[];
}

const NO_ATOMS: readonly number[] = [];
const NO_NEIGHBOURS: ReadonlySet<number> = new Set();

function neighboursOf(search: SymmetrySearch, mapNumber: number): readonly number[] {
  return search.mapNumberToNeighbours.get(mapNumber) ?? NO_ATOMS;
}

/**
 * Mapping `atom` onto `candidate` keeps every bond (and non-bond) to the atoms placed so far:
 * each placed neighbour of `atom` lands on a neighbour of `candidate`, and `candidate` has no
 * other placed images around it.
 */
function keepsBonds(
  search: SymmetrySearch,
  [atom, candidate]: readonly [number, number],
  placed: ReadonlyMap<number, number>,
  usedImages: ReadonlySet<number>,
): boolean {
  const candidateNeighbours = search.mapNumberToNeighbourSet.get(candidate) ?? NO_NEIGHBOURS;
  let placedNeighbourCount = 0;
  for (const neighbour of neighboursOf(search, atom)) {
    const image = placed.get(neighbour);
    if (image !== undefined) {
      placedNeighbourCount += 1;
      if (!candidateNeighbours.has(image)) {
        return false;
      }
    }
  }
  const imagesAround = neighboursOf(search, candidate).filter((next) => usedImages.has(next));
  return imagesAround.length === placedNeighbourCount;
}

/** The atoms `atom` could map onto: next to a placed neighbour's image, else any alike atom. */
function candidatesFor(
  search: SymmetrySearch,
  atom: number,
  placed: ReadonlyMap<number, number>,
): readonly number[] {
  const signature = search.mapNumberToSignature.get(atom) ?? "";
  const placedNeighbour = neighboursOf(search, atom).find((neighbour) => placed.has(neighbour));
  const image = placedNeighbour === undefined ? undefined : placed.get(placedNeighbour);
  if (image === undefined) {
    return search.signatureToMapNumbers.get(signature) ?? NO_ATOMS;
  }
  return neighboursOf(search, image).filter(
    (next) => search.mapNumberToSignature.get(next) === signature,
  );
}

/** The symmetry `placed` describes, keyed in map-number order. */
function foundSymmetry(
  search: SymmetrySearch,
  placed: ReadonlyMap<number, number>,
): Map<number, number> {
  const symmetry = new Map<number, number>();
  for (const mapNumber of search.mapNumbersAscending) {
    symmetry.set(mapNumber, placed.get(mapNumber) ?? mapNumber);
  }
  return symmetry;
}

/** Place the next atom in every possible way. Returns false once the cap is passed. */
function extend(
  search: SymmetrySearch,
  placed: Map<number, number>,
  usedImages: Set<number>,
): boolean {
  const atom = search.placingOrder[placed.size];
  if (atom === undefined) {
    search.symmetriesFound.push(foundSymmetry(search, placed));
    return search.symmetriesFound.length <= search.maximumSymmetries;
  }
  for (const candidate of candidatesFor(search, atom, placed)) {
    if (usedImages.has(candidate) || !keepsBonds(search, [atom, candidate], placed, usedImages)) {
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

/** Breadth first through each molecule, molecules by their lowest map number. */
function breadthFirstOrder(
  mapNumbersAscending: readonly number[],
  mapNumberToNeighbours: ReadonlyMap<number, readonly number[]>,
): number[] {
  const order: number[] = [];
  const reached = new Set<number>();
  for (const start of mapNumbersAscending) {
    if (reached.has(start)) {
      continue;
    }
    reached.add(start);
    order.push(start);
    for (let position = order.length - 1; position < order.length; position++) {
      for (const next of mapNumberToNeighbours.get(order[position] ?? start) ?? NO_ATOMS) {
        if (!reached.has(next)) {
          reached.add(next);
          order.push(next);
        }
      }
    }
  }
  return order;
}

/**
 * The order the search listed symmetries in when it placed atoms in map-number order, kept so
 * every caller sees the same list: atom by atom in map-number order, an atom mapped onto itself
 * first, then by the image's map number. The identity comes first.
 */
function compareSymmetries(
  mapNumbersAscending: readonly number[],
  first: MapNumberRelabelling,
  second: MapNumberRelabelling,
): number {
  const rank = (mapNumber: number, image: number | undefined): number =>
    image === mapNumber ? Number.NEGATIVE_INFINITY : (image ?? 0);
  for (const mapNumber of mapNumbersAscending) {
    const firstRank = rank(mapNumber, first.get(mapNumber));
    const secondRank = rank(mapNumber, second.get(mapNumber));
    if (firstRank !== secondRank) {
      return firstRank < secondRank ? -1 : 1;
    }
  }
  return 0;
}

/** Each signature's atoms, in map-number order. */
function atomsBySignature(
  mapNumbersAscending: readonly number[],
  mapNumberToSignature: ReadonlyMap<number, string>,
): Map<string, number[]> {
  const signatureToMapNumbers = new Map<string, number[]>();
  for (const mapNumber of mapNumbersAscending) {
    const signature = mapNumberToSignature.get(mapNumber) ?? "";
    signatureToMapNumbers.set(signature, [
      ...(signatureToMapNumbers.get(signature) ?? []),
      mapNumber,
    ]);
  }
  return signatureToMapNumbers;
}

function symmetrySearchOf(graph: StateGraph, maximumSymmetries: number): SymmetrySearch {
  const mapNumbersAscending = [...graph.mapNumberToAtom.keys()].sort(
    (first, second) => first - second,
  );
  const mapNumberToNeighbours = new Map(
    mapNumbersAscending.map((mapNumber) => [
      mapNumber,
      bondedNeighbours(graph, mapNumber)
        .map((neighbour) => neighbour.mapNumber)
        .sort((first, second) => first - second),
    ]),
  );
  const mapNumberToSignature = new Map(
    [...graph.mapNumberToAtom].map(([mapNumber, atom]) => [
      mapNumber,
      atomSignature(atom, mapNumberToNeighbours.get(mapNumber)?.length ?? 0),
    ]),
  );
  return {
    placingOrder: breadthFirstOrder(mapNumbersAscending, mapNumberToNeighbours),
    mapNumbersAscending,
    mapNumberToNeighbours,
    mapNumberToNeighbourSet: new Map(
      [...mapNumberToNeighbours].map(([mapNumber, neighbours]) => [mapNumber, new Set(neighbours)]),
    ),
    mapNumberToSignature,
    signatureToMapNumbers: atomsBySignature(mapNumbersAscending, mapNumberToSignature),
    maximumSymmetries,
    symmetriesFound: [],
  };
}

/**
 * Every skeleton symmetry of `graph`, the identity first; undefined when there are more than
 * `maximumSymmetries` (the linter warns about such states).
 */
/** Every reordering that keeps the σ skeleton, stereo ignored; undefined above the cap. */
function skeletonReorderings(
  graph: StateGraph,
  maximumSymmetries: number,
): MapNumberRelabelling[] | undefined {
  const search = symmetrySearchOf(graph, maximumSymmetries);
  if (!extend(search, new Map(), new Set())) {
    return undefined;
  }
  return search.symmetriesFound.sort((first, second) =>
    compareSymmetries(search.mapNumbersAscending, first, second),
  );
}

function hasTetrahedralMarks(graph: StateGraph): boolean {
  return (graph.mapNumberToTetrahedralMark?.size ?? 0) > 0;
}

/** Whether `relabelling` turns the state's stereo into itself, or with `inverted` its mirror. */
function stereoAfterIs(
  graph: StateGraph,
  relabelling: MapNumberRelabelling,
  inverted: boolean,
): boolean {
  const rename = (mapNumber: number): number => relabelled(mapNumber, relabelling);
  const stereo = renamedStereo(graph, { atom: rename, neighbour: rename });
  const marks = graph.mapNumberToTetrahedralMark ?? new Map<number, string>();
  const relations = graph.bondToDoubleBondRelation ?? new Map<string, string>();
  const expectedMark = (mark: string): string => (!inverted ? mark : mark === "@" ? "@@" : "@");
  return (
    stereo.mapNumberToTetrahedralMark.size === marks.size &&
    [...stereo.mapNumberToTetrahedralMark].every(
      ([centre, mark]) => marks.get(centre) === expectedMark(mark),
    ) &&
    stereo.bondToDoubleBondRelation.size === relations.size &&
    [...stereo.bondToDoubleBondRelation].every(([key, relation]) => relations.get(key) === relation)
  );
}

/**
 * Every skeleton symmetry of `graph` that keeps its stereo, the identity first; undefined when
 * the σ skeleton has more than `maximumSymmetries` (the linter warns about such states).
 */
export function skeletonSymmetriesWithinCap(
  graph: StateGraph,
  maximumSymmetries: number = MAXIMUM_SKELETON_SYMMETRIES,
): MapNumberRelabelling[] | undefined {
  return skeletonReorderings(graph, maximumSymmetries)?.filter((relabelling) =>
    stereoAfterIs(graph, relabelling, false),
  );
}

/**
 * The reorderings of an achiral state that invert every stereocentre (see the module comment);
 * empty for a state with no stereocentre marks, or above the cap.
 */
export function mirrorSymmetries(
  graph: StateGraph,
  maximumSymmetries: number = MAXIMUM_SKELETON_SYMMETRIES,
): MapNumberRelabelling[] {
  if (!hasTetrahedralMarks(graph)) {
    return [];
  }
  return (skeletonReorderings(graph, maximumSymmetries) ?? []).filter((relabelling) =>
    stereoAfterIs(graph, relabelling, true),
  );
}

/** The mirror image of a state: every stereocentre inverted (cis and trans stay). */
export function mirrorImageOf(graph: StateGraph): StateGraph {
  return {
    ...graph,
    mapNumberToTetrahedralMark: new Map(
      [...(graph.mapNumberToTetrahedralMark ?? [])].map(([centre, mark]) => [
        centre,
        mark === "@" ? "@@" : "@",
      ]),
    ),
  };
}

/** Every skeleton symmetry of `graph`, the identity first; only the identity above the cap. */
export function skeletonSymmetries(
  graph: StateGraph,
  maximumSymmetries: number = MAXIMUM_SKELETON_SYMMETRIES,
): MapNumberRelabelling[] {
  const identity = new Map(
    [...graph.mapNumberToAtom.keys()].map((mapNumber) => [mapNumber, mapNumber]),
  );
  return skeletonSymmetriesWithinCap(graph, maximumSymmetries) ?? [identity];
}

function relabelled(mapNumber: number, relabelling: MapNumberRelabelling): number {
  return relabelling.get(mapNumber) ?? mapNumber;
}

/**
 * The same state with every atom renumbered; electrons, bond orders and stereo marks move with
 * the atoms (each mark turned to the new canonical neighbour order).
 */
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
  const rename = (mapNumber: number): number => relabelled(mapNumber, relabelling);
  return {
    mapNumberToAtom,
    bondToOrder,
    ...renamedStereo(graph, { atom: rename, neighbour: rename }),
  };
}

/**
 * Whether relabelStateGraph(graph, relabelling) has the same σ skeleton as `target` (atoms with
 * their elements and hydrogen counts, and the bonded pairs), found without building it. Most
 * symmetries fail here at once, so comparing a result under thousands of them stays quick
 * (issue #1). `relabelling` is a symmetry of the state the result came from, so it renumbers
 * the result's atoms one to one.
 */
export function relabelledSkeletonMatches(
  graph: StateGraph,
  relabelling: MapNumberRelabelling,
  target: StateGraph,
): boolean {
  if (
    graph.mapNumberToAtom.size !== target.mapNumberToAtom.size ||
    graph.bondToOrder.size !== target.bondToOrder.size
  ) {
    return false;
  }
  for (const [mapNumber, atom] of graph.mapNumberToAtom) {
    const image = relabelled(mapNumber, relabelling);
    const targetAtom = target.mapNumberToAtom.get(image);
    if (targetAtom?.element !== atom.element || targetAtom.hydrogenCount !== atom.hydrogenCount) {
      return false;
    }
    for (const neighbour of bondedNeighbours(graph, mapNumber)) {
      const neighbourImage = relabelled(neighbour.mapNumber, relabelling);
      if (bondOrderBetween(target, image, neighbourImage) === undefined) {
        return false;
      }
    }
  }
  return true;
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
