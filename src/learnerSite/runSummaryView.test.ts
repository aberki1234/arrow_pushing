/** Tests for runSummaryView.ts on finished runs of the example reactions. */
import { expect, test } from "vitest";
import type { TappedPlace } from "../stepSession/arrowPicking.js";
import {
  checkArrows,
  clearArrows,
  continueToNextState,
  startStepSession,
  tapPlace,
} from "../stepSession/stepSession.js";
import { exampleSessionReaction } from "../testSupport/exampleSessions.js";
import { readCatalogue } from "../catalogue/catalogueReading.js";
import { emptyProgress, runRecordOf, withRun } from "../learnerProgress/learnerProgress.js";
import { isRecord, readFixtureJson } from "../testSupport/fixtureFiles.js";
import { attributionText, finishedViewExtras, summarySteps } from "./runSummaryView.js";

const atom = (mapNumber: number): TappedPlace => ({ placeKind: "atom", mapNumber });
const lonePair = (mapNumber: number): TappedPlace => ({ placeKind: "lonePair", mapNumber });
const bond = (first: number, second: number): TappedPlace => ({
  placeKind: "bond",
  mapNumbers: [first, second],
});

test("each step taken: its prompt, outcome, arrows in words and explanation", () => {
  const reaction = exampleSessionReaction("sn2-hydroxide-bromomethane");
  let session = checkArrows([lonePair(1), atom(3)].reduce(tapPlace, startStepSession(reaction)));
  session = checkArrows(
    [lonePair(1), atom(2), bond(2, 3), atom(3)].reduce(tapPlace, clearArrows(session)),
  );
  session = continueToNextState(session);
  expect(summarySteps(reaction, session.stepResults)).toEqual([
    {
      stepNumber: 1,
      prompt: "Draw the arrows for the single, concerted step.",
      stepOutcome: "afterRetry",
      outcomeText: "After a retry",
      arrowTexts: ["lone pair on O1 → new bond O1–C2", "bond C2–Br3 → lone pair on Br3"],
      explanation: reaction.steps[0]?.explanationAfterStep,
    },
  ]);
});

test("the attribution names the authors and the licence", () => {
  const reaction = exampleSessionReaction("sn2-hydroxide-bromomethane");
  const text = attributionText(reaction);
  expect(text).toContain(reaction.authors[0]?.name ?? "?");
  expect(text).toContain("CC BY-SA 4.0");
});

test("the finished view's extras: watch out for, related reactions, mastery change", () => {
  const cases = readFixtureJson("catalogue/catalogue_reading_cases.json");
  const catalogue = readCatalogue(isRecord(cases) ? cases["catalogue"] : undefined);
  const reaction = exampleSessionReaction("sn2-hydroxide-bromomethane");
  let session = checkArrows([lonePair(1), atom(3)].reduce(tapPlace, startStepSession(reaction)));
  session = checkArrows(
    [lonePair(1), atom(2), bond(2, 3), atom(3)].reduce(tapPlace, clearArrows(session)),
  );
  const before = withRun(
    emptyProgress(),
    runRecordOf({ ...session, stepResults: [] }, "2026-12-01T09:00:00Z"),
  );
  const after = withRun(before, runRecordOf(session, "2026-12-02T09:00:00Z"));
  const extras = finishedViewExtras(catalogue, reaction, before, after);
  expect(extras.watchOutRows.map((row) => row.heading)).toEqual(["Attack leaving group"]);
  expect(extras.watchOutRows[0]?.message).toMatch(/repel/);
  expect(extras.relatedCards).toEqual([]);
  // The empty earlier run scores 0 of 0; the new one 2 of 3.
  expect(extras.masteryBefore).toBe(0);
  expect(extras.masteryAfter).toBe(67);
  expect(finishedViewExtras(catalogue, reaction, emptyProgress(), after).masteryBefore).toBeNull();
});
