/** Tests for reactionVersionRefs.ts: "<reactionSlug>@<reactionVersion>" written and read. */
import { expect, test } from "vitest";
import { reactionVersionRef, splitReactionVersionRef } from "./reactionVersionRefs.js";

test("a reaction version ref is the slug and the version joined by @", () => {
  expect(reactionVersionRef("aldol-addition-base", 3)).toBe("aldol-addition-base@3");
});

test("a reaction version ref splits back into its slug and version", () => {
  expect(splitReactionVersionRef("aldol-addition-base@3")).toEqual(["aldol-addition-base", 3]);
  expect(splitReactionVersionRef("sn2-hydroxide-bromomethane@12")).toEqual([
    "sn2-hydroxide-bromomethane",
    12,
  ]);
});
