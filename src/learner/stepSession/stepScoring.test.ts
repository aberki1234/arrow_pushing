/** Tests for stepScoring.ts. */
import { expect, test } from "vitest";
import { maximumPoints, stepPoints, totalPoints } from "./stepScoring.js";
import type { StepOutcome, StepResult } from "./stepSession.js";

function result(stepOutcome: StepOutcome, attemptCount: number, hintsUsed: number): StepResult {
  return { stepKey: "s", stepOutcome, attemptCount, hintsUsed, feedbackIdsShown: [] };
}

test.each([
  ["first try", result("firstTry", 1, 0), 3],
  ["one wrong check", result("afterRetry", 2, 0), 2],
  ["one hint", result("afterHint", 1, 1), 2],
  ["a wrong check and a hint", result("afterHint", 2, 1), 1],
  ["all three hints", result("afterHint", 1, 3), 0],
  ["never below zero", result("afterHint", 3, 3), 0],
  ["missed", result("missed", 3, 0), 0],
])("%s", (unusedName, stepResult, expected) => {
  expect(stepPoints(stepResult)).toBe(expected);
});

test("a run's points and maximum", () => {
  const stepResults = [
    result("firstTry", 1, 0),
    result("afterRetry", 2, 0),
    result("missed", 3, 1),
  ];
  expect(totalPoints(stepResults)).toBe(5);
  expect(maximumPoints(stepResults)).toBe(9);
  expect(totalPoints([])).toBe(0);
});
