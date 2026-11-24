/** Tests for planeGeometry.ts and drawingLayout.ts. */
import { expect, test } from "vitest";
import { stateGraphFromMappedSmiles } from "../stateGraphs/mappedSmilesReading.js";
import {
  BOND_LENGTH_PIXELS,
  DEFAULT_BOND_LENGTH_UNITS,
  reactionScale,
  screenPoints,
  viewBoxAround,
} from "./drawingLayout.js";
import { angleFrom, distanceBetween, pointAtAngle, pointBetween } from "./planeGeometry.js";

test("points between, distances and angles use screen axes (y down)", () => {
  expect(pointBetween({ x: 0, y: 0 }, { x: 10, y: 20 }, 0.25)).toEqual({ x: 2.5, y: 5 });
  expect(distanceBetween({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  expect(angleFrom({ x: 0, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(Math.PI / 2);
  const reached = pointAtAngle({ x: 1, y: 1 }, Math.PI, 2);
  expect(reached.x).toBeCloseTo(-1);
  expect(reached.y).toBeCloseTo(1);
});

test("the scale makes the start state's median bond BOND_LENGTH_PIXELS long", () => {
  // Bonds of length 1, 2 and 4: the median is 2.
  const graph = stateGraphFromMappedSmiles("[CH3:1][CH2:2][CH2:3][CH3:4]");
  const coordinates = { "1": [0, 0], "2": [1, 0], "3": [3, 0], "4": [7, 0] };
  expect(reactionScale(graph, coordinates)).toBeCloseTo(BOND_LENGTH_PIXELS / 2);
});

test("a start state without bonds uses the default bond length", () => {
  const graph = stateGraphFromMappedSmiles("[Na+:1].[Cl-:2]");
  const coordinates = { "1": [0, 0], "2": [3, 0] };
  expect(reactionScale(graph, coordinates)).toBeCloseTo(
    BOND_LENGTH_PIXELS / DEFAULT_BOND_LENGTH_UNITS,
  );
});

test("screen points are scaled and flipped upside down", () => {
  const points = screenPoints({ "3": [1, 2], "10": [-0.5, -1] }, 10);
  expect(points.get(3)).toEqual({ x: 10, y: -20 });
  expect(points.get(10)).toEqual({ x: -5, y: 10 });
  expect([...points.keys()].sort((first, second) => first - second)).toEqual([3, 10]);
});

test("the view box holds every point plus padding", () => {
  const box = viewBoxAround(
    [
      { x: -10, y: 5 },
      { x: 30, y: -15 },
    ],
    4,
  );
  expect(box).toEqual({ minX: -14, minY: -19, width: 48, height: 28 });
});
