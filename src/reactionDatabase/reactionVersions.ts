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
 *   - The author of the unpublished version saves it (docs/SPEC.md §6, "Contributors"); anyone
 *     may start the next version of a published reaction, and becomes an author of its document.
 *   - Saving a changed document over a submitted version takes it out of review (back to draft);
 *     saving the same document again (a late autosave) leaves it in review.
 *   - An author has at most MAXIMUM_OPEN_DRAFTS unpublished versions.
 *   - A blocked user saves and starts nothing.
 */
import { sql } from "kysely";
import type { ReactionDatabase, SubmissionStatus } from "./databaseTables.js";
import { ReactionDatabaseError } from "./reactionDatabaseErrors.js";
import { mayPerform } from "./sitePermissions.js";
import { requireSiteAction, siteRoleOf } from "./siteUsers.js";

type ReactionDocument = Readonly<Record<string, unknown>>;

/** The only reaction file format so far (schema/reaction.schema.json, formatVersion). */
const CURRENT_FORMAT_VERSION = 1;

/** Which version a save or an edit wrote. */
export interface WrittenVersion {
  readonly reactionSlug: string;
  readonly reactionVersion: number;
  readonly submissionStatus: SubmissionStatus;
}

/** The most unpublished versions (draft, submitted, changes requested) one author may have. */
export const MAXIMUM_OPEN_DRAFTS = 5;

/** One reaction in the editor's list: its newest version. */
export interface ReactionListing {
  readonly reactionSlug: string;
  readonly ownerUserId: string;
  readonly ownerName: string;
  readonly newestAuthorUserId: string;
  readonly newestAuthorName: string;
  /** The newest version's title, or null if its document has none yet. */
  readonly title: string | null;
  /** For the progress Create shows (reactionEditing/creationProgress.ts). */
  readonly newestReactionDocument: Record<string, unknown>;
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

/** The reaction. Refusal: reaction-not-found. */
async function existingReaction(
  database: ReactionDatabase,
  reactionSlug: string,
): Promise<ReactionWithNewestVersion> {
  const reaction = await findReaction(database, reactionSlug);
  if (reaction === undefined) {
    throw new ReactionDatabaseError("reaction-not-found", `no reaction "${reactionSlug}"`);
  }
  return reaction;
}

/** Refusal too-many-open-drafts when the author already has MAXIMUM_OPEN_DRAFTS open versions. */
async function requireRoomForOpenDraft(
  database: ReactionDatabase,
  authorUserId: string,
): Promise<void> {
  const openCount = await database
    .selectFrom("arrowpush.reactionVersions")
    .select(sql<number>`count(*)::int`.as("openCount"))
    .where("authorUserId", "=", authorUserId)
    .where("submissionStatus", "<>", "published")
    .executeTakeFirstOrThrow();
  if (openCount.openCount >= MAXIMUM_OPEN_DRAFTS) {
    throw new ReactionDatabaseError(
      "too-many-open-drafts",
      `at most ${String(MAXIMUM_OPEN_DRAFTS)} unpublished versions at once: ` +
        "submit or delete one first",
    );
  }
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
  await requireRoomForOpenDraft(database, authorUserId);
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
 * (ReactionDatabaseError): document-has-no-slug, not-allowed (blocked), too-many-open-drafts (a
 * new reaction), no-unpublished-version (all versions are published: use startNextVersion),
 * not-version-author.
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
  return database
    .transaction()
    .execute((transaction) => saveDraftIn(transaction, reactionDocument, authorUserId));
}

/** saveDraft() inside a transaction the caller holds; the document must have a reactionSlug. */
export async function saveDraftIn(
  transaction: ReactionDatabase,
  reactionDocument: ReactionDocument,
  authorUserId: string,
): Promise<WrittenVersion> {
  await requireSiteAction(transaction, authorUserId, "createReactions");
  const reactionSlug = String(reactionDocument.reactionSlug);
  const reaction = await findReaction(transaction, reactionSlug);
  if (reaction === undefined) {
    return createReaction(transaction, reactionSlug, reactionDocument, authorUserId);
  }
  return replaceDraft(transaction, reaction, reactionDocument, authorUserId);
}

/** saveDraft() on an existing reaction: its unpublished version, if `authorUserId` wrote it. */
async function replaceDraft(
  database: ReactionDatabase,
  reaction: ReactionWithNewestVersion,
  reactionDocument: ReactionDocument,
  authorUserId: string,
): Promise<WrittenVersion> {
  const reactionSlug = String(reactionDocument.reactionSlug);
  if (reaction.newestSubmissionStatus === "published") {
    throw new ReactionDatabaseError(
      "no-unpublished-version",
      `every version of "${reactionSlug}" is published: start the next version with Edit`,
    );
  }
  if (reaction.newestAuthorUserId !== authorUserId) {
    throw new ReactionDatabaseError(
      "not-version-author",
      `version ${String(reaction.newestReactionVersion)} of "${reactionSlug}" is another ` +
        "user's",
    );
  }
  const documentJson = JSON.stringify(
    numberedDocument(reactionDocument, reaction.newestReactionVersion),
  );
  const isChanged = !(await isStoredDocument(database, reaction, documentJson));
  const submissionStatus =
    reaction.newestSubmissionStatus === "submitted" && isChanged
      ? "draft"
      : reaction.newestSubmissionStatus;
  await database
    .updateTable("arrowpush.reactionVersions")
    .set({
      reactionDocument: documentJson,
      formatVersion: formatVersionOf(reactionDocument),
      submissionStatus,
      updatedAt: new Date(),
    })
    .where("reactionId", "=", reaction.reactionId)
    .where("reactionVersion", "=", reaction.newestReactionVersion)
    .execute();
  return { reactionSlug, reactionVersion: reaction.newestReactionVersion, submissionStatus };
}

/** Whether the newest version already holds this document (compared as JSONB, key order aside). */
async function isStoredDocument(
  database: ReactionDatabase,
  reaction: ReactionWithNewestVersion,
  documentJson: string,
): Promise<boolean> {
  const comparison = await database
    .selectFrom("arrowpush.reactionVersions")
    .select(sql<boolean>`reaction_document = ${documentJson}::jsonb`.as("isSame"))
    .where("reactionId", "=", reaction.reactionId)
    .where("reactionVersion", "=", reaction.newestReactionVersion)
    .executeTakeFirstOrThrow();
  return comparison.isSame;
}

/** The document's authors with the user added, unless they already wrote a version of it. */
async function authorsWith(
  database: ReactionDatabase,
  reaction: ReactionWithNewestVersion,
  authorUserId: string,
): Promise<unknown[]> {
  const authors = reaction.newestReactionDocument.authors;
  const authorList: unknown[] = Array.isArray(authors) ? [...(authors as unknown[])] : [];
  const earlierVersion = await database
    .selectFrom("arrowpush.reactionVersions")
    .select("reactionVersion")
    .where("reactionId", "=", reaction.reactionId)
    .where("authorUserId", "=", authorUserId)
    .executeTakeFirst();
  if (earlierVersion !== undefined || reaction.ownerUserId === authorUserId) {
    return authorList;
  }
  const author = await database
    .selectFrom("arrowpush.users")
    .select("name")
    .where("id", "=", authorUserId)
    .executeTakeFirstOrThrow();
  return [...authorList, { name: author.name, url: null }];
}

/**
 * "Edit" a published reaction: version n+1 as a draft, a copy of version n, by anyone (adding them
 * to the authors). Refusals: not-allowed (blocked), reaction-not-found,
 * unpublished-version-exists, too-many-open-drafts.
 */
export function startNextVersion(
  database: ReactionDatabase,
  reactionSlug: string,
  authorUserId: string,
): Promise<WrittenVersion> {
  return database.transaction().execute(async (transaction) => {
    await requireSiteAction(transaction, authorUserId, "createReactions");
    const reaction = await existingReaction(transaction, reactionSlug);
    if (reaction.newestSubmissionStatus !== "published") {
      throw new ReactionDatabaseError(
        "unpublished-version-exists",
        `version ${String(reaction.newestReactionVersion)} of "${reactionSlug}" is not ` +
          "published yet: edit that one",
      );
    }
    await requireRoomForOpenDraft(transaction, authorUserId);
    const nextVersion = reaction.newestReactionVersion + 1;
    const authors = await authorsWith(transaction, reaction, authorUserId);
    await insertDraftVersion(
      transaction,
      reaction.reactionId,
      nextVersion,
      { ...reaction.newestReactionDocument, authors },
      authorUserId,
    );
    return { reactionSlug, reactionVersion: nextVersion, submissionStatus: "draft" };
  });
}

type ListedFromNewest =
  | "newestAuthorUserId"
  | "newestAuthorName"
  | "newestReactionDocument"
  | "newestReactionVersion"
  | "newestSubmissionStatus"
  | "publishedVersionCount";

interface VersionRowFields {
  readonly authorUserId: string;
  readonly authorName: string;
  readonly reactionDocument: Record<string, unknown>;
  readonly reactionVersion: number;
  readonly submissionStatus: SubmissionStatus;
}

/** Which reactions a listing holds: every one, one owner's, or what one contributor sees. */
export interface ListingFilter {
  readonly ownerUserId?: string;
  /** Their own reactions, those with a version they wrote, and every published one. */
  readonly visibleToUserId?: string;
}

/** Every reaction (or those of the filter) with its newest version, by slug. */
export async function listReactions(
  database: ReactionDatabase,
  filter: ListingFilter = {},
): Promise<ReactionListing[]> {
  let query = database
    .selectFrom("arrowpush.reactions as reaction")
    .innerJoin("arrowpush.reactionVersions as version", "version.reactionId", "reaction.id")
    .innerJoin("arrowpush.users as owner", "owner.id", "reaction.ownerUserId")
    .innerJoin("arrowpush.users as author", "author.id", "version.authorUserId");
  if (filter.ownerUserId !== undefined) {
    query = query.where("reaction.ownerUserId", "=", filter.ownerUserId);
  }
  const { visibleToUserId } = filter;
  if (visibleToUserId !== undefined) {
    query = query.where(
      sql<boolean>`(reaction.owner_user_id = ${visibleToUserId} OR EXISTS (
        SELECT 1 FROM arrowpush.reaction_versions other WHERE other.reaction_id = reaction.id
          AND (other.submission_status = 'published'
            OR other.author_user_id = ${visibleToUserId})))`,
    );
  }
  const versionRows = await query
    .select([
      "reaction.reactionSlug",
      "reaction.ownerUserId",
      "owner.name as ownerName",
      "version.authorUserId",
      "author.name as authorName",
      "version.reactionDocument",
      "version.reactionVersion",
      "version.submissionStatus",
      "version.updatedAt",
      sql<string | null>`version.reaction_document ->> 'title'`.as("title"),
    ])
    .orderBy("reaction.reactionSlug")
    .orderBy("version.reactionVersion")
    .execute();
  return listingsFromRows(versionRows);
}

/** One listing per reaction from its version rows (in version order): the newest one's. */
function listingsFromRows(
  versionRows: readonly (Omit<ReactionListing, ListedFromNewest> & VersionRowFields)[],
): ReactionListing[] {
  const slugToListing = new Map<string, ReactionListing>();
  for (const versionRow of versionRows) {
    const earlierListing = slugToListing.get(versionRow.reactionSlug);
    const publishedBefore = earlierListing?.publishedVersionCount ?? 0;
    slugToListing.set(versionRow.reactionSlug, {
      reactionSlug: versionRow.reactionSlug,
      ownerUserId: versionRow.ownerUserId,
      ownerName: versionRow.ownerName,
      newestAuthorUserId: versionRow.authorUserId,
      newestAuthorName: versionRow.authorName,
      title: versionRow.title,
      newestReactionDocument: versionRow.reactionDocument,
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

/**
 * The listings `userId` sees: every reaction with seeEveryReaction, else their own, those with a
 * version they wrote, and every published one ("Improve a published one").
 */
export async function listReactionsFor(
  database: ReactionDatabase,
  userId: string,
): Promise<ReactionListing[]> {
  const siteRole = await siteRoleOf(database, userId);
  const seesEveryReaction = siteRole !== undefined && mayPerform(siteRole, "seeEveryReaction");
  return listReactions(database, seesEveryReaction ? {} : { visibleToUserId: userId });
}
