/**
 * Tests for arrowPatterns.ts against the shared cases in
 * fixtures/assessment/arrow_pattern_cases.json; every pattern
 * in the example reactions must parse.
 */
import { expect, test } from "vitest";
import { parseCurvedArrow } from "../arrowNotation/curvedArrowNotation.js";
import {
  exampleReactionDocuments,
  fixtureCaseEntries,
  isRecord,
  readFixtureJson,
  textField,
  textListField,
} from "../../testSupport/fixtureFiles.js";
import { ArrowPatternError, arrowPatternMatches, parseArrowPattern } from "./arrowPatterns.js";

const casesFile = "assessment/arrow_pattern_cases.json";

/** Validate a role table: role name -> map numbers. */
function toRoleTable(value: unknown): Record<string, number[]> {
  if (!isRecord(value)) {
    throw new Error("atomRoleToMapNumbers must be an object");
  }
  const roleTable: Record<string, number[]> = {};
  for (const [roleName, mapNumbers] of Object.entries(value)) {
    if (!Array.isArray(mapNumbers) || !mapNumbers.every((item) => typeof item === "number")) {
      throw new Error(`role ${roleName} must list map numbers`);
    }
    roleTable[roleName] = mapNumbers;
  }
  return roleTable;
}

const casesFileContents = readFixtureJson(casesFile);
const roles = toRoleTable(
  isRecord(casesFileContents) ? casesFileContents.atomRoleToMapNumbers : {},
);
const matchCases = fixtureCaseEntries(casesFile, "matchCases").map((entry) => ({
  caseName: textField(entry, "caseName"),
  arrowPattern: textField(entry, "arrowPattern"),
  learnerArrows: textListField(entry, "learnerArrows"),
  expectedMatch: entry.expectedMatch === true,
}));
const invalidPatterns = fixtureCaseEntries(casesFile, "invalidPatterns").map((entry) => ({
  caseName: textField(entry, "caseName"),
  arrowPattern: textField(entry, "arrowPattern"),
  expectedErrorCode: textField(entry, "expectedErrorCode"),
}));

const examplePatterns = exampleReactionDocuments().flatMap(([, document]) => {
  const states = isRecord(document.stateIdToState) ? Object.values(document.stateIdToState) : [];
  const misconceptions = states
    .filter(isRecord)
    .flatMap((state) =>
      Array.isArray(state.misconceptions) ? state.misconceptions.filter(isRecord) : [],
    );
  return misconceptions.map((misconception) => ({
    arrowPattern: textField(misconception, "arrowPattern"),
    roles: toRoleTable(document.atomRoleToMapNumbers),
  }));
});

test.each(matchCases)("$caseName", ({ arrowPattern, learnerArrows, expectedMatch }) => {
  const parsedPattern = parseArrowPattern(arrowPattern, roles);
  expect(arrowPatternMatches(parsedPattern, learnerArrows.map(parseCurvedArrow))).toBe(
    expectedMatch,
  );
});

test.each(invalidPatterns)(
  "$caseName is refused with $expectedErrorCode",
  ({ arrowPattern, expectedErrorCode }) => {
    let caughtError: unknown;
    try {
      parseArrowPattern(arrowPattern, roles);
    } catch (error) {
      caughtError = error;
    }
    expect(caughtError).toBeInstanceOf(ArrowPatternError);
    expect((caughtError as ArrowPatternError).errorCode).toBe(expectedErrorCode);
  },
);

test("the example reactions have patterns to parse", () => {
  expect(examplePatterns.length).toBeGreaterThanOrEqual(10);
});

test.each(examplePatterns)(
  "example pattern $arrowPattern parses",
  ({ arrowPattern, roles: exampleRoles }) => {
    expect(() => parseArrowPattern(arrowPattern, exampleRoles)).not.toThrow();
  },
);
