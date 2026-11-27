/**
 * From stored coordinates to screen pixels.
 *
 * Coordinates are RDKit units (a C–C bond is about 1.5) with y pointing up. One scale is used for
 * every state of a reaction (decided 2026-11-25), set so that the start state's median bond is
 * BOND_LENGTH_PIXELS long; bonds therefore keep their length from step to step. The y axis is
 * flipped for SVG. Each state's view box fits its own drawing.
 */
import type { StateGraph } from "../../core/stateGraphs/stateGraph.js";
import type { Point } from "./planeGeometry.js";

export const BOND_LENGTH_PIXELS = 56;
/** Used when the start state has no bond to measure (e.g. two separate ions). */
export const DEFAULT_BOND_LENGTH_UNITS = 1.5;

/** Map number (as the JSON key text) to [x, y] in RDKit units. */
export type MapNumberToCoordinates = Readonly<Record<string, readonly number[]>>;

export interface ViewBox {
  readonly minX: number;
  readonly minY: number;
  readonly width: number;
  readonly height: number;
}

function coordinatesOf(
  coordinates: MapNumberToCoordinates,
  mapNumber: number,
): readonly number[] | undefined {
  return Object.hasOwn(coordinates, String(mapNumber)) ? coordinates[String(mapNumber)] : undefined;
}

function medianOf(values: readonly number[]): number {
  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/** Pixels per RDKit unit for the whole reaction, from its start state. */
export function reactionScale(
  startGraph: StateGraph,
  startCoordinates: MapNumberToCoordinates,
): number {
  const bondLengths: number[] = [];
  for (const key of startGraph.bondToOrder.keys()) {
    const [first, second] = key
      .split("-")
      .map((text) => coordinatesOf(startCoordinates, Number(text)));
    if (first !== undefined && second !== undefined) {
      bondLengths.push(
        Math.hypot((second[0] ?? 0) - (first[0] ?? 0), (second[1] ?? 0) - (first[1] ?? 0)),
      );
    }
  }
  const medianLength = bondLengths.length > 0 ? medianOf(bondLengths) : DEFAULT_BOND_LENGTH_UNITS;
  return BOND_LENGTH_PIXELS / (medianLength > 0 ? medianLength : DEFAULT_BOND_LENGTH_UNITS);
}

/** Each atom's screen point: coordinates times `scale`, y flipped. */
export function screenPoints(
  coordinates: MapNumberToCoordinates,
  scale: number,
): Map<number, Point> {
  const mapNumberToPoint = new Map<number, Point>();
  for (const [mapNumberText, [across = 0, upward = 0]] of Object.entries(coordinates)) {
    // 0 - value keeps a zero coordinate +0 rather than -0.
    mapNumberToPoint.set(Number(mapNumberText), { x: across * scale, y: 0 - upward * scale });
  }
  return mapNumberToPoint;
}

/** The smallest box holding every point, grown by `padding` on each side. */
export function viewBoxAround(points: readonly Point[], padding: number): ViewBox {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs, Number.POSITIVE_INFINITY);
  const minY = Math.min(...ys, Number.POSITIVE_INFINITY);
  if (!Number.isFinite(minX)) {
    return { minX: -padding, minY: -padding, width: 2 * padding, height: 2 * padding };
  }
  return {
    minX: minX - padding,
    minY: minY - padding,
    width: Math.max(...xs) - minX + 2 * padding,
    height: Math.max(...ys) - minY + 2 * padding,
  };
}
