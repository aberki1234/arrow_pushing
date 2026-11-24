/**
 * The lines of a bond between two labelled atoms: one, two or three parallel lines, each cut
 * short so it starts and ends outside the atom labels. A wedge or dash (display only, stereo is
 * not validated) is drawn on a single bond with its wide end at the second atom.
 */
import type { Point } from "./planeGeometry.js";

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
  /** The wedge's or dash's outline: narrow end at the first atom. */
  readonly wedge: { readonly style: WedgeStyle; readonly corners: readonly Point[] } | null;
  readonly midpoint: Point;
}

const WEDGE_HALF_WIDTH_PIXELS = 3.5;

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
    return { lines: [], wedge: { style: wedgeStyle, corners }, midpoint };
  }
  const lines = lineOffsets(bondOrder).map((offset) => offsetLine(start, end, normal, offset));
  return { lines, wedge: null, midpoint };
}
