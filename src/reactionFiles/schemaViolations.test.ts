/**
 * Tests for schemaViolations.ts.
 *
 * The valid documents are the example reactions in fixtures/reactions. The invalid ones are made
 * from them by the shared edits in fixtures/schema_cases/invalid_edits.json, each with the instance
 * path that must be reported.
 *
 * The helpers check types at run time instead of casting, so a malformed fixture fails with a
 * message naming the problem rather than silently editing the wrong place.
 */
import { readdirSync, readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import { expect, test } from "vitest";
import { jsonPointer, reactionSchema, schemaViolations } from "./schemaViolations.js";

/** Any value JSON can hold. Mutable, because an edit changes a copy of a parsed document. */
type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;
interface JsonObject {
  [key: string]: JsonValue;
}

/** Keys (in objects) and positions (in arrays) from the document root down to one value. */
type JsonPath = readonly (string | number)[];

interface EditCaseCommonFields {
  readonly caseName: string;
  readonly baseReactionFile: string;
  readonly expectedViolationPath: string;
}

/** Replace (or add) the value at `pathToSet` with `newValue`. */
interface SetValueEditCase extends EditCaseCommonFields {
  readonly pathToSet: JsonPath;
  readonly newValue: JsonValue;
  // `?: never` forbids the key. Without it, TypeScript would accept an object literal that has
  // both paths, because a union allows any property that belongs to one of its members.
  readonly pathToDelete?: never;
}

/** Remove the key or array position at `pathToDelete`. */
interface DeleteValueEditCase extends EditCaseCommonFields {
  readonly pathToDelete: JsonPath;
  readonly pathToSet?: never;
  readonly newValue?: never;
}

/** Exactly one kind of edit: the compiler rejects a case with both paths or neither. */
type InvalidEditCase = SetValueEditCase | DeleteValueEditCase;

/** JSON.parse returns `any`; its result is always a JSON value, which is what this states. */
function parseJson(text: string): JsonValue {
  return JSON.parse(text) as JsonValue;
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonPath(value: JsonValue | undefined): value is (string | number)[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((part) => typeof part === "string" || typeof part === "number")
  );
}

function requiredText(fields: JsonObject, key: string): string {
  const value = fields[key];
  if (typeof value !== "string") {
    throw new Error(`edit case field "${key}" must be text, got ${JSON.stringify(value)}`);
  }
  return value;
}

/** Check one entry of invalid_edits.json and turn it into a typed edit case. */
function toInvalidEditCase(entry: JsonValue): InvalidEditCase {
  if (!isJsonObject(entry)) {
    throw new Error(`edit case must be an object, got ${JSON.stringify(entry)}`);
  }
  const commonFields: EditCaseCommonFields = {
    caseName: requiredText(entry, "caseName"),
    baseReactionFile: requiredText(entry, "baseReactionFile"),
    expectedViolationPath: requiredText(entry, "expectedViolationPath"),
  };
  const { pathToSet, pathToDelete, newValue } = entry;
  if (isJsonPath(pathToSet) && pathToDelete === undefined && newValue !== undefined) {
    return { ...commonFields, pathToSet, newValue };
  }
  if (isJsonPath(pathToDelete) && pathToSet === undefined && newValue === undefined) {
    return { ...commonFields, pathToDelete };
  }
  throw new Error(
    `edit case "${commonFields.caseName}" needs either pathToSet with newValue, or pathToDelete`,
  );
}

function loadInvalidEditCases(): InvalidEditCase[] {
  const fileContents = parseJson(
    readFileSync(new URL("schema_cases/invalid_edits.json", fixturesFolder), "utf-8"),
  );
  const cases = isJsonObject(fileContents) ? fileContents.cases : undefined;
  if (!Array.isArray(cases)) {
    throw new Error('invalid_edits.json must hold a "cases" array');
  }
  return cases.map(toInvalidEditCase);
}

const fixturesFolder = new URL("../../fixtures/", import.meta.url);
const reactionsFolder = new URL("reactions/", fixturesFolder);
const exampleReactionFiles = readdirSync(reactionsFolder)
  .filter((name) => name.endsWith(".json"))
  .sort();
const invalidEditCases = loadInvalidEditCases();

function loadExampleReaction(fileName: string): JsonObject {
  const document = parseJson(readFileSync(new URL(fileName, reactionsFolder), "utf-8"));
  if (!isJsonObject(document)) {
    throw new Error(`${fileName} must hold a JSON object`);
  }
  return document;
}

/** The value one step down from `container`: a key of an object or a position in an array. */
function childAt(container: JsonValue, keyOrPosition: string | number): JsonValue {
  const child =
    Array.isArray(container) && typeof keyOrPosition === "number"
      ? container[keyOrPosition]
      : isJsonObject(container) && typeof keyOrPosition === "string"
        ? container[keyOrPosition]
        : undefined;
  if (child === undefined) {
    throw new Error(
      `nothing at ${JSON.stringify(keyOrPosition)} in ${JSON.stringify(container).slice(0, 80)}`,
    );
  }
  return child;
}

/** Set (`newValue` given) or delete (`newValue` undefined) one key or position of `container`. */
function changeChild(
  container: JsonValue,
  keyOrPosition: string | number,
  newValue: JsonValue | undefined,
): void {
  if (Array.isArray(container) && typeof keyOrPosition === "number") {
    // splice removes the position and shifts later items down.
    if (newValue === undefined) {
      container.splice(keyOrPosition, 1);
    } else {
      container[keyOrPosition] = newValue;
    }
  } else if (isJsonObject(container) && typeof keyOrPosition === "string") {
    if (newValue === undefined) {
      Reflect.deleteProperty(container, keyOrPosition);
    } else {
      container[keyOrPosition] = newValue;
    }
  } else {
    throw new Error(
      `cannot change ${JSON.stringify(keyOrPosition)} in ${JSON.stringify(container).slice(0, 80)}`,
    );
  }
}

/** A copy of `document` with the case's one edit applied; the original is not changed. */
function applyEdit(document: JsonObject, editCase: InvalidEditCase): JsonObject {
  const editedDocument = structuredClone(document);
  // Checking pathToSet tells the compiler which kind of edit this is (it narrows the union).
  const path = editCase.pathToSet !== undefined ? editCase.pathToSet : editCase.pathToDelete;
  const lastKeyOrPosition = path.at(-1);
  if (lastKeyOrPosition === undefined) {
    throw new Error(`edit case "${editCase.caseName}" has an empty path`);
  }
  const parentOfEditedValue = path.slice(0, -1).reduce<JsonValue>(childAt, editedDocument);
  changeChild(parentOfEditedValue, lastKeyOrPosition, editCase.newValue);
  return editedDocument;
}

test("the four example reactions are present", () => {
  expect(exampleReactionFiles).toEqual([
    "aldol-addition-base.json",
    "radical-bromination-methane.json",
    "sn2-hydroxide-bromomethane.json",
    "wittig-methylenation-cyclohexanone.json",
  ]);
});

test("the reaction schema is a valid draft 2020-12 schema", () => {
  expect(new Ajv2020().validateSchema(reactionSchema)).toBe(true);
});

test.each(exampleReactionFiles)("example reaction %s has no schema violations", (fileName) => {
  expect(schemaViolations(loadExampleReaction(fileName))).toEqual([]);
});

test.each(invalidEditCases)(
  "invalid edit is reported at the expected path: $caseName",
  (editCase) => {
    const editedDocument = applyEdit(loadExampleReaction(editCase.baseReactionFile), editCase);
    const reportedPaths = schemaViolations(editedDocument).map(
      (violation) => violation.instancePath,
    );
    expect(reportedPaths).toContain(editCase.expectedViolationPath);
  },
);

test("applying an edit leaves the original document unchanged", () => {
  const original = loadExampleReaction("sn2-hydroxide-bromomethane.json");
  const editCase: DeleteValueEditCase = {
    caseName: "delete start state id",
    baseReactionFile: "sn2-hydroxide-bromomethane.json",
    pathToDelete: ["startStateId"],
    expectedViolationPath: "",
  };
  const edited = applyEdit(original, editCase);
  expect(edited.startStateId).toBeUndefined();
  expect(original.startStateId).toBe("reactants");
});

test("a malformed edit case is refused with a message", () => {
  expect(() =>
    toInvalidEditCase({
      caseName: "both paths",
      baseReactionFile: "x.json",
      expectedViolationPath: "",
      pathToSet: ["licence"],
      pathToDelete: ["licence"],
      newValue: "MIT",
    }),
  ).toThrow("needs either pathToSet with newValue, or pathToDelete");
});

test("violations are sorted by instance path and each has a message", () => {
  const document = loadExampleReaction("sn2-hydroxide-bromomethane.json");
  document.difficultyTier = 9;
  document.licence = "MIT";
  const violations = schemaViolations(document);
  const reportedPaths = violations.map((violation) => violation.instancePath);
  expect(reportedPaths).toEqual([...reportedPaths].sort());
  expect(reportedPaths).toEqual(expect.arrayContaining(["/difficultyTier", "/licence"]));
  expect(violations.every((violation) => violation.message.length > 0)).toBe(true);
});

test("a JSON pointer joins keys and positions, escaping ~ and / inside a key (RFC 6901)", () => {
  expect(jsonPointer(["steps", 0, "routePreference"])).toBe("/steps/0/routePreference");
  expect(jsonPointer(["a/b", "c~d"])).toBe("/a~1b/c~0d");
  expect(jsonPointer([])).toBe("");
});
