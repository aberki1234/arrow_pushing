/** Tests for abbreviatedGroups.ts. */
import { expect, test } from "vitest";
import { stateGraphFromMappedSmiles } from "../stateGraphs/mappedSmilesReading.js";
import { isGroupIntact, stateDisplayPlan } from "./abbreviatedGroups.js";

// Methoxy on a carbonyl carbon: C1(=O2)–O3–C4, the OMe group being O3 and C4.
const ESTER = stateGraphFromMappedSmiles("[CH3:5][C:1](=[O:2])[O:3][CH3:4]");
const METHOXY = { groupLabel: "OMe", attachmentMapNumber: 3, mapNumbers: [3, 4] };

test("a group joined by one bond from its attachment atom is intact", () => {
  expect(isGroupIntact(ESTER, METHOXY)).toBe(true);
});

test("a group attached from another atom, or by two bonds, or partly absent is not", () => {
  expect(isGroupIntact(ESTER, { ...METHOXY, attachmentMapNumber: 4 })).toBe(false);
  expect(isGroupIntact(ESTER, { ...METHOXY, mapNumbers: [3] })).toBe(false);
  expect(isGroupIntact(ESTER, { ...METHOXY, mapNumbers: [3, 4, 9] })).toBe(false);
  const methoxide = stateGraphFromMappedSmiles("[CH3:5][C:1]=[O:2].[O-:3][CH3:4]");
  expect(isGroupIntact(methoxide, METHOXY)).toBe(false);
});

test("the plan hides the group's other atoms and makes the whole group untappable", () => {
  const plan = stateDisplayPlan(ESTER, [5], [METHOXY]);
  expect([...plan.hiddenMapNumbers]).toEqual([4]);
  expect(plan.mapNumberToGroupLabel.get(3)).toBe("OMe");
  expect([...plan.untappableMapNumbers].sort()).toEqual([3, 4, 5]);
  expect([...plan.spectatorMapNumbers]).toEqual([5]);
});
