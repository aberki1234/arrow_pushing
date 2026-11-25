/**
 * Drafts and versions of reactions in Postgres, the source of truth from item 8c (docs/SPEC.md §5,
 * backend).
 *
 * Rules
 *   - A reaction has versions 1..n; at most one of them is unpublished (draft, submitted or
 *     changes_requested), and it is always the newest.
 *   - Saving a document with a new slug makes the reaction, owned by the saving user, with
 *     version 1 as a draft. Saving it again replaces that draft's document.
 *   - A reaction whose versions are all published is changed only through startNextVersion()
 *     ("Edit"): version n+1 starts as a copy of version n.
 *   - The database, not the editor, numbers the versions: the stored document's reactionVersion
 *     and previousReactionVersion are set to the row's (previousReactionVersion null for 1).
 *   - Only the reaction's owner saves or edits it.
 */
import { sql } from "kysely";
import type { ReactionDatabase, SubmissionStatus } from "./databaseTables.js";
import { ReactionDatabaseError } from "./reactionDatabaseErrors.js";

type ReactionDocument = Readonly<Record<string, unknown>>;

/** The only reaction file format so far (schema/reaction.schema.json, formatVersion). */
const CURRENT_FORMAT_VERSION = 1;

/** Which version a save or an edit wrote. */
export interface WrittenVersion {
  readonly reactionSlug: string;
  readonly reactionVersion: number;
  readonly submissionStatus: SubmissionStatus;
}

/** One reaction in the editor's list: its newest version. */
export interface ReactionListing {
  readonly reactionSlug: string;
  /** The newest version's title, or null if its document has none yet. */
  readonly title: string | null;
  readonly newestReactionVersion: number;
  readonly newestSubmissionStatus: SubmissionStatus;
  readonly publishedVersionCount: number;
  readonly updatedAt: Date;
}

/** One version as stored. */
export interface StoredVersion {
  readonly reactionSlug: string;
  readonly reactionVersion: number;
  readonly submissionStatus: SubmissionStatus;
  readonly reactionDocument: Record<string, unknown>;
  /** Set when published. */
  readonly contentHash: string | null;
  /** The lint findings of the last publish attempt, or null if none was made. */
  readonly latestLintReport: unknown;
  readonly publishedAt: Date | null;
}

/** A reaction's row and its newest version, as the rules above need them. */
export interface ReactionWithNewestVersion {
  readonly reactionId: string;
  readonly ownerUserId: string;
  readonly newestReactionVersion: number;
  readonly newestSubmissionStatus: SubmissionStatus;
  readonly newestReactionDocument: Record<string, unknown>;
  readonly newestAuthorUserId: string;
}

/** The document with the version numbers of row `reactionVersion`. */
function numberedDocument(
  reactionDocument: ReactionDocument,
  reactionVersion: number,
): Record<string, unknown> {
  return {
    ...reactionDocument,
    reactionVersion,
    previousReactionVersion: reactionVersion > 1 ? reactionVersion - 1 : null,
  };
}

function formatVersionOf(reactionDocument: ReactionDocument): number {
  const formatVersion = reactionDocument.formatVersion;
  return typeof formatVersion === "number" ? formatVersion : CURRENT_FORMAT_VERSION;
}

/** The reaction and its newest version, or undefined for an unknown slug. */
export async function findReaction(
  database: ReactionDatabase,
  reactionSlug: string,
): Promise<ReactionWithNewestVersion | undefined> {
  const newestRow = await database
    .selectFrom("arrowpush.reactions as reaction")
    .innerJoin("arrowpush.reactionVersions as version", "version.reactionId", "reaction.id")
    .select([
      "reaction.id as reactionId",
      "reaction.ownerUserId",
      "version.reactionVersion",
      "version.submissionStatus",
      "version.reactionDocument",
      "version.authorUserId",
    ])
    .where("reaction.reactionSlug", "=", reactionSlug)
    .orderBy("version.reactionVersion", "desc")
    .limit(1)
    .executeTakeFirst();
  if (newestRow === undefined) {
    return undefined;
  }
  return {
    reactionId: newestRow.reactionId,
    ownerUserId: newestRow.ownerUserId,
    newestReactionVersion: newestRow.reactionVersion,
    newestSubmissionStatus: newestRow.submissionStatus,
    newestReactionDocument: newestRow.reactionDocument,
    newestAuthorUserId: newestRow.authorUserId,
  };
}

/** The reaction, if `userId` owns it. Refusals: reaction-not-found, not-reaction-owner. */
async function ownedReaction(
  database: ReactionDatabase,
  reactionSlug: string,
  userId: string,
): Promise<ReactionWithNewestVersion> {
  const reaction = await findReaction(database, reactionSlug);
  if (reaction === undefined) {
    throw new ReactionDatabaseError("reaction-not-found", `no reaction "${reactionSlug}"`);
  }
  if (reaction.ownerUserId !== userId) {
    throw new ReactionDatabaseError(
      "not-reaction-owner",
      `reaction "${reactionSlug}" belongs to another user`,
    );
  }
  return reaction;
}

async function insertDraftVersion(
  database: ReactionDatabase,
  reactionId: string,
  reactionVersion: number,
  reactionDocument: ReactionDocument,
  authorUserId: string,
): Promise<void> {
  await database
    .insertInto("arrowpush.reactionVersions")
    .values({
      reactionId,
      reactionVersion,
      submissionStatus: "draft",
      reactionDocument: JSON.stringify(numberedDocument(reactionDocument, reactionVersion)),
      formatVersion: formatVersionOf(reactionDocument),
      authorUserId,
    })
    .execute();
}

async function createReaction(
  database: ReactionDatabase,
  reactionSlug: string,
  reactionDocument: ReactionDocument,
  authorUserId: string,
): Promise<WrittenVersion> {
  const reaction = await database
    .insertInto("arrowpush.reactions")
    .values({ reactionSlug, ownerUserId: authorUserId })
    .returning("id")
    .executeTakeFirstOrThrow();
  await insertDraftVersion(database, reaction.id, 1, reactionDocument, authorUserId);
  return { reactionSlug, reactionVersion: 1, submissionStatus: "draft" };
}

/**
 * Save `reactionDocument` as the draft of its reaction (by its reactionSlug). Refusals
 * (ReactionDatabaseError): document-has-no-slug, not-reaction-owner, no-unpublished-version (all
 * versions are published: use startNextVersion).
 */
export function saveDraft(
  database: ReactionDatabase,
  reactionDocument: ReactionDocument,
  authorUserId: string,
): Promise<WrittenVersion> {
  const reactionSlug = reactionDocument.reactionSlug;
  if (typeof reactionSlug !== "string" || reactionSlug === "") {
    return Promise.reject(
      new ReactionDatabaseError("document-has-no-slug", "the document has no reactionSlug"),
    );
  }
  return database.transaction().execute(async (transaction) => {
    if ((await findReaction(transaction, reactionSlug)) === undefined) {
      return createReaction(transaction, reactionSlug, reactionDocument, authorUserId);
    }
    const reaction = await ownedReaction(transaction, reactionSlug, authorUserId);
    if (reaction.newestSubmissionStatus === "published") {
      throw new ReactionDatabaseError(
        "no-unpublished-version",
        `every version of "${reactionSlug}" is published: start the next version with Edit`,
      );
    }
    await transaction
      .updateTable("arrowpush.reactionVersions")
      .set({
        reactionDocument: JSON.stringify(
          numberedDocument(reactionDocument, reaction.newestReactionVersion),
        ),
        formatVersion: formatVersionOf(reactionDocument),
        updatedAt: new Date(),
      })
      .where("reactionId", "=", reaction.reactionId)
      .where("reactionVersion", "=", reaction.newestReactionVersion)
      .execute();
    return {
      reactionSlug,
      reactionVersion: reaction.newestReactionVersion,
      submissionStatus: reaction.newestSubmissionStatus,
    };
  });
}

/**
 * "Edit" a published reaction: version n+1 as a draft, a copy of version n. Refusals:
 * reaction-not-found, not-reaction-owner, unpublished-version-exists.
 */
export function startNextVersion(
  database: ReactionDatabase,
  reactionSlug: string,
  authorUserId: string,
): Promise<WrittenVersion> {
  return database.transaction().execute(async (transaction) => {
    const reaction = await ownedReaction(transaction, reactionSlug, authorUserId);
    if (reaction.newestSubmissionStatus !== "published") {
      throw new ReactionDatabaseError(
        "unpublished-version-exists",
        `version ${String(reaction.newestReactionVersion)} of "${reactionSlug}" is not ` +
          "published yet: edit that one",
      );
    }
    const nextVersion = reaction.newestReactionVersion + 1;
    await insertDraftVersion(
      transaction,
      reaction.reactionId,
      nextVersion,
      reaction.newestReactionDocument,
      authorUserId,
    );
    return { reactionSlug, reactionVersion: nextVersion, submissionStatus: "draft" };
  });
}

/** Every reaction with its newest version, by slug. */
export async function listReactions(database: ReactionDatabase): Promise<ReactionListing[]> {
  const versionRows = await database
    .selectFrom("arrowpush.reactions as reaction")
    .innerJoin("arrowpush.reactionVersions as version", "version.reactionId", "reaction.id")
    .select([
      "reaction.reactionSlug",
      "version.reactionVersion",
      "version.submissionStatus",
      "version.updatedAt",
      sql<string | null>`version.reaction_document ->> 'title'`.as("title"),
    ])
    .orderBy("reaction.reactionSlug")
    .orderBy("version.reactionVersion")
    .execute();
  const slugToListing = new Map<string, ReactionListing>();
  for (const versionRow of versionRows) {
    const earlierListing = slugToListing.get(versionRow.reactionSlug);
    const publishedBefore = earlierListing?.publishedVersionCount ?? 0;
    slugToListing.set(versionRow.reactionSlug, {
      reactionSlug: versionRow.reactionSlug,
      title: versionRow.title,
      newestReactionVersion: versionRow.reactionVersion,
      newestSubmissionStatus: versionRow.submissionStatus,
      publishedVersionCount:
        publishedBefore + (versionRow.submissionStatus === "published" ? 1 : 0),
      updatedAt: versionRow.updatedAt,
    });
  }
  return [...slugToListing.values()];
}

/** One version, e.g. ("aldol-addition-base", 2). Refusal: version-not-found. */
export async function readReactionVersion(
  database: ReactionDatabase,
  reactionSlug: string,
  reactionVersion: number,
): Promise<StoredVersion> {
  const versionRow = await database
    .selectFrom("arrowpush.reactions as reaction")
    .innerJoin("arrowpush.reactionVersions as version", "version.reactionId", "reaction.id")
    .select([
      "reaction.reactionSlug",
      "version.reactionVersion",
      "version.submissionStatus",
      "version.reactionDocument",
      "version.contentHash",
      "version.latestLintReport",
      "version.publishedAt",
    ])
    .where("reaction.reactionSlug", "=", reactionSlug)
    .where("version.reactionVersion", "=", reactionVersion)
    .executeTakeFirst();
  if (versionRow === undefined) {
    throw new ReactionDatabaseError(
      "version-not-found",
      `no version ${String(reactionVersion)} of reaction "${reactionSlug}"`,
    );
  }
  return versionRow;
}
