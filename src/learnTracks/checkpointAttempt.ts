/**
 * A checkpoint attempt (decided 2026-11-26, item 9c): one sitting on the checkpoint's page, which
 * plays its set items one after another in a shuffled order, names hidden until each is
 * finished. The order is not stored: a new attempt shuffles the set items not yet done in the
 * checkpoint, or all of them once every one is done (to play it again).
 */
import type { LearnerProgress } from "../learnerProgress/learnerProgress.js";
import type { ProblemSet, SetItem } from "../trackFiles/trackSchemaViolations.js";
import { slugsDoneInCheckpoint } from "./trackProgress.js";

/** A number in [0, 1), as Math.random gives; passed in so that tests can fix the order. */
export type RandomFraction = () => number;

/**
 * A copy of `setItems` in random order (Fisher–Yates: from the end, each position swaps with
 * one at or before it).
 */
function shuffled(setItems: readonly SetItem[], randomFraction: RandomFraction): SetItem[] {
  const order = [...setItems];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(randomFraction() * (i + 1));
    [order[i], order[j]] = [order[j] as SetItem, order[i] as SetItem];
  }
  return order;
}

/** The set items of a new attempt at the checkpoint `problemSet` of track `trackSlug`. */
export function checkpointAttemptOrder(
  trackSlug: string,
  problemSet: ProblemSet,
  progress: LearnerProgress,
  randomFraction: RandomFraction,
): SetItem[] {
  const doneSlugs = slugsDoneInCheckpoint(progress, `${trackSlug}/${problemSet.problemSetSlug}`);
  const notDone = problemSet.setItems.filter((setItem) => !doneSlugs.has(setItem.reactionSlug));
  return shuffled(notDone.length > 0 ? notDone : problemSet.setItems, randomFraction);
}
