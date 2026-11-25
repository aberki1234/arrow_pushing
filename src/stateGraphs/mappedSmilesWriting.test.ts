/**
 * Tests for mappedSmilesWriting.ts. The strongest check is the round trip: writing a state graph
 * and reading it back (mappedSmilesReading.ts) gives the same graph, for every valid shared case
 * and every example state.
 */
import { expect, it } from "vitest";
import {
  exampleReactionDocuments,
  fixtureCaseEntries,
  isRecord,
  textField,
} from "../testSupport/fixtureFiles.js";
import { stateGraphFromMappedSmiles } from "./mappedSmilesReading.js";
import { mappedSmilesFromStateGraph } from "./mappedSmilesWriting.js";
import { stateGraphToJson } from "./stateGraph.js";

const fixtureSmiles = fixtureCaseEntries("state_graphs/mapped_smiles_cases.json", "validCases").map(
  (entry) => textField(entry, "mappedSmiles"),
);
const exampleStateSmiles = exampleReactionDocuments().flatMap(([, document]) => {
  const states = isRecord(document.stateIdToState) ? Object.values(document.stateIdToState) : [];
  return states.filter(isRecord).map((state) => textField(state, "mappedSmiles"));
});

function rewritten(mappedSmiles: string): string {
  return mappedSmilesFromStateGraph(stateGraphFromMappedSmiles(mappedSmiles));
}

it.each([...new Set([...fixtureSmiles, ...exampleStateSmiles])].sort())(
  "writing %s and reading it back gives the same graph",
  (mappedSmiles) => {
    const graph = stateGraphFromMappedSmiles(mappedSmiles);
    const roundTrip = stateGraphFromMappedSmiles(mappedSmilesFromStateGraph(graph));
    expect(stateGraphToJson(roundTrip)).toEqual(stateGraphToJson(graph));
  },
);

it.each([
  ["[OH-:1]", "[OH-:1]"],
  ["[Na+:4].[OH-:1]", "[OH-:1].[Na+:4]"], // molecules in order of their lowest map number
  ["[Br:2][CH3:1]", "[CH3:1][Br:2]"], // each molecule starts at its lowest map number
  ["[CH3:1].[Br:2]", "[CH3:1].[Br:2]"], // radicals follow from the counts
  ["[CH2:1]=[CH:2][CH:3]=[O:4]", "[CH2:1]=[CH:2][CH:3]=[O:4]"],
  ["[CH3:1][C:2](=[O:3])[O-:4]", "[CH3:1][C:2](=[O:3])[O-:4]"], // a branch
  ["[O:1]=[C:2]=[O:3]", "[O:1]=[C:2]=[O:3]"],
  ["[Mg+2:1].[Br-:2].[Br-:3]", "[Mg+2:1].[Br-:2].[Br-:3]"], // a charge of 2 is written "+2"
  ["[H:2][O:1][H:3]", "[O:1]([H:2])[H:3]"], // explicit H atoms are branches
])("%s is written %s", (mappedSmiles, expected) => {
  expect(rewritten(mappedSmiles)).toBe(expected);
});

it("closes a ring with a numbered bond, writing its symbol where the ring closes", () => {
  const benzene = "[CH:1]1=[CH:2][CH:3]=[CH:4][CH:5]=[CH:6]1";
  expect(rewritten(benzene)).toBe(benzene);
  // The bond 1=6 closes the ring, so its "=" goes before the closing digit.
  const cyclohexene = "[CH:1]1=[CH:6][CH2:5][CH2:4][CH2:3][CH2:2]1";
  expect(rewritten(cyclohexene)).toBe("[CH:1]1[CH2:2][CH2:3][CH2:4][CH2:5][CH:6]=1");
});

it("numbers rings from 1 and reuses a number once its ring is closed", () => {
  const twoRings = "[CH2:1]1[CH2:2][CH2:3]1.[CH2:4]1[CH2:5][CH2:6]1";
  expect(rewritten(twoRings)).toBe(twoRings);
  const bicyclic = "[CH:1]12[CH2:2][CH2:3][CH:4]1[CH2:5][CH2:6]2";
  expect(stateGraphToJson(stateGraphFromMappedSmiles(rewritten(bicyclic)))).toEqual(
    stateGraphToJson(stateGraphFromMappedSmiles(bicyclic)),
  );
});

it("gives the same text for the same graph whatever order it was written in", () => {
  expect(rewritten("[O:3]=[CH:2][CH3:1]")).toBe(rewritten("[CH3:1][CH:2]=[O:3]"));
});
