/**
 * Where the "which atom forms the bond?" badges and menu are drawn (learnerSite/MoleculeCanvas
 * .svelte). The drawing shows no map numbers, so each candidate atom gets a badge (① ②) that the
 * menu names; neither the badges nor the menu may hide what the learner is choosing between.
 *
 * Steps
 *   1. Crowded points: every atom, the ends of its label, points along each bond, electron dots.
 *   2. A badge goes at BADGE_DISTANCE from its atom, in the direction of eight (up first) whose
 *      spot is farthest from every crowded point.
 *   3. The menu goes in one of four corners beside the tapped atom (up-right first, as before):
 *      the first that covers none of the points to keep clear (the candidate atoms and their
 *      badges), else the one covering the fewest crowded points.
 */
import { labelEnds } from "./labelPlacement.js";
import type { Point } from "./planeGeometry.js";
import { type StateDrawing, drawnAtomOf } from "./stateDrawing.js";

const BADGE_DISTANCE = 22;
const MENU_OFFSET = 22;
const MENU_MARGIN = 10;
const POINTS_ALONG_BOND = [0.25, 0.5, 0.75];

/** Up, then clockwise in screen axes (y down). */
const BADGE_DIRECTIONS: readonly Point[] = [
  { x: 0, y: -1 },
  { x: Math.SQRT1_2, y: -Math.SQRT1_2 },
  { x: -Math.SQRT1_2, y: -Math.SQRT1_2 },
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: Math.SQRT1_2, y: Math.SQRT1_2 },
  { x: -Math.SQRT1_2, y: Math.SQRT1_2 },
  { x: 0, y: 1 },
];

export interface MenuSize {
  readonly width: number;
  readonly height: number;
}

function crowdedPoints(drawing: StateDrawing): Point[] {
  const atomPoints = drawing.atoms.flatMap((atom) => [
    atom.point,
    ...labelEnds(atom.point, atom.labelText),
  ]);
  const bondPoints = drawing.bonds.flatMap((bond) => {
    const [first, second] = bond.mapNumbers.map(
      (mapNumber) => drawnAtomOf(drawing, mapNumber).point,
    );
    if (first === undefined || second === undefined) {
      return [];
    }
    return POINTS_ALONG_BOND.map((fraction) => ({
      x: first.x + (second.x - first.x) * fraction,
      y: first.y + (second.y - first.y) * fraction,
    }));
  });
  const dotPoints = drawing.electronDots.flatMap((dot) => dot.dotPoints);
  return [...atomPoints, ...bondPoints, ...dotPoints];
}

function clearance(point: Point, crowded: readonly Point[]): number {
  return Math.min(...crowded.map((other) => Math.hypot(point.x - other.x, point.y - other.y)));
}

/** The centre of the badge on the atom with `mapNumber`. */
export function choiceBadgePoint(drawing: StateDrawing, mapNumber: number): Point {
  const atomPoint = drawnAtomOf(drawing, mapNumber).point;
  const crowded = crowdedPoints(drawing);
  let best = { point: atomPoint, clearance: -1 };
  for (const direction of BADGE_DIRECTIONS) {
    const point = {
      x: atomPoint.x + direction.x * BADGE_DISTANCE,
      y: atomPoint.y + direction.y * BADGE_DISTANCE,
    };
    const pointClearance = clearance(point, crowded);
    if (pointClearance > best.clearance + 0.5) {
      best = { point, clearance: pointClearance };
    }
  }
  return best.point;
}

function pointsInside(origin: Point, size: MenuSize, points: readonly Point[]): number {
  return points.filter(
    (point) =>
      point.x >= origin.x - MENU_MARGIN &&
      point.x <= origin.x + size.width + MENU_MARGIN &&
      point.y >= origin.y - MENU_MARGIN &&
      point.y <= origin.y + size.height + MENU_MARGIN,
  ).length;
}

/** The menu's top-left corner, beside the atom with `anchorMapNumber`. */
export function choiceMenuOrigin(
  drawing: StateDrawing,
  anchorMapNumber: number,
  keepClear: readonly Point[],
  size: MenuSize,
): Point {
  const anchor = drawnAtomOf(drawing, anchorMapNumber).point;
  const right = anchor.x + MENU_OFFSET;
  const left = anchor.x - MENU_OFFSET - size.width;
  const up = anchor.y - MENU_OFFSET - size.height;
  const down = anchor.y + MENU_OFFSET;
  const corners: Point[] = [
    { x: right, y: up },
    { x: right, y: down },
    { x: left, y: up },
    { x: left, y: down },
  ];
  const crowded = crowdedPoints(drawing);
  const clearCorners = corners.filter((corner) => pointsInside(corner, size, keepClear) === 0);
  const choices = clearCorners.length > 0 ? clearCorners : corners;
  return choices.reduce((best, corner) =>
    pointsInside(corner, size, crowded) < pointsInside(best, size, crowded) ? corner : best,
  );
}
