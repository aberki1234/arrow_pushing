/**
 * Where an atom's lone pairs and unpaired electron are drawn: spread evenly through the free arcs
 * between the directions already taken (bonds, the implicit-hydrogen label, the charge). Each arc
 * gets electrons in proportion to its size, so two lone pairs beside one bond sit 120° apart
 * (trigonal) and three sit 90° apart; the unpaired electron takes the first place. Every lone
 * pair on every atom is drawn (decided 2026-11-25): showing only the relevant ones would give the
 * answer away.
 *
 * An author may fix the lone-pair directions of an atom in the state
 * (`mapNumberToLonePairAnglesDegrees`, degrees with y up as in RDKit); then those are used.
 */
export type ElectronDotKind = "lonePair" | "unpairedElectron";

export interface PlacedElectronDot {
  readonly dotKind: ElectronDotKind;
  /** Radians, screen axes (y down). */
  readonly angle: number;
}

const FULL_TURN = 2 * Math.PI;
const STRAIGHT_UP = -Math.PI / 2;
// Gaps closer than this count as equal, so the first one wins whatever the rounding.
const GAP_TOLERANCE = 1e-9;

function normalised(angle: number): number {
  return ((angle % FULL_TURN) + FULL_TURN) % FULL_TURN;
}

/** The direction of the widest free gap left by `occupiedAngles` (straight up when none). */
export function widestGapAngle(occupiedAngles: readonly number[]): number {
  if (occupiedAngles.length === 0) {
    return STRAIGHT_UP;
  }
  const sorted = occupiedAngles.map(normalised).sort((first, second) => first - second);
  let bestMiddle = 0;
  let bestGap = -1;
  sorted.forEach((angle, position) => {
    const next =
      position + 1 < sorted.length ? (sorted[position + 1] ?? 0) : (sorted[0] ?? 0) + FULL_TURN;
    const gap = next - angle;
    if (gap > bestGap + GAP_TOLERANCE) {
      bestGap = gap;
      bestMiddle = angle + gap / 2;
    }
  });
  return normalised(bestMiddle);
}

/** The free arcs between sorted occupied directions: [start angle, width]. */
function freeArcs(occupiedAngles: readonly number[]): [number, number][] {
  const sorted = occupiedAngles.map(normalised).sort((first, second) => first - second);
  return sorted.map((angle, position) => {
    const next =
      position + 1 < sorted.length ? (sorted[position + 1] ?? 0) : (sorted[0] ?? 0) + FULL_TURN;
    return [angle, next - angle];
  });
}

/** `count` directions spread evenly: round a free atom from straight up, or through its arcs. */
function spreadDirections(occupiedAngles: readonly number[], count: number): number[] {
  if (count === 0) {
    return [];
  }
  if (occupiedAngles.length === 0) {
    return Array.from({ length: count }, (unusedEntry, slot) =>
      normalised(STRAIGHT_UP + (FULL_TURN * slot) / count),
    );
  }
  const arcs = freeArcs(occupiedAngles);
  const arcCounts = arcs.map(() => 0);
  for (let placed = 0; placed < count; placed++) {
    // The arc whose spacing stays widest with one more electron in it.
    let bestArc = 0;
    arcs.forEach(([, width], arcIndex) => {
      const [, bestWidth] = arcs[bestArc] ?? [0, 0];
      const spacing = width / ((arcCounts[arcIndex] ?? 0) + 2);
      if (spacing > bestWidth / ((arcCounts[bestArc] ?? 0) + 2) + GAP_TOLERANCE) {
        bestArc = arcIndex;
      }
    });
    arcCounts[bestArc] = (arcCounts[bestArc] ?? 0) + 1;
  }
  return arcs.flatMap(([start, width], arcIndex) => {
    const inArc = arcCounts[arcIndex] ?? 0;
    return Array.from({ length: inArc }, (unusedEntry, slot) =>
      normalised(start + (width * (slot + 1)) / (inArc + 1)),
    );
  });
}

/**
 * The direction of each lone pair and unpaired electron. `occupiedAngles` are the bond
 * directions plus the hydrogen label's and the charge's directions. `authoredLonePairDegrees`
 * (y up) fixes lone-pair directions when given; electrons beyond those are spread
 * automatically.
 */
export function placeElectronDots(
  occupiedAngles: readonly number[],
  lonePairCount: number,
  unpairedElectronCount: number,
  authoredLonePairDegrees: readonly number[] = [],
): PlacedElectronDot[] {
  const authoredAngles = authoredLonePairDegrees
    .slice(0, lonePairCount)
    .map((degrees) => normalised((-degrees * Math.PI) / 180));
  const spreadCount = unpairedElectronCount + lonePairCount - authoredAngles.length;
  const spread = spreadDirections([...occupiedAngles, ...authoredAngles], spreadCount);
  return [
    ...spread
      .slice(0, unpairedElectronCount)
      .map((angle): PlacedElectronDot => ({ dotKind: "unpairedElectron", angle })),
    ...authoredAngles.map((angle): PlacedElectronDot => ({ dotKind: "lonePair", angle })),
    ...spread
      .slice(unpairedElectronCount)
      .map((angle): PlacedElectronDot => ({ dotKind: "lonePair", angle })),
  ];
}
