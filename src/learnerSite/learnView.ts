/**
 * Small pieces the Learn pages share (item 9b): the hashes of the Learn routes, a set item's mark
 * in words, and difficulty dots.
 */
import type { SetItemMark } from "../learnTracks/trackProgress.js";
import type { ProblemSet, SetItem } from "../trackFiles/trackSchemaViolations.js";
import { siteRouteHash } from "./siteRoutes.js";

const MAXIMUM_DIFFICULTY_TIER = 3;

/** "#/learn", "#/learn/<track>", "#/learn/<track>/<set>" or "#/learn/<track>/<set>/<reaction>". */
export function learnHash(
  trackSlug: string | null = null,
  problemSetSlug: string | null = null,
  reactionSlug: string | null = null,
): string {
  return siteRouteHash({ routeName: "learn", trackSlug, problemSetSlug, reactionSlug });
}

/**
 * Where a Next up link goes: the reaction played from its problem set, or for a checkpoint its
 * own page (its reactions are played there, names hidden).
 */
export function nextUpHash(trackSlug: string, problemSet: ProblemSet, setItem: SetItem): string {
  return problemSet.checkpoint
    ? learnHash(trackSlug, problemSet.problemSetSlug)
    : learnHash(trackSlug, problemSet.problemSetSlug, setItem.reactionSlug);
}

/** "Mastered", "Done · 67%" or "Not done yet". */
export function setItemMarkText(mark: SetItemMark): string {
  if (mark.mastered) {
    return "Mastered";
  }
  return mark.done ? `Done · ${String(mark.masteryPercent ?? 0)}%` : "Not done yet";
}

/** "●●○" for difficulty tier 2. */
export function difficultyDots(difficultyTier: number): string {
  return "●".repeat(difficultyTier) + "○".repeat(MAXIMUM_DIFFICULTY_TIER - difficultyTier);
}
