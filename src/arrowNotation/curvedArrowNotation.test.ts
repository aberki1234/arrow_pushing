/**
 * Tests for curvedArrowNotation.ts.
 *
 * The shared cases in fixtures/notation/curved_arrows.json are the reference. Every arrow written
 * in the example reactions must parse.
 */
import { readdirSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";
import {
  ArrowNotationError,
  formatCurvedArrow,
  formatElectronLocus,
  parseCurvedArrow,
  parseElectronLocus,
} from "./curvedArrowNotation.js";

interface ValidNotationCase {
  readonly notation: string;
  readonly printed: string;
  readonly curvedArrow: unknown;
}

interface InvalidNotationCase {
  readonly notation: string;
  readonly expectedErrorCode: string;
}

const fixturesFolder = new URL("../../fixtures/", import.meta.url);

function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(new URL(relativePath, fixturesFolder), "utf-8"));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textField(entry: Record<string, unknown>, key: string): string {
  const value = entry[key];
  if (typeof value !== "string") {
    throw new Error(`notation case field "${key}" must be text, got ${JSON.stringify(value)}`);
  }
  return value;
}

function caseEntries(key: string): Record<string, unknown>[] {
  const fileContents = readJson("notation/curved_arrows.json");
  const entries = isRecord(fileContents) ? fileContents[key] : undefined;
  if (!Array.isArray(entries) || !entries.every(isRecord)) {
    throw new Error(`curved_arrows.json must hold an array of objects under "${key}"`);
  }
  return entries;
}

const validCases: ValidNotationCase[] = caseEntries("validCases").map((entry) => ({
  notation: textField(entry, "notation"),
  printed: textField(entry, "printed"),
  curvedArrow: entry.curvedArrow,
}));

const invalidCases: InvalidNotationCase[] = caseEntries("invalidCases").map((entry) => ({
  notation: textField(entry, "notation"),
  expectedErrorCode: textField(entry, "expectedErrorCode"),
}));

/** Every arrow string in a reaction file: canonical arrows, partial arrow sets, learner arrows. */
function arrowsWrittenIn(reactionDocument: unknown): string[] {
  const textItems = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  if (
    !isRecord(reactionDocument) ||
    !Array.isArray(reactionDocument.steps) ||
    !isRecord(reactionDocument.stateIdToState)
  ) {
    throw new Error("reaction file must hold steps and stateIdToState");
  }
  const steps = reactionDocument.steps.filter(isRecord);
  const states = Object.values(reactionDocument.stateIdToState).filter(isRecord);
  const messages = states.flatMap((state) =>
    Array.isArray(state.partialProgressMessages)
      ? state.partialProgressMessages.filter(isRecord)
      : [],
  );
  return [
    ...steps.flatMap((step) => textItems(step.canonicalArrows)),
    ...steps.flatMap((step) =>
      Array.isArray(step.partialArrowSets) ? step.partialArrowSets.flatMap(textItems) : [],
    ),
    ...messages.flatMap((message) => textItems(message.learnerArrows)),
  ];
}

const exampleArrows = [
  ...new Set(
    readdirSync(new URL("reactions/", fixturesFolder))
      .filter((name) => name.endsWith(".json"))
      .flatMap((name) => arrowsWrittenIn(readJson(`reactions/${name}`))),
  ),
].sort();

test.each(validCases)("$notation parses to the expected structure", ({ notation, curvedArrow }) => {
  expect(parseCurvedArrow(notation)).toEqual(curvedArrow);
});

test.each(validCases)("$notation prints as $printed", ({ notation, printed }) => {
  expect(formatCurvedArrow(parseCurvedArrow(notation))).toBe(printed);
});

test.each(validCases)("$notation: printing then parsing gives the same arrow", ({ notation }) => {
  const curvedArrow = parseCurvedArrow(notation);
  expect(parseCurvedArrow(formatCurvedArrow(curvedArrow))).toEqual(curvedArrow);
});

test.each(invalidCases)(
  "'$notation' is refused with $expectedErrorCode",
  ({ notation, expectedErrorCode }) => {
    let caughtError: unknown;
    try {
      parseCurvedArrow(notation);
    } catch (error) {
      caughtError = error;
    }
    expect(caughtError).toBeInstanceOf(ArrowNotationError);
    expect((caughtError as ArrowNotationError).errorCode).toBe(expectedErrorCode);
  },
);

test("the error message quotes the notation", () => {
  expect(() => parseCurvedArrow("lp O1 => σ O1-C2")).toThrow("lp O1 => σ O1-C2");
});

test("the example reactions contain arrows to check", () => {
  expect(exampleArrows.length).toBeGreaterThan(20);
});

test.each(exampleArrows)("example arrow %s parses", (arrow) => {
  expect(() => parseCurvedArrow(arrow)).not.toThrow();
});

test("parseElectronLocus orders bond atoms by map number", () => {
  expect(parseElectronLocus("σ Br3-C2")).toEqual({
    locusKind: "sigmaBond",
    atoms: [
      { element: "C", mapNumber: 2 },
      { element: "Br", mapNumber: 3 },
    ],
  });
});

test("parseElectronLocus refuses a whole arrow", () => {
  expect(() => parseElectronLocus("lp O1 -> σ O1-C2")).toThrow(ArrowNotationError);
});

test("formatElectronLocus uses symbols for bonds", () => {
  expect(formatElectronLocus(parseElectronLocus("pi C5-O6"))).toBe("π C5-O6");
  expect(formatElectronLocus(parseElectronLocus("rad C3"))).toBe("rad C3");
});
