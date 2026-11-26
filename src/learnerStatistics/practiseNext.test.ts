/**
 * Tests for practiseNext.ts: the Progress page's "Practise next" card (decided 2026-11-26).
 * The runs are hand-made; each reaction's mastery is its last run's points over its maximum
 * (3 per step: first try 3, after a retry 2, missed 0), worked out by hand in each test.
 */
import { expect, it } from "vitest";
import { emptyProgress, withRun } from "../learnerProgress/learnerProgress.js";
import type { LearnerProgress, RunRecord } from "../learnerProgress/learnerProgress.js";
import { runOf, stepOf } from "../testSupport/progressExamples.js";
import { exampleLearnCatalogue } from "../testSupport/trackEdits.js";
import { masteryBySlug } from "./reactionMastery.js";
import { PRACTISE_NEXT_COUNT, practiseNext } from "./practiseNext.js";

const SN2 = "sn2-hydroxide-bromomethane";
const ALDOL = "aldol-addition-base";
const RADICAL = "radical-bromination-methane";
const WITTIG = "wittig-methylenation-cyclohexanone";

function progressWith(runs: readonly RunRecord[]): LearnerProgress {
  return runs.reduce(withRun, emptyProgress());
}

function slugsOf(progress: LearnerProgress): string[] {
  return practiseNext(masteryBySlug(progress), exampleLearnCatalogue()).map(
    (entry) => entry.reactionSlug,
  );
}

it("nothing tried means nothing to practise next", () => {
  expect(slugsOf(emptyProgress())).toEqual([]);
});

it("the weakest reactions come first, at most three, mastered ones left out", () => {
  const progress = progressWith([
    // SN2 0% (missed: 0 / 3), aldol 67% (a retry: 2 / 3), radical 100% (mastered), Wittig 33%
    // (missed, then a retry: 2 / 6).
    runOf(`${SN2}@1`, "2026-12-01T09:00:00Z", [stepOf("missed")]),
    runOf(`${ALDOL}@1`, "2026-12-01T09:05:00Z", [stepOf("afterRetry")]),
    runOf(`${RADICAL}@1`, "2026-12-01T09:10:00Z", [stepOf("firstTry")]),
    runOf(`${WITTIG}@1`, "2026-12-01T09:15:00Z", [stepOf("missed"), stepOf("afterRetry")]),
  ]);
  expect(PRACTISE_NEXT_COUNT).toBe(3);
  expect(slugsOf(progress)).toEqual([SN2, WITTIG, ALDOL]);
});

it("among equally weak reactions, the one practised longest ago comes first", () => {
  const progress = progressWith([
    runOf(`${ALDOL}@1`, "2026-12-02T09:00:00Z", [stepOf("missed")]),
    runOf(`${SN2}@1`, "2026-12-01T09:00:00Z", [stepOf("missed")]),
  ]);
  expect(slugsOf(progress)).toEqual([SN2, ALDOL]);
});

it("an entry names its title, mastery, last run and the latest version to play", () => {
  const lastRun = runOf(`${SN2}@1`, "2026-12-01T09:00:00Z", [stepOf("afterRetry")]);
  const [entry] = practiseNext(masteryBySlug(progressWith([lastRun])), exampleLearnCatalogue());
  expect(entry).toEqual({
    reactionSlug: SN2,
    title: "SN2 substitution",
    masteryPercent: 67,
    lastStepResults: lastRun.stepResults,
    reactionVersionRef: `${SN2}@1`,
  });
});

it("a reaction no longer in the catalogue is left out", () => {
  const progress = progressWith([
    runOf("withdrawn-reaction@1", "2026-12-01T09:00:00Z", [stepOf("missed")]),
  ]);
  expect(slugsOf(progress)).toEqual([]);
});
