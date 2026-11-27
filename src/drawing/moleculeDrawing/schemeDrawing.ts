/**
 * A state drawn as the reaction cards draw it (SPEC §5 "Drawing in the cards", decided
 * 2026-11-26): RSC / ACS document style, unlike the step screen. Pure data; the Svelte
 * component only renders it.
 *
 * Style: one fixed bond length (SCHEME_BOND_LENGTH; the state's median bond is scaled to it),
 * skeletal labels (schemeLabels.ts), lines about 0.05 bond lengths wide, double bonds 18% of a
 * bond length apart (schemeBonds.ts), Arial labels about 0.68 bond lengths high with true sub-
 * and superscripts (schemeText.ts), no lone pairs, spectators drawn normally.
 *
 * Terms
 *   species      A connected part of the state, drawn as its own picture; the cards put "+"
 *                between species.
 *   counter-ion  A charged species made only of metal atoms (Na⁺, Li⁺): left out, since the
 *                conditions name the salt (NaCN), unless the state holds nothing else.
 */
import { formalCharge } from "../../core/stateGraphs/stateGraph.js";
import type { AbbreviatedGroup } from "./abbreviatedGroups.js";
import type { ViewBox } from "./drawingLayout.js";
import type { Point } from "./planeGeometry.js";
import { type SchemeLine, type SchemeWedge, bondParts } from "./schemeBonds.js";
import {
  LABEL_HALF_HEIGHT,
  type LabelBox,
  type SchemeLabel,
  placedLabelOf,
} from "./schemeLabels.js";
import {
  type SchemeStateFields,
  type Structure,
  atomOf,
  pointOf,
  speciesMapNumbers,
  structureOf,
} from "./schemeStructure.js";
import { SCHEME_FONT_SIZE, runsWidth } from "./schemeText.js";

export { SCHEME_DOUBLE_BOND_SPACING } from "./schemeBonds.js";
export type { SchemeLine, SchemeWedge } from "./schemeBonds.js";
export type { SchemeLabel } from "./schemeLabels.js";
export { SCHEME_BOND_LENGTH } from "./schemeStructure.js";
export type { SchemeStateFields } from "./schemeStructure.js";
export {
  SCHEME_FONT_SIZE,
  SCRIPT_SIZE,
  type TextRun,
  type TextRunPosition,
  conditionsLabelParts,
  textRunShifts,
  textRuns,
} from "./schemeText.js";

/** About 0.05 bond lengths, as the RSC / ACS document style. */
export const SCHEME_LINE_WIDTH = 1;
const VIEW_BOX_PADDING = 2;
const METAL_ELEMENTS = new Set(["Li", "Na", "K", "Rb", "Cs", "Mg", "Ca", "Ba", "Zn", "Cu", "Ag"]);

export interface SchemeSpecies {
  readonly lines: readonly SchemeLine[];
  readonly wedges: readonly SchemeWedge[];
  readonly labels: readonly SchemeLabel[];
  readonly viewBox: ViewBox;
}

export interface SchemeDrawing {
  /** Left to right. */
  readonly species: readonly SchemeSpecies[];
}

function viewBoxOf(points: readonly Point[]): ViewBox {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs) - VIEW_BOX_PADDING;
  const minY = Math.min(...ys) - VIEW_BOX_PADDING;
  return {
    minX,
    minY,
    width: Math.max(...xs) + VIEW_BOX_PADDING - minX,
    height: Math.max(...ys) + VIEW_BOX_PADDING - minY,
  };
}

/** The points a species' view box must hold: atoms, label corners, wedge corners. */
function extentPoints(
  structure: Structure,
  part: readonly number[],
  labels: readonly SchemeLabel[],
  wedges: readonly SchemeWedge[],
): Point[] {
  const labelCorners = labels.flatMap((label) => [
    { x: label.x, y: label.baselineY - 2 * LABEL_HALF_HEIGHT - 0.4 * SCHEME_FONT_SIZE },
    { x: label.x + runsWidth(label.runs), y: label.baselineY + 0.3 * SCHEME_FONT_SIZE },
  ]);
  return [
    ...part.map((mapNumber) => pointOf(structure, mapNumber)),
    ...labelCorners,
    ...wedges.flatMap((wedge) => wedge.corners),
  ];
}

function isCounterIon(structure: Structure, part: readonly number[]): boolean {
  const charge = part.reduce((sum, mapNumber) => sum + formalCharge(structure.graph, mapNumber), 0);
  return (
    charge !== 0 &&
    part.every((mapNumber) => METAL_ELEMENTS.has(atomOf(structure, mapNumber).element))
  );
}

function drawnSpecies(
  structure: Structure,
  state: SchemeStateFields,
  part: readonly number[],
): SchemeSpecies {
  const labels: SchemeLabel[] = [];
  const mapNumberToBox = new Map<number, LabelBox | null>();
  for (const mapNumber of part) {
    const placed = placedLabelOf(structure, mapNumber, part);
    if (placed !== null) {
      labels.push(...placed.labels);
      mapNumberToBox.set(mapNumber, placed.box);
    }
  }
  const members = new Set(part);
  const drawnBonds = structure.bonds
    .filter(([first]) => members.has(first))
    .map((bond) => bondParts(structure, state, bond, mapNumberToBox));
  const lines = drawnBonds.flatMap((bond) => bond.lines);
  const wedges = drawnBonds.flatMap((bond) => bond.wedges);
  return {
    lines,
    wedges,
    labels,
    viewBox: viewBoxOf(extentPoints(structure, part, labels, wedges)),
  };
}

/** The state as the cards draw it: its species left to right (by their leftmost atom). */
export function drawSchemeState(
  state: SchemeStateFields,
  abbreviatedGroups: readonly AbbreviatedGroup[] = [],
): SchemeDrawing {
  const structure = structureOf(state, abbreviatedGroups);
  const leftmost = (part: readonly number[]): number =>
    Math.min(...part.map((mapNumber) => pointOf(structure, mapNumber).x));
  const allParts = speciesMapNumbers(structure).sort(
    (one, other) => leftmost(one) - leftmost(other) || (one[0] ?? 0) - (other[0] ?? 0),
  );
  const withoutCounterIons = allParts.filter((part) => !isCounterIon(structure, part));
  const parts = withoutCounterIons.length > 0 ? withoutCounterIons : allParts;
  return { species: parts.map((part) => drawnSpecies(structure, state, part)) };
}
