/** What a learner run uses on the real site: browser storage, the static site and the clock. */
import type { Catalogue } from "../../../core/catalogue/catalogueReading.js";
import type { RunDependencies } from "../model/learnerRun.js";
import { browserStorage } from "./browserStorage.js";
import { loadSessionReaction } from "./reactionLoading.js";

export function runDependencies(catalogue: Catalogue): RunDependencies {
  return {
    catalogue,
    storage: browserStorage,
    loadReaction: (reactionVersionRef) => loadSessionReaction(catalogue, reactionVersionRef),
    now: () => new Date(),
  };
}
