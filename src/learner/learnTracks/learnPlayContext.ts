/**
 * What the step screen shows when a reaction is played from a problem set (decided 2026-11-25,
 * item 9b): a breadcrumb, and on the finished view either Next in set or Problem set complete.
 */
import {
  type Catalogue,
  type CatalogueTrack,
  catalogueTracks,
} from "../../core/catalogue/catalogueReading.js";
import type { ProblemSet } from "../../core/trackFiles/trackSchemaViolations.js";
import { reactionVersionRef } from "../../core/catalogue/reactionVersionRefs.js";

/** After the run: the next set item of the same problem set, or the problem set is complete. */
export type AfterRun =
  | { readonly afterRunKind: "nextInSet"; readonly reactionSlug: string; readonly title: string }
  | {
      readonly afterRunKind: "problemSetComplete";
      /** The next problem set of the track; null after the last one. */
      readonly nextProblemSet: ProblemSet | null;
    };

export interface LearnPlayContext {
  readonly track: CatalogueTrack;
  readonly problemSet: ProblemSet;
  /** The latest published version of the reaction, e.g. "aldol-addition-base@3". */
  readonly reactionVersionRef: string;
  /** "Aromatic chemistry › The arenium ion · 2 of 5". */
  readonly breadcrumbText: string;
  readonly afterRun: AfterRun;
}

/** The problem set `problemSetSlug` of track `trackSlug`, or null if the catalogue lacks it. */
export function findProblemSet(
  catalogue: Catalogue,
  trackSlug: string,
  problemSetSlug: string,
): { readonly track: CatalogueTrack; readonly problemSet: ProblemSet } | null {
  const track = catalogueTracks(catalogue).find((candidate) => candidate.trackSlug === trackSlug);
  const problemSet = track?.problemSets.find(
    (candidate) => candidate.problemSetSlug === problemSetSlug,
  );
  return track === undefined || problemSet === undefined ? null : { track, problemSet };
}

function afterRunOf(
  catalogue: Catalogue,
  track: CatalogueTrack,
  problemSet: ProblemSet,
  setItemPosition: number,
): AfterRun {
  const nextSetItem = problemSet.setItems[setItemPosition + 1];
  if (nextSetItem !== undefined) {
    const entry = catalogue.reactions.find(
      (candidate) => candidate.reactionSlug === nextSetItem.reactionSlug,
    );
    return {
      afterRunKind: "nextInSet",
      reactionSlug: nextSetItem.reactionSlug,
      title: entry?.title ?? nextSetItem.reactionSlug,
    };
  }
  const problemSetPosition = track.problemSets.indexOf(problemSet);
  return {
    afterRunKind: "problemSetComplete",
    nextProblemSet: track.problemSets[problemSetPosition + 1] ?? null,
  };
}

/**
 * The context of playing `reactionSlug` from a problem set; null when the catalogue has no such
 * track, problem set, set item or reaction, and for a checkpoint, whose reactions are played on
 * its own page with their names hidden (checkpointAttempt.ts).
 */
export function learnPlayContext(
  catalogue: Catalogue,
  trackSlug: string,
  problemSetSlug: string,
  reactionSlug: string,
): LearnPlayContext | null {
  const found = findProblemSet(catalogue, trackSlug, problemSetSlug);
  const setItemPosition =
    found?.problemSet.setItems.findIndex((setItem) => setItem.reactionSlug === reactionSlug) ?? -1;
  const entry = catalogue.reactions.find((candidate) => candidate.reactionSlug === reactionSlug);
  if (found === null || found.problemSet.checkpoint || setItemPosition < 0 || entry === undefined) {
    return null;
  }
  const { track, problemSet } = found;
  const itemCount = problemSet.setItems.length;
  return {
    track,
    problemSet,
    reactionVersionRef: reactionVersionRef(reactionSlug, entry.latestReactionVersion),
    breadcrumbText:
      `${track.title} › ${problemSet.title} · ` +
      `${String(setItemPosition + 1)} of ${String(itemCount)}`,
    afterRun: afterRunOf(catalogue, track, problemSet, setItemPosition),
  };
}
