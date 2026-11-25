/**
 * Tests for arrowApplication.ts. The shared cases in
 * fixtures/state_graphs/arrow_application_cases.json are the reference. The strongest check is
 * that every step of the four example reactions, applied to its from-state, gives exactly its
 * to-state.
 */
import { expect, test } from "vitest";
import { parseCurvedArrow } from "../arrowNotation/curvedArrowNotation.js";
import {
  exampleReactionDocuments,
  fixtureCaseEntries,
  isRecord,
  textField,
  textListField,
} from "../testSupport/fixtureFiles.js";
import {
  ArrowApplicationError,
  applyCurvedArrows,
  applySpeciesChange,
  SpeciesChangeError,
} from "./arrowApplication.js";
import { stateGraphFromMappedSmiles } from "./mappedSmilesReading.js";
import { type StateGraph, stateGraphToJson } from "./stateGraph.js";

const casesFile = "state_graphs/arrow_application_cases.json";
const validCases = fixtureCaseEntries(casesFile, "validCases").map((entry) => ({
  caseName: textField(entry, "caseName"),
  mappedSmiles: textField(entry, "mappedSmiles"),
  curvedArrows: textListField(entry, "curvedArrows"),
  expectedMappedSmiles: textField(entry, "expectedMappedSmiles"),
}));
const invalidCases = fixtureCaseEntries(casesFile, "invalidCases").map((entry) => ({
  caseName: textField(entry, "caseName"),
  mappedSmiles: textField(entry, "mappedSmiles"),
  curvedArrows: textListField(entry, "curvedArrows"),
  expectedRuleId: textField(entry, "expectedRuleId"),
}));

function applyArrowNotation(mappedSmiles: string, notations: readonly string[]): StateGraph {
  return applyCurvedArrows(
    stateGraphFromMappedSmiles(mappedSmiles),
    notations.map(parseCurvedArrow),
  );
}

interface ExampleStep {
  readonly testId: string;
  readonly document: Record<string, unknown>;
  readonly step: Record<string, unknown>;
}

const exampleSteps: ExampleStep[] = exampleReactionDocuments().flatMap(([fileName, document]) => {
  const steps = Array.isArray(document.steps) ? document.steps.filter(isRecord) : [];
  return steps.map((step) => ({
    testId: `${fileName}/${textField(step, "stepKey")}`,
    document,
    step,
  }));
});

function stateOf(document: Record<string, unknown>, stateId: string): StateGraph {
  const state = isRecord(document.stateIdToState) ? document.stateIdToState[stateId] : undefined;
  if (!isRecord(state)) {
    throw new Error(`no state "${stateId}"`);
  }
  return stateGraphFromMappedSmiles(textField(state, "mappedSmiles"));
}

function applyExampleStep(
  document: Record<string, unknown>,
  step: Record<string, unknown>,
): StateGraph {
  const fromState = stateOf(document, textField(step, "fromStateId"));
  if (step.stepKind !== "change") {
    return applyCurvedArrows(
      fromState,
      textListField(step, "canonicalArrows").map(parseCurvedArrow),
    );
  }
  const addedSpecies =
    typeof step.addedSpecies === "string"
      ? stateGraphFromMappedSmiles(step.addedSpecies)
      : undefined;
  const removed = Array.isArray(step.removedFragmentMapNumbers)
    ? step.removedFragmentMapNumbers.filter((item): item is number => typeof item === "number")
    : [];
  return applySpeciesChange(fromState, addedSpecies, removed);
}

function caughtError(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  return undefined;
}

test.each(validCases)("$caseName", ({ mappedSmiles, curvedArrows, expectedMappedSmiles }) => {
  const applied = applyArrowNotation(mappedSmiles, curvedArrows);
  expect(stateGraphToJson(applied)).toEqual(
    stateGraphToJson(stateGraphFromMappedSmiles(expectedMappedSmiles)),
  );
});

test.each(invalidCases)(
  "$caseName is refused with $expectedRuleId",
  ({ mappedSmiles, curvedArrows, expectedRuleId }) => {
    const error = caughtError(() => applyArrowNotation(mappedSmiles, curvedArrows));
    expect(error).toBeInstanceOf(ArrowApplicationError);
    expect((error as ArrowApplicationError).genericRuleId).toBe(expectedRuleId);
  },
);

test("applying arrows leaves the input state unchanged", () => {
  const before = stateGraphFromMappedSmiles("[OH-:1].[CH3:2][Br:3]");
  const beforeJson = stateGraphToJson(before);
  applyCurvedArrows(before, ["lp O1 -> σ O1-C2", "σ C2-Br3 -> lp Br3"].map(parseCurvedArrow));
  expect(stateGraphToJson(before)).toEqual(beforeJson);
});

test("the example reactions have steps to check", () => {
  // SN2 1, aldol 4 (one a change step), radical bromination 2, Wittig 4.
  expect(exampleSteps.length).toBe(11);
});

test.each(exampleSteps)("example step $testId reproduces its to-state", ({ document, step }) => {
  const toState = stateOf(document, textField(step, "toStateId"));
  expect(stateGraphToJson(applyExampleStep(document, step))).toEqual(stateGraphToJson(toState));
});

test("a species change adds and removes whole molecules", () => {
  const before = stateGraphFromMappedSmiles("[OH2:1].[CH3:2][Br:3].[Na+:4]");
  const added = stateGraphFromMappedSmiles("[CH3:8][CH:9]=[O:10]");
  // Map number 3 is in the bromomethane molecule, so map number 2 goes with it.
  const result = applySpeciesChange(before, added, [3]);
  const expected = stateGraphFromMappedSmiles("[OH2:1].[Na+:4].[CH3:8][CH:9]=[O:10]");
  expect(stateGraphToJson(result)).toEqual(stateGraphToJson(expected));
});

test("a species change refuses an added map number in use, or removing an absent one", () => {
  const before = stateGraphFromMappedSmiles("[OH2:1]");
  const added = caughtError(() =>
    applySpeciesChange(before, stateGraphFromMappedSmiles("[CH4:1]"), []),
  );
  const removed = caughtError(() => applySpeciesChange(before, undefined, [7]));
  expect(added).toBeInstanceOf(SpeciesChangeError);
  expect((added as SpeciesChangeError).errorCode).toBe("added-map-number-in-use");
  expect(removed).toBeInstanceOf(SpeciesChangeError);
  expect((removed as SpeciesChangeError).errorCode).toBe("removed-map-number-absent");
});
