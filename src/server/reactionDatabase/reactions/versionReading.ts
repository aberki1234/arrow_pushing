/**
 * Who may read which stored version of a reaction (docs/SPEC.md §6, "Contributors").
 *
 * Rules
 *   - A published version is public (it is on the learner site anyway).
 *   - An unpublished version (draft, submitted, changes requested) is read only by its author, the
 *     reaction's owner, and a user whose site role may "seeEveryReaction" (a reviewer, the site's
 *     owner).
 *   - Anyone else is refused as if the version did not exist (version-not-found), so a draft's
 *     existence is not given away either.
 *   - "The newest version" is the newest one the user may read: someone else's open draft of a
 *     published reaction leaves them its newest published version; a reaction with nothing they
 *     may read is not found (reaction-not-found).
 */
import type { ReactionDatabase, SubmissionStatus } from "../model/databaseTables.js";
import { ReactionDatabaseError } from "../model/reactionDatabaseErrors.js";
import { mayPerform } from "../model/sitePermissions.js";
import { siteRoleOf } from "../users/siteUsers.js";
import { readReactionVersion, type StoredVersion } from "./reactionVersions.js";

/** What deciding whether a version may be read needs of it. */
interface VersionReaders {
  readonly reactionVersion: number;
  readonly submissionStatus: SubmissionStatus;
  readonly authorUserId: string;
  readonly ownerUserId: string;
}

/** The reaction's versions, newest first (none for an unknown slug). */
function versionReadersOf(
  database: ReactionDatabase,
  reactionSlug: string,
): Promise<VersionReaders[]> {
  return database
    .selectFrom("arrowpush.reactions as reaction")
    .innerJoin("arrowpush.reactionVersions as version", "version.reactionId", "reaction.id")
    .select([
      "version.reactionVersion",
      "version.submissionStatus",
      "version.authorUserId",
      "reaction.ownerUserId",
    ])
    .where("reaction.reactionSlug", "=", reactionSlug)
    .orderBy("version.reactionVersion", "desc")
    .execute();
}

async function seesEveryReaction(database: ReactionDatabase, userId: string): Promise<boolean> {
  const siteRole = await siteRoleOf(database, userId);
  return siteRole !== undefined && mayPerform(siteRole, "seeEveryReaction");
}

function mayRead(version: VersionReaders, userId: string): boolean {
  return (
    version.submissionStatus === "published" ||
    version.authorUserId === userId ||
    version.ownerUserId === userId
  );
}

/** The versions `userId` may read, newest first. */
async function readableVersionsOf(
  database: ReactionDatabase,
  userId: string,
  reactionSlug: string,
): Promise<VersionReaders[]> {
  const versions = await versionReadersOf(database, reactionSlug);
  if (await seesEveryReaction(database, userId)) {
    return versions;
  }
  return versions.filter((version) => mayRead(version, userId));
}

/** One version, if `userId` may read it. Refusal: version-not-found. */
export async function readReactionVersionFor(
  database: ReactionDatabase,
  userId: string,
  reactionSlug: string,
  reactionVersion: number,
): Promise<StoredVersion> {
  const readableVersions = await readableVersionsOf(database, userId, reactionSlug);
  if (!readableVersions.some((version) => version.reactionVersion === reactionVersion)) {
    throw new ReactionDatabaseError(
      "version-not-found",
      `no version ${String(reactionVersion)} of reaction "${reactionSlug}"`,
    );
  }
  return readReactionVersion(database, reactionSlug, reactionVersion);
}

/** The newest version `userId` may read. Refusal: reaction-not-found. */
export async function readNewestReactionVersionFor(
  database: ReactionDatabase,
  userId: string,
  reactionSlug: string,
): Promise<StoredVersion> {
  const [newestReadable] = await readableVersionsOf(database, userId, reactionSlug);
  if (newestReadable === undefined) {
    throw new ReactionDatabaseError("reaction-not-found", `no reaction "${reactionSlug}"`);
  }
  return readReactionVersion(database, reactionSlug, newestReadable.reactionVersion);
}
