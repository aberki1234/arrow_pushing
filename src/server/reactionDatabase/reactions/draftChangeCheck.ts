/**
 * Saving a draft only if it is still the one the client last saw (docs/SPEC.md §6, "Drafting with
 * an assistant"; build item 10c), so that a push from the draft-sync command line never silently
 * overwrites an edit made in Create.
 *
 * Terms
 *   draft content hash  contentHashOf (canonical JSON, SHA-256) of the stored newest version's
 *                       document, as the server numbers it.
 * Rules
 *   - Expected `null` ("no draft open"): there must be no reaction with this slug yet, or every
 *     version of it is published and the document builds on the newest (its
 *     previousReactionVersion is that version): then version n+1 is started (startNextVersion,
 *     "Edit") and the document saved into it, so a push can propose a new version (owner,
 *     2026-11-26). It is still only a draft: publishing stays the reviewer's.
 *   - Expected a hash: the reaction's newest version must hold a document with that hash. (A
 *     published newest version is refused by saveDraft as before, no-unpublished-version.)
 *   - Expected `undefined`: no check (Create's own saves).
 *   Otherwise draft-changed, and nothing is saved. Check and save share one transaction.
 */
import { contentHashOf } from "../../../tooling/catalogueBuilding/staticFileNaming.js";
import type { ReactionDatabase } from "../model/databaseTables.js";
import { ReactionDatabaseError } from "../model/reactionDatabaseErrors.js";
import {
  findReaction,
  readReactionVersion,
  saveDraftIn,
  startNextVersionIn,
  type WrittenVersion,
} from "./reactionVersions.js";

export interface WrittenDraft extends WrittenVersion {
  readonly draftContentHash: string;
}

async function newestDocumentHash(
  transaction: ReactionDatabase,
  reactionSlug: string,
): Promise<string | null> {
  const reaction = await findReaction(transaction, reactionSlug);
  if (reaction === undefined) {
    return null;
  }
  const newest = await readReactionVersion(
    transaction,
    reactionSlug,
    reaction.newestReactionVersion,
  );
  return contentHashOf(newest.reactionDocument);
}

/** Every version of the reaction is published and the document names the newest as its base. */
async function buildsOnPublished(
  transaction: ReactionDatabase,
  reactionDocument: Record<string, unknown>,
): Promise<boolean> {
  const reaction = await findReaction(transaction, String(reactionDocument.reactionSlug));
  return (
    reaction !== undefined &&
    reaction.newestSubmissionStatus === "published" &&
    reactionDocument.previousReactionVersion === reaction.newestReactionVersion
  );
}

export function saveDraftIfUnchanged(
  database: ReactionDatabase,
  reactionDocument: Record<string, unknown>,
  authorUserId: string,
  expectedDraftHash: string | null | undefined,
): Promise<WrittenDraft> {
  const reactionSlug = reactionDocument.reactionSlug;
  if (typeof reactionSlug !== "string" || reactionSlug === "") {
    return Promise.reject(
      new ReactionDatabaseError("document-has-no-slug", "the document has no reactionSlug"),
    );
  }
  return database.transaction().execute(async (transaction) => {
    if (expectedDraftHash === null && (await buildsOnPublished(transaction, reactionDocument))) {
      await startNextVersionIn(transaction, reactionSlug, authorUserId);
    } else if (expectedDraftHash !== undefined) {
      const storedHash = await newestDocumentHash(transaction, reactionSlug);
      if (storedHash !== expectedDraftHash) {
        throw new ReactionDatabaseError(
          "draft-changed",
          `the draft of "${reactionSlug}" changed since it was last read: pull it first`,
        );
      }
    }
    const written = await saveDraftIn(transaction, reactionDocument, authorUserId);
    const draftContentHash = (await newestDocumentHash(transaction, reactionSlug)) ?? "";
    return { ...written, draftContentHash };
  });
}
