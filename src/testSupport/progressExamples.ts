/** Hand-made runs and daily results for the learner statistics tests. */
import type { DailyResult, RunRecord } from "../learnerProgress/learnerProgress.js";
import type { StepOutcome, StepResult } from "../stepSession/stepSession.js";

/** A step result: attempts and hints follow from the outcome unless given. */
export function stepOf(
  stepOutcome: StepOutcome,
  feedbackIdsShown: readonly string[] = [],
  stepKey = "s",
): StepResult {
  const attemptCount = stepOutcome === "afterRetry" ? 2 : stepOutcome === "missed" ? 3 : 1;
  const hintsUsed = stepOutcome === "afterHint" ? 1 : 0;
  return { stepKey, stepOutcome, attemptCount, hintsUsed, feedbackIdsShown };
}

export function runOf(
  reactionVersionRef: string,
  startedAt: string,
  stepResults: readonly StepResult[],
  mode: "practice" | "daily" = "practice",
): RunRecord {
  return { reactionVersionRef, mode, startedAt, stepResults };
}

export function dailyResultOf(shareGrid: string): DailyResult {
  return {
    reactionVersionRef: "sn2-hydroxide-bromomethane@1",
    puzzleNumber: 1,
    runStartedAt: "2026-12-01T09:00:00.000Z",
    shareGrid,
    score: 0,
  };
}
