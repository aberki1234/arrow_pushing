/**
 * Tests for chemistryToolkit.ts (RDKit.js behind a small interface).
 *
 * The independent reference for distances is RDKit's depiction convention: a bond is drawn 1.5
 * units long. The tolerance, 0.02, allows for slightly stretched bonds in rings.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { type ChemistryToolkit, loadChemistryToolkit } from "./chemistryToolkit.js";

const RDKIT_BOND_LENGTH = 1.5;
const BOND_LENGTH_TOLERANCE = 0.02;

let toolkit: ChemistryToolkit;

beforeAll(async () => {
  toolkit = await loadChemistryToolkit();
});

describe("readAtoms", () => {
  it("gives each atom's element and map number in SMILES order, explicit hydrogens kept", () => {
    expect(toolkit.readAtoms("[H:5][O:1][CH3:2].[Na+:4]")).toEqual([
      { element: "H", mapNumber: 5 },
      { element: "O", mapNumber: 1 },
      { element: "C", mapNumber: 2 },
      { element: "Na", mapNumber: 4 },
    ]);
  });

  it("gives map number 0 to an atom without one", () => {
    expect(toolkit.readAtoms("[OH:1][CH3:2].[Br-]")).toEqual([
      { element: "O", mapNumber: 1 },
      { element: "C", mapNumber: 2 },
      { element: "Br", mapNumber: 0 },
    ]);
  });

  it("reads ordinary aromatic SMILES too", () => {
    expect(toolkit.readAtoms("Oc1ccccc1")).toHaveLength(7);
  });

  it("gives undefined for SMILES it cannot read", () => {
    expect(toolkit.readAtoms("[OH:1][CH3:2(")).toBeUndefined();
    expect(toolkit.readAtoms("C1CC(")).toBeUndefined();
  });
});

describe("laidOutAtoms", () => {
  it("lays out every atom, explicit hydrogens included", () => {
    const atoms = toolkit.laidOutAtoms("[H:2][O-:1].[H:4][CH2:3][CH:5]=[O:6]");
    expect(atoms?.map((atom) => atom.mapNumber)).toEqual([2, 1, 4, 3, 5, 6]);
    for (const atom of atoms ?? []) {
      expect(Number.isFinite(atom.x) && Number.isFinite(atom.y)).toBe(true);
    }
  });

  it("puts bonded atoms one RDKit bond length apart", () => {
    const atoms = toolkit.laidOutAtoms("[CH3:1][CH2:2][OH:3]") ?? [];
    expect(atoms).toHaveLength(3);
    for (const [first, second] of [
      [0, 1],
      [1, 2],
    ] as const) {
      const firstAtom = atoms[first];
      const secondAtom = atoms[second];
      if (firstAtom === undefined || secondAtom === undefined) {
        throw new Error("atom missing");
      }
      const distance = Math.hypot(firstAtom.x - secondAtom.x, firstAtom.y - secondAtom.y);
      expect(Math.abs(distance - RDKIT_BOND_LENGTH)).toBeLessThan(BOND_LENGTH_TOLERANCE);
    }
  });

  it("gives undefined for SMILES it cannot read", () => {
    expect(toolkit.laidOutAtoms("[CH3:1](")).toBeUndefined();
  });
});

describe("readWrittenStructure", () => {
  it("gives atoms with hydrogens and charges, and bonds, exactly as written", () => {
    expect(toolkit.readWrittenStructure("[CH2-:1][CH:2]=[O:3]")).toEqual({
      atoms: [
        { element: "C", mapNumber: 1, hydrogenCount: 2, formalCharge: -1 },
        { element: "C", mapNumber: 2, hydrogenCount: 1, formalCharge: 0 },
        { element: "O", mapNumber: 3, hydrogenCount: 0, formalCharge: 0 },
      ],
      bonds: [
        { firstAtomIndex: 0, secondAtomIndex: 1, bondOrder: 1 },
        { firstAtomIndex: 1, secondAtomIndex: 2, bondOrder: 2 },
      ],
    });
  });

  it("keeps a Kekulé ring's bonds where they were written", () => {
    const benzene = toolkit.readWrittenStructure("[CH:1]1=[CH:2][CH:3]=[CH:4][CH:5]=[CH:6]1");
    expect(benzene?.bonds.map((bond) => bond.bondOrder)).toEqual([2, 1, 2, 1, 2, 1]);
  });

  it("gives undefined for SMILES it cannot read", () => {
    expect(toolkit.readWrittenStructure("[CH3:1](")).toBeUndefined();
  });
});
