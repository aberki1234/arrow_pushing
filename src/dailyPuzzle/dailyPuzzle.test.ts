/** Tests for dailyPuzzle.ts. */
import { describe, expect, test } from "vitest";
import { type Catalogue, readCatalogue } from "../catalogue/catalogueReading.js";
import {
  type DailyInProgress,
  type DailyResult,
  type RunRecord,
  emptyProgress,
  withDailyResult,
} from "../learnerProgress/learnerProgress.js";
import type { StepOutcome, StepResult } from "../stepSession/stepSession.js";
import { isRecord, readFixtureJson } from "../testSupport/fixtureFiles.js";
import {
  dailyPageStateOf,
  dailyPuzzleOn,
  dailyResultOf,
  dateBefore,
  shareGridOf,
  stepCountText,
  streakOn,
  timeUntilNextPuzzleText,
} from "./dailyPuzzle.js";

function exampleCatalogue(): Catalogue {
  const cases = readFixtureJson("catalogue/catalogue_reading_cases.json");
  return readCatalogue(isRecord(cases) ? cases["catalogue"] : undefined);
}

function result(stepOutcome: StepOutcome, attemptCount = 1, hintsUsed = 0): StepResult {
  return { stepKey: "s", stepOutcome, attemptCount, hintsUsed, feedbackIdsShown: [] };
}

const SOME_RESULT: DailyResult = {
  reactionVersionRef: "sn2-hydroxide-bromomethane@1",
  puzzleNumber: 1,
  runStartedAt: "2026-12-01T09:00:00.000Z",
  shareGrid: "🟩",
  score: 3,
};

describe("today's puzzle", () => {
  test("is the calendar's entry for the local date, numbered from 1", () => {
    const catalogue = exampleCatalogue();
    expect(dailyPuzzleOn(catalogue, "2026-12-01")).toEqual({
      localDate: "2026-12-01",
      puzzleNumber: 1,
      reactionVersionRef: "sn2-hydroxide-bromomethane@1",
    });
    expect(dailyPuzzleOn(catalogue, "2026-12-03")?.puzzleNumber).toBe(3);
    expect(dailyPuzzleOn(catalogue, "2026-12-04")).toBeNull();
  });
});

describe("streak", () => {
  test("the day before, across months and years", () => {
    expect(dateBefore("2026-03-01")).toBe("2026-02-28");
    expect(dateBefore("2028-03-01")).toBe("2028-02-29");
    expect(dateBefore("2027-01-01")).toBe("2026-12-31");
  });

  test("counts finished days back from today, or from yesterday if today is not done", () => {
    const dates = ["2026-12-01", "2026-12-02", "2026-12-04", "2026-12-05"];
    const dateToDailyResult = Object.fromEntries(dates.map((date) => [date, SOME_RESULT]));
    expect(streakOn(dateToDailyResult, "2026-12-05")).toBe(2);
    expect(streakOn(dateToDailyResult, "2026-12-06")).toBe(2);
    expect(streakOn(dateToDailyResult, "2026-12-07")).toBe(0);
    expect(streakOn(dateToDailyResult, "2026-12-02")).toBe(2);
    expect(streakOn({}, "2026-12-02")).toBe(0);
  });
});

test("time until the next puzzle, at the learner's own midnight", () => {
  expect(timeUntilNextPuzzleText(new Date(2026, 0, 5, 9, 38))).toBe("14 h 22 m");
  expect(timeUntilNextPuzzleText(new Date(2026, 0, 5, 23, 15, 30))).toBe("44 m");
});

describe("the stored result", () => {
  test("its grid has one tile per step taken, coloured by outcome", () => {
    const stepResults = [result("firstTry"), result("afterHint", 1, 1), result("missed", 3)];
    expect(shareGridOf(stepResults)).toBe("🟩🟨🟥");
  });

  test("the daily result saved for a finished run", () => {
    const run: RunRecord = {
      reactionVersionRef: "aldol-addition-base@1",
      mode: "daily",
      startedAt: "2026-12-02T08:00:00.000Z",
      stepResults: [result("firstTry"), result("afterRetry", 2), result("firstTry")],
    };
    const puzzle = {
      localDate: "2026-12-02",
      puzzleNumber: 2,
      reactionVersionRef: "aldol-addition-base@1",
    };
    expect(dailyResultOf(puzzle, run)).toEqual({
      reactionVersionRef: "aldol-addition-base@1",
      puzzleNumber: 2,
      runStartedAt: "2026-12-02T08:00:00.000Z",
      shareGrid: "🟩🟨🟩",
      score: 8,
    });
  });
});

describe("page state", () => {
  const puzzle = {
    localDate: "2026-12-01",
    puzzleNumber: 1,
    reactionVersionRef: "sn2-hydroxide-bromomethane@1",
  };
  const saved = (localDate: string): DailyInProgress => ({
    formatVersion: 1,
    localDate,
    puzzleNumber: 1,
    reactionVersionRef: puzzle.reactionVersionRef,
    startedAt: `${localDate}T09:00:00.000Z`,
    snapshot: {
      mode: "daily",
      stateId: "reactants",
      stepResults: [],
      wrongCheckCount: 0,
      hintsShown: 0,
      feedbackIdsAtState: [],
    },
  });

  test("before, in progress, finished", () => {
    expect(dailyPageStateOf(puzzle, emptyProgress(), null)).toEqual({
      pageState: "before",
      dropSavedPuzzle: false,
    });
    expect(dailyPageStateOf(puzzle, emptyProgress(), saved("2026-12-01"))).toEqual({
      pageState: "inProgress",
      saved: saved("2026-12-01"),
    });
    const finished = withDailyResult(emptyProgress(), "2026-12-01", SOME_RESULT);
    expect(dailyPageStateOf(puzzle, finished, saved("2026-12-01"))).toEqual({
      pageState: "finished",
      dailyResult: SOME_RESULT,
    });
  });

  test("an unfinished puzzle from another day is dropped", () => {
    expect(dailyPageStateOf(puzzle, emptyProgress(), saved("2026-11-30"))).toEqual({
      pageState: "before",
      dropSavedPuzzle: true,
    });
  });
});

test("the number of steps in words", () => {
  expect(stepCountText(1)).toBe("1 step");
  expect(stepCountText(3)).toBe("3 steps");
});
