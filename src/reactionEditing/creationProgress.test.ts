/** Tests for creationProgress.ts: the stage a draft opens on and Create's progress line. */
import { describe, expect, it } from "vitest";
import { exampleReaction } from "../testSupport/reactionEdits.js";
import { creationProgress, creationProgressLine, openingStage } from "./creationProgress.js";
import { newReactionDraft } from "./reactionDraft.js";

const newDraft = newReactionDraft({
  reactionSlug: "test",
  title: "Test",
  startState: { mappedSmiles: "[OH-:1]", mapNumberToCoordinates: { "1": [0, 0] } },
});

describe("creationProgress", () => {
  it("counts the arrow steps and the teaching items", () => {
    expect(creationProgress(exampleReaction("aldol-addition-base.json"))).toEqual({
      arrowStepCount: 3,
      teachingDoneCount: 14,
      teachingItemCount: 14,
      neededLeftCount: 0,
    });
    expect(creationProgress(newDraft)).toEqual({
      arrowStepCount: 0,
      teachingDoneCount: 0,
      teachingItemCount: 1,
      neededLeftCount: 1,
    });
  });
});

describe("openingStage", () => {
  it.each([
    [
      { arrowStepCount: 0, teachingDoneCount: 0, teachingItemCount: 1, neededLeftCount: 1 },
      "mechanism",
    ],
    [
      { arrowStepCount: 2, teachingDoneCount: 3, teachingItemCount: 9, neededLeftCount: 2 },
      "teaching",
    ],
    [
      { arrowStepCount: 2, teachingDoneCount: 7, teachingItemCount: 9, neededLeftCount: 0 },
      "publish",
    ],
  ] as const)("opens %j on %s", (progress, stage) => {
    expect(openingStage(progress)).toBe(stage);
  });
});

describe("creationProgressLine", () => {
  it.each([
    [
      { arrowStepCount: 0, teachingDoneCount: 0, teachingItemCount: 1, neededLeftCount: 1 },
      "No steps yet",
    ],
    [
      { arrowStepCount: 1, teachingDoneCount: 2, teachingItemCount: 5, neededLeftCount: 1 },
      "1 step · teaching 2 of 5",
    ],
    [
      { arrowStepCount: 2, teachingDoneCount: 4, teachingItemCount: 9, neededLeftCount: 0 },
      "2 steps · teaching 4 of 9",
    ],
    [
      { arrowStepCount: 3, teachingDoneCount: 14, teachingItemCount: 14, neededLeftCount: 0 },
      "3 steps · teaching done",
    ],
  ] as const)("writes %j as %j", (progress, line) => {
    expect(creationProgressLine(progress)).toBe(line);
  });
});
