/**
 * Tests for previewReactionFile.ts: an unfinished draft made into a reaction file that Play as
 * learner and Create's drawings can use, its unfilled Publish fields given placeholders.
 */
import { expect, test } from "vitest";
import { exampleReaction } from "../../../testSupport/reactionEdits.js";
import { readSessionReaction } from "../../../learner/stepSession/sessionReaction.js";
import { PREVIEW_PLACEHOLDERS, previewReactionFile } from "./previewReactionFile.js";
import { newReactionDraft } from "./reactionDraft.js";
import type { DraftState } from "./startState.js";

const START_STATE: DraftState = {
  mappedSmiles: "[OH-:1].[CH3:2][Br:3]",
  mapNumberToCoordinates: { "1": [0, 0], "2": [1.5, 0], "3": [3, 0] },
};

test("a new draft keeps what it has and gets placeholders for the rest", () => {
  const draft = newReactionDraft({
    reactionSlug: "sn2-test",
    title: "SN2 test",
    startState: START_STATE,
  });
  const preview = previewReactionFile(draft);
  expect(preview).toMatchObject({
    reactionSlug: "sn2-test",
    title: "SN2 test",
    startStateId: "state-1",
    steps: [],
    authors: [],
    mechanismSummary: PREVIEW_PLACEHOLDERS.mechanismSummary,
  });
  expect(readSessionReaction(preview).title).toBe("SN2 test");
});

test("a draft with its title cleared and fields of the wrong kind still previews", () => {
  const draft = {
    ...exampleReaction("sn2-hydroxide-bromomethane.json"),
    title: "",
    difficultyTier: 7,
    authors: "?",
  };
  const preview = previewReactionFile(draft);
  expect(preview).toMatchObject({
    title: PREVIEW_PLACEHOLDERS.title,
    difficultyTier: 1,
    authors: [],
    reactionClasses: ["substitution"],
  });
  expect(readSessionReaction(preview).steps.map((step) => step.stepKey)).toEqual(["substitution"]);
});
