/**
 * The daily puzzle (SPEC §1; decided 2026-11-25, item 7b): which reaction version is today's for
 * the learner's local date, its number, the streak, the time to the next one, the share text,
 * and which of its three states the daily page shows.
 *
 * Rules
 *   puzzle number  the date's position in the catalogue's calendar, counting from 1
 *   streak         consecutive local days with a finished daily, ending today or yesterday
 *                  (missed steps still count: finishing counts, not scoring)
 *   share text     "ArrowPush #<number> <one tile per step taken> <points>/<maximum>", no link
 *   page state     finished if today has a result; in progress if an unfinished daily was
 *                  started today; otherwise before (an unfinished one from another day is dropped)
 */
import type { Catalogue } from "../catalogue/catalogueReading.js";
import type {
  DailyInProgress,
  DailyResult,
  LearnerProgress,
  RunRecord,
} from "../learnerProgress/learnerProgress.js";
import { maximumPoints, totalPoints } from "../stepSession/stepScoring.js";
import type { StepOutcome, StepResult } from "../stepSession/stepSession.js";

export const SHARE_TEXT_PREFIX = "ArrowPush";

export interface DailyPuzzle {
  readonly localDate: string;
  readonly puzzleNumber: number;
  readonly reactionVersionRef: string;
}

export const OUTCOME_TO_SHARE_TILE: Readonly<Record<StepOutcome, string>> = {
  firstTry: "🟩",
  afterRetry: "🟨",
  afterHint: "🟨",
  missed: "🟥",
};

export type DailyPageState =
  | { readonly pageState: "before"; readonly dropSavedPuzzle: boolean }
  | { readonly pageState: "inProgress"; readonly saved: DailyInProgress }
  | { readonly pageState: "finished"; readonly dailyResult: DailyResult };

const MILLISECONDS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;

/** Today's puzzle for the learner's local date, or null when the calendar has none. */
export function dailyPuzzleOn(catalogue: Catalogue, localDate: string): DailyPuzzle | null {
  const calendar = catalogue.dateToDailyReactionVersionRef;
  if (!Object.hasOwn(calendar, localDate)) {
    return null;
  }
  const dates = Object.keys(calendar).sort();
  return {
    localDate,
    puzzleNumber: dates.indexOf(localDate) + 1,
    reactionVersionRef: calendar[localDate] ?? "",
  };
}

/** The day before "YYYY-MM-DD". */
export function dateBefore(localDate: string): string {
  // Calendar arithmetic in UTC, where every day has 24 hours.
  const day = new Date(`${localDate}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - 1);
  return day.toISOString().slice(0, 10);
}

export function streakOn(
  dateToDailyResult: Readonly<Record<string, DailyResult>>,
  localDate: string,
): number {
  const finished = (date: string): boolean => Object.hasOwn(dateToDailyResult, date);
  let date = finished(localDate) ? localDate : dateBefore(localDate);
  let streak = 0;
  while (finished(date)) {
    streak += 1;
    date = dateBefore(date);
  }
  return streak;
}

/** "14 h 22 m" until the learner's next local midnight ("22 m" under an hour). */
export function timeUntilNextPuzzleText(now: Date): string {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const minutesLeft = Math.floor((midnight.getTime() - now.getTime()) / MILLISECONDS_PER_MINUTE);
  const hours = Math.floor(minutesLeft / MINUTES_PER_HOUR);
  const minutes = minutesLeft % MINUTES_PER_HOUR;
  return hours > 0 ? `${String(hours)} h ${String(minutes)} m` : `${String(minutes)} m`;
}

export function shareGridOf(stepResults: readonly StepResult[]): string {
  return stepResults.map((stepResult) => OUTCOME_TO_SHARE_TILE[stepResult.stepOutcome]).join("");
}

export function shareText(puzzleNumber: number, stepResults: readonly StepResult[]): string {
  const points = `${String(totalPoints(stepResults))}/${String(maximumPoints(stepResults))}`;
  return `${SHARE_TEXT_PREFIX} #${String(puzzleNumber)} ${shareGridOf(stepResults)} ${points}`;
}

/** The result to save for a finished daily run. */
export function dailyResultOf(puzzle: DailyPuzzle, run: RunRecord): DailyResult {
  return {
    reactionVersionRef: run.reactionVersionRef,
    puzzleNumber: puzzle.puzzleNumber,
    runStartedAt: run.startedAt,
    shareGrid: shareGridOf(run.stepResults),
    score: totalPoints(run.stepResults),
  };
}

export function dailyPageStateOf(
  puzzle: DailyPuzzle,
  progress: LearnerProgress,
  saved: DailyInProgress | null,
): DailyPageState {
  const dailyResult = progress.dateToDailyResult[puzzle.localDate];
  if (dailyResult !== undefined) {
    return { pageState: "finished", dailyResult };
  }
  if (saved?.localDate === puzzle.localDate) {
    return { pageState: "inProgress", saved };
  }
  return { pageState: "before", dropSavedPuzzle: saved !== null };
}

/** "1 step", "3 steps". */
export function stepCountText(stepCount: number): string {
  return `${String(stepCount)} ${stepCount === 1 ? "step" : "steps"}`;
}
