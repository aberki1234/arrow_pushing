/**
 * Stereo on the page (item 12c, docs/stereo-validation.md phase 1): reading a stereocentre's mark
 * from its wedges and dashes, a double bond's cis/trans from the coordinates, and choosing wedges
 * that show a state's marks. The SMILES marks are the truth; the drawing must agree (the linter's
 * wedges-disagree-with-smiles), and the editor fills wedges from the marks.
 *
 * Reading a stereocentre
 *   Each neighbour is a direction in space: its direction on the page (unit length), raised
 *   toward the viewer (+1) when a wedge starts at the centre and goes to it, lowered (-1) for a
 *   dash, flat otherwise. Only a wedge whose narrow end is at the centre counts. An implicit H or
 *   lone pair points opposite the drawn neighbours: back across the page, and behind it when the
 *   wedges lean forward (in front when they lean back).
 *   With the neighbours in canonical order (stereoMarks.ts) as n1..n4, the sign of the volume
 *   det[n2 - n1, n3 - n1, n4 - n1] gives the mark: negative is "@" (seen from n1 the others run
 *   anticlockwise). stereoDrawing.test.ts works one case by hand; the RDKit agreement test checks
 *   many.
 *
 * Reading a double bond D=E
 *   The reference neighbours (stereoMarks.ts: each end's lowest-numbered other neighbour) are cis
 *   when they lie on the same side of the line through D and E.
 */
import {
  IMPLICIT_NEIGHBOUR,
  stereocentreNeighbours,
} from "../../../core/stateGraphs/stereoMarks.js";
import {
  bondKeyMapNumbers,
  bondedNeighbours,
  type DoubleBondRelation,
  type StateGraph,
  type TetrahedralMark,
} from "../../../core/stateGraphs/stateGraph.js";
import type { MapNumberToCoordinates } from "./drawingLayout.js";

export type WedgeStyle = "wedge" | "dash";
/** Keyed "<narrow end>-<wide end>" by map number, as a state's bondToWedgeStyle. */
export type BondToWedgeStyle = Readonly<Record<string, WedgeStyle>>;

type SpaceVector = readonly [number, number, number];

// Below these the drawing does not say: neighbours on top of each other, or atoms in a line.
const SMALLEST_READABLE_VOLUME = 1e-6;
const SMALLEST_READABLE_SIDE = 1e-6;
// A sum of directions shorter than this points nowhere (e.g. three bonds 120 degrees apart).
const SHORTEST_MEANINGFUL_SUM = 0.3;

const STYLE_TO_HEIGHT: Readonly<Record<WedgeStyle, number>> = { wedge: 1, dash: -1 };

function pointOf(coordinates: MapNumberToCoordinates, mapNumber: number): [number, number] {
  const [across = 0, up = 0] = coordinates[String(mapNumber)] ?? [];
  return [across, up];
}

/** The direction from the centre to a drawn neighbour, raised or lowered by its wedge. */
function neighbourDirection(
  centre: number,
  neighbour: number,
  coordinates: MapNumberToCoordinates,
  wedges: BondToWedgeStyle,
): SpaceVector {
  const [centreAcross, centreUp] = pointOf(coordinates, centre);
  const [across, up] = pointOf(coordinates, neighbour);
  const length = Math.hypot(across - centreAcross, up - centreUp) || 1;
  const style = wedges[`${String(centre)}-${String(neighbour)}`];
  const height = style === undefined ? 0 : STYLE_TO_HEIGHT[style];
  return [(across - centreAcross) / length, (up - centreUp) / length, height];
}

/** Where an implicit H or lone pair points: away from the drawn neighbours (module comment). */
function implicitDirection(drawn: readonly SpaceVector[]): SpaceVector {
  const sum = drawn.reduce<[number, number, number]>(
    (total, [across, up, height]) => [total[0] + across, total[1] + up, total[2] + height],
    [0, 0, 0],
  );
  const flatLength = Math.hypot(sum[0], sum[1]);
  const flat: [number, number] =
    flatLength < SHORTEST_MEANINGFUL_SUM ? [0, 0] : [-sum[0] / flatLength, -sum[1] / flatLength];
  return [flat[0], flat[1], -Math.sign(sum[2])];
}

function difference(first: SpaceVector, second: SpaceVector): SpaceVector {
  return [first[0] - second[0], first[1] - second[1], first[2] - second[2]];
}

function determinant(first: SpaceVector, second: SpaceVector, third: SpaceVector): number {
  return (
    first[0] * (second[1] * third[2] - second[2] * third[1]) -
    first[1] * (second[0] * third[2] - second[2] * third[0]) +
    first[2] * (second[0] * third[1] - second[1] * third[0])
  );
}

function hasWedgeAt(centre: number, wedges: BondToWedgeStyle): boolean {
  const prefix = `${String(centre)}-`;
  return Object.keys(wedges).some((key) => key.startsWith(prefix));
}

/**
 * The mark the drawing shows at `centre`, or undefined when no wedge or dash starts there, the
 * centre does not have four neighbours (counting an implicit H or lone pair), or the drawing is
 * flat. `coordinates` are the state's (y up).
 */
export function drawnTetrahedralMark(
  graph: StateGraph,
  centre: number,
  coordinates: MapNumberToCoordinates,
  wedges: BondToWedgeStyle,
): TetrahedralMark | undefined {
  const neighbours = stereocentreNeighbours(graph, centre);
  if (neighbours.length !== 4 || !hasWedgeAt(centre, wedges)) {
    return undefined;
  }
  const drawn = neighbours
    .filter((neighbour) => neighbour !== IMPLICIT_NEIGHBOUR)
    .map((neighbour) => neighbourDirection(centre, neighbour, coordinates, wedges));
  const directions =
    neighbours[0] === IMPLICIT_NEIGHBOUR ? [implicitDirection(drawn), ...drawn] : drawn;
  const [first, second, third, fourth] = directions;
  if (first === undefined || second === undefined || third === undefined || fourth === undefined) {
    return undefined;
  }
  const volume = determinant(
    difference(second, first),
    difference(third, first),
    difference(fourth, first),
  );
  if (Math.abs(volume) < SMALLEST_READABLE_VOLUME) {
    return undefined;
  }
  return volume < 0 ? "@" : "@@";
}

/** The mark the drawing shows at every atom a wedge or dash starts from (and that has one). */
export function tetrahedralMarksFromDrawing(
  graph: StateGraph,
  coordinates: MapNumberToCoordinates,
  wedges: BondToWedgeStyle,
): Map<number, TetrahedralMark> {
  const centres = [...new Set(Object.keys(wedges).map((key) => bondKeyMapNumbers(key)[0]))];
  const marks = new Map<number, TetrahedralMark>();
  for (const centre of centres.sort((first, second) => first - second)) {
    const mark = drawnTetrahedralMark(graph, centre, coordinates, wedges);
    if (mark !== undefined) {
      marks.set(centre, mark);
    }
  }
  return marks;
}

/** Which side of the line from `start` through `end` the point lies: +1, -1, or 0 on it. */
function sideOf(
  start: readonly [number, number],
  end: readonly [number, number],
  point: readonly [number, number],
): number {
  const cross =
    (end[0] - start[0]) * (point[1] - start[1]) - (end[1] - start[1]) * (point[0] - start[0]);
  return Math.abs(cross) < SMALLEST_READABLE_SIDE ? 0 : Math.sign(cross);
}

function referenceNeighbour(graph: StateGraph, end: number, partner: number): number | undefined {
  const others = bondedNeighbours(graph, end)
    .map((neighbour) => neighbour.mapNumber)
    .filter((neighbour) => neighbour !== partner);
  return others.length === 0 ? undefined : Math.min(...others);
}

/**
 * The relation the coordinates show for the double bond `key` (bondKey), or undefined when an
 * end has no other neighbour or a reference neighbour lies on the line.
 */
export function drawnDoubleBondRelation(
  graph: StateGraph,
  key: string,
  coordinates: MapNumberToCoordinates,
): DoubleBondRelation | undefined {
  const [first, second] = bondKeyMapNumbers(key);
  const firstReference = referenceNeighbour(graph, first, second);
  const secondReference = referenceNeighbour(graph, second, first);
  if (firstReference === undefined || secondReference === undefined) {
    return undefined;
  }
  const start = pointOf(coordinates, first);
  const end = pointOf(coordinates, second);
  const firstSide = sideOf(start, end, pointOf(coordinates, firstReference));
  const secondSide = sideOf(start, end, pointOf(coordinates, secondReference));
  if (firstSide === 0 || secondSide === 0) {
    return undefined;
  }
  return firstSide === secondSide ? "cis" : "trans";
}

/**
 * The size of the smallest ring the bond lies in (the shortest other path between its ends, plus
 * one), or 0 when it is in no ring.
 */
function smallestRingSize(graph: StateGraph, first: number, second: number): number {
  const distance = new Map([[first, 0]]);
  const queue = [first];
  for (let position = 0; position < queue.length; position++) {
    const current = queue[position] ?? first;
    for (const { mapNumber } of bondedNeighbours(graph, current)) {
      const isTheBond = current === first && mapNumber === second;
      if (isTheBond || distance.has(mapNumber)) {
        continue;
      }
      const reached = (distance.get(current) ?? 0) + 1;
      if (mapNumber === second) {
        return reached + 1;
      }
      distance.set(mapNumber, reached);
      queue.push(mapNumber);
    }
  }
  return 0;
}

/**
 * The neighbours of `centre` whose bond may carry its wedge, best first: a drawn H, then an atom
 * with no mark of its own, a bond out of any ring, else one in the smallest ring (the C–O of an
 * epoxide, the C–Br of a bromonium ion), a carbon (so the bond to a leaving group or a
 * nucleophile stays flat where it can), fewer neighbours, a lower map number. A bond that already
 * carries the other end's wedge is left out.
 */
function wedgeCandidates(graph: StateGraph, centre: number, wedges: BondToWedgeStyle): number[] {
  const marks = graph.mapNumberToTetrahedralMark ?? new Map<number, TetrahedralMark>();
  const rank = (neighbour: number): number[] => [
    graph.mapNumberToAtom.get(neighbour)?.element === "H" ? 0 : 1,
    marks.has(neighbour) ? 1 : 0,
    smallestRingSize(graph, centre, neighbour),
    graph.mapNumberToAtom.get(neighbour)?.element === "C" ? 0 : 1,
    bondedNeighbours(graph, neighbour).length,
    neighbour,
  ];
  const compareRanks = (first: number, second: number): number => {
    const firstRank = rank(first);
    const secondRank = rank(second);
    const position = firstRank.findIndex((value, index) => value !== secondRank[index]);
    return position < 0 ? 0 : (firstRank[position] ?? 0) - (secondRank[position] ?? 0);
  };
  return bondedNeighbours(graph, centre)
    .filter((neighbour) => neighbour.bondOrder === 1)
    .map((neighbour) => neighbour.mapNumber)
    .filter((neighbour) => wedges[`${String(neighbour)}-${String(centre)}`] === undefined)
    .sort(compareRanks);
}

/** The wedges with every wedge or dash starting at `centre` taken out. */
function withoutWedgesAt(wedges: BondToWedgeStyle, centre: number): Record<string, WedgeStyle> {
  const prefix = `${String(centre)}-`;
  return Object.fromEntries(Object.entries(wedges).filter(([key]) => !key.startsWith(prefix)));
}

/** One wedge or dash at `centre` that shows `mark`, added to `wedges`; unchanged if none does. */
function withWedgeShowing(
  graph: StateGraph,
  centre: number,
  mark: TetrahedralMark,
  coordinates: MapNumberToCoordinates,
  wedges: Record<string, WedgeStyle>,
): Record<string, WedgeStyle> {
  for (const neighbour of wedgeCandidates(graph, centre, wedges)) {
    for (const style of ["wedge", "dash"] as const) {
      const tried = { ...wedges, [`${String(centre)}-${String(neighbour)}`]: style };
      if (drawnTetrahedralMark(graph, centre, coordinates, tried) === mark) {
        return tried;
      }
    }
  }
  return wedges;
}

/**
 * Wedges and dashes that show every stereocentre mark of `graph`: wedges at a marked centre that
 * already show its mark are kept, others replaced by one wedge or dash, and wedges starting at an
 * atom with no mark are removed.
 */
export function wedgesForMarks(
  graph: StateGraph,
  coordinates: MapNumberToCoordinates,
  wedges: BondToWedgeStyle,
): Record<string, WedgeStyle> {
  const marks = graph.mapNumberToTetrahedralMark ?? new Map<number, TetrahedralMark>();
  let result: Record<string, WedgeStyle> = Object.fromEntries(
    Object.entries(wedges).filter(([key]) => marks.has(bondKeyMapNumbers(key)[0])),
  );
  for (const [centre, mark] of [...marks].sort(([first], [second]) => first - second)) {
    if (drawnTetrahedralMark(graph, centre, coordinates, result) !== mark) {
      result = withWedgeShowing(graph, centre, mark, coordinates, withoutWedgesAt(result, centre));
    }
  }
  return result;
}
