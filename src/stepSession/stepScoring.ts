/**
 * Points for the steps of a run (decided 2026-11-25, item 7b): each step is worth
 * POINTS_PER_STEP, less one per wrong check and one per hint, never below 0; a missed step scores
 * 0. A run's maximum is POINTS_PER_STEP for every step taken, so it depends on the route.
 */
import type { StepResult } from "./stepSession.js";

export const POINTS_PER_STEP = 3;

export function stepPoints(stepResult: StepResult): number {
  if (stepResult.stepOutcome === "missed") {
    return 0;
  }
  const wrongChecks = stepResult.attemptCount - 1;
  return Math.max(0, POINTS_PER_STEP - wrongChecks - stepResult.hintsUsed);
}

export function totalPoints(stepResults: readonly StepResult[]): number {
  return stepResults.reduce((sum, stepResult) => sum + stepPoints(stepResult), 0);
}

export function maximumPoints(stepResults: readonly StepResult[]): number {
  return POINTS_PER_STEP * stepResults.length;
}
