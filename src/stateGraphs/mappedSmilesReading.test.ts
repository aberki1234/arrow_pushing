/**
 * Tests for mappedSmilesReading.ts. The shared cases in
 * fixtures/state_graphs/mapped_smiles_cases.json are the reference; the Python twin reads them with
 * RDKit, so passing them checks this parser against RDKit. Every example state must be readable.
 */
import { expect, test } from "vitest";
import {
  exampleReactionDocuments,
  fixtureCaseEntries,
  isRecord,
  textField,
} from "../testSupport/fixtureFiles.js";
import { MappedSmilesError, stateGraphFromMappedSmiles } from "./mappedSmilesReading.js";
import { stateGraphToJson } from "./stateGraph.js";

const casesFile = "state_graphs/mapped_smiles_cases.json";
const validCases = fixtureCaseEntries(casesFile, "validCases").map((entry) => ({
  caseName: textField(entry, "caseName"),
  mappedSmiles: textField(entry, "mappedSmiles"),
  stateGraph: entry.stateGraph,
}));
const invalidCases = fixtureCaseEntries(casesFile, "invalidCases").map((entry) => ({
  caseName: textField(entry, "caseName"),
  mappedSmiles: textField(entry, "mappedSmiles"),
  expectedErrorCode: textField(entry, "expectedErrorCode"),
}));

const exampleStateSmiles = [
  ...new Set(
    exampleReactionDocuments().flatMap(([, document]) => {
      const states = isRecord(document.stateIdToState)
        ? Object.values(document.stateIdToState)
        : [];
      return states.filter(isRecord).map((state) => textField(state, "mappedSmiles"));
    }),
  ),
].sort();

function errorCodeOf(mappedSmiles: string): string | undefined {
  try {
    stateGraphFromMappedSmiles(mappedSmiles);
  } catch (error) {
    return error instanceof MappedSmilesError
      ? error.errorCode
      : `not a MappedSmilesError: ${String(error)}`;
  }
  return undefined;
}

test.each(validCases)("$caseName gives the expected graph", ({ mappedSmiles, stateGraph }) => {
  expect(stateGraphToJson(stateGraphFromMappedSmiles(mappedSmiles))).toEqual(stateGraph);
});

test.each(invalidCases)(
  "$caseName is refused with $expectedErrorCode",
  ({ mappedSmiles, expectedErrorCode }) => {
    expect(errorCodeOf(mappedSmiles)).toBe(expectedErrorCode);
  },
);

test("the example reactions have states to read", () => {
  expect(exampleStateSmiles.length).toBeGreaterThanOrEqual(14);
});

test.each(exampleStateSmiles)("example state %s is readable", (mappedSmiles) => {
  expect(errorCodeOf(mappedSmiles)).toBeUndefined();
});

test("the error message quotes the SMILES", () => {
  expect(() => stateGraphFromMappedSmiles("[CH5:1]")).toThrow("[CH5:1]");
});
