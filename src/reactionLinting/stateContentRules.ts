/**
 * Lint rules on what each state shows the learner, and on its size for symmetry.
 *
 * Rules
 *   learner-prompt-missing        error    a state with an arrow step leaving it has no
 *                                          learnerPrompt
 *   hint-tiers-missing            error    such a state has no hintTiers (every step needs at
 *                                          least one hint before submission, docs/SPEC.md)
 *   fewer-than-three-hint-tiers   warning  such a state has fewer than 3 hint tiers (the
 *                                          conceptual / narrowing / reveal ladder)
 *   too-many-skeleton-symmetries  warning  a state with an arrow step leaving it has more than
 *                                          the symmetry cap, so equivalent atoms there are not
 *                                          accepted (docs/schema-design.md §4)
 */
import { graphOf, type PreparedReaction } from "../attemptAssessment/preparedReaction.js";
import {
  MAXIMUM_SKELETON_SYMMETRIES,
  skeletonSymmetriesWithinCap,
} from "../attemptAssessment/skeletonSymmetry.js";
import type { LintedReaction } from "./lintedReaction.js";
import { type LintFinding, lintError, lintWarning } from "./lintFindings.js";

const FULL_HINT_LADDER_LENGTH = 3; // conceptual, narrowing, reveal

/** In stateIdToState order: the states where the learner draws arrows. */
function stateIdsWithArrowStepsLeaving(reaction: LintedReaction): string[] {
  const fromStateIds = new Set(
    reaction.steps.filter((step) => step.stepKind !== "change").map((step) => step.fromStateId),
  );
  return [...reaction.stateIdToState.keys()].filter((stateId) => fromStateIds.has(stateId));
}

/**
 * The three learner-text rules: a missing key at "/stateIdToState/<state id>", too few hint tiers
 * at ".../hintTiers".
 */
export function learnerTextFindings(reaction: LintedReaction): LintFinding[] {
  const findings: LintFinding[] = [];
  for (const stateId of stateIdsWithArrowStepsLeaving(reaction)) {
    const state = reaction.stateIdToState.get(stateId);
    if (state === undefined) {
      continue;
    }
    if (!state.hasLearnerPrompt) {
      findings.push(
        lintError(
          "learner-prompt-missing",
          ["stateIdToState", stateId],
          `state "${stateId}": arrows are drawn here, so it needs a learnerPrompt`,
        ),
      );
    }
    if (state.hintTierCount === 0) {
      findings.push(
        lintError(
          "hint-tiers-missing",
          ["stateIdToState", stateId],
          `state "${stateId}": arrows are drawn here, so it needs at least one hint tier`,
        ),
      );
    } else if (state.hintTierCount < FULL_HINT_LADDER_LENGTH) {
      findings.push(
        lintWarning(
          "fewer-than-three-hint-tiers",
          ["stateIdToState", stateId, "hintTiers"],
          `state "${stateId}": ${String(state.hintTierCount)} hint tier(s); the full ladder is ` +
            "conceptual, narrowing, reveal",
        ),
      );
    }
  }
  return findings;
}

/** too-many-skeleton-symmetries, at "/stateIdToState/<state id>/mappedSmiles". */
export function symmetryCapFindings(
  reaction: LintedReaction,
  prepared: PreparedReaction,
  maximumSymmetries: number = MAXIMUM_SKELETON_SYMMETRIES,
): LintFinding[] {
  return stateIdsWithArrowStepsLeaving(reaction)
    .filter(
      (stateId) =>
        skeletonSymmetriesWithinCap(graphOf(prepared, stateId), maximumSymmetries) === undefined,
    )
    .map((stateId) =>
      lintWarning(
        "too-many-skeleton-symmetries",
        ["stateIdToState", stateId, "mappedSmiles"],
        `state "${stateId}": more than ${String(maximumSymmetries)} skeleton symmetries, so ` +
          "equivalent atoms are not accepted here; draw fewer explicit hydrogens",
      ),
    );
}
