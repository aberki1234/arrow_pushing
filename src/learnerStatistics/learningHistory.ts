/**
 * The learner's history over time (decided 2026-11-25, item 7c): the share of steps taken on the
 * first try this week and the week before, the last 28 days of daily puzzles, and the best streak.
 */
import { OUTCOME_TO_SHARE_TILE, dateBefore, streakOn } from "../dailyPuzzle/dailyPuzzle.js";
import type { DailyResult, LearnerProgress } from "../learnerProgress/learnerProgress.js";
import type { StepResult } from "../stepSession/stepSession.js";

export const HISTORY_DAYS = 28;
export const DAYS_PER_WEEK = 7;

/** null when no step was taken in that week. Percentages are rounded. */
export interface FirstTryRates {
  readonly thisWeekPercent: number | null;
  readonly lastWeekPercent: number | null;
}

/** good: every step on the first try; missed: any step missed; helped: anything else. */
export type DayTone = "good" | "helped" | "missed" | "notPlayed";

export interface HistoryDay {
  readonly localDate: string;
  readonly dayTone: DayTone;
}

const PERCENT = 100;
const MILLISECONDS_PER_DAY = 86_400_000;
const MINUS_SIGN = "\u2212";

function firstTryPercent(stepResults: readonly StepResult[]): number | null {
  if (stepResults.length === 0) {
    return null;
  }
  const firstTries = stepResults.filter((stepResult) => stepResult.stepOutcome === "firstTry");
  return Math.round((PERCENT * firstTries.length) / stepResults.length);
}

/** Steps of runs started in the 7 days up to `now`, and in the 7 days before those. */
export function firstTryRates(progress: LearnerProgress, now: Date): FirstTryRates {
  const weekLength = DAYS_PER_WEEK * MILLISECONDS_PER_DAY;
  const stepsInWeek = (weeksBack: number): StepResult[] => {
    const end = now.getTime() - weeksBack * weekLength;
    return progress.runs
      .filter((run) => {
        const started = Date.parse(run.startedAt);
        return started <= end && started > end - weekLength;
      })
      .flatMap((run) => run.stepResults);
  };
  return {
    thisWeekPercent: firstTryPercent(stepsInWeek(0)),
    lastWeekPercent: firstTryPercent(stepsInWeek(1)),
  };
}

/** "+6% vs last week", "−3% vs last week", or "" when either week is empty. */
export function weekChangeText(rates: FirstTryRates): string {
  const { thisWeekPercent, lastWeekPercent } = rates;
  if (thisWeekPercent === null || lastWeekPercent === null) {
    return "";
  }
  const change = thisWeekPercent - lastWeekPercent;
  const sign = change < 0 ? MINUS_SIGN : "+";
  return `${sign}${String(Math.abs(change))}% vs last week`;
}

function toneOf(dailyResult: DailyResult | undefined): DayTone {
  if (dailyResult === undefined) {
    return "notPlayed";
  }
  if (dailyResult.shareGrid.includes(OUTCOME_TO_SHARE_TILE.missed)) {
    return "missed";
  }
  return dailyResult.shareGrid.includes(OUTCOME_TO_SHARE_TILE.afterHint) ? "helped" : "good";
}

/** The last HISTORY_DAYS local days up to `today`, oldest first. */
export function dailyHistory(
  dateToDailyResult: Readonly<Record<string, DailyResult>>,
  today: string,
): HistoryDay[] {
  const dates = [today];
  while (dates.length < HISTORY_DAYS) {
    dates.unshift(dateBefore(dates[0] ?? today));
  }
  return dates.map((localDate) => ({
    localDate,
    dayTone: toneOf(
      Object.hasOwn(dateToDailyResult, localDate) ? dateToDailyResult[localDate] : undefined,
    ),
  }));
}

export function bestStreak(dateToDailyResult: Readonly<Record<string, DailyResult>>): number {
  return Object.keys(dateToDailyResult).reduce(
    (best, localDate) => Math.max(best, streakOn(dateToDailyResult, localDate)),
    0,
  );
}
