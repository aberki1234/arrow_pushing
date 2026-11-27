/**
 * Where atoms new to a state are drawn: clear of the atoms already there, so nothing overlaps
 * until the author tidies the layout. Coordinates are RDKit units (a bond about 1.5 long), y up.
 */

/** Map number (as text) to [x, y]. */
export type Coordinates = Readonly<Record<string, readonly number[]>>;

const GAP = 1.5; // one bond length between the drawing and the new atoms

interface Bounds {
  readonly left: number;
  readonly right: number;
  readonly bottom: number;
  readonly top: number;
}

function boundsOf(coordinates: Coordinates): Bounds | undefined {
  const points = Object.values(coordinates);
  if (points.length === 0) {
    return undefined;
  }
  const xs = points.map((point) => point[0] ?? 0);
  const ys = points.map((point) => point[1] ?? 0);
  return {
    left: Math.min(...xs),
    right: Math.max(...xs),
    bottom: Math.min(...ys),
    top: Math.max(...ys),
  };
}

/**
 * `newAtoms` moved as one piece so that they start one bond length right of `existing` and share
 * its vertical centre. With nothing existing they stay where they are.
 */
export function placedClearOf(
  existing: Coordinates,
  newAtoms: Coordinates,
): Record<string, [number, number]> {
  const existingBounds = boundsOf(existing);
  const newBounds = boundsOf(newAtoms);
  const shiftX =
    existingBounds === undefined || newBounds === undefined
      ? 0
      : existingBounds.right + GAP - newBounds.left;
  const shiftY =
    existingBounds === undefined || newBounds === undefined
      ? 0
      : (existingBounds.bottom + existingBounds.top) / 2 - (newBounds.bottom + newBounds.top) / 2;
  return Object.fromEntries(
    Object.entries(newAtoms).map(([key, [atomX = 0, atomY = 0]]): [string, [number, number]] => [
      key,
      [atomX + shiftX, atomY + shiftY],
    ]),
  );
}

const BOND_LENGTH = 1.5; // RDKit units
const UP = Math.PI / 2;

/**
 * Where to draw a new atom bonded to `mapNumber`: one bond length away, in the middle of the
 * widest angle left free by its neighbours (straight up when it has none). Rounded to 0.01.
 */
export function positionInLargestGap(
  coordinates: Coordinates,
  mapNumber: number,
  neighbourMapNumbers: readonly number[],
): [number, number] {
  const [centreX = 0, centreY = 0] = coordinates[String(mapNumber)] ?? [];
  const angles = neighbourMapNumbers
    .map((neighbour) => coordinates[String(neighbour)])
    .filter((point) => point !== undefined)
    .map(([pointX = 0, pointY = 0]) => Math.atan2(pointY - centreY, pointX - centreX))
    .sort((first, second) => first - second);
  let direction = UP;
  let widestGap = -1;
  angles.forEach((angle, index) => {
    const nextAngle =
      index + 1 < angles.length ? (angles[index + 1] ?? 0) : (angles[0] ?? 0) + 2 * Math.PI;
    if (nextAngle - angle > widestGap) {
      widestGap = nextAngle - angle;
      direction = (angle + nextAngle) / 2;
    }
  });
  const rounded = (value: number): number => Math.round(value * 100) / 100 + 0;
  return [
    rounded(centreX + BOND_LENGTH * Math.cos(direction)),
    rounded(centreY + BOND_LENGTH * Math.sin(direction)),
  ];
}
