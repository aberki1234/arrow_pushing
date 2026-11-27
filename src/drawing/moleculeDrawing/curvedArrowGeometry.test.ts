/** Tests for curvedArrowGeometry.ts on the SN2 and radical bromination example states. */
import { expect, test } from "vitest";
import { parseCurvedArrow } from "../../core/arrowNotation/curvedArrowNotation.js";
import { stateGraphFromMappedSmiles } from "../../core/stateGraphs/mappedSmilesReading.js";
import { ARROW_END_CLEARANCE_PIXELS, drawCurvedArrow } from "./curvedArrowGeometry.js";
import { type Point, angleFrom, distanceBetween, pointBetween } from "./planeGeometry.js";
import { type StateDrawing, drawState, drawnAtomOf } from "./stateDrawing.js";

const SN2_DRAWING = drawState(
  stateGraphFromMappedSmiles("[OH-:1].[CH3:2][Br:3]"),
  { mapNumberToCoordinates: { "1": [-1.5, 0], "2": [0, 0], "3": [1.5, 0] } },
  40,
);
const RADICAL_DRAWING = drawState(
  stateGraphFromMappedSmiles("[Br:1].[H:2][CH3:3]"),
  { mapNumberToCoordinates: { "1": [-1.5, 0], "2": [0, 0], "3": [1.5, 0] } },
  40,
);

function pointOf(drawing: StateDrawing, mapNumber: number): Point {
  return drawnAtomOf(drawing, mapNumber).point;
}

/** Which side of the line start→end a point is on: the sign of the cross product. */
function sideOf(start: Point, end: Point, point: Point): number {
  return Math.sign(
    (end.x - start.x) * (point.y - start.y) - (end.y - start.y) * (point.x - start.x),
  );
}

test("a lone pair source starts at the lone pair facing the other end", () => {
  const drawn = drawCurvedArrow(SN2_DRAWING, parseCurvedArrow("lp O1 -> σ O1-C2"));
  const facingDot = SN2_DRAWING.electronDots
    .filter((dot) => dot.mapNumber === 1)
    .reduce((best, dot) =>
      Math.abs(Math.cos(dot.angle) - 1) < Math.abs(Math.cos(best.angle) - 1) ? dot : best,
    );
  expect(drawn.start).toEqual(facingDot.center);
});

test("a pair arrow to a new bond ends just short of the atom attacked", () => {
  const drawn = drawCurvedArrow(SN2_DRAWING, parseCurvedArrow("lp O1 -> σ O1-C2"));
  expect(distanceBetween(drawn.end, pointOf(SN2_DRAWING, 2))).toBeCloseTo(
    ARROW_END_CLEARANCE_PIXELS,
  );
  expect(drawn.electronsMoved).toBe(2);
});

test("a bond source starts at the bond's midpoint; lp destination ends outside the atom", () => {
  const drawn = drawCurvedArrow(SN2_DRAWING, parseCurvedArrow("σ C2-Br3 -> lp Br3"));
  expect(drawn.start).toEqual(pointBetween(pointOf(SN2_DRAWING, 2), pointOf(SN2_DRAWING, 3), 0.5));
  expect(distanceBetween(drawn.end, pointOf(SN2_DRAWING, 3))).toBeCloseTo(
    ARROW_END_CLEARANCE_PIXELS,
  );
});

test("fish-hooks forming one bond both end at its middle", () => {
  const middle = pointBetween(pointOf(RADICAL_DRAWING, 1), pointOf(RADICAL_DRAWING, 2), 0.5);
  const fromRadical = drawCurvedArrow(RADICAL_DRAWING, parseCurvedArrow("rad Br1 ~> σ Br1-H2"));
  const fromBond = drawCurvedArrow(RADICAL_DRAWING, parseCurvedArrow("σ H2-C3 ~> σ Br1-H2"));
  expect(fromRadical.end).toEqual(middle);
  expect(fromBond.end).toEqual(middle);
  expect(fromRadical.electronsMoved).toBe(1);
  const radicalDot = RADICAL_DRAWING.electronDots.find((dot) => dot.dotKind === "unpairedElectron");
  expect(fromRadical.start).toEqual(radicalDot?.center);
});

test("the arrow bends away from the centre of the molecule", () => {
  const drawn = drawCurvedArrow(SN2_DRAWING, parseCurvedArrow("σ C2-Br3 -> lp Br3"));
  expect(sideOf(drawn.start, drawn.end, drawn.control)).toBe(
    -sideOf(drawn.start, drawn.end, SN2_DRAWING.centroid) ||
      sideOf(drawn.start, drawn.end, drawn.control),
  );
  expect(distanceBetween(drawn.control, pointBetween(drawn.start, drawn.end, 0.5))).toBeGreaterThan(
    10,
  );
});

test("the path data is one quadratic Bézier from start to end", () => {
  const drawn = drawCurvedArrow(SN2_DRAWING, parseCurvedArrow("lp O1 -> σ O1-C2"));
  const numbers = drawn.pathData.replace(/[MQ]/g, " ").trim().split(/\s+/).map(Number);
  expect(drawn.pathData.startsWith("M ")).toBe(true);
  expect(drawn.pathData).toContain(" Q ");
  expect(numbers).toHaveLength(6);
  expect(numbers[0]).toBeCloseTo(drawn.start.x, 1);
  expect(numbers[5]).toBeCloseTo(drawn.end.y, 1);
  expect(Number.isFinite(angleFrom(drawn.control, drawn.end))).toBe(true);
});
