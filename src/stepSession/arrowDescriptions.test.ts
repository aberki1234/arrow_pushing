/** Tests for arrowDescriptions.ts. */
import { expect, test } from "vitest";
import { parseCurvedArrow } from "../arrowNotation/curvedArrowNotation.js";
import { describeCurvedArrow } from "./arrowDescriptions.js";

test.each([
  ["lp O1 -> σ O1-C2", "lone pair on O1 → new bond O1–C2"],
  ["σ C2-Br3 -> lp Br3", "bond C2–Br3 → lone pair on Br3"],
  ["π C3-C5 -> σ C3-C9", "π bond C3=C5 → new bond C3–C9"],
  ["lp O6 -> π C5-O6", "lone pair on O6 → new π bond C5=O6"],
  ["rad Br1 ~> σ Br1-H2", "unpaired electron on Br1 ⇀ new bond Br1–H2"],
  ["σ H2-C3 ~> rad C3", "bond H2–C3 ⇀ unpaired electron on C3"],
])("%s", (notation, expected) => {
  expect(describeCurvedArrow(parseCurvedArrow(notation))).toBe(expected);
});
