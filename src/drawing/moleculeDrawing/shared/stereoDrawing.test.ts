/**
 * Tests for stereoDrawing.ts. The hand-worked case below is the reference for the sign
 * convention; tooling/chemistryToolkit/stereoDrawingAgreement.test.ts checks the same functions
 * against RDKit's own wedges on many molecules.
 */
import { expect, test } from "vitest";
import { stateGraphFromMappedSmiles } from "../../../core/stateGraphs/mappedSmilesReading.js";
import {
  drawnDoubleBondRelation,
  drawnTetrahedralMark,
  tetrahedralMarksFromDrawing,
  wedgesForMarks,
} from "./stereoDrawing.js";

// Butan-2-ol drawn as a zigzag with O3 straight up from C2. With O3 on a wedge the implicit H on
// C2 points away. Seen from that H (from behind the page), C1 -> O3 -> C4 runs anticlockwise,
// which is "@" for the canonical order (H, C1, O3, C4).
const butanol = stateGraphFromMappedSmiles("[CH3:1][C@@H:2]([OH:3])[CH2:4][CH3:5]");
const butanolCoordinates = {
  "1": [-1.3, -0.75],
  "2": [0, 0],
  "3": [0, 1.5],
  "4": [1.3, -0.75],
  "5": [2.6, 0],
};

test("the hand-worked case: a wedge to O3 gives the mark the SMILES has", () => {
  expect(butanol.mapNumberToTetrahedralMark?.get(2)).toBe("@");
  expect(drawnTetrahedralMark(butanol, 2, butanolCoordinates, { "2-3": "wedge" })).toBe("@");
});

test("a dash instead of a wedge, or a wedge from the other end, changes the reading", () => {
  expect(drawnTetrahedralMark(butanol, 2, butanolCoordinates, { "2-3": "dash" })).toBe("@@");
  // The narrow end is at O3, so the wedge says nothing about C2.
  expect(drawnTetrahedralMark(butanol, 2, butanolCoordinates, { "3-2": "wedge" })).toBeUndefined();
  expect(drawnTetrahedralMark(butanol, 2, butanolCoordinates, {})).toBeUndefined();
});

test("swapping two neighbours' places on the page changes the reading", () => {
  const swapped = { ...butanolCoordinates, "1": [1.3, -0.75], "4": [-1.3, -0.75] };
  expect(drawnTetrahedralMark(butanol, 2, swapped, { "2-3": "wedge" })).toBe("@@");
});

test("a drawn H on a dash reads the same as the implicit H pointing away", () => {
  const withDrawnHydrogen = stateGraphFromMappedSmiles(
    "[CH3:1][C@@:2]([H:6])([OH:3])[CH2:4][CH3:5]",
  );
  const coordinates = { ...butanolCoordinates, "3": [0.4, 1.45], "6": [-0.4, 1.45] };
  const wedges = { "2-3": "wedge", "2-6": "dash" } as const;
  expect(drawnTetrahedralMark(withDrawnHydrogen, 2, coordinates, wedges)).toBe(
    withDrawnHydrogen.mapNumberToTetrahedralMark?.get(2),
  );
});

test("marks are read from the drawing at each atom a wedge or dash starts from", () => {
  const marks = tetrahedralMarksFromDrawing(butanol, butanolCoordinates, { "2-3": "dash" });
  expect([...marks]).toEqual([[2, "@@"]]);
});

const transDibromide = stateGraphFromMappedSmiles(
  "[Br:8][C@@H:1]1[C@@H:2]([Br:7])[CH2:3][CH2:4][CH2:5][CH2:6]1",
);
const ringCoordinates = {
  "1": [1.5, 0],
  "2": [0.75, 1.3],
  "3": [-0.75, 1.3],
  "4": [-1.5, 0],
  "5": [-0.75, -1.3],
  "6": [0.75, -1.3],
  "7": [1.5, 2.6],
  "8": [3, 0],
};

test.each([
  ["no wedges yet", {}],
  ["wedges that disagree", { "1-8": "wedge", "2-7": "wedge" }],
  ["a wedge at an atom with no mark", { "3-4": "wedge" }],
] as const)("wedgesForMarks draws every mark: %s", (caseName, startingWedges) => {
  const wedges = wedgesForMarks(transDibromide, ringCoordinates, startingWedges);
  expect(tetrahedralMarksFromDrawing(transDibromide, ringCoordinates, wedges)).toEqual(
    transDibromide.mapNumberToTetrahedralMark,
  );
});

test("wedgesForMarks keeps wedges that already agree and prefers bonds out of the ring", () => {
  const agreeing = wedgesForMarks(transDibromide, ringCoordinates, {});
  expect(Object.keys(agreeing).sort()).toEqual(["1-8", "2-7"]);
  expect(wedgesForMarks(transDibromide, ringCoordinates, agreeing)).toEqual(agreeing);
});

test("the relation of a double bond is read from the coordinates", () => {
  const butene = stateGraphFromMappedSmiles("[CH3:1]/[CH:2]=[CH:3]/[CH3:4]");
  const trans = { "1": [-1.3, -0.75], "2": [0, 0], "3": [1.5, 0], "4": [2.8, 0.75] };
  const cis = { ...trans, "4": [2.8, -0.75] };
  expect(drawnDoubleBondRelation(butene, "2-3", trans)).toBe("trans");
  expect(drawnDoubleBondRelation(butene, "2-3", cis)).toBe("cis");
  const straight = { ...trans, "4": [3, 0] };
  expect(drawnDoubleBondRelation(butene, "2-3", straight)).toBeUndefined();
});

test("in a three-membered ring the wedges go on the bonds to the bridging atom", () => {
  // The bromonium ion of cyclohexene: Br7 bridges C1 and C2 on one face, as textbooks draw it.
  const bromonium = stateGraphFromMappedSmiles(
    "[C@@H:1]12[C@@H:2]([CH2:3][CH2:4][CH2:5][CH2:6]1)[Br+:7]2.[Br-:8]",
  );
  const coordinates = { ...ringCoordinates, "7": [1.85, 0.9], "8": [4, 2] };
  const wedges = wedgesForMarks(bromonium, coordinates, {});
  expect(Object.keys(wedges).sort()).toEqual(["1-7", "2-7"]);
});
