/**
 * Write a state graph as mapped SMILES in the strict subset reaction files use (the subset
 * mappedSmilesReading.ts reads), so the editor can store the states it generates.
 *
 * Output
 *   Every atom in brackets: element, implicit hydrogens ("H", "H2", …), formal charge ("+", "-",
 *   "+2", …) and map number, e.g. "[CH2-:3]". Unpaired electrons need no mark: the reader works
 *   them out from the counts. Bonds are "=" and "#"; single bonds are not written.
 *
 * Order (the same graph always gives the same text)
 *   Molecules in order of their lowest map number, joined by ".". Each molecule is walked depth
 *   first from its lowest map number, neighbours in ascending map-number order; every neighbour
 *   but the last is written as a branch in parentheses. A bond back to an atom already reached
 *   closes a ring: the lowest free ring number (1-9, then %10, %11, …) is written after the
 *   earlier atom and again, with the bond symbol, after the later one. A number is free again
 *   once its ring is closed.
 */
import {
  bondKey,
  bondKeyMapNumbers,
  formalCharge,
  type StateAtom,
  type StateGraph,
} from "./stateGraph.js";
import {
  canonicalNeighbourOrder,
  directionsForRelations,
  type DirectionSymbol,
  hasImplicitNeighbour,
  IMPLICIT_NEIGHBOUR,
  markInOrder,
} from "./stereoMarks.js";

const ORDER_TO_BOND_SYMBOL: ReadonlyMap<number, string> = new Map([
  [1, ""],
  [2, "="],
  [3, "#"],
]);
const LARGEST_SINGLE_DIGIT_RING_NUMBER = 9;

/** The depth-first walk of one molecule: tree children and ring-closing bonds per atom. */
interface MoleculeWalk {
  readonly mapNumberToChildren: Map<number, number[]>;
  /** For each atom, the earlier atoms it closes a ring back to. */
  readonly mapNumberToRingTargets: Map<number, number[]>;
  /** For each atom, the later atoms that close a ring back to it. */
  readonly mapNumberToRingSources: Map<number, number[]>;
}

const byNumber = (first: number, second: number): number => first - second;

function neighboursOf(graph: StateGraph): Map<number, number[]> {
  const mapNumberToNeighbours = new Map<number, number[]>(
    [...graph.mapNumberToAtom.keys()].map((mapNumber) => [mapNumber, []]),
  );
  for (const key of graph.bondToOrder.keys()) {
    const [first, second] = bondKeyMapNumbers(key);
    mapNumberToNeighbours.get(first)?.push(second);
    mapNumberToNeighbours.get(second)?.push(first);
  }
  for (const neighbours of mapNumberToNeighbours.values()) {
    neighbours.sort(byNumber);
  }
  return mapNumberToNeighbours;
}

function appendTo(table: Map<number, number[]>, key: number, item: number): void {
  table.set(key, [...(table.get(key) ?? []), item]);
}

/** Walk the molecule from `rootMapNumber`, marking every atom reached in `reached`. */
function walkMolecule(
  rootMapNumber: number,
  mapNumberToNeighbours: ReadonlyMap<number, readonly number[]>,
  reached: Set<number>,
): MoleculeWalk {
  const walk: MoleculeWalk = {
    mapNumberToChildren: new Map(),
    mapNumberToRingTargets: new Map(),
    mapNumberToRingSources: new Map(),
  };
  const visit = (mapNumber: number, parent: number | undefined): void => {
    reached.add(mapNumber);
    for (const neighbour of mapNumberToNeighbours.get(mapNumber) ?? []) {
      if (neighbour === parent) {
        continue;
      }
      if (!reached.has(neighbour)) {
        appendTo(walk.mapNumberToChildren, mapNumber, neighbour);
        visit(neighbour, mapNumber);
      } else if (!(walk.mapNumberToRingTargets.get(neighbour) ?? []).includes(mapNumber)) {
        // An atom already reached and not yet closed to from there: a ring closes here.
        appendTo(walk.mapNumberToRingTargets, mapNumber, neighbour);
        appendTo(walk.mapNumberToRingSources, neighbour, mapNumber);
      }
    }
  };
  visit(rootMapNumber, undefined);
  return walk;
}

/**
 * The stereocentre's mark for the order the writer lists its neighbours (the order the reader
 * sees): parent, an implicit H or lone pair, ring closures as written, then the children.
 */
function writtenMark(
  graph: StateGraph,
  walk: MoleculeWalk,
  atom: StateAtom,
  parent: number | undefined,
): string {
  const mark = graph.mapNumberToTetrahedralMark?.get(atom.mapNumber);
  if (mark === undefined) {
    return "";
  }
  const { mapNumber } = atom;
  const mapped = [
    ...(parent === undefined ? [] : [parent]),
    ...(walk.mapNumberToRingTargets.get(mapNumber) ?? []),
    ...(walk.mapNumberToRingSources.get(mapNumber) ?? []),
    ...(walk.mapNumberToChildren.get(mapNumber) ?? []),
  ];
  const written = hasImplicitNeighbour(atom, mapped.length)
    ? [
        ...mapped.slice(0, parent === undefined ? 0 : 1),
        IMPLICIT_NEIGHBOUR,
        ...mapped.slice(parent === undefined ? 0 : 1),
      ]
    : mapped;
  return markInOrder(mark, canonicalNeighbourOrder(written), written);
}

function atomText(graph: StateGraph, atom: StateAtom, mark = ""): string {
  const hydrogens =
    atom.hydrogenCount === 0
      ? ""
      : atom.hydrogenCount === 1
        ? "H"
        : `H${String(atom.hydrogenCount)}`;
  const charge = formalCharge(graph, atom.mapNumber);
  const chargeSign = charge > 0 ? "+" : "-";
  const chargeText =
    charge === 0
      ? ""
      : Math.abs(charge) === 1
        ? chargeSign
        : `${chargeSign}${String(Math.abs(charge))}`;
  return `[${atom.element}${mark}${hydrogens}${chargeText}:${String(atom.mapNumber)}]`;
}

function bondSymbol(
  graph: StateGraph,
  first: number,
  second: number,
  directions: ReadonlyMap<string, DirectionSymbol> = new Map(),
): string {
  const key = bondKey(first, second);
  return directions.get(key) ?? ORDER_TO_BOND_SYMBOL.get(graph.bondToOrder.get(key) ?? 1) ?? "";
}

function ringNumberText(ringNumber: number): string {
  return ringNumber > LARGEST_SINGLE_DIGIT_RING_NUMBER
    ? `%${String(ringNumber)}`
    : String(ringNumber);
}

/** Write one walked molecule. Open rings are keyed "<earlier>-<later>" by map number. */
function writeMolecule(
  graph: StateGraph,
  walk: MoleculeWalk,
  rootMapNumber: number,
  directions: ReadonlyMap<string, DirectionSymbol>,
): string {
  const openRings = new Map<string, number>();
  const takeRingNumber = (): number => {
    const inUse = new Set(openRings.values());
    let ringNumber = 1;
    while (inUse.has(ringNumber)) {
      ringNumber += 1;
    }
    return ringNumber;
  };
  const write = (mapNumber: number, parent: number | undefined): string => {
    const atom = graph.mapNumberToAtom.get(mapNumber);
    let text =
      atom === undefined ? "" : atomText(graph, atom, writtenMark(graph, walk, atom, parent));
    for (const target of walk.mapNumberToRingTargets.get(mapNumber) ?? []) {
      const key = `${String(target)}-${String(mapNumber)}`;
      text += `${bondSymbol(graph, target, mapNumber)}${ringNumberText(openRings.get(key) ?? 0)}`;
      openRings.delete(key);
    }
    for (const source of walk.mapNumberToRingSources.get(mapNumber) ?? []) {
      const ringNumber = takeRingNumber();
      openRings.set(`${String(mapNumber)}-${String(source)}`, ringNumber);
      text += ringNumberText(ringNumber);
    }
    const children = walk.mapNumberToChildren.get(mapNumber) ?? [];
    children.forEach((child, index) => {
      const branch = `${bondSymbol(graph, mapNumber, child, directions)}${write(child, mapNumber)}`;
      text += index < children.length - 1 ? `(${branch})` : branch;
    });
    return text;
  };
  return write(rootMapNumber, undefined);
}

/** The state as strict mapped SMILES (see the module comment for the order). */
export function mappedSmilesFromStateGraph(graph: StateGraph): string {
  const mapNumberToNeighbours = neighboursOf(graph);
  const reached = new Set<number>();
  const walks: [MoleculeWalk, number][] = [];
  for (const mapNumber of [...graph.mapNumberToAtom.keys()].sort(byNumber)) {
    if (!reached.has(mapNumber)) {
      walks.push([walkMolecule(mapNumber, mapNumberToNeighbours, reached), mapNumber]);
    }
  }
  const parentOf = new Map<number, number>();
  for (const [walk] of walks) {
    for (const [parent, children] of walk.mapNumberToChildren) {
      children.forEach((child) => parentOf.set(child, parent));
    }
  }
  const directions = directionsForRelations(
    graph.bondToOrder,
    graph.bondToDoubleBondRelation ?? new Map(),
    parentOf,
  );
  return walks.map(([walk, root]) => writeMolecule(graph, walk, root, directions)).join(".");
}
