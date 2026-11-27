/**
 * Where the parts of an atom's label go: its implicit-hydrogen text and charge around the
 * element, how far the label reaches (for the view box), and where an annotation sits.
 * Distances are screen pixels at the 19 px label font.
 */
import type { AtomLabelText, HydrogenSide } from "../shared/atomLabels.js";
import { type Point, pointAtAngle } from "../shared/planeGeometry.js";

/** How far an annotation sits from its atom. */
export const ANNOTATION_DISTANCE = 34;
/** Width of one label character at the label font (19 px); the canvas uses it too. */
export const LABEL_CHARACTER_WIDTH = 11;
/** The charge is written at the label's upper right: electron dots keep out of that way. */
export const CHARGE_DIRECTION = -Math.PI / 4;
/** How far above or below the element hydrogens written there sit (centre to centre). */
export const HYDROGEN_ROW_OFFSET = 18;
/** How far above the element's centre the charge is written. */
export const CHARGE_RISE = 9;
export const HYDROGEN_SIDE_TO_ANGLE: Readonly<Record<HydrogenSide, number>> = {
  right: 0,
  left: Math.PI,
  below: Math.PI / 2,
  above: -Math.PI / 2,
};

export interface LabelTextPlacement {
  /** Where the implicit-hydrogen text is written and how it is anchored; null without any. */
  readonly hydrogenTextPoint: Point | null;
  readonly hydrogenTextAnchor: "start" | "middle" | "end";
  /** The charge's left end, at the label's upper right; null for a neutral atom. */
  readonly chargePoint: Point | null;
}

/** Where an atom's hydrogen text and charge are written around its element. */
export function labelTextPlacement(point: Point, labelText: AtomLabelText): LabelTextPlacement {
  const { element, hydrogenText, hydrogenSide, chargeText } = labelText;
  const halfElement = (element.length * LABEL_CHARACTER_WIDTH) / 2;
  const hydrogenSideToPlacement = {
    right: { point: { x: point.x + halfElement, y: point.y }, anchor: "start" },
    left: { point: { x: point.x - halfElement, y: point.y }, anchor: "end" },
    above: { point: { x: point.x, y: point.y - HYDROGEN_ROW_OFFSET }, anchor: "middle" },
    below: { point: { x: point.x, y: point.y + HYDROGEN_ROW_OFFSET }, anchor: "middle" },
  } as const;
  const placement = hydrogenSideToPlacement[hydrogenSide];
  const hasHydrogens = hydrogenText !== "";
  const rightEdge =
    point.x +
    halfElement +
    (hasHydrogens && hydrogenSide === "right" ? hydrogenText.length * LABEL_CHARACTER_WIDTH : 0);
  return {
    hydrogenTextPoint: hasHydrogens ? placement.point : null,
    hydrogenTextAnchor: placement.anchor,
    chargePoint: chargeText === "" ? null : { x: rightEdge + 1, y: point.y - CHARGE_RISE },
  };
}

/**
 * Straight below or above the atom (whichever is further from bonds and dots): a horizontal text
 * label there does not run into the neighbours beside it.
 */
export function annotationPoint(point: Point, takenAngles: readonly number[]): Point {
  const clearance = (direction: number): number =>
    takenAngles.reduce(
      (smallest, angle) =>
        Math.min(
          smallest,
          Math.abs(Math.atan2(Math.sin(angle - direction), Math.cos(angle - direction))),
        ),
      Math.PI,
    );
  const direction = clearance(Math.PI / 2) >= clearance(-Math.PI / 2) ? Math.PI / 2 : -Math.PI / 2;
  return pointAtAngle(point, direction, ANNOTATION_DISTANCE);
}

/** The outer ends of an atom's label text: left and right, and its hydrogen row if any. */
export function labelEnds(point: Point, labelText: AtomLabelText): Point[] {
  const { element, hydrogenText, hydrogenSide, chargeText } = labelText;
  const halfElement = (element.length * LABEL_CHARACTER_WIDTH) / 2;
  const hydrogenWidth = hydrogenText.length * LABEL_CHARACTER_WIDTH;
  const left = point.x - halfElement - (hydrogenSide === "left" ? hydrogenWidth : 0);
  const right =
    point.x +
    halfElement +
    (hydrogenSide === "right" ? hydrogenWidth : 0) +
    chargeText.length * LABEL_CHARACTER_WIDTH;
  const ends = [
    { x: left, y: point.y },
    { x: right, y: point.y },
  ];
  if (hydrogenText !== "" && (hydrogenSide === "above" || hydrogenSide === "below")) {
    const rowOffset = hydrogenSide === "above" ? -HYDROGEN_ROW_OFFSET : HYDROGEN_ROW_OFFSET;
    ends.push({ x: point.x, y: point.y + rowOffset });
  }
  return ends;
}
