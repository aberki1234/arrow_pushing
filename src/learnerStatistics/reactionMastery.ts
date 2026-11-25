/**
 * Mastery (decided 2026-11-25, item 7c; it was open in SPEC §9): a reaction's mastery is the points
 * of its most recent finished run, in either mode, divided by that run's maximum (stepScoring.ts).
 * Runs are grouped by reaction slug, so a new version does not reset it. A reaction is mastered at
 * 100%. A reaction class's mastery is the average over every catalogue reaction of that class,
 * untried ones counting 0%.
 */
import type { Catalogue } from "../catalogue/catalogueReading.js";
import type { LearnerProgress, RunRecord } from "../learnerProgress/learnerProgress.js";
import { maximumPoints, totalPoints } from "../stepSession/stepScoring.js";

export const MASTERED_PERCENT = 100;
const PERCENT = 100;

export interface ReactionMastery {
  readonly reactionSlug: string;
  /** 0–100, rounded. */
  readonly masteryPercent: number;
  readonly lastRun: RunRecord;
  /** The version of the most recent run (an older one than the catalogue's shows "updated"). */
  readonly lastReactionVersion: number;
}

export interface ClassMastery {
  readonly reactionClass: string;
  readonly reactionCount: number;
  readonly masteryPercent: number;
}

/** The slug and version of a reaction version ref, "aldol@3" -> ["aldol", 3]. */
export function refParts(reactionVersionRef: string): [string, number] {
  const at = reactionVersionRef.lastIndexOf("@");
  return [reactionVersionRef.slice(0, at), Number(reactionVersionRef.slice(at + 1))];
}

function percentOf(points: number, maximum: number): number {
  return maximum === 0 ? 0 : Math.round((PERCENT * points) / maximum);
}

/** Mastery of each reaction the learner has finished at least once, by slug. */
export function masteryBySlug(progress: LearnerProgress): Map<string, ReactionMastery> {
  const slugToLastRun = new Map<string, RunRecord>();
  for (const run of progress.runs) {
    const [reactionSlug] = refParts(run.reactionVersionRef);
    const kept = slugToLastRun.get(reactionSlug);
    if (kept === undefined || run.startedAt > kept.startedAt) {
      slugToLastRun.set(reactionSlug, run);
    }
  }
  return new Map(
    [...slugToLastRun].map(([reactionSlug, lastRun]) => [
      reactionSlug,
      {
        reactionSlug,
        masteryPercent: percentOf(
          totalPoints(lastRun.stepResults),
          maximumPoints(lastRun.stepResults),
        ),
        lastRun,
        lastReactionVersion: refParts(lastRun.reactionVersionRef)[1],
      },
    ]),
  );
}

export function masteredCount(mastery: ReadonlyMap<string, ReactionMastery>): number {
  return [...mastery.values()].filter((entry) => entry.masteryPercent >= MASTERED_PERCENT).length;
}

/** One row per reaction class in the catalogue, in the catalogue's order of first appearance. */
export function masteryByClass(
  catalogue: Catalogue,
  mastery: ReadonlyMap<string, ReactionMastery>,
): ClassMastery[] {
  const classToPercents = new Map<string, number[]>();
  for (const entry of catalogue.reactions) {
    const percent = mastery.get(entry.reactionSlug)?.masteryPercent ?? 0;
    for (const reactionClass of entry.reactionClasses) {
      classToPercents.set(reactionClass, [...(classToPercents.get(reactionClass) ?? []), percent]);
    }
  }
  return [...classToPercents].map(([reactionClass, percents]) => ({
    reactionClass,
    reactionCount: percents.length,
    masteryPercent: Math.round(
      percents.reduce((sum, percent) => sum + percent, 0) / percents.length,
    ),
  }));
}
