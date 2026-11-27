/**
 * A state read for the reaction cards' drawings: its graph, its atoms' points in pixels (the
 * median bond SCHEME_BOND_LENGTH long, y flipped), the bonds and neighbours of the atoms drawn,
 * and its species (connected parts).
 *
 * Not drawn as atoms: an abbreviated group's other atoms, and an explicit (mapped) hydrogen
 * bonded to one other atom, which the mechanism needs but skeletal formulas fold away: it is
 * counted with that atom's hydrogens instead (left out on a carbon, "OH" on an oxygen).
 */
import { stateGraphFromMappedSmiles } from "../../core/stateGraphs/mappedSmilesReading.js";
import {
  type StateAtom,
  type StateGraph,
  bondKeyMapNumbers,
} from "../../core/stateGraphs/stateGraph.js";
import { type AbbreviatedGroup, stateDisplayPlan } from "./abbreviatedGroups.js";
import { DEFAULT_BOND_LENGTH_UNITS, type MapNumberToCoordinates } from "./drawingLayout.js";
import type { Point } from "./planeGeometry.js";

/** Pixels; the cards use one bond length everywhere. */
export const SCHEME_BOND_LENGTH = 20;

/** What the cards need of a state. */
export interface SchemeStateFields {
  readonly mappedSmiles: string;
  readonly mapNumberToCoordinates: MapNumberToCoordinates;
  readonly bondToWedgeStyle?: Readonly<Record<string, "wedge" | "dash">>;
}

function medianBondLength(graph: StateGraph, coordinates: MapNumberToCoordinates): number {
  const lengths = [...graph.bondToOrder.keys()]
    .map((key) => bondKeyMapNumbers(key).map((mapNumber) => coordinates[String(mapNumber)]))
    .filter(([first, second]) => first !== undefined && second !== undefined)
    .map(([first = [], second = []]) =>
      Math.hypot((second[0] ?? 0) - (first[0] ?? 0), (second[1] ?? 0) - (first[1] ?? 0)),
    )
    .sort((one, other) => one - other);
  if (lengths.length === 0) {
    return DEFAULT_BOND_LENGTH_UNITS;
  }
  const middle = Math.floor(lengths.length / 2);
  const median =
    lengths.length % 2 === 1
      ? (lengths[middle] ?? 0)
      : ((lengths[middle - 1] ?? 0) + (lengths[middle] ?? 0)) / 2;
  return median > 0 ? median : DEFAULT_BOND_LENGTH_UNITS;
}

/** Each atom's point in pixels: the median bond SCHEME_BOND_LENGTH long, y flipped. */
function schemePoints(graph: StateGraph, coordinates: MapNumberToCoordinates): Map<number, Point> {
  const scale = SCHEME_BOND_LENGTH / medianBondLength(graph, coordinates);
  const mapNumberToPoint = new Map<number, Point>();
  for (const [mapNumberText, [across = 0, upward = 0]] of Object.entries(coordinates)) {
    // 0 - value keeps a zero coordinate +0 rather than -0.
    mapNumberToPoint.set(Number(mapNumberText), { x: across * scale, y: 0 - upward * scale });
  }
  return mapNumberToPoint;
}

/** The state's drawn atoms and bonds, with what each atom touches. */
export interface Structure {
  readonly graph: StateGraph;
  readonly mapNumberToPoint: ReadonlyMap<number, Point>;
  readonly mapNumberToNeighbours: ReadonlyMap<number, readonly number[]>;
  /** Bonds as [first, second, order], first < second, in map-number order. */
  readonly bonds: readonly (readonly [number, number, number])[];
  readonly drawnMapNumbers: readonly number[];
  readonly mapNumberToGroupLabel: ReadonlyMap<number, string>;
  /** Explicit hydrogens folded into each atom they were bonded to. */
  readonly mapNumberToFoldedHydrogens: ReadonlyMap<number, number>;
}

/** The atom an explicit hydrogen is folded into: its only neighbour, unless that is a hydrogen. */
function foldedInto(graph: StateGraph, mapNumber: number): number | null {
  if (graph.mapNumberToAtom.get(mapNumber)?.element !== "H") {
    return null;
  }
  const neighbours = [...graph.bondToOrder.keys()]
    .map(bondKeyMapNumbers)
    .filter((pair) => pair.includes(mapNumber))
    .map(([first, second]) => (first === mapNumber ? second : first));
  const [onlyNeighbour] = neighbours;
  const isFoldable =
    neighbours.length === 1 &&
    onlyNeighbour !== undefined &&
    graph.mapNumberToAtom.get(onlyNeighbour)?.element !== "H";
  return isFoldable ? onlyNeighbour : null;
}

function foldedHydrogens(graph: StateGraph): Map<number, number> {
  const mapNumberToCount = new Map<number, number>();
  for (const mapNumber of graph.mapNumberToAtom.keys()) {
    const into = foldedInto(graph, mapNumber);
    if (into !== null) {
      mapNumberToCount.set(into, (mapNumberToCount.get(into) ?? 0) + 1);
    }
  }
  return mapNumberToCount;
}

export function structureOf(
  state: SchemeStateFields,
  abbreviatedGroups: readonly AbbreviatedGroup[],
): Structure {
  const graph = stateGraphFromMappedSmiles(state.mappedSmiles);
  const plan = stateDisplayPlan(graph, [], abbreviatedGroups);
  const mapNumberToFoldedHydrogens = foldedHydrogens(graph);
  const folded = new Set(
    [...graph.mapNumberToAtom.keys()].filter((mapNumber) => foldedInto(graph, mapNumber) !== null),
  );
  const isDrawn = (mapNumber: number): boolean =>
    !plan.hiddenMapNumbers.has(mapNumber) && !folded.has(mapNumber);
  const bonds = [...graph.bondToOrder.entries()]
    .map(([key, order]) => [...bondKeyMapNumbers(key), order] as const)
    .filter(([first, second]) => isDrawn(first) && isDrawn(second))
    .sort((one, other) => one[0] - other[0] || one[1] - other[1]);
  const mapNumberToNeighbours = new Map<number, number[]>();
  for (const [first, second] of bonds) {
    mapNumberToNeighbours.set(first, [...(mapNumberToNeighbours.get(first) ?? []), second]);
    mapNumberToNeighbours.set(second, [...(mapNumberToNeighbours.get(second) ?? []), first]);
  }
  return {
    graph,
    mapNumberToPoint: schemePoints(graph, state.mapNumberToCoordinates),
    mapNumberToNeighbours,
    bonds,
    drawnMapNumbers: [...graph.mapNumberToAtom.keys()]
      .filter(isDrawn)
      .sort((one, other) => one - other),
    mapNumberToGroupLabel: plan.mapNumberToGroupLabel,
    mapNumberToFoldedHydrogens,
  };
}

export function pointOf(structure: Structure, mapNumber: number): Point {
  const point = structure.mapNumberToPoint.get(mapNumber);
  if (point === undefined) {
    throw new Error(`the state has no coordinates for map number ${String(mapNumber)}`);
  }
  return point;
}

export function neighboursOf(structure: Structure, mapNumber: number): readonly number[] {
  return structure.mapNumberToNeighbours.get(mapNumber) ?? [];
}

export function atomOf(structure: Structure, mapNumber: number): StateAtom {
  const atom = structure.graph.mapNumberToAtom.get(mapNumber);
  if (atom === undefined) {
    throw new Error(`the state has no atom with map number ${String(mapNumber)}`);
  }
  return atom;
}

/** The map numbers of each connected part, each sorted. */
export function speciesMapNumbers(structure: Structure): number[][] {
  const seen = new Set<number>();
  const parts: number[][] = [];
  for (const start of structure.drawnMapNumbers) {
    if (seen.has(start)) {
      continue;
    }
    const part: number[] = [];
    const waiting = [start];
    seen.add(start);
    for (let next = waiting.pop(); next !== undefined; next = waiting.pop()) {
      part.push(next);
      for (const neighbour of neighboursOf(structure, next)) {
        if (!seen.has(neighbour)) {
          seen.add(neighbour);
          waiting.push(neighbour);
        }
      }
    }
    parts.push(part.sort((one, other) => one - other));
  }
  return parts;
}
