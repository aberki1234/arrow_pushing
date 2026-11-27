/**
 * Tests for trackProgress.ts on the example track (fixtures/tracks/first-mechanisms.json):
 *   polar-steps       sn2, aldol
 *   radical-chain     radical bromination
 *   first-checkpoint  radical bromination, sn2 (a checkpoint)
 * Mastery is points ÷ maximum of the most recent run (stepScoring.ts): a first-try step is
 * 3 of 3 (100%), a step after a hint 2 of 3 (67% rounded). Expected values are worked by hand.
 */
import { expect, it } from "vitest";
import type { CatalogueTrack } from "../../core/catalogue/catalogueReading.js";
import {
  type LearnerProgress,
  type RunRecord,
  emptyProgress,
  withRun,
} from "../learnerProgress/learnerProgress.js";
import { runOf, stepOf } from "../../testSupport/progressExamples.js";
import { exampleLearnCatalogue } from "../../testSupport/trackEdits.js";
import {
  nextUpInProblemSet,
  nextUpInTrack,
  problemSetProgress,
  trackProgress,
} from "./trackProgress.js";

const TRACK = "first-mechanisms";
const SN2 = "sn2-hydroxide-bromomethane";
const ALDOL = "aldol-addition-base";
const RADICAL = "radical-bromination-methane";

function exampleTrack(): CatalogueTrack {
  const [track] = exampleLearnCatalogue().tracks ?? [];
  if (track === undefined) {
    throw new Error("the example catalogue has no track");
  }
  return track;
}

function problemSetOf(problemSetSlug: string): CatalogueTrack["problemSets"][number] {
  const found = exampleTrack().problemSets.find(
    (problemSet) => problemSet.problemSetSlug === problemSetSlug,
  );
  if (found === undefined) {
    throw new Error(`no problem set ${problemSetSlug}`);
  }
  return found;
}

/** Progress with one finished practice run per [slug, outcome], a minute apart. */
function progressWith(...slugAndOutcomes: [string, "firstTry" | "afterHint"][]): LearnerProgress {
  return slugAndOutcomes.reduce(
    (progress, [slug, stepOutcome], position) =>
      withRun(
        progress,
        runOf(`${slug}@1`, `2026-12-01T09:0${String(position)}:00Z`, [stepOf(stepOutcome)]),
      ),
    emptyProgress(),
  );
}

it("with no runs nothing is done and mastery is 0%", () => {
  const polarSteps = problemSetProgress(TRACK, problemSetOf("polar-steps"), emptyProgress());
  expect(polarSteps.doneCount).toBe(0);
  expect(polarSteps.totalCount).toBe(2);
  expect(polarSteps.masteryPercent).toBe(0);
  expect(polarSteps.setItemMarks.map((mark) => [mark.done, mark.masteryPercent])).toEqual([
    [false, null],
    [false, null],
  ]);
});

it("a set item is done after any finished run, and mastered only at 100%", () => {
  const progress = progressWith([SN2, "firstTry"], [ALDOL, "afterHint"]);
  const polarSteps = problemSetProgress(TRACK, problemSetOf("polar-steps"), progress);
  expect(polarSteps.setItemMarks.map((mark) => [mark.done, mark.mastered])).toEqual([
    [true, true],
    [true, false],
  ]);
  expect(polarSteps.doneCount).toBe(2);
  // (100 + 67) / 2 = 83.5, rounded to 84.
  expect(polarSteps.masteryPercent).toBe(84);
});

it("a daily run counts as done too", () => {
  const progress = withRun(
    emptyProgress(),
    runOf(`${SN2}@1`, "2026-12-01T09:00:00Z", [stepOf("firstTry")], "daily"),
  );
  expect(problemSetProgress(TRACK, problemSetOf("polar-steps"), progress).doneCount).toBe(1);
});

it("a checkpoint's set items are not done by ordinary runs", () => {
  const progress = progressWith([SN2, "firstTry"], [RADICAL, "firstTry"]);
  const checkpoint = problemSetProgress(TRACK, problemSetOf("first-checkpoint"), progress);
  expect(checkpoint.doneCount).toBe(0);
  expect(checkpoint.setItemMarks.map((mark) => mark.masteryPercent)).toEqual([100, 100]);
});

it("the track counts every set item and averages their mastery", () => {
  const progress = progressWith([SN2, "firstTry"], [RADICAL, "afterHint"]);
  const progressOfTrack = trackProgress(exampleTrack(), progress);
  expect(progressOfTrack.totalCount).toBe(5);
  // Done: sn2 in polar-steps, radical in radical-chain; the checkpoint's items are not done.
  expect(progressOfTrack.doneCount).toBe(2);
  // Items: sn2 100, aldol 0, radical 67, radical 67, sn2 100 -> 334 / 5 = 66.8, rounded to 67.
  expect(progressOfTrack.masteryPercent).toBe(67);
  expect(progressOfTrack.problemSetProgresses.map((entry) => entry.doneCount)).toEqual([1, 1, 0]);
});

it("Next up is the first set item, in track order, that is not done", () => {
  expect(nextUpInTrack(exampleTrack(), emptyProgress())?.setItem.reactionSlug).toBe(SN2);
  const afterPolar = nextUpInTrack(
    exampleTrack(),
    progressWith([SN2, "afterHint"], [ALDOL, "firstTry"]),
  );
  expect([afterPolar?.problemSet.problemSetSlug, afterPolar?.setItem.reactionSlug]).toEqual([
    "radical-chain",
    RADICAL,
  ]);
  const afterAldolOnly = nextUpInTrack(exampleTrack(), progressWith([ALDOL, "firstTry"]));
  expect(afterAldolOnly?.setItem.reactionSlug).toBe(SN2);
});

it("once every ordinary problem set is done, Next up is the checkpoint", () => {
  const progress = progressWith([SN2, "firstTry"], [ALDOL, "firstTry"], [RADICAL, "firstTry"]);
  const nextUp = nextUpInTrack(exampleTrack(), progress);
  expect([nextUp?.problemSet.problemSetSlug, nextUp?.setItem.reactionSlug]).toEqual([
    "first-checkpoint",
    RADICAL,
  ]);
});

it("Next up in a problem set is its first set item not done, or null when all are", () => {
  const polarSteps = problemSetOf("polar-steps");
  expect(nextUpInProblemSet(TRACK, polarSteps, progressWith([SN2, "firstTry"]))?.reactionSlug).toBe(
    ALDOL,
  );
  expect(
    nextUpInProblemSet(TRACK, polarSteps, progressWith([SN2, "firstTry"], [ALDOL, "afterHint"])),
  ).toBeNull();
});

const CHECKPOINT_REF = "first-mechanisms/first-checkpoint";

it("a checkpoint's set item is done by a checkpoint run in that checkpoint only", () => {
  const checkpointRun = (problemSetRef: string): RunRecord => ({
    ...runOf(`${RADICAL}@1`, "2026-12-01T09:00:00Z", [stepOf("afterHint")], "checkpoint"),
    problemSetRef,
  });
  const inThisCheckpoint = withRun(emptyProgress(), checkpointRun(CHECKPOINT_REF));
  const checkpoint = problemSetProgress(TRACK, problemSetOf("first-checkpoint"), inThisCheckpoint);
  expect(checkpoint.setItemMarks.map((mark) => mark.done)).toEqual([true, false]);
  const inAnotherCheckpoint = withRun(
    emptyProgress(),
    checkpointRun("other-track/first-checkpoint"),
  );
  expect(
    problemSetProgress(TRACK, problemSetOf("first-checkpoint"), inAnotherCheckpoint).doneCount,
  ).toBe(0);
  // A checkpoint run also counts for the ordinary problem set holding the reaction.
  expect(problemSetProgress(TRACK, problemSetOf("radical-chain"), inThisCheckpoint).doneCount).toBe(
    1,
  );
});
