/**
 * Tests for the stereo question phase of stepSession.ts (docs/stereo-question.md), on the example
 * SN2 on (R)-2-bromobutane: inversion is right; retention and the racemic mixture are authored
 * wrong answers. Every answer that is not right counts as a wrong check, like a wrong arrow.
 */
import { describe, expect, test } from "vitest";
import { exampleSessionReaction } from "../../testSupport/exampleSessions.js";
import type { TappedPlace } from "./arrowPicking.js";
import {
  DAILY_ATTEMPTS_PER_STEP,
  STEREO_UNSET_MESSAGE,
  type StepSession,
  checkArrows,
  checkStereo,
  continueToNextState,
  setQuestionCentreMark,
  setRacemicMixtureAnswer,
  startStepSession,
  tapPlace,
} from "./stepSession.js";

const atom = (mapNumber: number): TappedPlace => ({ placeKind: "atom", mapNumber });
const lonePair = (mapNumber: number): TappedPlace => ({ placeKind: "lonePair", mapNumber });
const bond = (first: number, second: number): TappedPlace => ({
  placeKind: "bond",
  mapNumbers: [first, second],
});

/** The SN2 example after its correct arrows (lp O1 -> σ O1-C2, σ C2-Br3 -> lp Br3). */
function afterCorrectArrows(mode: "practice" | "daily" = "practice"): StepSession {
  const started = startStepSession(exampleSessionReaction("sn2-2-bromobutane-inversion"), mode);
  return checkArrows([lonePair(1), atom(2), bond(2, 3), atom(3)].reduce(tapPlace, started));
}

// The product's own mark at C2 is the right one (inversion); the other mark is retention.
const productMark = exampleSessionReaction("sn2-2-bromobutane-inversion")
  .prepared.stateIdToGraph.get("products")
  ?.mapNumberToTetrahedralMark?.get(2);
const INVERSION = productMark ?? "@";
const RETENTION = INVERSION === "@" ? "@@" : "@";

describe("after correct arrows", () => {
  test("a step with a stereo question asks it before the step counts", () => {
    const session = afterCorrectArrows();
    expect(session.phase).toBe("stereoQuestion");
    expect(session.currentStep?.stepKey).toBe("substitution");
    expect(session.currentStep?.stereoQuestion?.questionCentres).toEqual([2]);
    expect(session.stepResults).toEqual([]);
  });
  test("Check waits until every question centre is set, without counting", () => {
    const session = checkStereo(afterCorrectArrows());
    expect(session.pickMessage).toBe(STEREO_UNSET_MESSAGE);
    expect(session.wrongCheckCount).toBe(0);
  });
});

describe("answering", () => {
  test("retention is wrong, with its message, and counts; inversion then finishes the step", () => {
    let session = checkStereo(setQuestionCentreMark(afterCorrectArrows(), 2, RETENTION));
    expect(session.phase).toBe("stereoQuestion");
    expect(session.lastStereoAssessment).toMatchObject({ kind: "authored", severity: "wrong" });
    expect(session.wrongCheckCount).toBe(1);
    session = checkStereo(setQuestionCentreMark(session, 2, INVERSION));
    expect(session.phase).toBe("stepCorrect");
    expect(session.lastStereoAssessment).toEqual({ kind: "right" });
    expect(session.stepResults).toEqual([
      expect.objectContaining({
        stepKey: "substitution",
        stepOutcome: "afterRetry",
        attemptCount: 2,
      }),
    ]);
  });
  test("right first time is a first-try step", () => {
    const session = checkStereo(setQuestionCentreMark(afterCorrectArrows(), 2, INVERSION));
    expect(session.stepResults[0]?.stepOutcome).toBe("firstTry");
  });
  test("the racemic mixture is a wrong check; unticking goes back to the drawing", () => {
    const ticked = checkStereo(setRacemicMixtureAnswer(afterCorrectArrows(), true));
    expect(ticked.lastStereoAssessment).toMatchObject({ kind: "racemicMixtureWrong" });
    expect(ticked.wrongCheckCount).toBe(1);
    const unticked = setRacemicMixtureAnswer(ticked, false);
    expect(checkStereo(unticked).pickMessage).toBe(STEREO_UNSET_MESSAGE);
  });
  test("after the step, the run moves on to the product", () => {
    const done = checkStereo(setQuestionCentreMark(afterCorrectArrows(), 2, INVERSION));
    expect(continueToNextState(done).phase).toBe("complete");
  });
});

describe("daily mode", () => {
  test("the third wrong check, arrows or stereo, misses the step", () => {
    let session = afterCorrectArrows("daily");
    for (let i = 0; i < DAILY_ATTEMPTS_PER_STEP; i++) {
      session = checkStereo(setQuestionCentreMark(session, 2, RETENTION));
    }
    expect(session.phase).toBe("stepMissed");
    expect(session.stepResults).toEqual([
      expect.objectContaining({ stepKey: "substitution", stepOutcome: "missed" }),
    ]);
  });
});
