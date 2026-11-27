/**
 * Bond lines in the reaction cards' drawings (SPEC §5 "Drawing in the cards"): each bond cut
 * where it leaves its atoms' label boxes; double bonds SCHEME_DOUBLE_BOND_SPACING apart (in a
 * ring the second line is inside and shortened; beside a labelled terminal atom, as in C=O, the
 * two lines straddle the axis; in a chain the second line goes to the side of the neighbours);
 * triple bonds as three lines; wedges and dashes with the narrow end at the key's first atom.
 */
import type { Point } from "../shared/planeGeometry.js";
import { type LabelBox, clearanceOf } from "./schemeLabels.js";
import {
  SCHEME_BOND_LENGTH,
  type SchemeStateFields,
  type Structure,
  neighboursOf,
  pointOf,
} from "./schemeStructure.js";

export const SCHEME_DOUBLE_BOND_SPACING = 0.18 * SCHEME_BOND_LENGTH;
/** How far a ring's inner line is shortened at each end. */
const INNER_LINE_SHORTENING = 0.15 * SCHEME_BOND_LENGTH;
/** How far a chain double bond's second line is shortened at an unlabelled end. */
const CHAIN_LINE_SHORTENING = 0.12 * SCHEME_BOND_LENGTH;
const WEDGE_HALF_WIDTH = 0.1 * SCHEME_BOND_LENGTH;
const HASH_SPACING = 0.16 * SCHEME_BOND_LENGTH;
/** Half the width of a dash's narrowest hash line. */
const NARROWEST_HASH_HALF_WIDTH = 0.3;
/** The longest ring the double-bond placement looks for. */
const LARGEST_RING = 8;

export interface SchemeLine {
  readonly start: Point;
  readonly end: Point;
}

export interface SchemeWedge {
  readonly style: "wedge" | "dash";
  /** Narrow end first, then the two corners of the wide end. */
  readonly corners: readonly Point[];
  /** A dash's lines across the bond, narrow end first (none for a wedge). */
  readonly hashes: readonly SchemeLine[];
}

/** The lines and wedges of one bond. */
export interface DrawnBondParts {
  readonly lines: readonly SchemeLine[];
  readonly wedges: readonly SchemeWedge[];
}

function pointAlong(point: Point, direction: Point, distance: number): Point {
  return { x: point.x + direction.x * distance, y: point.y + direction.y * distance };
}

/** The atoms of the smallest ring holding the bond, or null if it is in none. */
function ringThrough(structure: Structure, first: number, second: number): number[] | null {
  const cameFrom = new Map<number, number>([[first, first]]);
  let frontier = [first];
  for (let depth = 1; depth < LARGEST_RING && frontier.length > 0; depth += 1) {
    const nextFrontier: number[] = [];
    for (const atom of frontier) {
      for (const neighbour of neighboursOf(structure, atom)) {
        const isTheBond = atom === first && neighbour === second;
        if (isTheBond || cameFrom.has(neighbour)) {
          continue;
        }
        cameFrom.set(neighbour, atom);
        if (neighbour === second) {
          const ring = [second];
          for (
            let atomOnPath = atom;
            atomOnPath !== first;
            atomOnPath = cameFrom.get(atomOnPath) ?? first
          ) {
            ring.push(atomOnPath);
          }
          return [...ring, first];
        }
        nextFrontier.push(neighbour);
      }
    }
    frontier = nextFrontier;
  }
  return null;
}

function centreOf(points: readonly Point[]): Point {
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

/** Which way (along the normal) a double bond's second line goes; 0 straddles the axis. */
function doubleBondSide(
  structure: Structure,
  first: number,
  second: number,
  normal: Point,
  labelled: ReadonlySet<number>,
): { side: number; inRing: boolean } {
  const start = pointOf(structure, first);
  const ring = ringThrough(structure, first, second);
  const sideOf = (point: Point, from: Point): number =>
    Math.sign((point.x - from.x) * normal.x + (point.y - from.y) * normal.y);
  if (ring !== null) {
    const centre = centreOf(ring.map((mapNumber) => pointOf(structure, mapNumber)));
    return { side: sideOf(centre, start) || 1, inRing: true };
  }
  const isLabelledEnd = (atom: number): boolean =>
    labelled.has(atom) && neighboursOf(structure, atom).length === 1;
  if (isLabelledEnd(first) || isLabelledEnd(second)) {
    return { side: 0, inRing: false };
  }
  const sides = [first, second].flatMap((atom) =>
    neighboursOf(structure, atom)
      .filter((neighbour) => neighbour !== first && neighbour !== second)
      .map((neighbour) => sideOf(pointOf(structure, neighbour), pointOf(structure, atom))),
  );
  const total = sides.reduce((sum, side) => sum + side, 0);
  return { side: Math.sign(total) || (sides[0] ?? 0), inRing: false };
}

interface BondEnds {
  readonly start: Point;
  readonly end: Point;
  readonly along: Point;
  readonly normal: Point;
}

function offsetLine(
  ends: BondEnds,
  offset: number,
  startTrim: number,
  endTrim: number,
): SchemeLine {
  const { start, end, along, normal } = ends;
  return {
    start: pointAlong(pointAlong(start, normal, offset), along, startTrim),
    end: pointAlong(pointAlong(end, normal, offset), along, -endTrim),
  };
}

function wedgeOf(style: "wedge" | "dash", ends: BondEnds): SchemeWedge {
  const { start, end, normal } = ends;
  const corners = [
    start,
    pointAlong(end, normal, WEDGE_HALF_WIDTH),
    pointAlong(end, normal, -WEDGE_HALF_WIDTH),
  ];
  if (style === "wedge") {
    return { style, corners, hashes: [] };
  }
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  const count = Math.max(2, Math.floor(length / HASH_SPACING) + 1);
  const hashes = [...Array(count).keys()].map((position) => {
    const fraction = position / (count - 1);
    const centre = {
      x: start.x + (end.x - start.x) * fraction,
      y: start.y + (end.y - start.y) * fraction,
    };
    const halfWidth =
      NARROWEST_HASH_HALF_WIDTH + (WEDGE_HALF_WIDTH - NARROWEST_HASH_HALF_WIDTH) * fraction;
    return {
      start: pointAlong(centre, normal, halfWidth),
      end: pointAlong(centre, normal, -halfWidth),
    };
  });
  return { style, corners, hashes };
}

/** The wedge style of the bond and the atom its narrow end is at, or null for a plain bond. */
function wedgeFor(
  state: SchemeStateFields,
  first: number,
  second: number,
): { style: "wedge" | "dash"; narrowAt: number } | null {
  const table = state.bondToWedgeStyle ?? {};
  for (const [narrowAt, wideAt] of [
    [first, second],
    [second, first],
  ] as const) {
    const key = `${String(narrowAt)}-${String(wideAt)}`;
    if (Object.hasOwn(table, key)) {
      return { style: table[key] ?? "wedge", narrowAt };
    }
  }
  return null;
}

function bondEnds(
  structure: Structure,
  from: number,
  to: number,
  mapNumberToBox: ReadonlyMap<number, LabelBox | null>,
): BondEnds {
  const fromPoint = pointOf(structure, from);
  const toPoint = pointOf(structure, to);
  const length = Math.hypot(toPoint.x - fromPoint.x, toPoint.y - fromPoint.y) || 1;
  const along = { x: (toPoint.x - fromPoint.x) / length, y: (toPoint.y - fromPoint.y) / length };
  const backward = { x: -along.x, y: -along.y };
  return {
    start: pointAlong(fromPoint, along, clearanceOf(mapNumberToBox.get(from) ?? null, along)),
    end: pointAlong(toPoint, along, -clearanceOf(mapNumberToBox.get(to) ?? null, backward)),
    along,
    normal: { x: -along.y, y: along.x },
  };
}

export function bondParts(
  structure: Structure,
  state: SchemeStateFields,
  bond: readonly [number, number, number],
  mapNumberToBox: ReadonlyMap<number, LabelBox | null>,
): DrawnBondParts {
  const [first, second, order] = bond;
  const wedge = order === 1 ? wedgeFor(state, first, second) : null;
  if (wedge !== null) {
    const wideAt = wedge.narrowAt === first ? second : first;
    return {
      lines: [],
      wedges: [wedgeOf(wedge.style, bondEnds(structure, wedge.narrowAt, wideAt, mapNumberToBox))],
    };
  }
  const ends = bondEnds(structure, first, second, mapNumberToBox);
  if (order >= 3) {
    const spacing = SCHEME_DOUBLE_BOND_SPACING * 0.85;
    return {
      lines: [0, spacing, -spacing].map((offset) => offsetLine(ends, offset, 0, 0)),
      wedges: [],
    };
  }
  if (order !== 2) {
    return { lines: [offsetLine(ends, 0, 0, 0)], wedges: [] };
  }
  const labelled = new Set(
    [...mapNumberToBox.entries()].filter(([, box]) => box !== null).map(([atom]) => atom),
  );
  const { side, inRing } = doubleBondSide(structure, first, second, ends.normal, labelled);
  if (side === 0) {
    const half = SCHEME_DOUBLE_BOND_SPACING / 2;
    return { lines: [offsetLine(ends, half, 0, 0), offsetLine(ends, -half, 0, 0)], wedges: [] };
  }
  const shortening = inRing ? INNER_LINE_SHORTENING : CHAIN_LINE_SHORTENING;
  const trimAt = (atom: number): number => (labelled.has(atom) && !inRing ? 0 : shortening);
  return {
    lines: [
      offsetLine(ends, 0, 0, 0),
      offsetLine(ends, side * SCHEME_DOUBLE_BOND_SPACING, trimAt(first), trimAt(second)),
    ],
    wedges: [],
  };
}
