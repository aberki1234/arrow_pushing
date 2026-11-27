/**
 * Where a curved arrow is drawn: from its source locus to its destination locus, as a quadratic
 * Bézier bent away from the centre of the molecule (decided 2026-11-25).
 *
 * Anchors
 *   lp X (source)        the lone pair of X that faces the other end
 *   rad X (source)       X's unpaired-electron dot
 *   σ / π bond (source)  the bond's midpoint
 *   π X-Y (destination)  the existing bond's midpoint
 *   σ X-Y (destination)  a new bond: near the atom being bonded to (the one not in the source)
 *                        for a pair arrow; the midpoint of X and Y for a fish-hook, so that the
 *                        two fish-hooks forming one bond meet in the middle
 *   lp / rad X (dest.)   just outside X, in its widest free gap
 */
import type {
  CurvedArrow,
  ElectronLocus,
} from "../../../core/arrowNotation/curvedArrowNotation.js";
import { widestGapAngle } from "./electronDotPlacement.js";
import {
  type Point,
  angleFrom,
  distanceBetween,
  pointAtAngle,
  pointBetween,
} from "../shared/planeGeometry.js";
import { type StateDrawing, drawnAtomOf } from "./stateDrawing.js";

/** How far the middle of an arrow bends out, as a fraction of its length, and at least this. */
export const ARROW_BEND_FRACTION = 0.4;
export const MINIMUM_ARROW_BEND_PIXELS = 22;
/** How far an arrow stops short of an atom it points at. */
export const ARROW_END_CLEARANCE_PIXELS = 13;

export interface DrawnCurvedArrow {
  readonly start: Point;
  readonly control: Point;
  readonly end: Point;
  /** SVG path data, "M x y Q cx cy ex ey". */
  readonly pathData: string;
  readonly electronsMoved: 1 | 2;
}

function bondMidpoint(drawing: StateDrawing, first: number, second: number): Point {
  const bond = drawing.bonds.find(
    (candidate) =>
      (candidate.mapNumbers[0] === first && candidate.mapNumbers[1] === second) ||
      (candidate.mapNumbers[0] === second && candidate.mapNumbers[1] === first),
  );
  return (
    bond?.bondLines.midpoint ??
    pointBetween(drawnAtomOf(drawing, first).point, drawnAtomOf(drawing, second).point, 0.5)
  );
}

function locusMapNumbers(locus: ElectronLocus): number[] {
  return locus.atoms.map((atom) => atom.mapNumber);
}

/** Just outside atom `mapNumber`, in its widest gap between bonds and electron dots. */
function freeSpotBeside(drawing: StateDrawing, mapNumber: number): Point {
  const point = drawnAtomOf(drawing, mapNumber).point;
  const occupied = [
    ...drawing.bonds
      .filter((bond) => bond.mapNumbers.includes(mapNumber))
      .map((bond) => {
        const other = bond.mapNumbers[0] === mapNumber ? bond.mapNumbers[1] : bond.mapNumbers[0];
        return angleFrom(point, drawnAtomOf(drawing, other).point);
      }),
    ...drawing.electronDots.filter((dot) => dot.mapNumber === mapNumber).map((dot) => dot.angle),
  ];
  return pointAtAngle(point, widestGapAngle(occupied), ARROW_END_CLEARANCE_PIXELS);
}

function destinationAnchor(drawing: StateDrawing, curvedArrow: CurvedArrow): Point {
  const { destination, source, electronsMoved } = curvedArrow;
  const [first, second] = locusMapNumbers(destination);
  if (
    destination.locusKind === "lonePair" ||
    destination.locusKind === "unpairedElectron" ||
    second === undefined ||
    first === undefined
  ) {
    return freeSpotBeside(drawing, first ?? 0);
  }
  if (destination.locusKind === "piBond") {
    return bondMidpoint(drawing, first, second);
  }
  const firstPoint = drawnAtomOf(drawing, first).point;
  const secondPoint = drawnAtomOf(drawing, second).point;
  if (electronsMoved === 1) {
    return pointBetween(firstPoint, secondPoint, 0.5);
  }
  const attackedIsFirst =
    !locusMapNumbers(source).includes(first) && locusMapNumbers(source).includes(second);
  const [attacked, partner] = attackedIsFirst
    ? [firstPoint, secondPoint]
    : [secondPoint, firstPoint];
  return pointAtAngle(attacked, angleFrom(attacked, partner), ARROW_END_CLEARANCE_PIXELS);
}

/** The centre of atom `mapNumber`'s dot of `dotKind` that faces `towards` most directly. */
function facingDotCenter(
  drawing: StateDrawing,
  mapNumber: number,
  dotKind: string,
  towards: Point,
): Point | undefined {
  const direction = angleFrom(drawnAtomOf(drawing, mapNumber).point, towards);
  let best: { center: Point; facing: number } | undefined;
  for (const dot of drawing.electronDots) {
    if (dot.mapNumber === mapNumber && dot.dotKind === dotKind) {
      const facing = Math.cos(dot.angle - direction);
      if (best === undefined || facing > best.facing) {
        best = { center: dot.center, facing };
      }
    }
  }
  return best?.center;
}

function sourceAnchor(drawing: StateDrawing, curvedArrow: CurvedArrow, towards: Point): Point {
  const { source } = curvedArrow;
  const [first = 0, second = 0] = locusMapNumbers(source);
  if (source.locusKind === "sigmaBond" || source.locusKind === "piBond") {
    return bondMidpoint(drawing, first, second);
  }
  return (
    facingDotCenter(drawing, first, source.locusKind, towards) ?? drawnAtomOf(drawing, first).point
  );
}

function formatted(value: number): string {
  return value.toFixed(1);
}

export function drawCurvedArrow(drawing: StateDrawing, curvedArrow: CurvedArrow): DrawnCurvedArrow {
  const end = destinationAnchor(drawing, curvedArrow);
  const start = sourceAnchor(drawing, curvedArrow, end);
  const length = distanceBetween(start, end);
  const middle = pointBetween(start, end, 0.5);
  const bend = Math.max(MINIMUM_ARROW_BEND_PIXELS, ARROW_BEND_FRACTION * length);
  // The unit normal to start→end; straight up when the two ends coincide.
  const normal =
    length > 0 ? { x: (start.y - end.y) / length, y: (end.x - start.x) / length } : { x: 0, y: -1 };
  const centroidSide =
    (drawing.centroid.x - middle.x) * normal.x + (drawing.centroid.y - middle.y) * normal.y;
  const sign = centroidSide > 0 ? -1 : 1;
  const control = { x: middle.x + normal.x * bend * sign, y: middle.y + normal.y * bend * sign };
  const pathData =
    `M ${formatted(start.x)} ${formatted(start.y)} ` +
    `Q ${formatted(control.x)} ${formatted(control.y)} ${formatted(end.x)} ${formatted(end.y)}`;
  return { start, control, end, pathData, electronsMoved: curvedArrow.electronsMoved };
}
