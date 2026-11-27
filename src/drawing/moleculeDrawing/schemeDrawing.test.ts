/**
 * Tests for schemeDrawing.ts: states drawn as the reaction cards draw them (SPEC §5 "Drawing in
 * the cards"). The states are small and hand-made so every expected value can be worked out by
 * hand: their bonds are 1.5 units long, so the scale is 20 / 1.5 pixels per unit and y flips.
 */
import { expect, it } from "vitest";
import { exampleReactionDocuments } from "../../testSupport/fixtureFiles.js";
import {
  SCHEME_BOND_LENGTH,
  SCHEME_DOUBLE_BOND_SPACING,
  type SchemeLabel,
  type SchemeLine,
  type SchemeSpecies,
  conditionsLabelParts,
  drawSchemeState,
  textRuns,
  textRunShifts,
} from "./schemeDrawing.js";

/** [x, y] of a zigzag atom: every bond 1.5 units, alternating 30° up and down. */
const ZIGZAG: readonly (readonly [number, number])[] = [
  [0, 0],
  [1.299, 0.75],
  [2.598, 0],
  [3.897, 0.75],
];

function coordinatesOf(points: readonly (readonly number[])[]): Record<string, number[]> {
  return Object.fromEntries(points.map((point, index) => [String(index + 1), [...point]]));
}

function lengthOf(line: SchemeLine): number {
  return Math.hypot(line.end.x - line.start.x, line.end.y - line.start.y);
}

function midpointOf(line: SchemeLine): { x: number; y: number } {
  return { x: (line.start.x + line.end.x) / 2, y: (line.start.y + line.end.y) / 2 };
}

/** A label as one line of text, sub- and superscripts written as _2 and ^+. */
function labelText(label: SchemeLabel | undefined): string {
  return (label?.runs ?? [])
    .map(({ text, position }) => {
      if (position === "subscript") {
        return `_${text}`;
      }
      return position === "superscript" ? `^${text}` : text;
    })
    .join("");
}

function onlySpecies(drawingSpecies: readonly SchemeSpecies[]): SchemeSpecies {
  expect(drawingSpecies).toHaveLength(1);
  return drawingSpecies[0] as SchemeSpecies;
}

it("Unicode sub- and superscripts become runs of plain characters", () => {
  expect(textRuns("H₂SO₄")).toEqual([
    { text: "H", position: "normal" },
    { text: "2", position: "subscript" },
    { text: "SO", position: "normal" },
    { text: "4", position: "subscript" },
  ]);
  expect(textRuns("2. H₃O⁺")).toEqual([
    { text: "2. H", position: "normal" },
    { text: "3", position: "subscript" },
    { text: "O", position: "normal" },
    { text: "+", position: "superscript" },
  ]);
  expect(textRuns("")).toEqual([]);
});

it("each run is shifted from the one before, in em of the label's font", () => {
  // A subscript's baseline sits 0.2 em below the label's, a superscript's 0.4 em above it.
  expect(textRunShifts(textRuns("H₂O⁻"))).toEqual([0, 0.2, -0.2, -0.4]);
  expect(textRunShifts(textRuns("SO₄²⁻"))).toEqual([0, 0.2, expect.closeTo(-0.6, 9)]);
});

it("the conditions go above the arrow up to the first ·, the rest below", () => {
  expect(conditionsLabelParts("NaCN · DMSO · 25 °C")).toEqual({
    above: "NaCN",
    below: "DMSO, 25 °C",
  });
  expect(conditionsLabelParts("Br₂ · hν")).toEqual({ above: "Br₂", below: "hν" });
  expect(conditionsLabelParts("Et₂O")).toEqual({ above: "Et₂O", below: "" });
  expect(conditionsLabelParts(undefined)).toEqual({ above: "", below: "" });
});

it("butane is four unlabelled carbons joined by bonds one bond length long", () => {
  const species = onlySpecies(
    drawSchemeState({
      mappedSmiles: "[CH3:1][CH2:2][CH2:3][CH3:4]",
      mapNumberToCoordinates: coordinatesOf(ZIGZAG),
    }).species,
  );
  expect(species.labels).toEqual([]);
  expect(species.lines.map((line) => lengthOf(line))).toEqual([
    expect.closeTo(SCHEME_BOND_LENGTH, 2),
    expect.closeTo(SCHEME_BOND_LENGTH, 2),
    expect.closeTo(SCHEME_BOND_LENGTH, 2),
  ]);
  // The first atom sits at the origin; the second is up and to the right (y flips).
  expect(species.lines[0]?.start).toEqual({ x: 0, y: 0 });
  expect(species.lines[0]?.end.x).toBeCloseTo(17.32, 1);
  expect(species.lines[0]?.end.y).toBeCloseTo(-10, 1);
});

it("a heteroatom is labelled with its hydrogens and its bond stops short of the label", () => {
  const species = onlySpecies(
    drawSchemeState({
      mappedSmiles: "[CH3:1][CH2:2][OH:3]",
      mapNumberToCoordinates: coordinatesOf(ZIGZAG.slice(0, 3)),
    }).species,
  );
  expect(species.labels.map((label) => [label.mapNumber, labelText(label)])).toEqual([[3, "OH"]]);
  const oxygen = { x: (2.598 * SCHEME_BOND_LENGTH) / 1.5, y: 0 };
  const carbonOxygen = species.lines[1] as SchemeLine;
  const gap = Math.hypot(carbonOxygen.end.x - oxygen.x, carbonOxygen.end.y - oxygen.y);
  expect(gap).toBeGreaterThan(5);
  expect(gap).toBeLessThan(10);
});

it("a carbon bonded only to a heteroatom in a two-atom species is labelled", () => {
  const species = onlySpecies(
    drawSchemeState({
      mappedSmiles: "[CH3:1][Br:2]",
      mapNumberToCoordinates: { "1": [0, 0], "2": [1.5, 0] },
    }).species,
  );
  // Its bond points right, so the hydrogens go on the left.
  expect(species.labels.map(labelText)).toEqual(["H_3C", "Br"]);
});

it("a charge is a superscript after the label", () => {
  const species = onlySpecies(
    drawSchemeState({ mappedSmiles: "[NH4+:1]", mapNumberToCoordinates: { "1": [0, 0] } }).species,
  );
  expect(species.labels.map(labelText)).toEqual(["NH_4^+"]);
});

it("a lone oxygen, sulfur or halogen is written hydrogens first, as textbooks do", () => {
  const labelsOf = (mappedSmiles: string): string[] =>
    drawSchemeState({ mappedSmiles, mapNumberToCoordinates: { "1": [0, 0] } }).species.flatMap(
      (species) => species.labels.map(labelText),
    );
  expect(labelsOf("[OH-:1]")).toEqual(["HO^−"]);
  expect(labelsOf("[OH2:1]")).toEqual(["H_2O"]);
  expect(labelsOf("[BrH:1]")).toEqual(["HBr"]);
  expect(labelsOf("[NH3:1]")).toEqual(["NH_3"]);
});

it("an explicit hydrogen on a carbon is left out, as skeletal formulas do", () => {
  const species = onlySpecies(
    drawSchemeState({
      mappedSmiles: "[CH3:1][CH:2]([H:4])[CH3:3]",
      mapNumberToCoordinates: {
        "1": [0, 0],
        "2": [1.299, 0.75],
        "3": [2.598, 0],
        "4": [1.299, 2.25],
      },
    }).species,
  );
  expect(species.labels).toEqual([]);
  expect(species.lines).toHaveLength(2);
});

it("an explicit hydrogen on a heteroatom joins its label", () => {
  const drawing = drawSchemeState({
    mappedSmiles: "[H:2][Br:1].[CH3:3][O:4][H:5]",
    mapNumberToCoordinates: {
      "1": [-3, 0],
      "2": [-4.5, 0],
      "3": [0, 0],
      "4": [1.299, 0.75],
      "5": [2.598, 0],
    },
  });
  expect(drawing.species.map((species) => species.labels.map(labelText))).toEqual([
    ["HBr"],
    ["H_3C", "OH"],
  ]);
  expect(drawing.species[1]?.lines).toHaveLength(1);
});

it("a bond leaving to the right of a charged label clears its charge", () => {
  const species = onlySpecies(
    drawSchemeState({
      mappedSmiles: "[O-:1][CH3:2]",
      mapNumberToCoordinates: { "1": [0, 0], "2": [1.5, 0] },
    }).species,
  );
  // Half the O (0.389 em) and the 0.7 em minus sign (0.584 em) of the 13.6 px font: 10.9 px.
  expect(species.lines[0]?.start.x).toBeGreaterThan(10.9);
});

it("a carbocation inside a carbon skeleton shows only its charge", () => {
  const species = onlySpecies(
    drawSchemeState({
      mappedSmiles: "[CH3:1][C+:2]([CH3:3])[CH3:4]",
      mapNumberToCoordinates: {
        "1": [-1.299, -0.75],
        "2": [0, 0],
        "3": [1.299, -0.75],
        "4": [0, 1.5],
      },
    }).species,
  );
  expect(species.labels.map((label) => [label.mapNumber, labelText(label)])).toEqual([[2, "^+"]]);
  // No label to clear: the bonds reach the cation's vertex.
  expect(species.lines.map((line) => lengthOf(line))).toEqual([
    expect.closeTo(SCHEME_BOND_LENGTH, 2),
    expect.closeTo(SCHEME_BOND_LENGTH, 2),
    expect.closeTo(SCHEME_BOND_LENGTH, 2),
  ]);
});

it("a ring double bond has its second line inside the ring, shortened", () => {
  // A hexagon of radius 1.5 centred on the origin, first atom at the top.
  const hexagon = [0, 1, 2, 3, 4, 5].map((position) => {
    const angle = Math.PI / 2 - (position * Math.PI) / 3;
    return [1.5 * Math.cos(angle), 1.5 * Math.sin(angle)];
  });
  const species = onlySpecies(
    drawSchemeState({
      mappedSmiles: "[CH:1]1=[CH:2][CH:3]=[CH:4][CH:5]=[CH:6]1",
      mapNumberToCoordinates: coordinatesOf(hexagon),
    }).species,
  );
  // Six ring lines plus three inner lines.
  expect(species.lines).toHaveLength(9);
  const [outer, inner] = species.lines.slice(0, 2) as [SchemeLine, SchemeLine];
  const distanceToCentre = (line: SchemeLine): number =>
    Math.hypot(midpointOf(line).x, midpointOf(line).y);
  expect(distanceToCentre(outer) - distanceToCentre(inner)).toBeCloseTo(
    SCHEME_DOUBLE_BOND_SPACING,
    5,
  );
  expect(lengthOf(inner)).toBeLessThan(lengthOf(outer) - 4);
});

it("a terminal C=O is two lines either side of the bond's axis", () => {
  const species = onlySpecies(
    drawSchemeState({
      mappedSmiles: "[CH3:1][C:2](=[O:3])[CH3:4]",
      mapNumberToCoordinates: {
        "1": [-1.299, -0.75],
        "2": [0, 0],
        "3": [0, 1.5],
        "4": [1.299, -0.75],
      },
    }).species,
  );
  // The C=O bond is vertical along x = 0: its two lines sit at ±spacing / 2.
  const carbonOxygen = species.lines.filter((line) => Math.abs(line.start.x - line.end.x) < 1e-9);
  expect(carbonOxygen.map((line) => line.start.x).sort((one, other) => one - other)).toEqual([
    expect.closeTo(-SCHEME_DOUBLE_BOND_SPACING / 2, 5),
    expect.closeTo(SCHEME_DOUBLE_BOND_SPACING / 2, 5),
  ]);
});

it("a chain C=C keeps one line on its axis and the other on the side of its neighbours", () => {
  const species = onlySpecies(
    drawSchemeState({
      mappedSmiles: "[CH3:1][CH:2]=[CH:3][CH3:4]",
      mapNumberToCoordinates: coordinatesOf(ZIGZAG),
    }).species,
  );
  const doubleLines = species.lines.slice(1, 3) as [SchemeLine, SchemeLine];
  // The axis line joins the two atoms; the neighbours (atoms 1 and 4) lie below the bond on
  // screen, so the second line is below it (larger y).
  expect(doubleLines[0].start.y).toBeCloseTo(-10, 1);
  expect(midpointOf(doubleLines[1]).y).toBeGreaterThan(midpointOf(doubleLines[0]).y);
});

it("a wedge has its narrow end at the first atom of its key", () => {
  const species = onlySpecies(
    drawSchemeState({
      mappedSmiles: "[CH3:1][CH2:2][CH2:3][CH3:4]",
      mapNumberToCoordinates: coordinatesOf(ZIGZAG),
      bondToWedgeStyle: { "3-2": "wedge" },
    }).species,
  );
  expect(species.lines).toHaveLength(2);
  expect(species.wedges).toHaveLength(1);
  const [narrow] = species.wedges[0]?.corners ?? [];
  expect(narrow?.x).toBeCloseTo((2.598 * SCHEME_BOND_LENGTH) / 1.5, 2);
});

it("species are drawn left to right, leaving out a metal counter-ion", () => {
  // The salt is named in the conditions (NaOH), as SciFinder writes reagents.
  const drawing = drawSchemeState({
    mappedSmiles: "[OH-:1].[CH3:2][Br:3].[Na+:4]",
    mapNumberToCoordinates: { "1": [-3.3, 0], "2": [0, 0], "3": [1.5, 0], "4": [-3.3, -1.9] },
  });
  expect(drawing.species.map((species) => species.labels.map(labelText))).toEqual([
    ["HO^−"],
    ["H_3C", "Br"],
  ]);
});

it("a state that is only a counter-ion still draws it", () => {
  const drawing = drawSchemeState({
    mappedSmiles: "[Na+:1]",
    mapNumberToCoordinates: { "1": [0, 0] },
  });
  expect(drawing.species.map((species) => species.labels.map(labelText))).toEqual([["Na^+"]]);
});

it("an intact abbreviated group is one label and its other atoms are not drawn", () => {
  const wittig = exampleReactionDocuments().find(
    ([name]) => name === "wittig-methylenation-cyclohexanone.json",
  )?.[1] as Record<string, unknown>;
  const stateIdToState = wittig["stateIdToState"] as Record<string, Record<string, unknown>>;
  const reactants = stateIdToState["reactants"] as Record<string, unknown>;
  const drawing = drawSchemeState(
    {
      mappedSmiles: String(reactants["mappedSmiles"]),
      mapNumberToCoordinates: reactants["mapNumberToCoordinates"] as Record<string, number[]>,
    },
    wittig["abbreviatedGroups"] as {
      groupLabel: string;
      attachmentMapNumber: number;
      mapNumbers: number[];
    }[],
  );
  const ylide = drawing.species.find((species) =>
    species.labels.some((label) => label.mapNumber === 1),
  );
  expect(ylide?.labels.map(labelText).sort()).toEqual(["CH_2^−", "P^+", "Ph", "Ph", "Ph"]);
  expect(ylide?.lines).toHaveLength(4);
});

it("each species' view box holds its atoms and labels with a little room", () => {
  const species = onlySpecies(
    drawSchemeState({
      mappedSmiles: "[CH3:1][CH2:2][CH2:3][CH3:4]",
      mapNumberToCoordinates: coordinatesOf(ZIGZAG),
    }).species,
  );
  expect(species.viewBox.minX).toBeLessThan(0);
  expect(species.viewBox.minX + species.viewBox.width).toBeGreaterThan(51.96);
  expect(species.viewBox.minY).toBeLessThan(-10);
  expect(species.viewBox.minY + species.viewBox.height).toBeGreaterThan(0);
});
