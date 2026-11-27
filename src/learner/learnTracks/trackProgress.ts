/**
 * A learner's progress through the Learn tracks (docs/SPEC.md §5 "Learn"; decided 2026-11-25,
 * item 9b). Everything is worked out from the saved runs; nothing new is stored.
 *
 * Terms (docs/schema-design.md §0)
 *   done (set item)  Its reaction has a finished run in any mode. A checkpoint's set items are
 *                    done only by a checkpoint run in that checkpoint (item 9c), whose run
 *                    records problemSetRef "<trackSlug>/<problemSetSlug>".
 *   mastered         The reaction's most recent run scored 100% (learnerStatistics).
 *   Next up          The first set item, in track order, that is not done.
 */
import type { CatalogueTrack } from "../../core/catalogue/catalogueReading.js";
import type { LearnerProgress } from "../learnerProgress/learnerProgress.js";
import {
  MASTERED_PERCENT,
  type ReactionMastery,
  masteryBySlug,
} from "../learnerStatistics/reactionMastery.js";
import type { ProblemSet, SetItem } from "../../core/trackFiles/trackSchemaViolations.js";
import { splitReactionVersionRef } from "../../core/catalogue/reactionVersionRefs.js";

export interface SetItemMark {
  readonly setItem: SetItem;
  readonly done: boolean;
  readonly mastered: boolean;
  /** 0–100, rounded; null when the reaction has never been finished. */
  readonly masteryPercent: number | null;
}

export interface ProblemSetProgress {
  readonly problemSet: ProblemSet;
  readonly setItemMarks: readonly SetItemMark[];
  readonly doneCount: number;
  readonly totalCount: number;
  /** The average mastery of the set items, untried ones counting 0%. */
  readonly masteryPercent: number;
}

export interface TrackProgress {
  readonly track: CatalogueTrack;
  readonly problemSetProgresses: readonly ProblemSetProgress[];
  readonly doneCount: number;
  readonly totalCount: number;
  /** The average mastery over every set item of the track, untried ones counting 0%. */
  readonly masteryPercent: number;
}

/** Where Next up is: a problem set of the track and one of its set items. */
export interface NextUp {
  readonly problemSet: ProblemSet;
  readonly setItem: SetItem;
}

/** The slugs with a finished run that marks ordinary (not checkpoint) set items done. */
function finishedReactionSlugs(progress: LearnerProgress): Set<string> {
  return new Set(progress.runs.map((run) => splitReactionVersionRef(run.reactionVersionRef)[0]));
}

/** The slugs finished in the checkpoint `problemSetRef` ("<trackSlug>/<problemSetSlug>"). */
export function slugsDoneInCheckpoint(
  progress: LearnerProgress,
  problemSetRef: string,
): Set<string> {
  return new Set(
    progress.runs
      .filter((run) => run.mode === "checkpoint" && run.problemSetRef === problemSetRef)
      .map((run) => splitReactionVersionRef(run.reactionVersionRef)[0]),
  );
}

function averagePercent(percents: readonly number[]): number {
  return percents.length === 0
    ? 0
    : Math.round(percents.reduce((sum, percent) => sum + percent, 0) / percents.length);
}

/**
 * `slugsThatMarkDone`: for an ordinary problem set every finished slug; for a checkpoint only
 * the slugs finished in it.
 */
function setItemMarks(
  problemSet: ProblemSet,
  slugsThatMarkDone: ReadonlySet<string>,
  mastery: ReadonlyMap<string, ReactionMastery>,
): SetItemMark[] {
  return problemSet.setItems.map((setItem) => {
    const masteryPercent = mastery.get(setItem.reactionSlug)?.masteryPercent ?? null;
    return {
      setItem,
      done: slugsThatMarkDone.has(setItem.reactionSlug),
      mastered: masteryPercent !== null && masteryPercent >= MASTERED_PERCENT,
      masteryPercent,
    };
  });
}

interface RunFacts {
  readonly progress: LearnerProgress;
  readonly finishedSlugs: ReadonlySet<string>;
  readonly mastery: ReadonlyMap<string, ReactionMastery>;
}

function runFactsOf(progress: LearnerProgress): RunFacts {
  return {
    progress,
    finishedSlugs: finishedReactionSlugs(progress),
    mastery: masteryBySlug(progress),
  };
}

function progressOfProblemSet(
  trackSlug: string,
  problemSet: ProblemSet,
  runFacts: RunFacts,
): ProblemSetProgress {
  const slugsThatMarkDone = problemSet.checkpoint
    ? slugsDoneInCheckpoint(runFacts.progress, `${trackSlug}/${problemSet.problemSetSlug}`)
    : runFacts.finishedSlugs;
  const marks = setItemMarks(problemSet, slugsThatMarkDone, runFacts.mastery);
  return {
    problemSet,
    setItemMarks: marks,
    doneCount: marks.filter((mark) => mark.done).length,
    totalCount: marks.length,
    masteryPercent: averagePercent(marks.map((mark) => mark.masteryPercent ?? 0)),
  };
}

/** The marks, counts and mastery of one problem set of track `trackSlug`. */
export function problemSetProgress(
  trackSlug: string,
  problemSet: ProblemSet,
  progress: LearnerProgress,
): ProblemSetProgress {
  return progressOfProblemSet(trackSlug, problemSet, runFactsOf(progress));
}

/** The progress of each problem set of the track, and of the track as a whole. */
export function trackProgress(track: CatalogueTrack, progress: LearnerProgress): TrackProgress {
  const runFacts = runFactsOf(progress);
  const problemSetProgresses = track.problemSets.map((problemSet) =>
    progressOfProblemSet(track.trackSlug, problemSet, runFacts),
  );
  const allMarks = problemSetProgresses.flatMap((entry) => entry.setItemMarks);
  return {
    track,
    problemSetProgresses,
    doneCount: allMarks.filter((mark) => mark.done).length,
    totalCount: allMarks.length,
    masteryPercent: averagePercent(allMarks.map((mark) => mark.masteryPercent ?? 0)),
  };
}

/** The first set item of the problem set that is not done; null when all are done. */
export function nextUpInProblemSet(
  trackSlug: string,
  problemSet: ProblemSet,
  progress: LearnerProgress,
): SetItem | null {
  const firstNotDone = problemSetProgress(trackSlug, problemSet, progress).setItemMarks.find(
    (mark) => !mark.done,
  );
  return firstNotDone?.setItem ?? null;
}

/** The first set item of the track, in order, that is not done; null when the track is done. */
export function nextUpInTrack(track: CatalogueTrack, progress: LearnerProgress): NextUp | null {
  for (const entry of trackProgress(track, progress).problemSetProgresses) {
    const firstNotDone = entry.setItemMarks.find((mark) => !mark.done);
    if (firstNotDone !== undefined) {
      return { problemSet: entry.problemSet, setItem: firstNotDone.setItem };
    }
  }
  return null;
}
