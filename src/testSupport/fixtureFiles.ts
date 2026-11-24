/**
 * Reading the shared fixture files (fixtures/) in tests, with run-time type checks instead of
 * casts: a malformed fixture fails with a message naming the problem.
 */
import { readdirSync, readFileSync } from "node:fs";

const fixturesFolder = new URL("../../fixtures/", import.meta.url);

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The parsed JSON of a file under fixtures/, e.g. "notation/curved_arrows.json". */
export function readFixtureJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(new URL(relativePath, fixturesFolder), "utf-8"));
}

/** The objects in the array held under `key` of a fixture file's top-level object. */
export function fixtureCaseEntries(relativePath: string, key: string): Record<string, unknown>[] {
  const fileContents = readFixtureJson(relativePath);
  const entries = isRecord(fileContents) ? fileContents[key] : undefined;
  if (!Array.isArray(entries) || !entries.every(isRecord)) {
    throw new Error(`${relativePath} must hold an array of objects under "${key}"`);
  }
  return entries;
}

export function textField(entry: Record<string, unknown>, key: string): string {
  const value = entry[key];
  if (typeof value !== "string") {
    throw new Error(`fixture field "${key}" must be text, got ${JSON.stringify(value)}`);
  }
  return value;
}

export function textListField(entry: Record<string, unknown>, key: string): string[] {
  const value = entry[key];
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`fixture field "${key}" must be a list of text, got ${JSON.stringify(value)}`);
  }
  return value;
}

/** Every example reaction under fixtures/reactions, as [file name, parsed document], by name. */
export function exampleReactionDocuments(): [string, Record<string, unknown>][] {
  return readdirSync(new URL("reactions/", fixturesFolder))
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => {
      const document = readFixtureJson(`reactions/${name}`);
      if (!isRecord(document)) {
        throw new Error(`reactions/${name} must hold a JSON object`);
      }
      return [name, document];
    });
}
