/**
 * Tests for arrowApplication.ts. The shared cases in
 * fixtures/state_graphs/arrow_application_cases.json are the reference. The strongest check is
 * that every step of the example reactions, applied to its from-state, gives exactly its
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
} from "../../testSupport/fixtureFiles.js";
import {
  ArrowApplicationError,
  applyCurvedArrows,
  applySpeciesChange,
  SpeciesChangeError,
  withStereoFromToState,
} from "./arrowApplication.js";
import { stateGraphFromMappedSmiles } from "./mappedSmilesReading.js";
import { type StateGraph, appliedStateMatches, stateGraphToJson } from "./stateGraph.js";

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
  // SN2 1, SN2 with inversion 1, aldol 4 (one a change step), radical bromination 2, Wittig 4.
  expect(exampleSteps.length).toBe(12);
});

test.each(exampleSteps)("example step $testId reproduces its to-state", ({ document, step }) => {
  const toState = stateOf(document, textField(step, "toStateId"));
  const completed = withStereoFromToState(applyExampleStep(document, step), toState);
  expect(stateGraphToJson(completed)).toEqual(stateGraphToJson(toState));
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

// ---- Stereo (item 12b, docs/stereo-validation.md phase 1) ----
// The reference is the strict reader: a mark kept means the same canonical mark on map numbers.

test("a species change keeps the remaining marks and adds the added molecule's marks", () => {
  const before = stateGraphFromMappedSmiles("[CH3:1][C@@H:2]([OH:3])[CH2:4][CH3:5].[Na+:6]");
  const added = stateGraphFromMappedSmiles("[CH3:7]/[CH:8]=[CH:9]/[CH3:10]");
  const result = applySpeciesChange(before, added, [6]);
  const expected = stateGraphFromMappedSmiles(
    "[CH3:1][C@@H:2]([OH:3])[CH2:4][CH3:5].[CH3:7]/[CH:8]=[CH:9]/[CH3:10]",
  );
  expect(stateGraphToJson(result)).toEqual(stateGraphToJson(expected));
});

const sn2Start = "[OH-:1].[CH3:2][C@@H:3]([Br:4])[CH2:5][CH3:6]";
const sn2Arrows = ["lp O1 -> σ O1-C3", "σ C3-Br4 -> lp Br4"];
// Written around C3 as (C2, H, Br4, C5) the start is @@. Retention puts O1 where Br4 was:
// (C2, H, O1, C5) @@, which written as (O1, H, C2, C5) is one swap away, so @. Inversion is @@.
const sn2Inverted = "[OH:1][C@@H:3]([CH3:2])[CH2:5][CH3:6].[Br-:4]";
const sn2Retained = "[OH:1][C@H:3]([CH3:2])[CH2:5][CH3:6].[Br-:4]";

test("the to-state's mark fills a centre the step made or changed", () => {
  const applied = applyArrowNotation(sn2Start, sn2Arrows);
  const toState = stateGraphFromMappedSmiles(sn2Inverted);
  expect(stateGraphToJson(withStereoFromToState(applied, toState))).toEqual(
    stateGraphToJson(toState),
  );
});

test("the to-state's marks never replace a mark the result kept", () => {
  const applied = applyArrowNotation("[CH3:1][C@@H:2]([O:3][H:7])[CH2:4][CH3:5].[OH-:6]", [
    "lp O6 -> σ O6-H7",
    "σ O3-H7 -> lp O3",
  ]);
  const otherEnantiomer = stateGraphFromMappedSmiles(
    "[CH3:1][C@H:2]([O-:3])[CH2:4][CH3:5].[OH:6][H:7]",
  );
  const completed = withStereoFromToState(applied, otherEnantiomer);
  expect(completed.mapNumberToTetrahedralMark?.get(2)).toBe("@");
  expect(appliedStateMatches(applied, otherEnantiomer)).toBe(false);
});

test("an applied state matches a to-state that agrees on every mark it kept", () => {
  const applied = applyArrowNotation(sn2Start, sn2Arrows);
  expect(appliedStateMatches(applied, stateGraphFromMappedSmiles(sn2Inverted))).toBe(true);
  expect(appliedStateMatches(applied, stateGraphFromMappedSmiles(sn2Retained))).toBe(true);
  expect(appliedStateMatches(applied, stateGraphFromMappedSmiles("[OH:1][CH3:3].[Br-:4]"))).toBe(
    false,
  );
});

test("a to-state's mark on an atom whose neighbours changed is not copied", () => {
  const applied = stateGraphFromMappedSmiles("[CH3:1][CH:2]([OH:3])[CH2:4][CH3:5].[Cl-:6]");
  const differentNeighbours = stateGraphFromMappedSmiles(
    "[CH3:1][C@@H:2]([Cl:6])[CH2:4][CH3:5].[OH-:3]",
  );
  const completed = withStereoFromToState(applied, differentNeighbours);
  expect(completed.mapNumberToTetrahedralMark?.size ?? 0).toBe(0);
});
