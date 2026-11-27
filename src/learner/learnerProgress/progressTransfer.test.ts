/** Tests for progressTransfer.ts. */
import { describe, expect, test } from "vitest";
import { dailyResultOf, runOf, stepOf } from "../../testSupport/progressExamples.js";
import {
  DAILY_IN_PROGRESS_STORAGE_KEY,
  type LearnerProgress,
  PROGRESS_STORAGE_KEY,
  type ProgressStorage,
  emptyProgress,
  withDailyResult,
  withRun,
  withTheme,
} from "./learnerProgress.js";
import {
  exportFileName,
  exportText,
  importProgress,
  importSummaryText,
  resetProgress,
} from "./progressTransfer.js";

const RUN_A = runOf("sn2-hydroxide-bromomethane@1", "2026-12-01T09:00:00Z", [stepOf("firstTry")]);
const RUN_B = runOf("aldol-addition-base@1", "2026-12-02T09:00:00Z", [stepOf("missed")]);

function inBrowser(): LearnerProgress {
  return withTheme(
    withDailyResult(withRun(emptyProgress(), RUN_A), "2026-12-01", dailyResultOf("🟩")),
    "dark",
  );
}

function exported(): LearnerProgress {
  let progress = withRun(withRun(emptyProgress(), RUN_A), RUN_B);
  progress = withDailyResult(progress, "2026-12-01", dailyResultOf("🟥"));
  return withDailyResult(progress, "2026-12-02", dailyResultOf("🟥🟩"));
}

test("the export file's name and text", () => {
  expect(exportFileName("2026-12-01")).toBe("arrowpush-progress-2026-12-01.json");
  expect(JSON.parse(exportText(inBrowser()))).toEqual(inBrowser());
});

describe("import", () => {
  test("merges: new runs and dates added, the browser's own daily result and settings kept", () => {
    const outcome = importProgress(inBrowser(), exportText(exported()));
    if (outcome.importOutcome !== "merged") {
      throw new Error(outcome.refusalMessage);
    }
    expect(outcome.addedRunCount).toBe(1);
    expect(outcome.addedDailyResultCount).toBe(1);
    const merged = outcome.mergedProgress;
    expect(merged.runs).toHaveLength(2);
    expect(merged.dateToDailyResult["2026-12-01"]?.shareGrid).toBe("🟩");
    expect(merged.dateToDailyResult["2026-12-02"]?.shareGrid).toBe("🟥🟩");
    expect(merged.settings.theme).toBe("dark");
  });

  test.each([
    ["not JSON", "{oops"],
    ["not progress", JSON.stringify({ runs: [] })],
  ])("refuses %s and changes nothing", (unusedName, fileText) => {
    const outcome = importProgress(inBrowser(), fileText);
    expect(outcome.importOutcome).toBe("refused");
  });

  test("the summary line", () => {
    expect(importSummaryText(4, 2)).toBe("Added 4 runs and 2 daily results.");
    expect(importSummaryText(1, 0)).toBe("Added 1 run and 0 daily results.");
    expect(importSummaryText(0, 1)).toBe("Added 0 runs and 1 daily result.");
  });
});

test("reset forgets progress and the unfinished daily puzzle", () => {
  const keyToText = new Map<string, string>([
    [PROGRESS_STORAGE_KEY, "{}"],
    [DAILY_IN_PROGRESS_STORAGE_KEY, "{}"],
    ["other.key", "kept"],
  ]);
  const storage: ProgressStorage = {
    getItem: (key): string | null => keyToText.get(key) ?? null,
    setItem: (key, value): void => {
      keyToText.set(key, value);
    },
    removeItem: (key): void => {
      keyToText.delete(key);
    },
  };
  resetProgress(storage);
  expect([...keyToText.keys()]).toEqual(["other.key"]);
});
