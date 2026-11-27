/**
 * Tests for checkpointAttempt.ts on the example track's checkpoint (radical bromination, then
 * sn2). The random source is fixed, so the expected orders follow from the Fisher–Yates shuffle
 * worked by hand: with a source always giving 0, each position swaps with the first, so two items
 * [a, b] become [b, a].
 */
import { expect, it } from "vitest";
import type { CatalogueTrack } from "../../core/catalogue/catalogueReading.js";
import { emptyProgress, withRun } from "../learnerProgress/learnerProgress.js";
import { runOf, stepOf } from "../../testSupport/progressExamples.js";
import { exampleLearnCatalogue } from "../../testSupport/trackEdits.js";
import { checkpointAttemptOrder } from "./checkpointAttempt.js";

const TRACK = "first-mechanisms";
const SN2 = "sn2-hydroxide-bromomethane";
const RADICAL = "radical-bromination-methane";

function checkpoint(): CatalogueTrack["problemSets"][number] {
  const found = exampleLearnCatalogue().tracks?.[0]?.problemSets.find(
    (problemSet) => problemSet.checkpoint,
  );
  if (found === undefined) {
    throw new Error("the example track has no checkpoint");
  }
  return found;
}

function slugsOf(setItems: readonly { reactionSlug: string }[]): string[] {
  return setItems.map((setItem) => setItem.reactionSlug);
}

it("a first attempt shuffles every set item", () => {
  expect(slugsOf(checkpointAttemptOrder(TRACK, checkpoint(), emptyProgress(), () => 0))).toEqual([
    SN2,
    RADICAL,
  ]);
  // A source near 1 leaves each item where it is.
  expect(
    slugsOf(checkpointAttemptOrder(TRACK, checkpoint(), emptyProgress(), () => 0.999)),
  ).toEqual([RADICAL, SN2]);
});

it("a later attempt plays only the set items not yet done in the checkpoint", () => {
  const progress = withRun(emptyProgress(), {
    ...runOf(`${RADICAL}@1`, "2026-12-01T09:00:00Z", [stepOf("firstTry")], "checkpoint"),
    problemSetRef: `${TRACK}/first-checkpoint`,
  });
  expect(slugsOf(checkpointAttemptOrder(TRACK, checkpoint(), progress, () => 0))).toEqual([SN2]);
});

it("once every set item is done, an attempt plays them all again", () => {
  const progress = [RADICAL, SN2].reduce(
    (saved, slug, position) =>
      withRun(saved, {
        ...runOf(
          `${slug}@1`,
          `2026-12-01T09:0${String(position)}:00Z`,
          [stepOf("firstTry")],
          "checkpoint",
        ),
        problemSetRef: `${TRACK}/first-checkpoint`,
      }),
    emptyProgress(),
  );
  expect(
    new Set(slugsOf(checkpointAttemptOrder(TRACK, checkpoint(), progress, Math.random))),
  ).toEqual(new Set([RADICAL, SN2]));
});
