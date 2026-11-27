/**
 * Points and directions on the drawing, in screen pixels (x to the right, y down, as in SVG).
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

export function pointBetween(start: Point, end: Point, fraction: number): Point {
  return { x: start.x + (end.x - start.x) * fraction, y: start.y + (end.y - start.y) * fraction };
}

export function distanceBetween(start: Point, end: Point): number {
  return Math.hypot(end.x - start.x, end.y - start.y);
}

/** The direction from `start` to `end` in radians, as Math.atan2 gives it (y down). */
export function angleFrom(start: Point, end: Point): number {
  return Math.atan2(end.y - start.y, end.x - start.x);
}

/** The point `distance` pixels from `origin` in the direction `angle` (radians). */
export function pointAtAngle(origin: Point, angle: number, distance: number): Point {
  return { x: origin.x + Math.cos(angle) * distance, y: origin.y + Math.sin(angle) * distance };
}
