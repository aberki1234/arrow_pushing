/** Tests for recurringFeedback.ts. */
import { expect, test } from "vitest";
import { emptyProgress, withRun } from "../learnerProgress/learnerProgress.js";
import { exampleSessionReaction } from "../testSupport/exampleSessions.js";
import { runOf, stepOf } from "../testSupport/progressExamples.js";
import {
  type MisconceptionInfo,
  misconceptionInfoOf,
  misconceptionSlugsShown,
  recurringFeedback,
} from "./recurringFeedback.js";

const SN2 = "sn2-hydroxide-bromomethane";

function exampleProgress(): ReturnType<typeof emptyProgress> {
  const octet = "rule:octet-exceeded";
  const attack = `misconception:${SN2}/attack-on-bromine`;
  let progress = withRun(
    emptyProgress(),
    runOf(`${SN2}@1`, "2026-12-01T09:00:00Z", [stepOf("missed", [attack, octet])]),
  );
  progress = withRun(
    progress,
    runOf("aldol-addition-base@1", "2026-12-02T09:00:00Z", [
      stepOf("afterRetry", [octet]),
      stepOf("afterRetry", ["misconception:aldol-addition-base/oxygen-attack"]),
    ]),
  );
  return withRun(
    progress,
    runOf(`${SN2}@1`, "2026-12-03T09:00:00Z", [stepOf("afterRetry", [attack])]),
  );
}

test("a reaction's misconceptions with their tags and messages", () => {
  const info = misconceptionInfoOf(exampleSessionReaction(SN2));
  expect(info.get("attack-on-bromine")?.misconceptionTag).toBe("attack-leaving-group");
  expect(info.get("attack-on-bromine")?.feedbackMessage).toMatch(/repel/);
});

test("slugs whose misconceptions were shown, most recent first", () => {
  expect(misconceptionSlugsShown(exampleProgress())).toEqual([SN2, "aldol-addition-base"]);
});

test("rows: counted, grouped by tag, headed plainly, most frequent first", () => {
  const slugToInfo = new Map<string, ReadonlyMap<string, MisconceptionInfo>>([
    [SN2, misconceptionInfoOf(exampleSessionReaction(SN2))],
  ]);
  const rows = recurringFeedback(exampleProgress(), slugToInfo);
  expect(rows.map((row) => [row.groupKey, row.count])).toEqual([
    ["tag:attack-leaving-group", 2],
    ["rule:octet-exceeded", 2],
    ["misconception:aldol-addition-base/oxygen-attack", 1],
  ]);
  const [attack, octet, oxygen] = rows;
  expect(attack?.heading).toBe("Attack leaving group");
  expect(attack?.message).toMatch(/repel/);
  expect(attack?.practiseRef).toBe(`${SN2}@1`);
  expect(octet?.heading).toBe("Too many electrons");
  expect(octet?.reactionSlugs).toEqual(["aldol-addition-base", SN2]);
  // Not loaded: shown by its id.
  expect(oxygen?.heading).toBe("Oxygen attack");
});

test("rows for one reaction only, for the finished view", () => {
  const rows = recurringFeedback(exampleProgress(), new Map(), "aldol-addition-base");
  expect(rows.map((row) => row.groupKey)).toEqual([
    "rule:octet-exceeded",
    "misconception:aldol-addition-base/oxygen-attack",
  ]);
  expect(rows[0]?.count).toBe(1);
});
