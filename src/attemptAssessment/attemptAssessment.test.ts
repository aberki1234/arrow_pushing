/**
 * Tests for attemptAssessment.ts against the shared cases in fixtures/assessment/attempt_cases.json
 * (the Python twin runs the same cases). Only the fields named in each expectedAssessment are
 * compared; for partial progress, "hasAuthoredMessage" is derived from authoredMessage.
 */
import { expect, test } from "vitest";
import { parseCurvedArrow } from "../arrowNotation/curvedArrowNotation.js";
import {
  fixtureCaseEntries,
  isRecord,
  readFixtureJson,
  textField,
  textListField,
} from "../testSupport/fixtureFiles.js";
import { assessAttempt, type AttemptAssessment, prepareReaction } from "./attemptAssessment.js";

const attemptCases = fixtureCaseEntries("assessment/attempt_cases.json", "cases").map((entry) => ({
  caseName: textField(entry, "caseName"),
  reactionFile: textField(entry, "reactionFile"),
  stateId: textField(entry, "stateId"),
  learnerArrows: textListField(entry, "learnerArrows"),
  extraMisconceptions: Array.isArray(entry.extraMisconceptions) ? entry.extraMisconceptions : [],
  expectedAssessment: isRecord(entry.expectedAssessment) ? entry.expectedAssessment : {},
}));

/** The example reaction, with `extraMisconceptions` appended to the state's misconceptions. */
function reactionWithExtraMisconceptions(
  reactionFile: string,
  stateId: string,
  extraMisconceptions: readonly unknown[],
): Record<string, unknown> {
  const document = structuredClone(readFixtureJson(`reactions/${reactionFile}`));
  const states = isRecord(document) ? document.stateIdToState : undefined;
  const state = isRecord(states) ? states[stateId] : undefined;
  if (!isRecord(document) || !isRecord(state)) {
    throw new Error(`${reactionFile} has no state ${stateId}`);
  }
  const existing = Array.isArray(state.misconceptions) ? state.misconceptions.filter(isRecord) : [];
  state.misconceptions = [...existing, ...extraMisconceptions];
  return document;
}

function comparableFields(assessment: AttemptAssessment): Record<string, unknown> {
  const fields: Record<string, unknown> = { ...assessment };
  if (assessment.assessmentKind === "partialProgress") {
    fields.hasAuthoredMessage = assessment.authoredMessage !== null;
  }
  return fields;
}

function assessNotation(
  reactionFile: string,
  stateId: string,
  notations: string[],
): AttemptAssessment {
  const prepared = prepareReaction(reactionWithExtraMisconceptions(reactionFile, stateId, []));
  return assessAttempt(prepared, stateId, notations.map(parseCurvedArrow));
}

test.each(attemptCases)("$caseName", (attemptCase) => {
  const prepared = prepareReaction(
    reactionWithExtraMisconceptions(
      attemptCase.reactionFile,
      attemptCase.stateId,
      attemptCase.extraMisconceptions,
    ),
  );
  const assessment = assessAttempt(
    prepared,
    attemptCase.stateId,
    attemptCase.learnerArrows.map(parseCurvedArrow),
  );
  const fields = comparableFields(assessment);
  const expectedKeys = Object.keys(attemptCase.expectedAssessment);
  expect(Object.fromEntries(expectedKeys.map((key) => [key, fields[key]]))).toEqual(
    attemptCase.expectedAssessment,
  );
});

test("partial progress carries the broken rule's message as well", () => {
  const assessment = assessNotation("sn2-hydroxide-bromomethane.json", "reactants", [
    "lp O1 -> σ O1-C2",
  ]);
  expect(assessment.assessmentKind).toBe("partialProgress");
  if (assessment.assessmentKind === "partialProgress") {
    expect(assessment.authoredMessage).toContain("10 electrons");
    expect(assessment.brokenRuleMessage).toContain("C2 would have 10 valence-shell electrons");
  }
});

test("a state left only by a change step cannot be assessed", () => {
  expect(() => assessNotation("aldol-addition-base.json", "enolate", ["lp O6 -> π C5-O6"])).toThrow(
    "no arrow step",
  );
});
