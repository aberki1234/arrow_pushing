/**
 * The new bonds a bond source could form (point and snap, decided 2026-11-26, build item 10g;
 * docs/SPEC.md §3). The learner points at one of them, drawn dashed between its two atoms,
 * instead of tapping an atom and choosing from a menu. Only the chemistry is decided here; which
 * of them are near enough in the drawing to show is moleculeDrawing's (newBondTargets.ts).
 *
 * Rules, for a source bond A–B and a new bond from B to an atom Y (and likewise from A):
 *   - Y in another molecule: kept.
 *   - Y two bonds from B: kept only as a 1,2-shift (Y bonded to A, B moving across) onto an
 *     electron-poor Y (C, N or O short of an octet, or losing a σ bond to an arrow already drawn
 *     in this set).
 *   - Y three bonds away (a four-membered ring): left out. Four or more: kept (a ring closure).
 *   - Nothing from an atom a drawn arrow is already bonding to something else (a base taking
 *     the H), and no bond a drawn arrow already forms.
 * A lone pair or an unpaired electron needs none: tapping the atom says which bond it forms.
 */
import type {
  BondLocus,
  CurvedArrow,
  ElectronLocus,
} from "../arrowNotation/curvedArrowNotation.js";
import { type StateGraph, bondKey, bondKeyMapNumbers } from "../stateGraphs/stateGraph.js";

const OCTET_ELEMENTS = new Set(["C", "N", "O"]);
const SMALLEST_RING_CLOSURE_DISTANCE = 4;

function neighboursOf(graph: StateGraph, mapNumber: number): number[] {
  return [...graph.bondToOrder.keys()]
    .map(bondKeyMapNumbers)
    .filter((pair) => pair.includes(mapNumber))
    .map(([first, second]) => (first === mapNumber ? second : first));
}

/** Bonds between `start` and every atom of its molecule (breadth first). */
function bondDistancesFrom(graph: StateGraph, start: number): Map<number, number> {
  const distances = new Map([[start, 0]]);
  const queue = [start];
  for (let current = queue.shift(); current !== undefined; current = queue.shift()) {
    for (const neighbour of neighboursOf(graph, current)) {
      if (!distances.has(neighbour)) {
        distances.set(neighbour, (distances.get(current) ?? 0) + 1);
        queue.push(neighbour);
      }
    }
  }
  return distances;
}

function valenceElectronsOf(graph: StateGraph, mapNumber: number): number {
  const atom = graph.mapNumberToAtom.get(mapNumber);
  let bondingElectrons = 2 * (atom?.hydrogenCount ?? 0);
  for (const [key, bondOrder] of graph.bondToOrder) {
    if (bondKeyMapNumbers(key).includes(mapNumber)) {
      bondingElectrons += 2 * bondOrder;
    }
  }
  return bondingElectrons + (atom?.nonbondingElectronCount ?? 0);
}

function touches(locus: ElectronLocus, mapNumber: number): boolean {
  return locus.atoms.some((atom) => atom.mapNumber === mapNumber);
}

function isElectronPoor(
  graph: StateGraph,
  mapNumber: number,
  drawnArrows: readonly CurvedArrow[],
): boolean {
  const element = graph.mapNumberToAtom.get(mapNumber)?.element ?? "";
  if (OCTET_ELEMENTS.has(element) && valenceElectronsOf(graph, mapNumber) < 8) {
    return true;
  }
  return drawnArrows.some(
    ({ source, destination }) =>
      source.locusKind === "sigmaBond" &&
      touches(source, mapNumber) &&
      !touches(destination, mapNumber),
  );
}

function sigmaBond(graph: StateGraph, first: number, second: number): BondLocus {
  const [smaller, larger] = first < second ? [first, second] : [second, first];
  const label = (mapNumber: number): { element: string; mapNumber: number } => ({
    element: graph.mapNumberToAtom.get(mapNumber)?.element ?? "",
    mapNumber,
  });
  return { locusKind: "sigmaBond", atoms: [label(smaller), label(larger)] };
}

/** Whether a new bond from `former` (one end of the source bond) to `target` is offered. */
function isOffered(
  graph: StateGraph,
  [former, other]: readonly [number, number],
  target: number,
  drawnArrows: readonly CurvedArrow[],
): boolean {
  const distance = bondDistancesFrom(graph, former).get(target);
  if (distance === undefined) {
    return true;
  }
  if (distance === 2) {
    const isShiftOfFormer = graph.bondToOrder.has(bondKey(other, target));
    return isShiftOfFormer && isElectronPoor(graph, target, drawnArrows);
  }
  return distance >= SMALLEST_RING_CLOSURE_DISTANCE;
}

/** The σ bonds the source bond could form, in map number order; none for an atom source. */
export function newBondDestinations(
  graph: StateGraph,
  source: ElectronLocus,
  drawnArrows: readonly CurvedArrow[],
): BondLocus[] {
  const [first, second] = source.atoms.map((atom) => atom.mapNumber);
  if (first === undefined || second === undefined) {
    return [];
  }
  const formed = new Set(
    drawnArrows
      .map(({ destination }) => destination)
      .filter((destination): destination is BondLocus => destination.locusKind === "sigmaBond")
      .map(({ atoms: [first, second] }) => bondKey(first.mapNumber, second.mapNumber)),
  );
  const alreadyBonding = (mapNumber: number): boolean =>
    drawnArrows.some(
      ({ destination }) => destination.locusKind === "sigmaBond" && touches(destination, mapNumber),
    );
  const keys = new Set<string>();
  for (const [former, other] of [
    [first, second],
    [second, first],
  ] as const) {
    if (alreadyBonding(former)) {
      continue;
    }
    for (const target of graph.mapNumberToAtom.keys()) {
      const key = bondKey(former, target);
      const isCandidate =
        target !== former &&
        target !== other &&
        !graph.bondToOrder.has(key) &&
        !formed.has(key) &&
        isOffered(graph, [former, other], target, drawnArrows);
      if (isCandidate) {
        keys.add(key);
      }
    }
  }
  return [...keys]
    .map(bondKeyMapNumbers)
    .sort(([firstA, secondA], [firstB, secondB]) => firstA - firstB || secondA - secondB)
    .map(([first, second]) => sigmaBond(graph, first, second));
}
