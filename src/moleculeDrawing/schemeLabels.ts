/**
 * Atom labels in the reaction cards' drawings (SPEC §5 "Drawing in the cards"): which atoms are
 * labelled, where each label is written, and the box a bond stops short of.
 *
 * Skeletal: carbons are unlabelled, except a lone carbon, a charged carbon with fewer than two
 * carbon neighbours, or a carbon bonded only to heteroatoms in a species of at most two heavy
 * atoms (H₃C–Br); a charged carbon inside a carbon skeleton shows only its charge. Hydrogens go
 * beside the element as atomLabelText decides (right, left, or in a row above or below), first
 * for a lone O, S or halogen (H₂O, HBr, HO⁻); the element is centred on its atom. A label's box
 * holds its charge, so a bond to that side stops short of it.
 */
import { formalCharge } from "../stateGraphs/stateGraph.js";
import { type AtomLabelText, atomLabelText } from "./atomLabels.js";
import type { Point } from "./planeGeometry.js";
import { SCHEME_FONT_SIZE, type TextRun, runsWidth, textRuns } from "./schemeText.js";
import { type Structure, atomOf, neighboursOf, pointOf } from "./schemeStructure.js";

/** Space left between a bond's end and a label's box. */
const LABEL_MARGIN = 1.6;
/** Half the height of a capital letter: a label's box reaches this far above and below. */
export const LABEL_HALF_HEIGHT = 0.36 * SCHEME_FONT_SIZE;
/** Where a charge written alone sits from its atom's vertex. */
const LONE_CHARGE_OFFSET = { x: 1.5, y: 2 };
/** Elements written hydrogens first when they stand alone: H₂O, H₂S, HBr, HO⁻. */
const HYDROGENS_FIRST_ELEMENTS = new Set(["O", "S", "F", "Cl", "Br", "I"]);

/** Text written from (x, baselineY), left-aligned, at SCHEME_FONT_SIZE. */
export interface SchemeLabel {
  readonly mapNumber: number;
  readonly x: number;
  readonly baselineY: number;
  readonly runs: readonly TextRun[];
}

/** The label's box around its atom: how far it reaches left, right, up and down. */
export interface LabelBox {
  readonly left: number;
  readonly right: number;
  readonly up: number;
  readonly down: number;
}

/** The labels written for one atom (two with a hydrogen row) and its box (null: none). */
export interface PlacedLabel {
  readonly labels: readonly SchemeLabel[];
  readonly box: LabelBox | null;
}

interface LabelPlan {
  readonly labelText: AtomLabelText;
  /** A charged carbon inside a carbon skeleton: only its charge is written. */
  readonly chargeOnly: boolean;
}

function heavyAtomCount(structure: Structure, part: readonly number[]): number {
  return part.filter((mapNumber) => atomOf(structure, mapNumber).element !== "H").length;
}

function bondAnglesOf(structure: Structure, mapNumber: number): number[] {
  const point = pointOf(structure, mapNumber);
  return neighboursOf(structure, mapNumber).map((neighbour) => {
    const other = pointOf(structure, neighbour);
    return Math.atan2(other.y - point.y, other.x - point.x);
  });
}

/** What the atom's label says, or null for an unlabelled carbon. */
function labelPlanOf(
  structure: Structure,
  mapNumber: number,
  part: readonly number[],
): LabelPlan | null {
  const groupLabel = structure.mapNumberToGroupLabel.get(mapNumber);
  if (groupLabel !== undefined) {
    return {
      labelText: { element: groupLabel, hydrogenText: "", hydrogenSide: "right", chargeText: "" },
      chargeOnly: false,
    };
  }
  const atom = atomOf(structure, mapNumber);
  const charge = formalCharge(structure.graph, mapNumber);
  const hydrogenCount =
    atom.hydrogenCount + (structure.mapNumberToFoldedHydrogens.get(mapNumber) ?? 0);
  const bondAngles = bondAnglesOf(structure, mapNumber);
  const computed = atomLabelText(atom.element, hydrogenCount, charge, bondAngles);
  // A lone H₂O, HBr or HO⁻ is written hydrogens first.
  const isHydrogensFirst = bondAngles.length === 0 && HYDROGENS_FIRST_ELEMENTS.has(atom.element);
  const labelText: AtomLabelText = isHydrogensFirst
    ? { ...computed, hydrogenSide: "left" }
    : computed;
  if (atom.element !== "C") {
    return { labelText, chargeOnly: false };
  }
  const neighbours = neighboursOf(structure, mapNumber);
  const carbonNeighbours = neighbours.filter(
    (neighbour) => atomOf(structure, neighbour).element === "C",
  ).length;
  const onlyHeteroatomNeighbours = carbonNeighbours === 0 && heavyAtomCount(structure, part) <= 2;
  const isLabelled =
    neighbours.length === 0 || onlyHeteroatomNeighbours || (charge !== 0 && carbonNeighbours < 2);
  if (isLabelled) {
    return { labelText, chargeOnly: false };
  }
  return charge === 0 ? null : { labelText, chargeOnly: true };
}

function chargeRuns(labelText: AtomLabelText): TextRun[] {
  return labelText.chargeText === ""
    ? []
    : [{ text: labelText.chargeText, position: "superscript" }];
}

/** Hydrogens beside the element: "OH" (right) or "H₃C" (left). */
function besideLabel(mapNumber: number, point: Point, labelText: AtomLabelText): PlacedLabel {
  const elementRuns: TextRun[] = [{ text: labelText.element, position: "normal" }];
  const halfElement = runsWidth(elementRuns) / 2;
  const hydrogens = textRuns(labelText.hydrogenText);
  const baselineY = point.y + LABEL_HALF_HEIGHT;
  const vertical = { up: LABEL_HALF_HEIGHT, down: LABEL_HALF_HEIGHT };
  if (labelText.hydrogenSide === "left" && hydrogens.length > 0) {
    const labelX = point.x - halfElement - runsWidth(hydrogens);
    return {
      labels: [
        {
          mapNumber,
          x: labelX,
          baselineY,
          runs: [...hydrogens, ...elementRuns, ...chargeRuns(labelText)],
        },
      ],
      box: {
        left: point.x - labelX,
        right: halfElement + runsWidth(chargeRuns(labelText)),
        ...vertical,
      },
    };
  }
  return {
    labels: [
      {
        mapNumber,
        x: point.x - halfElement,
        baselineY,
        runs: [...elementRuns, ...hydrogens, ...chargeRuns(labelText)],
      },
    ],
    box: {
      left: halfElement,
      right: halfElement + runsWidth([...hydrogens, ...chargeRuns(labelText)]),
      ...vertical,
    },
  };
}

/** Hydrogens in a row above or below the element (a CH₂ in a zigzag's crook). */
function stackedLabel(mapNumber: number, point: Point, labelText: AtomLabelText): PlacedLabel {
  const elementRuns: TextRun[] = [{ text: labelText.element, position: "normal" }];
  const halfElement = runsWidth(elementRuns) / 2;
  const hydrogens = textRuns(labelText.hydrogenText);
  const baselineY = point.y + LABEL_HALF_HEIGHT;
  const isAbove = labelText.hydrogenSide === "above";
  const rowOffset = (isAbove ? -1 : 1) * SCHEME_FONT_SIZE;
  const reach = SCHEME_FONT_SIZE + LABEL_HALF_HEIGHT;
  return {
    labels: [
      {
        mapNumber,
        x: point.x - halfElement,
        baselineY,
        runs: [...elementRuns, ...chargeRuns(labelText)],
      },
      {
        mapNumber,
        x: point.x - runsWidth(hydrogens) / 2,
        baselineY: baselineY + rowOffset,
        runs: hydrogens,
      },
    ],
    box: {
      left: halfElement,
      right: halfElement + runsWidth(chargeRuns(labelText)),
      up: isAbove ? reach : LABEL_HALF_HEIGHT,
      down: isAbove ? LABEL_HALF_HEIGHT : reach,
    },
  };
}

/** The atom's labels and box, or null for an unlabelled carbon. */
export function placedLabelOf(
  structure: Structure,
  mapNumber: number,
  part: readonly number[],
): PlacedLabel | null {
  const plan = labelPlanOf(structure, mapNumber, part);
  if (plan === null) {
    return null;
  }
  const point = pointOf(structure, mapNumber);
  const { labelText } = plan;
  if (plan.chargeOnly) {
    const runs = chargeRuns(labelText);
    const labelX = point.x + LONE_CHARGE_OFFSET.x;
    return {
      labels: [{ mapNumber, x: labelX, baselineY: point.y + LONE_CHARGE_OFFSET.y, runs }],
      box: null,
    };
  }
  const isStacked =
    labelText.hydrogenText !== "" &&
    (labelText.hydrogenSide === "above" || labelText.hydrogenSide === "below");
  return isStacked
    ? stackedLabel(mapNumber, point, labelText)
    : besideLabel(mapNumber, point, labelText);
}

/** How far from the atom a bond leaving in `direction` leaves the label's box, plus a margin. */
export function clearanceOf(box: LabelBox | null, direction: Point): number {
  if (box === null) {
    return 0;
  }
  const across = direction.x > 0 ? box.right : box.left;
  const upDown = direction.y > 0 ? box.down : box.up;
  const alongX =
    Math.abs(direction.x) > 1e-9 ? across / Math.abs(direction.x) : Number.POSITIVE_INFINITY;
  const alongY =
    Math.abs(direction.y) > 1e-9 ? upDown / Math.abs(direction.y) : Number.POSITIVE_INFINITY;
  return Math.min(alongX, alongY) + LABEL_MARGIN;
}
