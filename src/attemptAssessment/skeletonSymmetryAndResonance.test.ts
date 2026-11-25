/**
 * Tests for skeletonSymmetry.ts and resonanceEquivalence.ts against the shared cases in
 * fixtures/assessment.
 */
import { expect, test } from "vitest";
import { formatCurvedArrow, parseCurvedArrow } from "../arrowNotation/curvedArrowNotation.js";
import { stateGraphFromMappedSmiles } from "../stateGraphs/mappedSmilesReading.js";
import { stateGraphToJson } from "../stateGraphs/stateGraph.js";
import { fixtureCaseEntries, textField } from "../testSupport/fixtureFiles.js";
import { chargedAtomCount, compareStates } from "./resonanceEquivalence.js";
import {
  relabelCurvedArrow,
  relabelStateGraph,
  skeletonSymmetries,
  skeletonSymmetriesWithinCap,
} from "./skeletonSymmetry.js";

const symmetryCases = fixtureCaseEntries("assessment/skeleton_symmetry_cases.json", "cases").map(
  (entry) => ({
    caseName: textField(entry, "caseName"),
    mappedSmiles: textField(entry, "mappedSmiles"),
    expectedSymmetryCount: entry.expectedSymmetryCount,
  }),
);
const resonanceCases = fixtureCaseEntries("assessment/resonance_cases.json", "cases").map(
  (entry) => ({
    caseName: textField(entry, "caseName"),
    resultSmiles: textField(entry, "resultSmiles"),
    targetSmiles: textField(entry, "targetSmiles"),
    expectedComparison: textField(entry, "expectedComparison"),
  }),
);
const benzene = "[CH:1]1=[CH:2][CH:3]=[CH:4][CH:5]=[CH:6]1";
const benzeneIdentity = new Map([1, 2, 3, 4, 5, 6].map((mapNumber) => [mapNumber, mapNumber]));

test.each(symmetryCases)("$caseName", ({ mappedSmiles, expectedSymmetryCount }) => {
  expect(skeletonSymmetries(stateGraphFromMappedSmiles(mappedSmiles)).length).toBe(
    expectedSymmetryCount,
  );
});

test("the identity comes first and every symmetry is a bijection", () => {
  const symmetries = skeletonSymmetries(stateGraphFromMappedSmiles(benzene));
  expect(symmetries[0]).toEqual(benzeneIdentity);
  for (const symmetry of symmetries) {
    expect([...symmetry.values()].sort((first, second) => first - second)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
  }
});

test("above the cap only the identity is returned", () => {
  expect(skeletonSymmetries(stateGraphFromMappedSmiles(benzene), 5)).toEqual([benzeneIdentity]);
});

test("within the cap every symmetry is returned; above it, undefined", () => {
  const graph = stateGraphFromMappedSmiles(benzene);
  expect(skeletonSymmetriesWithinCap(graph, 12)).toHaveLength(12);
  expect(skeletonSymmetriesWithinCap(graph, 11)).toBeUndefined();
});

test("relabelStateGraph moves electrons and bonds with the atoms", () => {
  const water = stateGraphFromMappedSmiles("[H:2][O:1][H:4].[H+:7]");
  const swapped = relabelStateGraph(
    water,
    new Map([
      [1, 1],
      [2, 7],
      [4, 4],
      [7, 2],
    ]),
  );
  const expected = stateGraphFromMappedSmiles("[H:7][O:1][H:4].[H+:2]");
  expect(stateGraphToJson(swapped)).toEqual(stateGraphToJson(expected));
});

test("relabelCurvedArrow re-sorts bond atoms", () => {
  const relabelled = relabelCurvedArrow(
    parseCurvedArrow("σ O1-H4 -> lp O1"),
    new Map([
      [1, 5],
      [4, 2],
    ]),
  );
  expect(formatCurvedArrow(relabelled)).toBe("σ H2-O5 -> lp O5");
});

test.each(resonanceCases)("$caseName", ({ resultSmiles, targetSmiles, expectedComparison }) => {
  const comparison = compareStates(
    stateGraphFromMappedSmiles(resultSmiles),
    stateGraphFromMappedSmiles(targetSmiles),
  );
  expect(comparison).toBe(expectedComparison);
});

test("chargedAtomCount counts atoms with a nonzero formal charge", () => {
  expect(chargedAtomCount(stateGraphFromMappedSmiles("[CH2+:1][O-:2].[Na+:3]"))).toBe(3);
  expect(chargedAtomCount(stateGraphFromMappedSmiles("[CH2:1]=[O:2]"))).toBe(0);
});
