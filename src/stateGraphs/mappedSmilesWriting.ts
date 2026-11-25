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

function atomText(graph: StateGraph, atom: StateAtom): string {
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
  return `[${atom.element}${hydrogens}${chargeText}:${String(atom.mapNumber)}]`;
}

function bondSymbol(graph: StateGraph, first: number, second: number): string {
  return ORDER_TO_BOND_SYMBOL.get(graph.bondToOrder.get(bondKey(first, second)) ?? 1) ?? "";
}

function ringNumberText(ringNumber: number): string {
  return ringNumber > LARGEST_SINGLE_DIGIT_RING_NUMBER
    ? `%${String(ringNumber)}`
    : String(ringNumber);
}

/** Write one walked molecule. Open rings are keyed "<earlier>-<later>" by map number. */
function writeMolecule(graph: StateGraph, walk: MoleculeWalk, rootMapNumber: number): string {
  const openRings = new Map<string, number>();
  const takeRingNumber = (): number => {
    const inUse = new Set(openRings.values());
    let ringNumber = 1;
    while (inUse.has(ringNumber)) {
      ringNumber += 1;
    }
    return ringNumber;
  };
  const write = (mapNumber: number): string => {
    const atom = graph.mapNumberToAtom.get(mapNumber);
    let text = atom === undefined ? "" : atomText(graph, atom);
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
      const branch = `${bondSymbol(graph, mapNumber, child)}${write(child)}`;
      text += index < children.length - 1 ? `(${branch})` : branch;
    });
    return text;
  };
  return write(rootMapNumber);
}

/** The state as strict mapped SMILES (see the module comment for the order). */
export function mappedSmilesFromStateGraph(graph: StateGraph): string {
  const mapNumberToNeighbours = neighboursOf(graph);
  const reached = new Set<number>();
  const molecules: string[] = [];
  for (const mapNumber of [...graph.mapNumberToAtom.keys()].sort(byNumber)) {
    if (!reached.has(mapNumber)) {
      const walk = walkMolecule(mapNumber, mapNumberToNeighbours, reached);
      molecules.push(writeMolecule(graph, walk, mapNumber));
    }
  }
  return molecules.join(".");
}
