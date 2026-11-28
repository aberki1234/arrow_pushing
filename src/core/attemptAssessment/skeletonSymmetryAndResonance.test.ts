/**
 * Tests for skeletonSymmetry.ts and resonanceEquivalence.ts against the shared cases in
 * fixtures/assessment.
 */
import { expect, test } from "vitest";
import { formatCurvedArrow, parseCurvedArrow } from "../arrowNotation/curvedArrowNotation.js";
import { stateGraphFromMappedSmiles } from "../stateGraphs/mappedSmilesReading.js";
import { stateGraphToJson } from "../stateGraphs/stateGraph.js";
import { fixtureCaseEntries, textField } from "../../testSupport/fixtureFiles.js";
import { chargedAtomCount, compareStates, relabelledComparison } from "./resonanceEquivalence.js";
import {
  relabelCurvedArrow,
  relabelStateGraph,
  skeletonSymmetries,
  skeletonSymmetriesWithinCap,
  withHydrogensFolded,
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

// ---- Stereo under relabelling and folding (item 12c) ----
// Reference: renaming the map numbers in the SMILES text keeps the written order, so it is the same
// arrangement in space; relabelling the parsed state must give what the renamed text parses to.

function renamedText(mappedSmiles: string, relabelling: ReadonlyMap<number, number>): string {
  return mappedSmiles.replace(/:(\d+)\]/g, (matched, digits: string) => {
    const mapNumber = Number(digits);
    return `:${String(relabelling.get(mapNumber) ?? mapNumber)}]`;
  });
}

test.each([
  [
    "a stereocentre, two neighbours swapped",
    "[CH3:1][C@@H:2]([OH:3])[CH2:4][CH3:5]",
    [
      [1, 4],
      [4, 1],
    ],
  ],
  [
    "a stereocentre, renumbered",
    "[CH3:1][C@@H:2]([OH:3])[CH2:4][CH3:5]",
    [
      [2, 9],
      [3, 1],
      [1, 3],
    ],
  ],
  [
    "a centre with four mapped neighbours",
    "[F:1][C@:2]([Cl:3])([Br:4])[I:5]",
    [
      [1, 5],
      [5, 3],
      [3, 1],
    ],
  ],
  [
    "a double bond, reference neighbours renumbered",
    "[CH3:1]/[C:2]([CH3:6])=[CH:3]/[CH3:4]",
    [
      [1, 6],
      [6, 1],
    ],
  ],
  [
    "a double bond, renumbered across",
    "[CH3:1]/[CH:2]=[CH:3]\\[CH3:4]",
    [
      [1, 4],
      [4, 1],
      [2, 3],
      [3, 2],
    ],
  ],
] as const)("relabelling keeps the stereo: %s", (caseName, mappedSmiles, pairs) => {
  const relabelling = new Map<number, number>(pairs.map(([from, to]) => [from, to]));
  const relabelled = relabelStateGraph(stateGraphFromMappedSmiles(mappedSmiles), relabelling);
  const expected = stateGraphFromMappedSmiles(renamedText(mappedSmiles, relabelling));
  expect(stateGraphToJson(relabelled)).toEqual(stateGraphToJson(expected));
});

test.each([
  // In SMILES the bracket H stands where the drawn H was written, so these are the same molecule.
  [
    "a drawn H on a stereocentre becomes the implicit H",
    "[CH3:1][C@@:2]([H:6])([OH:3])[CH2:4][CH3:5]",
    "[CH3:1][C@@H:2]([OH:3])[CH2:4][CH3:5]",
  ],
  [
    "a centre left with two hydrogens is no longer marked",
    "[CH3:1][C@@H:2]([H:6])[OH:3]",
    "[CH3:1][CH2:2][OH:3]",
  ],
  [
    "a drawn H that was a double bond's reference neighbour",
    "[H:5]/[C:1]([CH3:6])=[CH:2]/[CH3:3]",
    "[CH3:6]/[CH:1]=[CH:2]\\[CH3:3]",
  ],
])("folding hydrogens keeps the stereo: %s", (caseName, drawn, folded) => {
  expect(stateGraphToJson(withHydrogensFolded(stateGraphFromMappedSmiles(drawn)))).toEqual(
    stateGraphToJson(stateGraphFromMappedSmiles(folded)),
  );
});

test("a result is identical under a symmetry that turns its marks onto the target's", () => {
  // Two ethyl groups on C2: swapping them is a skeleton symmetry; the result drawn with the
  // groups' map numbers swapped is the target with each mark relabelled.
  const target = "[OH:1][C@@H:2]([CH2:3][CH3:4])[CH2:5][CH3:6]";
  const swap = new Map([
    [1, 1],
    [2, 2],
    [3, 5],
    [4, 6],
    [5, 3],
    [6, 4],
  ]);
  const result = stateGraphFromMappedSmiles(renamedText(target, swap));
  const compare = relabelledComparison(result, stateGraphFromMappedSmiles(target));
  expect(compare(swap)).toBe("identical");
  const identity = new Map([1, 2, 3, 4, 5, 6].map((mapNumber) => [mapNumber, mapNumber]));
  expect(compare(identity)).toBe("different");
});
