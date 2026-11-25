/**
 * Tests for coordinateSeeding.ts.
 *
 * The independent reference for distances is RDKit's depiction convention: a bond is drawn 1.5
 * units long. The tolerance, 0.02, allows for the rounding of each coordinate to 0.01 and for
 * slightly stretched bonds in rings.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  type ChemistryToolkit,
  loadChemistryToolkit,
} from "../chemistryToolkit/chemistryToolkit.js";
import { isRecord } from "../testSupport/fixtureFiles.js";
import { exampleReaction } from "../testSupport/reactionEdits.js";
import { seededCoordinates, seedMissingCoordinates } from "./coordinateSeeding.js";

const RDKIT_BOND_LENGTH = 1.5;
const BOND_LENGTH_TOLERANCE = 0.02;

let toolkit: ChemistryToolkit;

beforeAll(async () => {
  toolkit = await loadChemistryToolkit();
});

function sn2Reaction(): Record<string, unknown> {
  return exampleReaction("sn2-hydroxide-bromomethane.json");
}

function stateOf(document: Record<string, unknown>, stateId: string): Record<string, unknown> {
  const states = document.stateIdToState;
  const state = isRecord(states) ? states[stateId] : undefined;
  if (!isRecord(state)) {
    throw new Error(`no state ${stateId}`);
  }
  return state;
}

function coordinatesOf(
  document: Record<string, unknown>,
  stateId: string,
): Record<string, unknown> {
  const coordinates = stateOf(document, stateId).mapNumberToCoordinates;
  if (!isRecord(coordinates)) {
    throw new Error(`state ${stateId} has no coordinates`);
  }
  return coordinates;
}

const byNumber = (first: string, second: string): number => Number(first) - Number(second);

describe("seededCoordinates", () => {
  it("covers every mapped atom, explicit hydrogens included", () => {
    const coordinates = seededCoordinates("[H:2][O-:1].[H:4][CH2:3][CH:5]=[O:6]", toolkit);
    expect(Object.keys(coordinates).sort(byNumber)).toEqual(["1", "2", "3", "4", "5", "6"]);
  });

  it("puts bonded atoms one bond length apart", () => {
    const coordinates = seededCoordinates("[CH3:1][CH2:2][OH:3]", toolkit);
    for (const [firstKey, secondKey] of [
      ["1", "2"],
      ["2", "3"],
    ] as const) {
      const [firstX = 0, firstY = 0] = coordinates[firstKey] ?? [];
      const [secondX = 0, secondY = 0] = coordinates[secondKey] ?? [];
      const distance = Math.hypot(firstX - secondX, firstY - secondY);
      expect(Math.abs(distance - RDKIT_BOND_LENGTH)).toBeLessThan(BOND_LENGTH_TOLERANCE);
    }
  });

  it("rounds to 0.01 and never writes -0", () => {
    const values = Object.values(seededCoordinates("[CH3:1][CH2:2][OH:3]", toolkit)).flat();
    for (const value of values) {
      expect(Math.round(value * 100) / 100).toBe(value);
      expect(Object.is(value, -0)).toBe(false);
    }
  });

  it("throws for SMILES RDKit cannot read", () => {
    expect(() => seededCoordinates("[CH3:1](", toolkit)).toThrow(/cannot read/);
  });
});

describe("seedMissingCoordinates", () => {
  it("seeds only states whose coordinates are missing or stale", () => {
    const document = sn2Reaction();
    const reactantCoordinates = structuredClone(coordinatesOf(document, "reactants"));
    delete coordinatesOf(document, "products")["4"];
    expect(seedMissingCoordinates(document, toolkit)).toEqual(["products"]);
    expect(coordinatesOf(document, "reactants")).toEqual(reactantCoordinates);
    expect(Object.keys(coordinatesOf(document, "products")).sort(byNumber)).toEqual([
      "1",
      "2",
      "3",
      "4",
    ]);
  });

  it("seeds a state without the coordinates key", () => {
    const document = sn2Reaction();
    delete stateOf(document, "reactants").mapNumberToCoordinates;
    expect(seedMissingCoordinates(document, toolkit)).toEqual(["reactants"]);
    expect(stateOf(document, "reactants").mapNumberToCoordinates).toBeDefined();
  });

  it("skips a state whose SMILES cannot be read", () => {
    const document = sn2Reaction();
    stateOf(document, "products").mappedSmiles = "[OH:1](";
    stateOf(document, "products").mapNumberToCoordinates = {};
    expect(seedMissingCoordinates(document, toolkit)).toEqual([]);
  });

  it("leaves a clean reaction unchanged", () => {
    const document = sn2Reaction();
    expect(seedMissingCoordinates(document, toolkit)).toEqual([]);
    expect(document).toEqual(sn2Reaction());
  });
});
