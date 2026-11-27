/** Loading a reaction version from the static site as a session reaction. */
import type { Catalogue } from "../../../core/catalogue/catalogueReading.js";
import { fetchSiteJson, loadReactionFile } from "../../siteData/siteData.js";
import { type SessionReaction, readSessionReaction } from "../../stepSession/sessionReaction.js";

export async function loadSessionReaction(
  catalogue: Catalogue,
  reactionVersionRef: string,
): Promise<SessionReaction> {
  return readSessionReaction(await loadReactionFile(fetchSiteJson, catalogue, reactionVersionRef));
}
