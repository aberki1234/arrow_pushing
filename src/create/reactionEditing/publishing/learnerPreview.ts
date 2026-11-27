/**
 * "Play as learner": the unsaved draft played in the real step screen, in practice mode, from the
 * start state or a chosen state (docs/SPEC.md §5, editor decisions 2026-11-25). It is offered once
 * every step reproduces its to-state (lint rule 6, the linter's own check); prompts and hints may
 * still be missing (8b).
 */
import { prepareReaction } from "../../../core/attemptAssessment/preparedReaction.js";
import { readLintedReaction } from "../../../tooling/reactionLinting/findings/lintedReaction.js";
import { withoutInvalidPatterns } from "../../../tooling/reactionLinting/rules/misconceptionRules.js";
import { stepReproductionFindings } from "../../../tooling/reactionLinting/rules/stepReproduction.js";
import { readSessionReaction } from "../../../learner/stepSession/sessionReaction.js";
import { sessionAtState, type StepSession } from "../../../learner/stepSession/stepSession.js";
import { previewReactionFile } from "../draft/previewReactionFile.js";
import { type ReactionDocument, draftMechanism, stepsOf } from "../draft/reactionDraft.js";

export type PreviewReadiness =
  { readonly ready: true } | { readonly ready: false; readonly reason: string };

export function previewReadiness(document: ReactionDocument): PreviewReadiness {
  if (stepsOf(document).length === 0) {
    return { ready: false, reason: "Draw a first step to play it." };
  }
  const mechanism = draftMechanism(document);
  const reaction = readLintedReaction(mechanism);
  const prepared = prepareReaction(withoutInvalidPatterns(mechanism, reaction));
  const [firstProblem] = stepReproductionFindings(reaction, prepared);
  return firstProblem === undefined
    ? { ready: true }
    : { ready: false, reason: firstProblem.message };
}

/** A practice session on the draft, at `stateId` (the start state when not given). */
export function startPreview(document: ReactionDocument, stateId?: string): StepSession {
  const reaction = readSessionReaction(previewReactionFile(document));
  return sessionAtState(reaction, "practice", stateId ?? reaction.startStateId, {
    stepResults: [],
    wrongCheckCount: 0,
    hintsShown: 0,
    feedbackIdsAtState: [],
  });
}
