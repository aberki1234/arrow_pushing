/**
 * Home's Continue learning card (decided 2026-11-25, item 9b): the last problem set the learner
 * touched (progress.lastProblemSetRef, "<trackSlug>/<problemSetSlug>") and its Next up.
 */
import type { Catalogue, CatalogueTrack } from "../catalogue/catalogueReading.js";
import { findProblemSet } from "./learnPlayContext.js";
import { nextUpInProblemSet } from "./trackProgress.js";
import type { LearnerProgress } from "../learnerProgress/learnerProgress.js";
import type { ProblemSet, SetItem } from "../trackFiles/trackSchemaViolations.js";

export interface ContinueLearning {
  readonly track: CatalogueTrack;
  readonly problemSet: ProblemSet;
  /** null when every set item of the problem set is done. */
  readonly nextUp: SetItem | null;
}

/**
 * The card's content; null when no problem set was touched yet, or the one touched is no longer
 * in the catalogue.
 */
export function continueLearning(
  catalogue: Catalogue,
  progress: LearnerProgress,
): ContinueLearning | null {
  if (progress.lastProblemSetRef === undefined) {
    return null;
  }
  const [trackSlug = "", problemSetSlug = ""] = progress.lastProblemSetRef.split("/");
  const found = findProblemSet(catalogue, trackSlug, problemSetSlug);
  return found === null
    ? null
    : { ...found, nextUp: nextUpInProblemSet(found.problemSet, progress) };
}
