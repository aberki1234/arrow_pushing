/**
 * Tests for structureExchange.ts: a state to Ketcher's molfile and back (item 10h). The reference
 * for the molfile is the V2000 format: atom map number in columns 61–63 of an atom line, bond
 * stereo 1 (wedge) or 6 (dash) with the narrow end at the bond's first atom.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  type ChemistryToolkit,
  loadChemistryToolkit,
} from "../../tooling/chemistryToolkit/chemistryToolkit.js";
import { stateGraphFromMappedSmiles } from "../../core/stateGraphs/mappedSmilesReading.js";
import { stateGraphsEqual } from "../../core/stateGraphs/stateGraph.js";
import { exampleReaction } from "../../testSupport/reactionEdits.js";
import { statesOf } from "./reactionDraft.js";
import {
  applyEditedStructure,
  molfileToStructure,
  saveStructureFromEditor,
  stateToMolfile,
} from "./structureExchange.js";

let toolkit: ChemistryToolkit;
beforeAll(async () => {
  toolkit = await loadChemistryToolkit();
});

const TRANS_DIBROMIDE = {
  mappedSmiles: "[CH:1]1([Br:8])[CH:2]([Br:7])[CH2:3][CH2:4][CH2:5][CH2:6]1",
  mapNumberToCoordinates: {
    "1": [0, 1.5], "2": [1.3, 0.75], "3": [1.3, -0.75], "4": [0, -1.5], "5": [-1.3, -0.75],
    "6": [-1.3, 0.75], "7": [2.6, 1.5], "8": [0, 3],
  },
  bondToWedgeStyle: { "2-7": "wedge", "1-8": "dash" },
}; // prettier-ignore

/** A Ketcher-style molfile: bond length 1, the C2–Br7 wedge and C1–Br8 dash, map numbers. */
function ketcherMolfile(extraAtom = false): string {
  const pad = (value: number | string, width: number): string => String(value).padStart(width);
  const atom = (across: number, up: number, symbol: string, mapNumber: number): string =>
    `${pad(across.toFixed(4), 10)}${pad(up.toFixed(4), 10)}${pad("0.0000", 10)} ` +
    `${symbol.padEnd(3)} 0  0  0  0  0  0  0  0  0${pad(mapNumber, 3)}  0  0`;
  const atoms = [
    atom(0, 1, "C", 1),
    atom(0.866, 0.5, "C", 2),
    atom(0.866, -0.5, "C", 3),
    atom(0, -1, "C", 4),
    atom(-0.866, -0.5, "C", 5),
    atom(-0.866, 0.5, "C", 6),
    atom(1.732, 1, "Br", 7),
    atom(0, 2, "Br", 8),
    ...(extraAtom ? [atom(-1.732, 1, "O", 0)] : []),
  ];
  const bond = (first: number, second: number, order: number, stereo = 0): string =>
    `${pad(first, 3)}${pad(second, 3)}${pad(order, 3)}${pad(stereo, 3)}`;
  const ring = [1, 2, 3, 4, 5, 6].map((position) => bond(position, (position % 6) + 1, 1));
  const bonds = [
    ...ring,
    bond(2, 7, 1, 1),
    bond(1, 8, 1, 6),
    ...(extraAtom ? [bond(6, 9, 1)] : []),
  ];
  const counts = `${pad(atoms.length, 3)}${pad(bonds.length, 3)}  0  0  0  0  0  0  0  0999 V2000`;
  return ["", "  Ketcher", "", counts, ...atoms, ...bonds, "M  END"].join("\n");
}

describe("a state to a molfile and back", () => {
  it("keeps the structure, its map numbers, coordinates and wedges", () => {
    const molfile = stateToMolfile(TRANS_DIBROMIDE);
    expect(molfile).toContain("V2000");
    const back = molfileToStructure(molfile, toolkit, []);
    expect(
      stateGraphsEqual(
        stateGraphFromMappedSmiles(back.mappedSmiles),
        stateGraphFromMappedSmiles(TRANS_DIBROMIDE.mappedSmiles),
      ),
    ).toBe(true);
    expect(back.mapNumberToCoordinates["7"]?.[0]).toBeCloseTo(2.6);
    expect(back.bondToWedgeStyle).toEqual(TRANS_DIBROMIDE.bondToWedgeStyle);
  });

  it("round-trips every example state, charges, explicit hydrogens and radicals included", () => {
    for (const fileName of [
      "sn2-hydroxide-bromomethane.json",
      "aldol-addition-base.json",
      "wittig-methylenation-cyclohexanone.json",
      "radical-bromination-methane.json",
    ]) {
      for (const [stateId, state] of Object.entries(statesOf(exampleReaction(fileName)))) {
        const original = state as {
          mappedSmiles: string;
          mapNumberToCoordinates: Record<string, [number, number]>;
        };
        const back = molfileToStructure(stateToMolfile(original), toolkit, []);
        expect(
          stateGraphsEqual(
            stateGraphFromMappedSmiles(back.mappedSmiles),
            stateGraphFromMappedSmiles(original.mappedSmiles),
          ),
          `${fileName} ${stateId}`,
        ).toBe(true);
      }
    }
  });
});

describe("a molfile from Ketcher", () => {
  it("rescales to our bond length and reads its wedge and dash", () => {
    const structure = molfileToStructure(ketcherMolfile(), toolkit, []);
    const [x1, y1] = structure.mapNumberToCoordinates["1"] ?? [0, 0];
    const [x2, y2] = structure.mapNumberToCoordinates["2"] ?? [0, 0];
    expect(Math.hypot(x2 - x1, y2 - y1)).toBeCloseTo(1.5, 1);
    expect(structure.bondToWedgeStyle).toEqual({ "2-7": "wedge", "1-8": "dash" });
  });

  it("gives a new atom the next free map number", () => {
    const structure = molfileToStructure(ketcherMolfile(true), toolkit, [1, 2, 3, 4, 5, 6, 7, 8]);
    expect(structure.mappedSmiles).toContain(":9]");
    expect(structure.mapNumberToCoordinates["9"]).toBeDefined();
  });
});

describe("saving an edited structure into a state", () => {
  const sn2 = exampleReaction("sn2-hydroxide-bromomethane.json");
  const products = statesOf(sn2).products as { mappedSmiles: string };

  it("a later state takes a new layout and wedges, with its bonds locked", () => {
    const moved = molfileToStructure(
      stateToMolfile({ ...products, mapNumberToCoordinates: {} }),
      toolkit,
      [],
    );
    const edit = applyEditedStructure(sn2, "products", moved);
    expect(edit.outcome).toBe("edited");
  });
});

describe("saving an edited structure: the layout's place", () => {
  const sn2 = exampleReaction("sn2-hydroxide-bromomethane.json");

  it("keeps the state where it was: the saved layout has the old layout's centre", () => {
    const shifted = molfileToStructure(ketcherMolfile(), toolkit, []);
    const moved = Object.fromEntries(
      Object.entries(shifted.mapNumberToCoordinates).map(([key, [across, up]]) => [
        key,
        [across + 17, up - 11] as [number, number],
      ]),
    );
    const document = {
      ...sn2,
      startStateId: "dibromide",
      stateIdToState: { dibromide: TRANS_DIBROMIDE },
    };
    const edit = applyEditedStructure(document, "dibromide", {
      ...shifted,
      mapNumberToCoordinates: moved,
    });
    const saved = edit.outcome === "edited" ? statesOf(edit.document).dibromide : undefined;
    const centre = (coordinates: Record<string, readonly number[]>): [number, number] => {
      const points = Object.values(coordinates);
      const mean = (axis: number): number =>
        points.reduce((sum, point) => sum + (point[axis] ?? 0), 0) / points.length;
      return [mean(0), mean(1)];
    };
    const [savedAcross, savedUp] = centre(
      (saved as { mapNumberToCoordinates: Record<string, number[]> }).mapNumberToCoordinates,
    );
    const [oldAcross, oldUp] = centre(TRANS_DIBROMIDE.mapNumberToCoordinates);
    expect(savedAcross).toBeCloseTo(oldAcross, 1);
    expect(savedUp).toBeCloseTo(oldUp, 1);
  });

  it("a later state refuses a change to its bonds; the start state accepts it", () => {
    const changed = molfileToStructure(
      stateToMolfile({ mappedSmiles: "[OH-:1].[CH3:2][Br:3].[Na+:4]", mapNumberToCoordinates: {} }),
      toolkit,
      [],
    );
    const refused = applyEditedStructure(sn2, "products", changed);
    expect(refused.outcome === "refused" ? refused.reason : "").toContain("arrows");
    expect(applyEditedStructure(sn2, "reactants", changed).outcome).toBe("edited");
  });
});

describe("saving what the structure editor gives back", () => {
  it("reads the molfile, numbers new atoms after the reaction's map numbers, and saves", () => {
    const sn2 = exampleReaction("sn2-hydroxide-bromomethane.json");
    const reactants = statesOf(sn2).reactants as { mappedSmiles: string };
    // The start state with a methanol (new atoms) added beside it.
    const withMethanol = stateToMolfile({
      mappedSmiles: `${reactants.mappedSmiles}.[CH3:20][OH:21]`,
    })
      .replace(/(\s)20( {2}0 {2}0)$/m, "$1 0$2")
      .replace(/(\s)21( {2}0 {2}0)$/m, "$1 0$2");
    const edit = saveStructureFromEditor(sn2, "reactants", withMethanol, toolkit);
    expect(edit.outcome).toBe("edited");
    const saved = edit.outcome === "edited" ? statesOf(edit.document).reactants : undefined;
    expect((saved as { mappedSmiles: string }).mappedSmiles).toMatch(/:5\]/);
  });

  it("turns a molfile nothing can read into a refusal", () => {
    const sn2 = exampleReaction("sn2-hydroxide-bromomethane.json");
    const edit = saveStructureFromEditor(sn2, "reactants", "not a molfile", toolkit);
    expect(edit.outcome).toBe("refused");
  });
});
