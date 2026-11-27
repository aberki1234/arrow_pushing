/**
 * The difficulty tier Create suggests on its Publish stage (docs/SPEC.md §5, "Create"); the
 * author may choose another.
 *
 * Rule (matches the four example reactions' authored tiers)
 *   3  the reaction accepts another route (an accepted step), or its preferred route has
 *      MANY_ARROW_STEPS or more arrow steps;
 *   1  the preferred route has at most one arrow step, of at most two arrows;
 *   2  otherwise.
 */
import { preferredRoute, routeOfDocument } from "../../../core/reactionFiles/preferredRoute.js";
import { type ReactionDocument, stepsOf } from "../draft/reactionDraft.js";

export type DifficultyTier = 1 | 2 | 3;

export const MANY_ARROW_STEPS = 5;

/** Arrows in an easy reaction's one arrow step (SN2: two). */
const EASY_ARROW_COUNT = 2;

/** The arrow counts of the arrow steps on the preferred route from the start state. */
function preferredRouteArrowCounts(document: ReactionDocument): number[] {
  return preferredRoute(routeOfDocument(document))
    .filter(({ step }) => step["stepKind"] !== "change")
    .map(({ step }) =>
      Array.isArray(step["canonicalArrows"]) ? step["canonicalArrows"].length : 0,
    );
}

export function suggestedDifficultyTier(document: ReactionDocument): DifficultyTier {
  const arrowCounts = preferredRouteArrowCounts(document);
  const acceptsAnotherRoute = stepsOf(document).some((step) => step.routePreference === "accepted");
  if (acceptsAnotherRoute || arrowCounts.length >= MANY_ARROW_STEPS) {
    return 3;
  }
  const isEasy = arrowCounts.length <= 1 && arrowCounts.every((count) => count <= EASY_ARROW_COUNT);
  return isEasy ? 1 : 2;
}
