/** Tests for sessionSnapshot.ts on the aldol example in daily mode. */
import { expect, test } from "vitest";
import { exampleSessionReaction } from "../testSupport/exampleSessions.js";
import type { TappedPlace } from "./arrowPicking.js";
import { resumeStepSession, sessionSnapshot } from "./sessionSnapshot.js";
import {
  type StepSession,
  checkArrows,
  showNextHint,
  startStepSession,
  tapPlace,
} from "./stepSession.js";

const atom = (mapNumber: number): TappedPlace => ({ placeKind: "atom", mapNumber });
const lonePair = (mapNumber: number): TappedPlace => ({ placeKind: "lonePair", mapNumber });
const bond = (first: number, second: number): TappedPlace => ({
  placeKind: "bond",
  mapNumbers: [first, second],
});

const reaction = exampleSessionReaction("aldol-addition-base");

function enolateFormed(): StepSession {
  const taps = [lonePair(1), atom(4), bond(3, 4), atom(5), bond(5, 6), atom(6)];
  return checkArrows(taps.reduce(tapPlace, startStepSession(reaction, "daily")));
}

test("mid-step: the state, wrong checks, hints and feedback come back; the arrows do not", () => {
  let session = showNextHint(startStepSession(reaction, "daily"));
  session = checkArrows(tapPlace(tapPlace(session, lonePair(1)), atom(5)));
  const snapshot = JSON.parse(JSON.stringify(sessionSnapshot(session))) as ReturnType<
    typeof sessionSnapshot
  >;
  const resumed = resumeStepSession(reaction, snapshot);
  expect(resumed.mode).toBe("daily");
  expect(resumed.phase).toBe("drawing");
  expect(resumed.currentStateId).toBe("reactants");
  expect(resumed.wrongCheckCount).toBe(1);
  expect(resumed.hintsShown).toBe(1);
  expect(resumed.drawnArrows).toEqual([]);
  expect(sessionSnapshot(resumed)).toEqual(snapshot);
});

test("just after a correct step: resumes at its to-state with the step recorded", () => {
  const snapshot = sessionSnapshot(enolateFormed());
  expect(snapshot.stateId).toBe("enolate");
  const resumed = resumeStepSession(reaction, snapshot);
  expect(resumed.phase).toBe("changeEvent");
  expect(resumed.stepResults.map((stepResult) => stepResult.stepKey)).toEqual([
    "enolate-formation",
  ]);
});
