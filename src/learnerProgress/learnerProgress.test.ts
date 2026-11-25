/** Tests for learnerProgress.ts with an in-memory storage. */
import { describe, expect, test } from "vitest";
import { type StepResult, startStepSession } from "../stepSession/stepSession.js";
import { exampleSessionReaction } from "../testSupport/exampleSessions.js";
import {
  DAILY_IN_PROGRESS_STORAGE_KEY,
  type DailyInProgress,
  type DailyResult,
  PROGRESS_STORAGE_KEY,
  type ProgressStorage,
  type RunRecord,
  UNREADABLE_PROGRESS_STORAGE_KEY,
  clearDailyInProgress,
  emptyProgress,
  readDailyInProgress,
  readProgress,
  runRecordOf,
  runOfDailyResult,
  withDailyResult,
  withRun,
  withTheme,
  writeDailyInProgress,
  writeProgress,
} from "./learnerProgress.js";

function memoryStorage(keyToText: Record<string, string> = {}): ProgressStorage & {
  readonly keyToText: Record<string, string>;
} {
  return {
    keyToText,
    getItem: (key): string | null =>
      Object.hasOwn(keyToText, key) ? (keyToText[key] ?? null) : null,
    setItem: (key, value): void => {
      keyToText[key] = value;
    },
    removeItem: (key): void => {
      // A storage in tests: deleting a key the test created.
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete keyToText[key];
    },
  };
}

const FIRST_TRY: StepResult = {
  stepKey: "substitution",
  stepOutcome: "firstTry",
  attemptCount: 1,
  hintsUsed: 0,
  feedbackIdsShown: [],
};

const SN2_RUN: RunRecord = {
  reactionVersionRef: "sn2-hydroxide-bromomethane@1",
  mode: "daily",
  startedAt: "2026-12-01T09:00:00.000Z",
  stepResults: [FIRST_TRY],
};

const SN2_DAILY_RESULT: DailyResult = {
  reactionVersionRef: "sn2-hydroxide-bromomethane@1",
  puzzleNumber: 1,
  runStartedAt: "2026-12-01T09:00:00.000Z",
  shareGrid: "🟩",
  score: 3,
};

describe("progress", () => {
  test("nothing saved yet reads as empty progress", () => {
    expect(readProgress(memoryStorage())).toEqual({
      formatVersion: 1,
      runs: [],
      dateToDailyResult: {},
      settings: { theme: "auto" },
    });
    expect(emptyProgress().runs).toEqual([]);
  });

  test("runs, daily results and the theme are saved and read back", () => {
    const storage = memoryStorage();
    const progress = withTheme(
      withDailyResult(withRun(emptyProgress(), SN2_RUN), "2026-12-01", SN2_DAILY_RESULT),
      "dark",
    );
    writeProgress(storage, progress);
    expect(storage.keyToText[PROGRESS_STORAGE_KEY]).toBeDefined();
    expect(readProgress(storage)).toEqual(progress);
    expect(runOfDailyResult(progress, SN2_DAILY_RESULT)).toEqual(SN2_RUN);
  });

  test("a run saved twice is kept once", () => {
    const progress = withRun(withRun(emptyProgress(), SN2_RUN), SN2_RUN);
    expect(progress.runs).toHaveLength(1);
    const other = withRun(progress, { ...SN2_RUN, startedAt: "2026-12-02T09:00:00.000Z" });
    expect(other.runs).toHaveLength(2);
  });

  test.each([
    ["not JSON", "{oops"],
    ["the wrong shape", JSON.stringify({ formatVersion: 1, runs: "many" })],
    ["a future format", JSON.stringify({ ...emptyProgress(), formatVersion: 2 })],
  ])("unreadable progress (%s) starts afresh and keeps the old text aside", (unusedName, text) => {
    const storage = memoryStorage({ [PROGRESS_STORAGE_KEY]: text });
    expect(readProgress(storage)).toEqual(emptyProgress());
    expect(storage.keyToText[UNREADABLE_PROGRESS_STORAGE_KEY]).toBe(text);
  });

  test("a daily result for a run not kept has no run", () => {
    expect(runOfDailyResult(emptyProgress(), SN2_DAILY_RESULT)).toBeNull();
  });
});

describe("the unfinished daily puzzle", () => {
  const saved: DailyInProgress = {
    formatVersion: 1,
    localDate: "2026-12-01",
    puzzleNumber: 1,
    reactionVersionRef: "sn2-hydroxide-bromomethane@1",
    startedAt: "2026-12-01T09:00:00.000Z",
    snapshot: {
      mode: "daily",
      stateId: "reactants",
      stepResults: [],
      wrongCheckCount: 1,
      hintsShown: 1,
      feedbackIdsAtState: ["rule:octet-exceeded"],
    },
  };

  test("is saved, read back and cleared", () => {
    const storage = memoryStorage();
    expect(readDailyInProgress(storage)).toBeNull();
    writeDailyInProgress(storage, saved);
    expect(readDailyInProgress(storage)).toEqual(saved);
    clearDailyInProgress(storage);
    expect(readDailyInProgress(storage)).toBeNull();
  });

  test("an unreadable one is dropped", () => {
    const storage = memoryStorage({ [DAILY_IN_PROGRESS_STORAGE_KEY]: '{"localDate": 5}' });
    expect(readDailyInProgress(storage)).toBeNull();
    expect(storage.keyToText[DAILY_IN_PROGRESS_STORAGE_KEY]).toBeUndefined();
  });
});

test("a session's run record: its ref, mode, start time and step results", () => {
  const session = startStepSession(exampleSessionReaction("aldol-addition-base"), "daily");
  expect(runRecordOf(session, "2026-12-01T09:00:00.000Z")).toEqual({
    reactionVersionRef: "aldol-addition-base@1",
    mode: "daily",
    startedAt: "2026-12-01T09:00:00.000Z",
    stepResults: [],
  });
});
