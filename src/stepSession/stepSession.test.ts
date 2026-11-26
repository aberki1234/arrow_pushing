/** Tests for stepSession.ts: whole runs through the example reactions in practice mode. */
import { describe, expect, test } from "vitest";
import { formatCurvedArrow, formatElectronLocus } from "../arrowNotation/curvedArrowNotation.js";
import { exampleSessionReaction } from "../testSupport/exampleSessions.js";
import type { TappedPlace } from "./arrowPicking.js";
import {
  DAILY_ATTEMPTS_PER_STEP,
  revealsReactionClass,
  hasLimitedAttempts,
  NO_ARROWS_MESSAGE,
  type StepSession,
  cancelPick,
  checkArrows,
  clearArrows,
  continueToNextState,
  ghostArrows,
  revealedArrows,
  removeArrow,
  setArrowType,
  showNextHint,
  shownHintTexts,
  startStepSession,
  tapPlace,
  undoArrow,
} from "./stepSession.js";

const atom = (mapNumber: number): TappedPlace => ({ placeKind: "atom", mapNumber });
const lonePair = (mapNumber: number): TappedPlace => ({ placeKind: "lonePair", mapNumber });
const bond = (first: number, second: number): TappedPlace => ({
  placeKind: "bond",
  mapNumbers: [first, second],
});
const unpaired = (mapNumber: number): TappedPlace => ({ placeKind: "unpairedElectron", mapNumber });
const newBond = (first: number, second: number): TappedPlace => ({
  placeKind: "newBond",
  mapNumbers: [first, second],
});

/** Tap each pair of places as source then destination. */
function draw(session: StepSession, ...taps: TappedPlace[]): StepSession {
  return taps.reduce(tapPlace, session);
}

function drawnTexts(session: StepSession): string[] {
  return session.drawnArrows.map(formatCurvedArrow);
}

function sn2Session(): StepSession {
  return startStepSession(exampleSessionReaction("sn2-hydroxide-bromomethane"));
}

/** The two SN2 arrows: lp O1 -> σ O1-C2, σ C2-Br3 -> lp Br3. */
function drawSn2(session: StepSession): StepSession {
  return draw(session, lonePair(1), atom(2), bond(2, 3), atom(3));
}

describe("starting", () => {
  test("a session starts drawing at the start state with pair arrows", () => {
    const session = sn2Session();
    expect(session.phase).toBe("drawing");
    expect(session.currentStateId).toBe("reactants");
    expect(session.arrowType).toBe("pair");
    expect(session.drawnArrows).toEqual([]);
    expect(session.stepResults).toEqual([]);
  });

  test("a radical reaction starts with fish-hooks in practice", () => {
    const session = startStepSession(exampleSessionReaction("radical-bromination-methane"));
    expect(session.arrowType).toBe("fishHook");
    expect(revealsReactionClass("practice")).toBe(true);
  });

  test.each(["daily", "checkpoint"] as const)(
    "in %s mode a radical reaction starts with electron pairs, so nothing tells its class",
    (mode) => {
      const radical = exampleSessionReaction("radical-bromination-methane");
      expect(startStepSession(radical, mode).arrowType).toBe("pair");
      expect(revealsReactionClass(mode)).toBe(false);
    },
  );
});

describe("drawing", () => {
  test("a source then a destination makes an arrow", () => {
    const picked = tapPlace(sn2Session(), lonePair(1));
    expect(picked.pendingSource && formatElectronLocus(picked.pendingSource)).toBe("lp O1");
    const drawn = tapPlace(picked, atom(2));
    expect(drawn.pendingSource).toBeNull();
    expect(drawnTexts(drawn)).toEqual(["lp O1 -> σ O1-C2"]);
  });

  test("a refused tap leaves a message and keeps the pick", () => {
    const refused = tapPlace(sn2Session(), atom(2));
    expect(refused.pickMessage).toMatch(/lone pair|bond/);
    expect(refused.pendingSource).toBeNull();
    const picked = tapPlace(sn2Session(), lonePair(1));
    const toItself = tapPlace(picked, atom(1));
    expect(toItself.pickMessage).not.toBeNull();
    expect(toItself.pendingSource).toEqual(picked.pendingSource);
    expect(tapPlace(toItself, atom(2)).pickMessage).toBeNull();
  });
});

describe("drawing: choices and editing", () => {
  test("a new bond is picked as itself; an atom bonded to neither is refused", () => {
    let session = startStepSession(exampleSessionReaction("aldol-addition-base"));
    session = continueToNextState(
      checkArrows(draw(session, lonePair(1), atom(4), bond(3, 4), atom(5), bond(5, 6), atom(6))),
    );
    session = continueToNextState(session); // the second aldehyde arrives
    const refused = draw(session, bond(3, 5), atom(9));
    expect(refused.pickMessage).toContain("dashed line");
    expect(refused.pendingSource).not.toBeNull();
    expect(drawnTexts(draw(refused, newBond(3, 9)))).toEqual(["π C3-C5 -> σ C3-C9"]);
    expect(cancelPick(refused).pendingSource).toBeNull();
  });

  test("undo, remove and clear", () => {
    const drawn = drawSn2(sn2Session());
    expect(drawnTexts(undoArrow(drawn))).toEqual(["lp O1 -> σ O1-C2"]);
    expect(drawnTexts(removeArrow(drawn, 0))).toEqual(["σ C2-Br3 -> lp Br3"]);
    expect(clearArrows(drawn).drawnArrows).toEqual([]);
  });

  test("changing the arrow type drops a picked source", () => {
    const picked = tapPlace(sn2Session(), lonePair(1));
    const switched = setArrowType(picked, "fishHook");
    expect(switched.arrowType).toBe("fishHook");
    expect(switched.pendingSource).toBeNull();
  });

  test("Esc drops a picked source", () => {
    expect(cancelPick(tapPlace(sn2Session(), lonePair(1))).pendingSource).toBeNull();
  });
});

describe("checking", () => {
  test("correct on the first try, then the run completes", () => {
    const checked = checkArrows(drawSn2(sn2Session()));
    expect(checked.phase).toBe("stepCorrect");
    expect(checked.lastAssessment?.assessmentKind).toBe("correct");
    expect(checked.currentStep?.stepKey).toBe("substitution");
    expect(checked.stepResults).toEqual([
      {
        stepKey: "substitution",
        stepOutcome: "firstTry",
        attemptCount: 1,
        hintsUsed: 0,
        feedbackIdsShown: [],
      },
    ]);
    expect(tapPlace(checked, lonePair(1))).toBe(checked);
    const finished = continueToNextState(checked);
    expect(finished.phase).toBe("complete");
    expect(finished.currentStateId).toBe("products");
  });

  test("a wrong check counts, keeps the arrows, and makes the outcome afterRetry", () => {
    const wrong = checkArrows(draw(sn2Session(), lonePair(1), atom(3)));
    expect(wrong.phase).toBe("drawing");
    expect(wrong.wrongCheckCount).toBe(1);
    expect(wrong.lastAssessment?.assessmentKind).not.toBe("correct");
    expect(drawnTexts(wrong)).toEqual(["lp O1 -> σ O1-Br3"]);
    const corrected = checkArrows(drawSn2(clearArrows(wrong)));
    expect(corrected.stepResults[0]).toMatchObject({ stepOutcome: "afterRetry", attemptCount: 2 });
  });

  test("checking with no arrows is not an attempt", () => {
    const unchanged = checkArrows(sn2Session());
    expect(unchanged.wrongCheckCount).toBe(0);
    expect(unchanged.lastAssessment).toBeNull();
    expect(unchanged.pickMessage).toBe(NO_ARROWS_MESSAGE);
  });

  test("a new pick clears the last assessment's message but not the assessment", () => {
    const wrong = checkArrows(draw(sn2Session(), lonePair(1), atom(3)));
    expect(tapPlace(wrong, lonePair(1)).lastAssessment).toEqual(wrong.lastAssessment);
  });
});

describe("hints", () => {
  test("three tiers; the third shows the canonical arrows as ghosts", () => {
    let session = sn2Session();
    expect(ghostArrows(session)).toEqual([]);
    session = showNextHint(showNextHint(session));
    expect(shownHintTexts(session)).toHaveLength(2);
    expect(ghostArrows(session)).toEqual([]);
    session = showNextHint(session);
    expect(shownHintTexts(session)).toHaveLength(3);
    expect(ghostArrows(session).map(formatCurvedArrow)).toEqual([
      "lp O1 -> σ O1-C2",
      "σ C2-Br3 -> lp Br3",
    ]);
    expect(showNextHint(session).hintsShown).toBe(3);
  });

  test("any hint makes the outcome afterHint", () => {
    const checked = checkArrows(drawSn2(showNextHint(sn2Session())));
    expect(checked.stepResults[0]).toMatchObject({ stepOutcome: "afterHint", hintsUsed: 1 });
  });
});

describe("routes", () => {
  test("a change step is shown as an event between arrow steps", () => {
    let session = startStepSession(exampleSessionReaction("aldol-addition-base"));
    session = checkArrows(
      draw(session, lonePair(1), atom(4), bond(3, 4), atom(5), bond(5, 6), atom(6)),
    );
    expect(session.phase).toBe("stepCorrect");
    session = continueToNextState(session);
    expect(session.phase).toBe("changeEvent");
    expect(session.currentStep?.stepKey).toBe("second-aldehyde-arrives");
    session = continueToNextState(session);
    expect(session.phase).toBe("drawing");
    expect(session.currentStateId).toBe("enolate-and-aldehyde");
    expect(session.hintsShown).toBe(0);
    expect(session.stepResults).toHaveLength(1);
  });

  test("an accepted branch is followed (Wittig via the betaine)", () => {
    let session = startStepSession(exampleSessionReaction("wittig-methylenation-cyclohexanone"));
    session = checkArrows(draw(session, lonePair(2), atom(3), bond(3, 4), atom(4)));
    expect(session.currentStep?.stepKey).toBe("betaine-formation");
    session = continueToNextState(session);
    expect(session.currentStateId).toBe("betaine");
  });

  test("radical steps are drawn with fish-hooks", () => {
    let session = startStepSession(exampleSessionReaction("radical-bromination-methane"));
    // The H2–C3 electron that goes to Br1 forms the new bond Br1–H2, picked as itself.
    session = draw(session, unpaired(1), atom(2), bond(2, 3), newBond(1, 2), bond(2, 3), atom(3));
    expect(drawnTexts(session)).toEqual([
      "rad Br1 ~> σ Br1-H2",
      "σ H2-C3 ~> σ Br1-H2",
      "σ H2-C3 ~> rad C3",
    ]);
    expect(checkArrows(session).lastAssessment?.assessmentKind).toBe("correct");
  });
});

/** Three wrong SN2 checks: the hydroxide attacking bromine (an authored misconception). */
function threeWrongChecks(session: StepSession): StepSession {
  let checked = session;
  for (let attempt = 0; attempt < DAILY_ATTEMPTS_PER_STEP; attempt++) {
    checked = checkArrows(draw(clearArrows(checked), lonePair(1), atom(3)));
  }
  return checked;
}

describe("daily mode", () => {
  const sn2Daily = (): StepSession =>
    startStepSession(exampleSessionReaction("sn2-hydroxide-bromomethane"), "daily");

  test("a session knows its mode; practice is the default", () => {
    expect(sn2Daily().mode).toBe("daily");
    expect(sn2Session().mode).toBe("practice");
  });

  test("the third wrong check reveals the preferred step and records it as missed", () => {
    const missed = threeWrongChecks(sn2Daily());
    expect(DAILY_ATTEMPTS_PER_STEP).toBe(3);
    expect(missed.phase).toBe("stepMissed");
    expect(missed.currentStep?.stepKey).toBe("substitution");
    expect(revealedArrows(missed).map(formatCurvedArrow)).toEqual([
      "lp O1 -> σ O1-C2",
      "σ C2-Br3 -> lp Br3",
    ]);
    expect(missed.stepResults).toEqual([
      {
        stepKey: "substitution",
        stepOutcome: "missed",
        attemptCount: 3,
        hintsUsed: 0,
        feedbackIdsShown: ["misconception:sn2-hydroxide-bromomethane/attack-on-bromine"],
      },
    ]);
    expect(checkArrows(missed)).toBe(missed);
    expect(tapPlace(missed, lonePair(1))).toBe(missed);
    expect(continueToNextState(missed).phase).toBe("complete");
  });

  test("practice has no attempt limit", () => {
    const practice = threeWrongChecks(sn2Session());
    expect(practice.phase).toBe("drawing");
    expect(practice.wrongCheckCount).toBe(3);
    expect(revealedArrows(practice)).toEqual([]);
  });
});

describe("feedback ids", () => {
  test("feedback shown at a state is recorded with the step taken from it", () => {
    let session = checkArrows(draw(sn2Session(), lonePair(1), atom(3)));
    session = checkArrows(draw(clearArrows(session), lonePair(1), atom(3)));
    session = checkArrows(drawSn2(clearArrows(session)));
    expect(session.stepResults[0]?.feedbackIdsShown).toEqual([
      "misconception:sn2-hydroxide-bromomethane/attack-on-bromine",
    ]);
  });

  test("a generic rule is recorded as rule:<id>", () => {
    // A fish-hook where the step needs pairs: wrong-arrow-type.
    let session = setArrowType(sn2Session(), "fishHook");
    session = checkArrows(draw(session, lonePair(1), atom(2)));
    expect(session.lastAssessment?.assessmentKind).toBe("genericRule");
    session = checkArrows(drawSn2(clearArrows(setArrowType(session, "pair"))));
    expect(session.stepResults[0]?.feedbackIdsShown).toEqual(["rule:wrong-arrow-type"]);
  });
});

describe("checkpoint mode (item 9c)", () => {
  test("the daily rules apply: the third wrong check misses the step", () => {
    const checkpoint = startStepSession(
      exampleSessionReaction("sn2-hydroxide-bromomethane"),
      "checkpoint",
    );
    expect(hasLimitedAttempts("checkpoint")).toBe(true);
    expect(hasLimitedAttempts("practice")).toBe(false);
    const missed = threeWrongChecks(checkpoint);
    expect(missed.phase).toBe("stepMissed");
    expect(missed.stepResults.map((stepResult) => stepResult.stepOutcome)).toEqual(["missed"]);
  });
});
