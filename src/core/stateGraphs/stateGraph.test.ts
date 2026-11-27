/**
 * Tests for stateGraph.ts: the derived electron counts. Graphs are built by hand, so these tests do
 * not depend on SMILES reading. Expected values are counted from Lewis structures.
 */
import { expect, test } from "vitest";
import {
  bondKey,
  bondKeyMapNumbers,
  bondOrderSum,
  formalCharge,
  lonePairCount,
  maximumValenceShellElectrons,
  type StateAtom,
  type StateGraph,
  stateGraphsEqual,
  stateGraphToJson,
  unpairedElectronCount,
  valenceShellElectronCount,
} from "./stateGraph.js";

function atom(
  mapNumber: number,
  element: string,
  hydrogenCount: number,
  nonbondingElectronCount: number,
): StateAtom {
  return { mapNumber, element, hydrogenCount, nonbondingElectronCount };
}

function graphOf(atoms: StateAtom[], bonds: [number, number, number][]): StateGraph {
  return {
    mapNumberToAtom: new Map(atoms.map((each) => [each.mapNumber, each])),
    bondToOrder: new Map(bonds.map(([first, second, order]) => [bondKey(first, second), order])),
  };
}

const hydroxide = graphOf([atom(1, "O", 1, 6)], []);
const bromineRadical = graphOf([atom(1, "Br", 0, 7)], []);
// The ylide [CH2-:2][P+:1](C)(C)C, with the three methyls as map numbers 11-13.
const phosphoniumYlide = graphOf(
  [atom(1, "P", 0, 0), atom(2, "C", 2, 2),
   atom(11, "C", 3, 0), atom(12, "C", 3, 0), atom(13, "C", 3, 0)],
  [[1, 2, 1], [1, 11, 1], [1, 12, 1], [1, 13, 1]],
); // prettier-ignore

function onlyAtom(graph: StateGraph, mapNumber: number): StateAtom {
  const found = graph.mapNumberToAtom.get(mapNumber);
  if (found === undefined) {
    throw new Error(`no atom ${String(mapNumber)}`);
  }
  return found;
}

test("bondKey puts the smaller map number first, and bondKeyMapNumbers reads it back", () => {
  expect(bondKey(5, 3)).toBe("3-5");
  expect(bondKey(3, 5)).toBe("3-5");
  expect(bondKeyMapNumbers("3-5")).toEqual([3, 5]);
});

test("hydroxide has three lone pairs, charge -1 and an octet", () => {
  expect(formalCharge(hydroxide, 1)).toBe(-1);
  expect(lonePairCount(onlyAtom(hydroxide, 1))).toBe(3);
  expect(unpairedElectronCount(onlyAtom(hydroxide, 1))).toBe(0);
  expect(valenceShellElectronCount(hydroxide, 1)).toBe(8);
});

test("a bromine radical has three lone pairs and one unpaired electron", () => {
  expect(formalCharge(bromineRadical, 1)).toBe(0);
  expect(lonePairCount(onlyAtom(bromineRadical, 1))).toBe(3);
  expect(unpairedElectronCount(onlyAtom(bromineRadical, 1))).toBe(1);
  expect(valenceShellElectronCount(bromineRadical, 1)).toBe(7);
});

test("ylide charges come from the electron counts", () => {
  expect(bondOrderSum(phosphoniumYlide, 1)).toBe(4);
  expect(formalCharge(phosphoniumYlide, 1)).toBe(1);
  expect(formalCharge(phosphoniumYlide, 2)).toBe(-1);
  expect(lonePairCount(onlyAtom(phosphoniumYlide, 2))).toBe(1);
});

test("the maximum valence shell is a duet, an octet or expanded, by period", () => {
  expect(maximumValenceShellElectrons("H")).toBe(2);
  expect(maximumValenceShellElectrons("C")).toBe(8);
  expect(maximumValenceShellElectrons("O")).toBe(8);
  expect(maximumValenceShellElectrons("P")).toBe(12);
  expect(maximumValenceShellElectrons("Br")).toBe(12);
});

test("zinc, selenium, tin, mercury and cerium have an expanded shell", () => {
  for (const element of ["Zn", "Se", "Sn", "Hg", "Ce"]) {
    expect(maximumValenceShellElectrons(element)).toBe(12);
  }
});

test("stateGraphToJson sorts atoms and bonds", () => {
  const json = stateGraphToJson(phosphoniumYlide);
  expect(json.atoms[0]).toEqual(atom(1, "P", 0, 0));
  expect(json.bonds.map((bond) => bond.mapNumbers)).toEqual([
    [1, 2],
    [1, 11],
    [1, 12],
    [1, 13],
  ]);
});

test("stateGraphsEqual compares atoms, electrons and bonds", () => {
  const sameYlide = graphOf(
    [atom(13, "C", 3, 0), atom(12, "C", 3, 0), atom(11, "C", 3, 0),
     atom(2, "C", 2, 2), atom(1, "P", 0, 0)],
    [[13, 1, 1], [12, 1, 1], [11, 1, 1], [2, 1, 1]],
  ); // prettier-ignore
  expect(stateGraphsEqual(phosphoniumYlide, sameYlide)).toBe(true);
  expect(stateGraphsEqual(hydroxide, bromineRadical)).toBe(false);
  expect(stateGraphsEqual(hydroxide, graphOf([atom(1, "O", 1, 4)], []))).toBe(false);
});
