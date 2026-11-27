/** Tests for electronDotPlacement.ts. Angles are radians on screen axes (y down). */
import { expect, test } from "vitest";
import { placeElectronDots, widestGapAngle } from "./electronDotPlacement.js";

const DEGREE = Math.PI / 180;

function degreesOf(angles: readonly number[]): number[] {
  return angles.map((angle) => Math.round((((angle / DEGREE) % 360) + 360) % 360));
}

test("with nothing around, the first gap is straight up", () => {
  expect(degreesOf([widestGapAngle([])])).toEqual([270]);
});

test("the widest gap is opposite a single bond", () => {
  expect(degreesOf([widestGapAngle([Math.PI])])).toEqual([0]);
});

test("the widest gap between two bonds", () => {
  // Bonds at 0° and 90°: the 270° gap from 90° round to 360° is the widest; its middle is 225°.
  expect(degreesOf([widestGapAngle([0, 90 * DEGREE])])).toEqual([225]);
});

test("three lone pairs around one bond spread out", () => {
  const dots = placeElectronDots([Math.PI], 3, 0);
  expect(dots.map((dot) => dot.dotKind)).toEqual(["lonePair", "lonePair", "lonePair"]);
  expect(degreesOf(dots.map((dot) => dot.angle)).sort((first, second) => first - second)).toEqual([
    0, 90, 270,
  ]);
});

test("four lone pairs on a free ion sit at the four sides", () => {
  const dots = placeElectronDots([], 4, 0);
  expect(degreesOf(dots.map((dot) => dot.angle)).sort((first, second) => first - second)).toEqual([
    0, 90, 180, 270,
  ]);
});

test("the unpaired electron comes first; all four spread evenly round the free arc", () => {
  const dots = placeElectronDots([Math.PI], 3, 1);
  expect(dots.map((dot) => dot.dotKind)).toEqual([
    "unpairedElectron",
    "lonePair",
    "lonePair",
    "lonePair",
  ]);
  // One bond at 180°: five equal gaps of 72° round the atom.
  expect(degreesOf(dots.map((dot) => dot.angle)).sort((first, second) => first - second)).toEqual([
    36, 108, 252, 324,
  ]);
});

test("two lone pairs beside one bond sit 120° from it and each other (trigonal)", () => {
  const dots = placeElectronDots([30 * DEGREE], 2, 0);
  expect(degreesOf(dots.map((dot) => dot.angle)).sort((first, second) => first - second)).toEqual([
    150, 270,
  ]);
});

test("electrons are shared between gaps by size", () => {
  // Bonds at 0° and 180°: one lone pair in each half.
  const dots = placeElectronDots([0, Math.PI], 2, 0);
  expect(degreesOf(dots.map((dot) => dot.angle)).sort((first, second) => first - second)).toEqual([
    90, 270,
  ]);
});

test("a free atom's electrons start straight up", () => {
  const dots = placeElectronDots([], 3, 0);
  expect(degreesOf(dots.map((dot) => dot.angle)).sort((first, second) => first - second)).toEqual([
    30, 150, 270,
  ]);
});

test("authored lone-pair directions (degrees, y up) are used as given, flipped to screen", () => {
  const dots = placeElectronDots([Math.PI], 2, 0, [90]);
  expect(degreesOf(dots.map((dot) => dot.angle))[0]).toBe(270);
  expect(dots).toHaveLength(2);
});

test("nothing to place gives nothing", () => {
  expect(placeElectronDots([0, Math.PI], 0, 0)).toEqual([]);
});
