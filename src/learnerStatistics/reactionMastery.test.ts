/** Tests for reactionMastery.ts. */
import { expect, test } from "vitest";
import { type Catalogue, readCatalogue } from "../catalogue/catalogueReading.js";
import { emptyProgress, withRun } from "../learnerProgress/learnerProgress.js";
import { isRecord, readFixtureJson } from "../testSupport/fixtureFiles.js";
import { runOf, stepOf } from "../testSupport/progressExamples.js";
import { masteredCount, masteryByClass, masteryBySlug, refParts } from "./reactionMastery.js";

function exampleCatalogue(): Catalogue {
  const cases = readFixtureJson("catalogue/catalogue_reading_cases.json");
  return readCatalogue(isRecord(cases) ? cases["catalogue"] : undefined);
}

const SN2 = "sn2-hydroxide-bromomethane";
const ALDOL = "aldol-addition-base";

test("a ref's slug and version", () => {
  expect(refParts("aldol-addition-base@3")).toEqual(["aldol-addition-base", 3]);
});

test("mastery is the most recent run's points over its maximum, across versions", () => {
  let progress = withRun(
    emptyProgress(),
    runOf(`${SN2}@1`, "2026-12-01T09:00:00Z", [stepOf("missed")]),
  );
  progress = withRun(progress, runOf(`${SN2}@2`, "2026-12-02T09:00:00Z", [stepOf("firstTry")]));
  progress = withRun(
    progress,
    runOf(`${ALDOL}@1`, "2026-12-03T09:00:00Z", [
      stepOf("firstTry"),
      stepOf("afterRetry"),
      stepOf("missed"),
    ]),
  );
  const mastery = masteryBySlug(progress);
  expect(mastery.get(SN2)?.masteryPercent).toBe(100);
  expect(mastery.get(SN2)?.lastReactionVersion).toBe(2);
  // 3 + 2 + 0 of 9.
  expect(mastery.get(ALDOL)?.masteryPercent).toBe(56);
  expect(masteredCount(mastery)).toBe(1);
});

test("the most recent run counts even when it is worse", () => {
  let progress = withRun(
    emptyProgress(),
    runOf(`${SN2}@1`, "2026-12-01T09:00:00Z", [stepOf("firstTry")]),
  );
  progress = withRun(progress, runOf(`${SN2}@1`, "2026-12-02T09:00:00Z", [stepOf("afterHint")]));
  expect(masteryBySlug(progress).get(SN2)?.masteryPercent).toBe(67);
});

test("class mastery averages over every catalogue reaction of the class, untried as 0", () => {
  const progress = withRun(
    emptyProgress(),
    runOf(`${SN2}@1`, "2026-12-01T09:00:00Z", [stepOf("firstTry")]),
  );
  expect(masteryByClass(exampleCatalogue(), masteryBySlug(progress))).toEqual([
    { reactionClass: "carbonyl", reactionCount: 1, masteryPercent: 0 },
    { reactionClass: "substitution", reactionCount: 1, masteryPercent: 100 },
  ]);
});
