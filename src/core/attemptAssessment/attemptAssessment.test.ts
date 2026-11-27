/**
 * Tests for attemptAssessment.ts against the shared cases in fixtures/assessment/attempt_cases.json
 * Only the fields named in each expectedAssessment are
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
} from "../../testSupport/fixtureFiles.js";
import { assessAttempt, type AttemptAssessment, prepareReaction } from "./attemptAssessment.js";
import { asReactionFile, asReactionMechanism } from "../../testSupport/exampleReactionFiles.js";

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
  const prepared = prepareReaction(
    asReactionFile(reactionWithExtraMisconceptions(reactionFile, stateId, [])),
  );
  return assessAttempt(prepared, stateId, notations.map(parseCurvedArrow));
}

test.each(attemptCases)("$caseName", (attemptCase) => {
  const prepared = prepareReaction(
    asReactionFile(
      reactionWithExtraMisconceptions(
        attemptCase.reactionFile,
        attemptCase.stateId,
        attemptCase.extraMisconceptions,
      ),
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

/**
 * Benzene attacking NO₂⁺ (docs/SPEC.md §4): only C9's hydrogen is drawn, as H15, because the
 * deprotonation needs it. That one explicit hydrogen must not make attack at C10 (its mirror
 * image) wrong: hydrogens are compared as counts.
 */
const AT_ORIGIN = { "1": [0, 0] };

function benzeneNitration(): Record<string, unknown> {
  const benzene = "[C:9]1([H:15])=[CH:10][CH:11]=[CH:12][CH:13]=[CH:14]1";
  const arenium = "[O:1]=[N+:2]([O-:3])[C:9]1([H:15])[CH+:10][CH:11]=[CH:12][CH:13]=[CH:14]1";
  return {
    startStateId: "reactants",
    atomRoleToMapNumbers: {},
    stateIdToState: {
      // Assessment never reads coordinates; the schema needs some.
      reactants: {
        mappedSmiles: `[O:1]=[N+:2]=[O:3].${benzene}`,
        mapNumberToCoordinates: AT_ORIGIN,
      },
      arenium: { mappedSmiles: arenium, mapNumberToCoordinates: AT_ORIGIN },
    },
    steps: [
      {
        stepKey: "attack",
        fromStateId: "reactants",
        toStateId: "arenium",
        stepKind: "polar",
        routePreference: "preferred",
        canonicalArrows: ["π C9-C10 -> σ C9-N2", "π N2-O3 -> lp O3"],
      },
    ],
  };
}

test("attack at the mirror-image carbon of a ring with one drawn H is correct", () => {
  const prepared = prepareReaction(asReactionMechanism(benzeneNitration()));
  const assess = (arrows: string[]): AttemptAssessment =>
    assessAttempt(prepared, "reactants", arrows.map(parseCurvedArrow));
  expect(assess(["π C9-C10 -> σ C9-N2", "π N2-O3 -> lp O3"]).assessmentKind).toBe("correct");
  // The same π bond, but the new bond formed at C10: the mirror image of the drawn answer.
  expect(assess(["π C9-C10 -> σ C10-N2", "π N2-O3 -> lp O3"]).assessmentKind).toBe("correct");
  // Attack at C11 (a different π bond) is the same compound too: any ring carbon of benzene.
  expect(assess(["π C11-C12 -> σ C11-N2", "π N2-O3 -> lp O3"]).assessmentKind).toBe("correct");
});
