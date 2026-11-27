/**
 * Stereo marks kept on map numbers (item 12a, docs/stereo-validation.md), shared by the mapped
 * SMILES reader and writer.
 *
 * Stereocentres
 *   A SMILES "@" or "@@" depends on the order the neighbours are written in. A state graph keeps
 *   the mark for the canonical order: IMPLICIT_NEIGHBOUR (an implicit H, or a lone pair on S, P or
 *   N) first, then the mapped neighbours by ascending map number. markInOrder() turns a mark from
 *   one order to another: an odd permutation swaps "@" and "@@".
 *
 * Double bonds
 *   Written as "/" and "\" on single bonds next to the double bond. For a bond written left to
 *   right, "/" puts the right atom above the left one and "\" below (so F/C=C/F is trans). Each
 *   end D of a double bond D=E has a reference neighbour: its lowest-numbered neighbour other
 *   than E. The relation is "cis" when the two reference neighbours are on the same side.
 *   relationsFromDirections() reads relations from written directions; directionsForRelations()
 *   chooses directions for the writer, which marks only bonds it writes from parent to child.
 */
import {
  bondKey,
  bondKeyMapNumbers,
  type DoubleBondRelation,
  type StateAtom,
  type TetrahedralMark,
} from "./stateGraph.js";

/** Stands for an implicit H or a lone pair in a neighbour order (map numbers start at 1). */
export const IMPLICIT_NEIGHBOUR = 0;

export type DirectionSymbol = "/" | "\\";

/** A single bond written with a direction mark; `left` is the atom written first. */
export interface DirectedBond {
  readonly left: number;
  readonly right: number;
  readonly symbol: DirectionSymbol;
}

/** Whether an implicit H or a lone pair is a stereocentre's fourth neighbour. */
export function hasImplicitNeighbour(atom: StateAtom, mappedNeighbourCount: number): boolean {
  const hasLonePair = atom.nonbondingElectronCount >= 2;
  return (
    atom.hydrogenCount === 1 ||
    (atom.hydrogenCount === 0 && hasLonePair && mappedNeighbourCount === 3)
  );
}

/** The canonical order of a stereocentre's neighbours (see the module comment). */
export function canonicalNeighbourOrder(neighbours: readonly number[]): number[] {
  return [...neighbours].sort((first, second) => first - second);
}

/** The mark that means the same arrangement when the neighbours are listed in `toOrder`. */
export function markInOrder(
  mark: TetrahedralMark,
  fromOrder: readonly number[],
  toOrder: readonly number[],
): TetrahedralMark {
  const positions = fromOrder.map((neighbour) => toOrder.indexOf(neighbour));
  let inversions = 0;
  positions.forEach((position, index) => {
    inversions += positions.slice(index + 1).filter((later) => later < position).length;
  });
  if (inversions % 2 === 0) {
    return mark;
  }
  return mark === "@" ? "@@" : "@";
}

function neighbourTable(bondToOrder: ReadonlyMap<string, number>): Map<number, number[]> {
  const table = new Map<number, number[]>();
  for (const key of bondToOrder.keys()) {
    const [first, second] = bondKeyMapNumbers(key);
    table.set(first, [...(table.get(first) ?? []), second]);
    table.set(second, [...(table.get(second) ?? []), first]);
  }
  return table;
}

/** Whether the substituent on `bond` sits above `doubleBondAtom`, its other end. */
function isAbove(bond: DirectedBond, doubleBondAtom: number): boolean {
  const isSlash = bond.symbol === "/";
  return bond.left === doubleBondAtom ? isSlash : !isSlash;
}

/** The other atoms bonded to `end`, leaving out its double-bond partner. */
function substituentsOf(
  table: ReadonlyMap<number, readonly number[]>,
  end: number,
  partner: number,
): number[] {
  return (table.get(end) ?? []).filter((neighbour) => neighbour !== partner);
}

/**
 * Whether the reference neighbour of `end` is above it, from the marks written there; undefined
 * when none is written; an error text when two marks put two neighbours on one side.
 */
function referenceSide(
  substituents: readonly number[],
  end: number,
  keyToDirectedBond: ReadonlyMap<string, DirectedBond>,
): boolean | string | undefined {
  const marked = substituents.flatMap((substituent) => {
    const bond = keyToDirectedBond.get(bondKey(end, substituent));
    return bond === undefined ? [] : [{ substituent, above: isAbove(bond, end) }];
  });
  const [first, second] = marked;
  if (first === undefined) {
    return undefined;
  }
  if (second !== undefined && second.above === first.above) {
    return `two neighbours of atom ${String(end)} are marked on the same side`;
  }
  const reference = Math.min(...substituents);
  return first.substituent === reference ? first.above : !first.above;
}

/**
 * The relation of every double bond marked at both ends, or an error text: two marks on one
 * side, or a direction mark that no double bond marked at both ends uses.
 */
export function relationsFromDirections(
  bondToOrder: ReadonlyMap<string, number>,
  directedBonds: readonly DirectedBond[],
): Map<string, DoubleBondRelation> | string {
  const table = neighbourTable(bondToOrder);
  const keyToDirectedBond = new Map(
    directedBonds.map((bond) => [bondKey(bond.left, bond.right), bond]),
  );
  const relations = new Map<string, DoubleBondRelation>();
  const usedKeys = new Set<string>();
  for (const [key, order] of bondToOrder) {
    if (order !== 2) {
      continue;
    }
    const [first, second] = bondKeyMapNumbers(key);
    const firstSubstituents = substituentsOf(table, first, second);
    const secondSubstituents = substituentsOf(table, second, first);
    const firstSide = referenceSide(firstSubstituents, first, keyToDirectedBond);
    const secondSide = referenceSide(secondSubstituents, second, keyToDirectedBond);
    if (typeof firstSide === "string" || typeof secondSide === "string") {
      return typeof firstSide === "string" ? firstSide : String(secondSide);
    }
    if (firstSide === undefined || secondSide === undefined) {
      continue;
    }
    relations.set(key, firstSide === secondSide ? "cis" : "trans");
    for (const [end, substituents] of [
      [first, firstSubstituents],
      [second, secondSubstituents],
    ] as const) {
      substituents.forEach((substituent) => usedKeys.add(bondKey(end, substituent)));
    }
  }
  const unused = directedBonds.find((bond) => !usedKeys.has(bondKey(bond.left, bond.right)));
  if (unused !== undefined) {
    const atoms = `${String(unused.left)} and ${String(unused.right)}`;
    return `the direction mark between atoms ${atoms} is beside no double bond marked at both ends`;
  }
  return relations;
}

/** A bond the writer can mark: written from `left` (the parent) to `right` (the child). */
interface WrittenSingleBond {
  readonly left: number;
  readonly right: number;
}

/** One stereo double bond as an equation: slash(first) XOR slash(second) = parity. */
interface DirectionEquation {
  readonly firstKey: string;
  readonly secondKey: string;
  readonly parity: boolean;
}

/** The substituent bond the writer marks at `end`: the lowest-numbered tree bond. */
function markedSubstituent(
  substituents: readonly number[],
  end: number,
  parentOf: ReadonlyMap<number, number>,
): WrittenSingleBond {
  const writable = [...substituents]
    .sort((first, second) => first - second)
    .find((substituent) => parentOf.get(substituent) === end || parentOf.get(end) === substituent);
  if (writable === undefined) {
    throw new Error(
      `cannot write the double-bond stereo at atom ${String(end)}: no tree bond to mark`,
    );
  }
  return parentOf.get(writable) === end
    ? { left: end, right: writable }
    : { left: writable, right: end };
}

function equationFor(
  key: string,
  relation: DoubleBondRelation,
  table: ReadonlyMap<number, readonly number[]>,
  parentOf: ReadonlyMap<number, number>,
): DirectionEquation & { readonly bonds: readonly WrittenSingleBond[] } {
  const ends = bondKeyMapNumbers(key);
  let parity = relation === "trans";
  const bonds = ends.map((end, index) => {
    const substituents = substituentsOf(table, end, ends[1 - index] ?? end);
    const bond = markedSubstituent(substituents, end, parentOf);
    const substituent = bond.left === end ? bond.right : bond.left;
    // above = slash XOR (left is not the end); reference above = above XOR (not the reference).
    parity = (parity !== (bond.left !== end)) !== (substituent !== Math.min(...substituents));
    return bond;
  });
  const [firstBond, secondBond] = bonds;
  return {
    firstKey: bondKey(firstBond?.left ?? 0, firstBond?.right ?? 0),
    secondKey: bondKey(secondBond?.left ?? 0, secondBond?.right ?? 0),
    parity,
    bonds,
  };
}

/** Solve the equations by propagation, starting each unsolved bond at "/". */
function solveDirections(equations: readonly DirectionEquation[]): Map<string, boolean> {
  const isSlash = new Map<string, boolean>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const { firstKey, secondKey, parity } of equations) {
      const first = isSlash.get(firstKey);
      const second = isSlash.get(secondKey);
      if (first !== undefined && second !== undefined) {
        if ((first !== second) !== parity) {
          throw new Error("cannot write the double-bond stereo: the marks contradict each other");
        }
      } else if (first !== undefined || second !== undefined) {
        isSlash.set(first === undefined ? firstKey : secondKey, (first ?? second) !== parity);
        changed = true;
      }
    }
    const unsolved = equations.find((equation) => !isSlash.has(equation.firstKey));
    if (!changed && unsolved !== undefined) {
      isSlash.set(unsolved.firstKey, true);
      changed = true;
    }
  }
  return isSlash;
}

/**
 * The direction symbol of each single bond the writer marks, keyed by bondKey(). `parentOf` gives
 * each atom's parent in the writer's walk; only those tree bonds are marked.
 */
export function directionsForRelations(
  bondToOrder: ReadonlyMap<string, number>,
  bondToRelation: ReadonlyMap<string, DoubleBondRelation>,
  parentOf: ReadonlyMap<number, number>,
): Map<string, DirectionSymbol> {
  const table = neighbourTable(bondToOrder);
  const equations = [...bondToRelation].map(([key, relation]) =>
    equationFor(key, relation, table, parentOf),
  );
  const directions = new Map<string, DirectionSymbol>();
  for (const [key, isSlash] of solveDirections(equations)) {
    directions.set(key, isSlash ? "/" : "\\");
  }
  return directions;
}
