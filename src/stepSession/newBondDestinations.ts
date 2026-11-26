/**
 * The new bonds a bond source could form (point and snap, decided 2026-11-26, build item 10g;
 * docs/SPEC.md §3). The learner points at one of them, drawn dashed between its two atoms,
 * instead of tapping an atom and choosing from a menu. Only the chemistry is decided here; which
 * of them are near enough in the drawing to show is moleculeDrawing's (newBondTargets.ts).
 *
 * Rules, for a source bond A–B and a new bond from B to an atom Y (and likewise from A):
 *   - Y must be able to take a bond (canTakeBond): electron-poor, positively charged (P⁺ of an
 *     ylide), with a π bond to give up, a radical, an H on O, N, S or a halogen (passed across),
 *     or bonded to a leaving group (O, S or a halogen). So a methyl carbon or water's oxygen is
 *     never offered.
 *   - Y in another molecule: kept.
 *   - Y two bonds from B: kept only as a 1,2-shift (Y bonded to A, B moving across) onto an
 *     electron-poor Y (C, N or O short of an octet, or losing a σ bond to an arrow already drawn
 *     in this set).
 *   - Y three bonds away (a four-membered ring): left out. Four or more: kept (a ring closure).
 *   - Nothing from a hydrogen a drawn arrow is already bonding to something else (a base taking
 *     it), and no bond a drawn arrow already forms. None of this depends on the order the arrows
 *     are drawn in (a 1,2-shift is offered onto an atom bonded to a leaving group, before or after
 *     the leaving group is drawn going).
 * A lone pair or an unpaired electron needs none: tapping the atom says which bond it forms.
 */
import type {
  BondLocus,
  CurvedArrow,
  ElectronLocus,
} from "../arrowNotation/curvedArrowNotation.js";
import { type StateGraph, bondKey, bondKeyMapNumbers } from "../stateGraphs/stateGraph.js";

/** Atoms short of an octet here are electron-poor (a carbocation, a Lewis acid). */
const OCTET_ELEMENTS = new Set(["B", "Al", "C", "N", "O"]);
/** Valence electrons of the neutral atom, for formal charges. */
const VALENCE_ELECTRONS: ReadonlyMap<string, number> = new Map([
  ["H", 1], ["B", 3], ["C", 4], ["N", 5], ["O", 6], ["F", 7], ["Al", 3], ["Si", 4], ["P", 5],
  ["S", 6], ["Cl", 7], ["Zn", 2], ["Se", 6], ["Br", 7], ["Sn", 4], ["I", 7], ["Ce", 3], ["Hg", 2],
]); // prettier-ignore
/** An H bonded to one of these can be passed across to a new bond. */
const PROTON_DONOR_ELEMENTS = new Set(["N", "O", "S", "F", "Cl", "Br", "I"]);
/** A bond from an atom to one of these can break as the atom takes a new bond. */
const LEAVING_GROUP_ELEMENTS = new Set(["O", "S", "F", "Cl", "Br", "I"]);
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

function bondsOf(graph: StateGraph, mapNumber: number): [string, number][] {
  return [...graph.bondToOrder].filter(([key]) => bondKeyMapNumbers(key).includes(mapNumber));
}

function formalChargeOf(graph: StateGraph, mapNumber: number): number {
  const atom = graph.mapNumberToAtom.get(mapNumber);
  if (atom === undefined) {
    return 0;
  }
  const bondOrderSum = bondsOf(graph, mapNumber).reduce((sum, [, order]) => sum + order, 0);
  return (
    (VALENCE_ELECTRONS.get(atom.element) ?? 0) -
    atom.nonbondingElectronCount -
    bondOrderSum -
    atom.hydrogenCount
  );
}

function hasPiBond(graph: StateGraph, mapNumber: number): boolean {
  return bondsOf(graph, mapNumber).some(([, order]) => order > 1);
}

function elementOf(graph: StateGraph, mapNumber: number): string {
  return graph.mapNumberToAtom.get(mapNumber)?.element ?? "";
}

/**
 * Whether an H can be passed to a new bond: on O, N, S or a halogen, or an acidic C–H (its carbon
 * next to a π bond or a positive atom: an α-H, the CH of a phosphonium salt).
 */
function isTransferableHydrogen(graph: StateGraph, hydrogen: number): boolean {
  return neighboursOf(graph, hydrogen).some((carrier) => {
    const element = elementOf(graph, carrier);
    if (PROTON_DONOR_ELEMENTS.has(element)) {
      return true;
    }
    return (
      element === "C" &&
      neighboursOf(graph, carrier).some(
        (next) => next !== hydrogen && (hasPiBond(graph, next) || formalChargeOf(graph, next) > 0),
      )
    );
  });
}

/** Whether `mapNumber` could take a new bond (see the module comment). */
function canTakeBond(
  graph: StateGraph,
  mapNumber: number,
  drawnArrows: readonly CurvedArrow[],
): boolean {
  const atom = graph.mapNumberToAtom.get(mapNumber);
  if (atom === undefined) {
    return false;
  }
  if (atom.element === "H") {
    return isTransferableHydrogen(graph, mapNumber);
  }
  return (
    isElectronPoor(graph, mapNumber, drawnArrows) ||
    formalChargeOf(graph, mapNumber) > 0 ||
    hasPiBond(graph, mapNumber) ||
    atom.nonbondingElectronCount % 2 === 1 ||
    neighboursOf(graph, mapNumber).some((neighbour) =>
      LEAVING_GROUP_ELEMENTS.has(elementOf(graph, neighbour)),
    )
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
    // A 1,2-shift onto an atom that is electron-poor, or will be as a leaving group goes (drawn
    // before or after the shift: the order the arrows are drawn in does not matter).
    const isShiftOfFormer = graph.bondToOrder.has(bondKey(other, target));
    // A single bond to a leaving group (C–Br, C–OH₂⁺, O–O), not a C=O: a carbonyl carbon is no
    // shift target.
    const losesLeavingGroup = neighboursOf(graph, target).some(
      (neighbour) =>
        neighbour !== other &&
        LEAVING_GROUP_ELEMENTS.has(elementOf(graph, neighbour)) &&
        graph.bondToOrder.get(bondKey(target, neighbour)) === 1,
    );
    return isShiftOfFormer && (isElectronPoor(graph, target, drawnArrows) || losesLeavingGroup);
  }
  return distance >= SMALLEST_RING_CLOSURE_DISTANCE;
}

/**
 * The new bonds the drawn arrows have already given their pair. Two fish-hooks meet in one bond,
 * so a bond is formed (and its atoms taken) only once it has both electrons.
 */
function formedBondKeys(drawnArrows: readonly CurvedArrow[]): Set<string> {
  const keyToElectrons = new Map<string, number>();
  for (const { destination, electronsMoved } of drawnArrows) {
    if (destination.locusKind === "sigmaBond") {
      const [atomA, atomB] = destination.atoms;
      const key = bondKey(atomA.mapNumber, atomB.mapNumber);
      keyToElectrons.set(key, (keyToElectrons.get(key) ?? 0) + electronsMoved);
    }
  }
  return new Set([...keyToElectrons].filter(([, electrons]) => electrons >= 2).map(([key]) => key));
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
  const formed = formedBondKeys(drawnArrows);
  // A hydrogen makes one bond: once a drawn arrow bonds it (a base taking it), it cannot also
  // shift. A heavier atom can form a second new bond in the same step (the epoxide oxygen).
  const alreadyBonding = (mapNumber: number): boolean =>
    elementOf(graph, mapNumber) === "H" &&
    [...formed].some((key) => bondKeyMapNumbers(key).includes(mapNumber));
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
        canTakeBond(graph, target, drawnArrows) &&
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
