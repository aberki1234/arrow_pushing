/**
 * The lines of a bond between two labelled atoms: one, two or three parallel lines, each cut
 * short so it starts and ends outside the atom labels. A wedge or dash (display only, stereo is
 * not validated) is drawn on a single bond with its wide end at the second atom.
 */
import type { Point } from "../shared/planeGeometry.js";

export const LABEL_CLEARANCE_PIXELS = 11;
export const MULTIPLE_BOND_SPACING_PIXELS = 6;

export interface LineSegment {
  readonly start: Point;
  readonly end: Point;
}

export type WedgeStyle = "wedge" | "dash";

export interface BondLines {
  /** Parallel lines, centre line first for odd orders. Empty for a wedge or dash. */
  readonly lines: readonly LineSegment[];
  /**
   * The wedge's or dash's outline (narrow end at the first atom), and for a dash its hash lines
   * across the bond, each a little wider than the one before (none for a wedge).
   */
  readonly wedge: {
    readonly style: WedgeStyle;
    readonly corners: readonly Point[];
    readonly hashes: readonly LineSegment[];
  } | null;
  readonly midpoint: Point;
}

const WEDGE_HALF_WIDTH_PIXELS = 3.5;
/** Space between a dash's hash lines along the bond. */
const HASH_SPACING_PIXELS = 4.5;
/** Half the width of the narrowest hash line, at the narrow end. */
const NARROWEST_HASH_HALF_WIDTH_PIXELS = 0.8;

/** A dash's hash lines from `start` (narrow) to `end` (wide), across the bond. */
function hashLines(start: Point, end: Point, normal: Point): LineSegment[] {
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  const count = Math.max(2, Math.floor(length / HASH_SPACING_PIXELS) + 1);
  return [...Array(count).keys()].map((position) => {
    const fraction = position / (count - 1);
    const centre = {
      x: start.x + (end.x - start.x) * fraction,
      y: start.y + (end.y - start.y) * fraction,
    };
    const halfWidth =
      NARROWEST_HASH_HALF_WIDTH_PIXELS +
      (WEDGE_HALF_WIDTH_PIXELS - NARROWEST_HASH_HALF_WIDTH_PIXELS) * fraction;
    return {
      start: { x: centre.x + normal.x * halfWidth, y: centre.y + normal.y * halfWidth },
      end: { x: centre.x - normal.x * halfWidth, y: centre.y - normal.y * halfWidth },
    };
  });
}

function offsetLine(start: Point, end: Point, normal: Point, offset: number): LineSegment {
  return {
    start: { x: start.x + normal.x * offset, y: start.y + normal.y * offset },
    end: { x: end.x + normal.x * offset, y: end.y + normal.y * offset },
  };
}

function lineOffsets(bondOrder: number): number[] {
  if (bondOrder >= 3) {
    return [0, -MULTIPLE_BOND_SPACING_PIXELS, MULTIPLE_BOND_SPACING_PIXELS];
  }
  return bondOrder === 2
    ? [-MULTIPLE_BOND_SPACING_PIXELS / 2, MULTIPLE_BOND_SPACING_PIXELS / 2]
    : [0];
}

export function bondLines(
  firstPoint: Point,
  secondPoint: Point,
  bondOrder: number,
  wedgeStyle: WedgeStyle | null = null,
): BondLines {
  const length = Math.hypot(secondPoint.x - firstPoint.x, secondPoint.y - firstPoint.y) || 1;
  const along = {
    x: (secondPoint.x - firstPoint.x) / length,
    y: (secondPoint.y - firstPoint.y) / length,
  };
  const normal = { x: 0 - along.y, y: along.x };
  const start = {
    x: firstPoint.x + along.x * LABEL_CLEARANCE_PIXELS,
    y: firstPoint.y + along.y * LABEL_CLEARANCE_PIXELS,
  };
  const end = {
    x: secondPoint.x - along.x * LABEL_CLEARANCE_PIXELS,
    y: secondPoint.y - along.y * LABEL_CLEARANCE_PIXELS,
  };
  const midpoint = {
    x: (firstPoint.x + secondPoint.x) / 2,
    y: (firstPoint.y + secondPoint.y) / 2,
  };
  if (wedgeStyle !== null && bondOrder === 1) {
    const corners = [
      start,
      offsetLine(end, end, normal, WEDGE_HALF_WIDTH_PIXELS).start,
      offsetLine(end, end, normal, -WEDGE_HALF_WIDTH_PIXELS).start,
    ];
    const hashes = wedgeStyle === "dash" ? hashLines(start, end, normal) : [];
    return { lines: [], wedge: { style: wedgeStyle, corners, hashes }, midpoint };
  }
  const lines = lineOffsets(bondOrder).map((offset) => offsetLine(start, end, normal, offset));
  return { lines, wedge: null, midpoint };
}
