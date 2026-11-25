/**
 * Tests for stateAtomConsistency.ts.
 *
 * The consistent documents are the example reactions in fixtures/reactions. Each inconsistent one
 * changes a single state of the SN2 example (map numbers: O1 hydroxide oxygen, C2 carbon, Br3,
 * Na4).
 */
import { beforeAll, expect, it } from "vitest";
import {
  type ChemistryToolkit,
  loadChemistryToolkit,
} from "../chemistryToolkit/chemistryToolkit.js";
import { exampleReactionDocuments, isRecord } from "../testSupport/fixtureFiles.js";
import { stateAtomProblems } from "./stateAtomConsistency.js";

let toolkit: ChemistryToolkit;

beforeAll(async () => {
  toolkit = await loadChemistryToolkit();
});

function sn2Example(): Record<string, unknown> {
  const found = exampleReactionDocuments().find(
    ([name]) => name === "sn2-hydroxide-bromomethane.json",
  );
  if (found === undefined) {
    throw new Error("the SN2 example is missing");
  }
  return structuredClone(found[1]);
}

/** The SN2 example with its products state replaced: a dummy coordinate per key given. */
function sn2WithProductsState(
  mappedSmiles: string,
  coordinateKeys: readonly string[],
): Record<string, unknown> {
  const document = sn2Example();
  const states = document.stateIdToState;
  const productsState = isRecord(states) ? states.products : undefined;
  if (!isRecord(productsState)) {
    throw new Error("the SN2 example has no products state");
  }
  productsState.mappedSmiles = mappedSmiles;
  productsState.mapNumberToCoordinates = Object.fromEntries(
    coordinateKeys.map((key) => [key, [0, 0]]),
  );
  return document;
}

it.each(exampleReactionDocuments())("finds nothing in the example %s", (name, document) => {
  expect(stateAtomProblems(document, toolkit)).toEqual([]);
});

it("reports unreadable SMILES", () => {
  const problems = stateAtomProblems(sn2WithProductsState("[OH:1][CH3:2(", ["1", "2"]), toolkit);
  expect(problems).toHaveLength(1);
  expect(problems[0]).toMatch(/^state products: .*cannot be read/);
});

it("reports an atom without a map number", () => {
  const document = sn2WithProductsState("[OH:1][CH3:2].[Br-].[Na+:4]", ["1", "2", "4"]);
  expect(stateAtomProblems(document, toolkit)).toEqual([
    "state products: an atom Br has no map number",
  ]);
});

it("reports a map number used twice in one state", () => {
  const document = sn2WithProductsState("[OH:1][CH3:2].[Br-:2].[Na+:4]", ["1", "2", "4"]);
  expect(stateAtomProblems(document, toolkit)).toContain(
    "state products: map number 2 is used more than once",
  );
});

it("reports a map number changing element between states", () => {
  const document = sn2WithProductsState("[OH:1][CH3:2].[Cl-:3].[Na+:4]", ["1", "2", "3", "4"]);
  expect(stateAtomProblems(document, toolkit)).toEqual([
    "state products: map number 3 is Cl here but Br in state reactants",
  ]);
});

it("reports missing coordinates", () => {
  const document = sn2WithProductsState("[OH:1][CH3:2].[Br-:3].[Na+:4]", ["1", "2", "4"]);
  expect(stateAtomProblems(document, toolkit)).toEqual([
    "state products: no coordinates for map number 3",
  ]);
});

it("reports coordinates for an absent map number", () => {
  const document = sn2WithProductsState("[OH:1][CH3:2].[Br-:3].[Na+:4]", ["1", "2", "3", "4", "9"]);
  expect(stateAtomProblems(document, toolkit)).toEqual([
    "state products: coordinates for map number 9, which is not in the state",
  ]);
});

it("keeps explicit mapped hydrogens as atoms that need coordinates", () => {
  const document = sn2WithProductsState("[H:5][O:1][CH3:2].[Br-:3].[Na+:4]", ["1", "2", "3", "4"]);
  expect(stateAtomProblems(document, toolkit)).toEqual([
    "state products: no coordinates for map number 5",
  ]);
});
