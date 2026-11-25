/**
 * Tests for startState.ts: a structure pasted as ordinary SMILES becomes a state the editor can
 * store. The independent reference for distances is RDKit's convention of a 1.5-unit bond.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  type ChemistryToolkit,
  loadChemistryToolkit,
} from "../chemistryToolkit/chemistryToolkit.js";
import { stateGraphFromMappedSmiles } from "../stateGraphs/mappedSmilesReading.js";
import { unpairedElectronCount } from "../stateGraphs/stateGraph.js";
import { StructureEntryError, stateFromPastedSmiles } from "./startState.js";

let toolkit: ChemistryToolkit;

beforeAll(async () => {
  toolkit = await loadChemistryToolkit();
});

function errorCodeOf(pastedSmiles: string): string {
  try {
    stateFromPastedSmiles(pastedSmiles, toolkit);
  } catch (error) {
    if (error instanceof StructureEntryError) {
      return error.errorCode;
    }
    throw error;
  }
  return "no error";
}

describe("stateFromPastedSmiles", () => {
  it.each([
    ["CC(=O)O", "[CH3:1][C:2](=[O:3])[OH:4]"],
    ["[OH-].CBr", "[OH-:1].[CH3:2][Br:3]"], // a mixture, numbered in the order written
    ["[CH3:7][OH:9]", "[CH3:1][OH:2]"], // map numbers in the paste are ignored
    ["[H]OC([H])([H])[H]", "[OH:1][CH3:2]"], // written hydrogens become implicit
    ["C=CC=O", "[CH2:1]=[CH:2][CH:3]=[O:4]"],
  ])("%s becomes %s", (pastedSmiles, expectedMappedSmiles) => {
    expect(stateFromPastedSmiles(pastedSmiles, toolkit).mappedSmiles).toBe(expectedMappedSmiles);
  });

  it("gives an aromatic ring one Kekulé form the strict reader accepts", () => {
    const { mappedSmiles } = stateFromPastedSmiles("Oc1ccccc1", toolkit);
    const graph = stateGraphFromMappedSmiles(mappedSmiles);
    expect(graph.mapNumberToAtom.size).toBe(7);
    expect([...graph.bondToOrder.values()].filter((order) => order === 2)).toHaveLength(3);
  });

  it("keeps a radical as an unpaired electron", () => {
    const graph = stateGraphFromMappedSmiles(stateFromPastedSmiles("[CH3]", toolkit).mappedSmiles);
    expect(unpairedElectronCount(graph.mapNumberToAtom.get(1) ?? fail())).toBe(1);
  });

  it("numbers from the first free map number given (for molecules that arrive later)", () => {
    expect(stateFromPastedSmiles("CC=O", toolkit, 10).mappedSmiles).toBe("[CH3:10][CH:11]=[O:12]");
  });

  it("lays every atom out, one bond length apart", () => {
    const { mapNumberToCoordinates } = stateFromPastedSmiles("CCO", toolkit);
    expect(Object.keys(mapNumberToCoordinates)).toEqual(["1", "2", "3"]);
    const [firstX = 0, firstY = 0] = mapNumberToCoordinates["1"] ?? [];
    const [secondX = 0, secondY = 0] = mapNumberToCoordinates["2"] ?? [];
    expect(Math.abs(Math.hypot(firstX - secondX, firstY - secondY) - 1.5)).toBeLessThan(0.02);
  });

  it.each([
    ["C1CC(", "smiles-not-readable"],
    ["", "smiles-not-readable"],
    ["   ", "smiles-not-readable"],
    ["[Fe+2]", "unsupported-element"],
  ])("refuses %j with %s", (pastedSmiles, expectedErrorCode) => {
    expect(errorCodeOf(pastedSmiles)).toBe(expectedErrorCode);
  });
});

function fail(): never {
  throw new Error("atom missing");
}
