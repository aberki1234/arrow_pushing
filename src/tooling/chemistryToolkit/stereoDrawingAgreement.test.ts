/**
 * The stereo read from a drawing (drawing/moleculeDrawing/shared/stereoDrawing.ts) against RDKit:
 * RDKit lays out each molecule and chooses its own wedges; reading that drawing must give the
 * marks our strict reader takes from the same SMILES. RDKit is the independent reference here:
 * it wedges by its own rules and lays out double bonds from the SMILES directions.
 */
import { beforeAll, expect, test } from "vitest";
import { stateGraphFromMappedSmiles } from "../../core/stateGraphs/mappedSmilesReading.js";
import {
  type BondToWedgeStyle,
  drawnDoubleBondRelation,
  tetrahedralMarksFromDrawing,
} from "../../drawing/moleculeDrawing/shared/stereoDrawing.js";
import { type ChemistryToolkit, loadChemistryToolkit } from "./chemistryToolkit.js";

let toolkit: ChemistryToolkit;

beforeAll(async () => {
  toolkit = await loadChemistryToolkit();
});

const MOLBLOCK_HEADER_LINES = 3;
const MOLBLOCK_STEREO_TO_STYLE: Readonly<Record<string, "wedge" | "dash">> = {
  "1": "wedge",
  "6": "dash",
};

/** Coordinates by map number and wedges by "<narrow>-<wide>" map numbers, from a molblock. */
function drawingOf(molblock: string): {
  coordinates: Record<string, [number, number]>;
  wedges: BondToWedgeStyle;
} {
  const lines = molblock.split("\n");
  const countsLine = lines[MOLBLOCK_HEADER_LINES] ?? "";
  const atomCount = Number(countsLine.slice(0, 3));
  const bondCount = Number(countsLine.slice(3, 6));
  const atomLines = lines.slice(MOLBLOCK_HEADER_LINES + 1, MOLBLOCK_HEADER_LINES + 1 + atomCount);
  const mapNumbers = atomLines.map((line) => Number(line.trim().split(/\s+/)[13]));
  const coordinates = Object.fromEntries(
    atomLines.map((line, index): [string, [number, number]] => {
      const [across = "0", up = "0"] = line.trim().split(/\s+/);
      return [String(mapNumbers[index]), [Number(across), Number(up)]];
    }),
  );
  const bondLines = lines.slice(
    MOLBLOCK_HEADER_LINES + 1 + atomCount,
    MOLBLOCK_HEADER_LINES + 1 + atomCount + bondCount,
  );
  const wedges: Record<string, "wedge" | "dash"> = {};
  for (const line of bondLines) {
    const [firstIndex = 0, secondIndex = 0, , stereo = "0"] = line.trim().split(/\s+/).map(String);
    const style = MOLBLOCK_STEREO_TO_STYLE[stereo];
    if (style !== undefined) {
      const first = mapNumbers[Number(firstIndex) - 1];
      const second = mapNumbers[Number(secondIndex) - 1];
      wedges[`${String(first)}-${String(second)}`] = style;
    }
  }
  return { coordinates, wedges };
}

const chiralStates = [
  "[CH3:1][C@@H:2]([OH:3])[CH2:4][CH3:5]",
  "[CH3:1][C@H:2]([OH:3])[CH2:4][CH3:5]",
  "[F:1][C@:2]([Cl:3])([Br:4])[I:5]",
  "[F:1][C@@:2]([Cl:3])([Br:4])[I:5]",
  "[Br:8][C@@H:1]1[C@@H:2]([Br:7])[CH2:3][CH2:4][CH2:5][CH2:6]1",
  "[Br:8][C@@H:1]1[C@H:2]([Br:7])[CH2:3][CH2:4][CH2:5][CH2:6]1",
  "[NH2:1][C@@H:2]([CH3:3])[C:4](=[O:5])[OH:6]",
  "[CH3:1][C@@H:2]1[CH2:3][CH2:4][C@H:5]([CH3:9])[CH2:6][CH2:7]1",
  "[CH3:10][CH:11]([CH3:12])[C@@H:2]1[CH2:3][CH2:4][C@@H:5]([CH3:9])[CH2:6][C@H:1]1[Cl:13]",
  "[OH:1][C@H:2]1[C@@H:3]([OH:4])[CH2:5][O:6][CH2:7]1",
];

test.each(chiralStates)("RDKit's wedges for %s read as our marks", (mappedSmiles) => {
  const molblock = toolkit.laidOutMolblock(mappedSmiles);
  if (molblock === undefined) {
    throw new Error(`RDKit cannot read ${mappedSmiles}`);
  }
  const { coordinates, wedges } = drawingOf(molblock);
  const graph = stateGraphFromMappedSmiles(mappedSmiles);
  expect(Object.keys(wedges).length).toBeGreaterThan(0);
  expect(tetrahedralMarksFromDrawing(graph, coordinates, wedges)).toEqual(
    graph.mapNumberToTetrahedralMark,
  );
});

test.each([
  "[CH3:1]/[CH:2]=[CH:3]/[CH3:4]",
  "[CH3:1]/[CH:2]=[CH:3]\\[CH3:4]",
  "[Cl:1]/[CH:2]=[C:3](/[CH3:4])[CH2:5][CH3:6]",
  "[CH3:5][CH2:6]/[C:3](=[CH:2]/[Cl:1])[CH3:4]",
])("RDKit's layout of %s reads as our cis or trans", (mappedSmiles) => {
  const molblock = toolkit.laidOutMolblock(mappedSmiles);
  if (molblock === undefined) {
    throw new Error(`RDKit cannot read ${mappedSmiles}`);
  }
  const { coordinates } = drawingOf(molblock);
  const graph = stateGraphFromMappedSmiles(mappedSmiles);
  for (const [key, relation] of graph.bondToDoubleBondRelation ?? []) {
    expect(drawnDoubleBondRelation(graph, key, coordinates)).toBe(relation);
  }
  expect(graph.bondToDoubleBondRelation?.size).toBe(1);
});
