/** Tests for difficultySuggestion.ts: the difficulty tier Create suggests. */
import { expect, it } from "vitest";
import { exampleReactionDocuments } from "../../../testSupport/fixtureFiles.js";
import { exampleReaction } from "../../../testSupport/reactionEdits.js";
import { MANY_ARROW_STEPS, suggestedDifficultyTier } from "./difficultySuggestion.js";

it.each(exampleReactionDocuments())("suggests %s's authored tier", (fileName, document) => {
  expect(suggestedDifficultyTier(document), fileName).toBe(document.difficultyTier);
});

it("suggests 1 for a draft with no steps", () => {
  const sn2 = exampleReaction("sn2-hydroxide-bromomethane.json");
  expect(suggestedDifficultyTier({ ...sn2, steps: [] })).toBe(1);
});

it(`suggests 3 for a preferred route of ${String(MANY_ARROW_STEPS)} arrow steps`, () => {
  const steps = [...Array(MANY_ARROW_STEPS).keys()].map((position) => ({
    stepKey: `step-${String(position + 1)}`,
    fromStateId: `state-${String(position + 1)}`,
    toStateId: `state-${String(position + 2)}`,
    stepKind: "polar",
    routePreference: "preferred",
    canonicalArrows: ["lp 1 -> 2"],
  }));
  expect(suggestedDifficultyTier({ startStateId: "state-1", steps })).toBe(3);
});

it("suggests 2 for one step of three arrows", () => {
  const sn2 = exampleReaction("sn2-hydroxide-bromomethane.json");
  const [step] = sn2.steps as Record<string, unknown>[];
  const threeArrows = { ...step, canonicalArrows: ["lp 1 -> 2", "s 2-3 -> 3", "lp 4 -> 5"] };
  expect(suggestedDifficultyTier({ ...sn2, steps: [threeArrows] })).toBe(2);
});
