/**
 * The authored misconception messages for the reactions named in the learner's feedback history,
 * loaded from each reaction's latest version. A reaction that cannot be loaded is left out; its
 * misconceptions are then shown by their ids.
 */
import type { Catalogue } from "../../../core/catalogue/catalogueReading.js";
import {
  type MisconceptionInfo,
  misconceptionInfoOf,
} from "../../learnerStatistics/recurringFeedback.js";
import { loadSessionReaction } from "./reactionLoading.js";
import { reactionVersionRef } from "../../../core/catalogue/reactionVersionRefs.js";

export async function loadMisconceptionInfo(
  catalogue: Catalogue,
  reactionSlugs: readonly string[],
): Promise<Map<string, ReadonlyMap<string, MisconceptionInfo>>> {
  const loaded = await Promise.all(
    reactionSlugs.map(async (reactionSlug) => {
      const entry = catalogue.reactions.find(
        (candidate) => candidate.reactionSlug === reactionSlug,
      );
      if (entry === undefined) {
        return null;
      }
      try {
        const ref = reactionVersionRef(reactionSlug, entry.latestReactionVersion);
        return [
          reactionSlug,
          misconceptionInfoOf(await loadSessionReaction(catalogue, ref)),
        ] as const;
      } catch {
        return null;
      }
    }),
  );
  return new Map(loaded.filter((pair) => pair !== null));
}
