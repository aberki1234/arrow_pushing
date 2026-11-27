/**
 * Every published version, for the deploy workflow: it writes them to content/published/ as the
 * repository's backup and builds the learner site from them (docs/SPEC.md §5, backend).
 */
import type { ReactionDatabase } from "../model/databaseTables.js";

export interface ExportedVersion {
  readonly reactionSlug: string;
  readonly reactionVersion: number;
  readonly contentHash: string;
  readonly reactionDocument: Record<string, unknown>;
}

/** The published versions, by slug, then version. Drafts are never included. */
export async function publishedVersionsForExport(
  database: ReactionDatabase,
): Promise<ExportedVersion[]> {
  const publishedRows = await database
    .selectFrom("arrowpush.reactions as reaction")
    .innerJoin("arrowpush.reactionVersions as version", "version.reactionId", "reaction.id")
    .select([
      "reaction.reactionSlug",
      "version.reactionVersion",
      "version.contentHash",
      "version.reactionDocument",
    ])
    .where("version.submissionStatus", "=", "published")
    .orderBy("reaction.reactionSlug")
    .orderBy("version.reactionVersion")
    .execute();
  return publishedRows.map((publishedRow) => {
    if (publishedRow.contentHash === null) {
      throw new Error(
        `published version ${publishedRow.reactionSlug}@${String(publishedRow.reactionVersion)} ` +
          "has no content hash",
      );
    }
    return { ...publishedRow, contentHash: publishedRow.contentHash };
  });
}
