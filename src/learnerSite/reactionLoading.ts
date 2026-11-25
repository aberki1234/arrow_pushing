/** Loading a reaction version from the static site as a session reaction. */
import type { Catalogue } from "../catalogue/catalogueReading.js";
import { fetchSiteJson, loadReactionDocument } from "../siteData/siteData.js";
import { type SessionReaction, readSessionReaction } from "../stepSession/sessionReaction.js";

export async function loadSessionReaction(
  catalogue: Catalogue,
  reactionVersionRef: string,
): Promise<SessionReaction> {
  return readSessionReaction(
    await loadReactionDocument(fetchSiteJson, catalogue, reactionVersionRef),
  );
}
