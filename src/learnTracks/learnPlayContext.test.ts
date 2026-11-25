/**
 * Tests for learnPlayContext.ts on the example track (see trackProgress.test.ts for its
 * problem sets) in a catalogue where every example reaction is at version 1.
 */
import { expect, it } from "vitest";
import { exampleLearnCatalogue } from "../testSupport/trackEdits.js";
import { findProblemSet, learnPlayContext } from "./learnPlayContext.js";

const TRACK = "first-mechanisms";
const SN2 = "sn2-hydroxide-bromomethane";

it("the breadcrumb names the track, the problem set and the item's position", () => {
  const context = learnPlayContext(exampleLearnCatalogue(), TRACK, "polar-steps", SN2);
  expect(context?.reactionVersionRef).toBe(`${SN2}@1`);
  expect(context?.breadcrumbText).toBe("First mechanisms › Polar steps · 1 of 2");
});

it("after a set item comes the next one of the same problem set, with its title", () => {
  const context = learnPlayContext(exampleLearnCatalogue(), TRACK, "polar-steps", SN2);
  expect(context?.afterRun).toEqual({
    afterRunKind: "nextInSet",
    reactionSlug: "aldol-addition-base",
    title: "Aldol addition",
  });
});

it("after the last set item the problem set is complete and the next one is offered", () => {
  const context = learnPlayContext(
    exampleLearnCatalogue(),
    TRACK,
    "polar-steps",
    "aldol-addition-base",
  );
  expect(context?.afterRun.afterRunKind).toBe("problemSetComplete");
  expect(
    context?.afterRun.afterRunKind === "problemSetComplete"
      ? context.afterRun.nextProblemSet?.problemSetSlug
      : undefined,
  ).toBe("radical-chain");
});

it("after the last item of the last problem set there is no next problem set", () => {
  const context = learnPlayContext(
    exampleLearnCatalogue(),
    TRACK,
    "radical-chain",
    "radical-bromination-methane",
  );
  expect(context?.breadcrumbText).toBe("First mechanisms › Radical chain · 1 of 1");
  expect(context?.afterRun.afterRunKind).toBe("problemSetComplete");
  expect(
    context?.afterRun.afterRunKind === "problemSetComplete"
      ? context.afterRun.nextProblemSet?.problemSetSlug
      : undefined,
  ).toBe("first-checkpoint");
});

it.each([
  { caseName: "an unknown track", trackSlug: "nowhere", problemSetSlug: "polar-steps" },
  { caseName: "an unknown problem set", trackSlug: TRACK, problemSetSlug: "nowhere" },
  {
    caseName: "a reaction not in the problem set",
    trackSlug: TRACK,
    problemSetSlug: "radical-chain",
  },
])("$caseName gives no context", ({ trackSlug, problemSetSlug }) => {
  expect(learnPlayContext(exampleLearnCatalogue(), trackSlug, problemSetSlug, SN2)).toBeNull();
});

it("findProblemSet finds a problem set by its track and slug", () => {
  expect(findProblemSet(exampleLearnCatalogue(), TRACK, "radical-chain")?.problemSet.title).toBe(
    "Radical chain",
  );
  expect(findProblemSet(exampleLearnCatalogue(), TRACK, "nowhere")).toBeNull();
});

it("a checkpoint's reactions have no play context: they are played from its page", () => {
  expect(learnPlayContext(exampleLearnCatalogue(), TRACK, "first-checkpoint", SN2)).toBeNull();
});
