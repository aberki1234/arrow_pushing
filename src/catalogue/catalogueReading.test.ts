/**
 * Tests for catalogueReading.ts against the shared cases in
 * fixtures/catalogue/catalogue_reading_cases.json (the catalogue build validates the same catalogue
 * and invalid edits with the same schema).
 */
import { expect, test } from "vitest";
import {
  fixtureCaseEntries,
  isRecord,
  readFixtureJson,
  textField,
} from "../testSupport/fixtureFiles.js";
import {
  catalogueSchemaViolations,
  dailyReactionVersionRefForDate,
  localDateText,
  reactionFilePath,
  readCatalogue,
} from "./catalogueReading.js";

const casesFile = "catalogue/catalogue_reading_cases.json";

function exampleCatalogueDocument(): Record<string, unknown> {
  const cases = readFixtureJson(casesFile);
  const catalogueDocument = isRecord(cases) ? cases["catalogue"] : undefined;
  if (!isRecord(catalogueDocument)) {
    throw new Error(`${casesFile} must hold an object under "catalogue"`);
  }
  return catalogueDocument;
}

function nullableTextField(entry: Record<string, unknown>, key: string): string | null {
  return entry[key] === null ? null : textField(entry, key);
}

test("the shared example catalogue is valid", () => {
  expect(catalogueSchemaViolations(exampleCatalogueDocument())).toEqual([]);
});

test.each(fixtureCaseEntries(casesFile, "invalidEdits"))("invalid edit: $caseName", (edit) => {
  const catalogueDocument: unknown = structuredClone(exampleCatalogueDocument());
  const pathToSet = edit["pathToSet"];
  if (!Array.isArray(pathToSet) || pathToSet.length === 0) {
    throw new Error("pathToSet must be a non-empty list");
  }
  let parent = catalogueDocument;
  for (const key of pathToSet.slice(0, -1) as (string | number)[]) {
    parent = (parent as Record<string | number, unknown>)[key];
  }
  (parent as Record<string | number, unknown>)[pathToSet.at(-1) as string | number] =
    edit["newValue"];
  const violationPaths = catalogueSchemaViolations(catalogueDocument).map(
    (violation) => violation.instancePath,
  );
  expect(violationPaths).toContain(textField(edit, "expectedViolationPath"));
});

test("reading an invalid catalogue throws and names the place", () => {
  const catalogueDocument = { ...exampleCatalogueDocument(), formatVersion: 2 };
  expect(() => readCatalogue(catalogueDocument)).toThrow("/formatVersion");
});

test.each(fixtureCaseEntries(casesFile, "dateCases"))("daily puzzle: $caseName", (dateCase) => {
  const catalogue = readCatalogue(exampleCatalogueDocument());
  expect(dailyReactionVersionRefForDate(catalogue, textField(dateCase, "localDate"))).toBe(
    nullableTextField(dateCase, "expectedReactionVersionRef"),
  );
});

test.each(fixtureCaseEntries(casesFile, "filePathCases"))("file path: $caseName", (pathCase) => {
  const catalogue = readCatalogue(exampleCatalogueDocument());
  expect(reactionFilePath(catalogue, textField(pathCase, "reactionVersionRef"))).toBe(
    nullableTextField(pathCase, "expectedFilePath"),
  );
});

test("a calendar key from the prototype chain is not a date in the calendar", () => {
  const catalogue = readCatalogue(exampleCatalogueDocument());
  expect(dailyReactionVersionRefForDate(catalogue, "constructor")).toBeNull();
  expect(reactionFilePath(catalogue, "toString@1")).toBeNull();
});

test("the local date uses the learner's own calendar day, zero-padded", () => {
  // new Date(year, monthIndex, day, hour) is in the local time zone, whatever it is.
  expect(localDateText(new Date(2026, 0, 5, 0, 30))).toBe("2026-01-05");
  expect(localDateText(new Date(2026, 11, 31, 23, 59))).toBe("2026-12-31");
});
