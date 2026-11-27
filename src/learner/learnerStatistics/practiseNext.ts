/**
 * The Progress page's "Practise next" card (decided 2026-11-26, replacing the reaction library
 * and the Tracks section): the learner's weakest reactions, so the page stays the same size
 * however large the catalogue grows.
 *
 * Rules
 *   which      reactions with a finished run that are not mastered (mastery below 100%) and are
 *              still in the catalogue
 *   order      lowest mastery first; then the one practised longest ago; then by slug
 *   how many   at most PRACTISE_NEXT_COUNT
 *   plays      the reaction's latest version
 */
import type { Catalogue } from "../../core/catalogue/catalogueReading.js";
import type { StepResult } from "../stepSession/stepSession.js";
import type { ReactionMastery } from "./reactionMastery.js";
import { reactionVersionRef } from "../../core/catalogue/reactionVersionRefs.js";

export const PRACTISE_NEXT_COUNT = 3;
const MASTERED_PERCENT = 100;

export interface PractiseNextEntry {
  readonly reactionSlug: string;
  readonly title: string;
  readonly masteryPercent: number;
  readonly lastStepResults: readonly StepResult[];
  /** The latest version, "<slug>@<version>". */
  readonly reactionVersionRef: string;
}

function compareText(first: string, second: string): number {
  if (first === second) {
    return 0;
  }
  return first < second ? -1 : 1;
}

export function practiseNext(
  mastery: ReadonlyMap<string, ReactionMastery>,
  catalogue: Catalogue,
): PractiseNextEntry[] {
  return [...mastery.values()]
    .filter((entry) => entry.masteryPercent < MASTERED_PERCENT)
    .sort(
      (one, other) =>
        one.masteryPercent - other.masteryPercent ||
        compareText(one.lastRun.startedAt, other.lastRun.startedAt) ||
        compareText(one.reactionSlug, other.reactionSlug),
    )
    .flatMap((entry) => {
      const catalogueEntry = catalogue.reactions.find(
        (candidate) => candidate.reactionSlug === entry.reactionSlug,
      );
      return catalogueEntry === undefined
        ? []
        : [
            {
              reactionSlug: entry.reactionSlug,
              title: catalogueEntry.title,
              masteryPercent: entry.masteryPercent,
              lastStepResults: entry.lastRun.stepResults,
              reactionVersionRef: reactionVersionRef(
                entry.reactionSlug,
                catalogueEntry.latestReactionVersion,
              ),
            },
          ];
    })
    .slice(0, PRACTISE_NEXT_COUNT);
}
