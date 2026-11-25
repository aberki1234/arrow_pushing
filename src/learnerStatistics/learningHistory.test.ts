/** Tests for learningHistory.ts. */
import { describe, expect, test } from "vitest";
import { emptyProgress, withRun } from "../learnerProgress/learnerProgress.js";
import { dailyResultOf, runOf, stepOf } from "../testSupport/progressExamples.js";
import {
  HISTORY_DAYS,
  bestStreak,
  dailyHistory,
  firstTryRates,
  weekChangeText,
} from "./learningHistory.js";

describe("first-try rates", () => {
  const now = new Date("2026-12-15T12:00:00Z");

  test("this week against the week before; runs older than that do not count", () => {
    let progress = withRun(
      emptyProgress(),
      runOf("sn2@1", "2026-12-14T09:00:00Z", [
        stepOf("firstTry"),
        stepOf("firstTry"),
        stepOf("missed"),
      ]),
    );
    progress = withRun(
      progress,
      runOf("sn2@1", "2026-12-04T09:00:00Z", [stepOf("firstTry"), stepOf("afterHint")]),
    );
    progress = withRun(progress, runOf("sn2@1", "2026-11-01T09:00:00Z", [stepOf("missed")]));
    const rates = firstTryRates(progress, now);
    expect(rates).toEqual({ thisWeekPercent: 67, lastWeekPercent: 50 });
    expect(weekChangeText(rates)).toBe("+17% vs last week");
    expect(weekChangeText({ thisWeekPercent: 40, lastWeekPercent: 50 })).toBe("−10% vs last week");
  });

  test("an empty week has no rate, and no change is shown", () => {
    const rates = firstTryRates(emptyProgress(), now);
    expect(rates).toEqual({ thisWeekPercent: null, lastWeekPercent: null });
    expect(weekChangeText({ thisWeekPercent: 80, lastWeekPercent: null })).toBe("");
  });
});

describe("daily history", () => {
  test("the last 28 days, oldest first, toned by the day's share grid", () => {
    const history = dailyHistory(
      {
        "2026-12-15": dailyResultOf("🟩🟩"),
        "2026-12-14": dailyResultOf("🟩🟨"),
        "2026-12-13": dailyResultOf("🟥🟩"),
        "2026-11-01": dailyResultOf("🟩"),
      },
      "2026-12-15",
    );
    expect(history).toHaveLength(HISTORY_DAYS);
    expect(history[0]?.localDate).toBe("2026-11-18");
    expect(history.slice(-4).map((day) => day.dayTone)).toEqual([
      "notPlayed",
      "missed",
      "helped",
      "good",
    ]);
  });

  test("the best streak ever", () => {
    const dates = ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-10", "2026-11-11"];
    expect(bestStreak(Object.fromEntries(dates.map((date) => [date, dailyResultOf("🟩")])))).toBe(
      3,
    );
    expect(bestStreak({})).toBe(0);
  });
});
