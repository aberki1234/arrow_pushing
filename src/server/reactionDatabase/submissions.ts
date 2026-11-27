/**
 * Contributors' submissions and their review (docs/SPEC.md §6, "Contributors").
 *
 * Rules
 *   - Submit: the author of a draft (or of a version with changes requested) sends it to review;
 *     the full linter must find no error (its report is saved either way) and the author agrees
 *     to the licence now or did before. Their note for the reviewer is stored with it.
 *   - The review queue: submitted versions, oldest submission first, leaving out blocked authors
 *     and the reviewer's own. A version is "resubmitted" once it has had a review, a
 *     "nextVersion" when it is not version 1, else a "newReaction".
 *   - A review (reviewers only, never of one's own submission) publishes the version (as
 *     publishing.ts does, with the author's licence agreement) or requests changes. Either way
 *     it is stored in reviews with its overall comment and pinned notes.
 *   - The author sees the newest review's notes while the version's changes are requested;
 *     submitting again clears them.
 */
import { sql, type Updateable } from "kysely";
import type { LintFinding } from "../../tooling/reactionLinting/lintFindings.js";
import type { PinnedNote, ReactionDatabase, ReactionVersionsTable } from "./databaseTables.js";
import {
  licenceAgreementDate,
  lintAndRecord,
  publishNewestVersion,
  type PublishedVersionSummary,
} from "./publishing.js";
import { ReactionDatabaseError } from "./reactionDatabaseErrors.js";
import {
  findReaction,
  type ReactionWithNewestVersion,
  readReactionVersion,
  type StoredVersion,
} from "./reactionVersions.js";
import { mayPerform } from "./sitePermissions.js";
import { requireSiteAction, siteRoleOf } from "./siteUsers.js";

type LintDocument = (reactionDocument: Readonly<Record<string, unknown>>) => LintFinding[];

export interface SubmitRequest {
  readonly reactionSlug: string;
  readonly authorUserId: string;
  readonly licenceAgreedNow: boolean;
  readonly submissionNote: string;
  readonly lintDocument: LintDocument;
}

export type QueueKind = "newReaction" | "nextVersion" | "resubmitted";

export interface QueuedSubmission {
  readonly reactionSlug: string;
  readonly reactionVersion: number;
  readonly title: string | null;
  readonly authorName: string;
  readonly ownerName: string;
  readonly submittedAt: Date;
  readonly submissionNote: string | null;
  readonly queueKind: QueueKind;
}

export interface ReviewRequest {
  readonly reactionSlug: string;
  readonly reviewerUserId: string;
  readonly reviewDecision: "publish" | "changes_requested";
  readonly comment: string;
  readonly pinnedNotes: readonly PinnedNote[];
  readonly lintDocument: LintDocument;
}

export interface ReviewNotes {
  readonly reviewerName: string;
  readonly comment: string | null;
  readonly pinnedNotes: readonly PinnedNote[];
  readonly reviewedAt: Date;
}

export interface ReviewMaterial {
  readonly submitted: StoredVersion;
  readonly previousPublished: StoredVersion | null;
  readonly authorName: string;
  readonly submissionNote: string | null;
}

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

/** Set columns of the reaction's newest version. */
async function updateNewestVersion(
  database: ReactionDatabase,
  reaction: ReactionWithNewestVersion,
  columns: Updateable<ReactionVersionsTable>,
): Promise<void> {
  await database
    .updateTable("arrowpush.reactionVersions")
    .set(columns)
    .where("reactionId", "=", reaction.reactionId)
    .where("reactionVersion", "=", reaction.newestReactionVersion)
    .execute();
}

/** The version to submit, if `authorUserId` may submit it. Throws the refusals. */
async function versionToSubmit(
  database: ReactionDatabase,
  request: SubmitRequest,
): Promise<ReactionWithNewestVersion> {
  await requireSiteAction(database, request.authorUserId, "submitForReview");
  const reaction = await existingReaction(database, request.reactionSlug);
  const status = reaction.newestSubmissionStatus;
  if (status !== "draft" && status !== "changes_requested") {
    throw new ReactionDatabaseError(
      "not-submittable",
      `version ${String(reaction.newestReactionVersion)} of "${request.reactionSlug}" is ${status}`,
    );
  }
  if (reaction.newestAuthorUserId !== request.authorUserId) {
    throw new ReactionDatabaseError(
      "not-version-author",
      `version ${String(reaction.newestReactionVersion)} of "${request.reactionSlug}" is another ` +
        "user's",
    );
  }
  return reaction;
}

async function submitInTransaction(
  database: ReactionDatabase,
  request: SubmitRequest,
): Promise<ReactionDatabaseError | undefined> {
  const reaction = await versionToSubmit(database, request);
  const { lintRefusal } = await lintAndRecord(database, reaction, request.lintDocument);
  if (lintRefusal !== undefined) {
    return lintRefusal;
  }
  const licenceAgreedAt = await licenceAgreementDate(
    database,
    request.authorUserId,
    request.licenceAgreedNow,
  );
  if (licenceAgreedAt === undefined) {
    return new ReactionDatabaseError(
      "licence-not-agreed",
      "agree to publish under CC BY-SA 4.0 first",
    );
  }
  const submissionNote = request.submissionNote.trim();
  await updateNewestVersion(database, reaction, {
    submissionStatus: "submitted",
    submittedAt: new Date(),
    licenceAgreedAt,
    submissionNote: submissionNote === "" ? null : submissionNote,
  });
  return undefined;
}

/**
 * Submit for review. Refusals: not-allowed (blocked), reaction-not-found, not-submittable
 * (submitted or published), not-version-author, draft-has-lint-errors, licence-not-agreed.
 */
export async function submitForReview(
  database: ReactionDatabase,
  request: SubmitRequest,
): Promise<void> {
  const refusal = await database
    .transaction()
    .execute((transaction) => submitInTransaction(transaction, request));
  if (refusal !== undefined) {
    throw refusal;
  }
}

/** The submitted versions a reviewer may review, oldest first. Refusal: not-allowed. */
export async function reviewQueue(
  database: ReactionDatabase,
  reviewerUserId: string,
): Promise<QueuedSubmission[]> {
  await requireSiteAction(database, reviewerUserId, "review");
  const queueRows = await database
    .selectFrom("arrowpush.reactionVersions as version")
    .innerJoin("arrowpush.reactions as reaction", "reaction.id", "version.reactionId")
    .innerJoin("arrowpush.users as author", "author.id", "version.authorUserId")
    .innerJoin("arrowpush.users as owner", "owner.id", "reaction.ownerUserId")
    .select([
      "reaction.reactionSlug",
      "version.reactionVersion",
      "version.reactionDocument",
      "author.name as authorName",
      "owner.name as ownerName",
      "version.submittedAt",
      "version.submissionNote",
      sql<boolean>`EXISTS (SELECT 1 FROM arrowpush.reviews review
        WHERE review.reaction_id = version.reaction_id
          AND review.reaction_version = version.reaction_version)`.as("wasReviewed"),
    ])
    .where("version.submissionStatus", "=", "submitted")
    .where("author.siteRole", "<>", "blocked")
    .where("version.authorUserId", "<>", reviewerUserId)
    .orderBy("version.submittedAt")
    .execute();
  return queueRows.map((queueRow) => {
    const title = queueRow.reactionDocument.title;
    const queueKind: QueueKind = queueRow.wasReviewed
      ? "resubmitted"
      : queueRow.reactionVersion > 1
        ? "nextVersion"
        : "newReaction";
    return {
      reactionSlug: queueRow.reactionSlug,
      reactionVersion: queueRow.reactionVersion,
      title: typeof title === "string" ? title : null,
      authorName: queueRow.authorName,
      ownerName: queueRow.ownerName,
      submittedAt: queueRow.submittedAt ?? new Date(0),
      submissionNote: queueRow.submissionNote,
      queueKind,
    };
  });
}

/** The submitted version a reviewer may review. Throws the refusals. */
async function versionToReview(
  database: ReactionDatabase,
  reactionSlug: string,
  reviewerUserId: string,
): Promise<ReactionWithNewestVersion> {
  await requireSiteAction(database, reviewerUserId, "review");
  const reaction = await existingReaction(database, reactionSlug);
  if (reaction.newestSubmissionStatus !== "submitted") {
    throw new ReactionDatabaseError(
      "not-submitted",
      `version ${String(reaction.newestReactionVersion)} of "${reactionSlug}" is not in review`,
    );
  }
  if (reaction.newestAuthorUserId === reviewerUserId) {
    throw new ReactionDatabaseError("own-submission", "someone else reviews your submission");
  }
  return reaction;
}

async function reviewInTransaction(
  database: ReactionDatabase,
  request: ReviewRequest,
): Promise<PublishedVersionSummary | ReactionDatabaseError | null> {
  const reaction = await versionToReview(database, request.reactionSlug, request.reviewerUserId);
  let outcome: PublishedVersionSummary | ReactionDatabaseError | null = null;
  if (request.reviewDecision === "publish") {
    outcome = await publishNewestVersion(database, reaction, {
      licenceAgreedNow: false,
      lintDocument: request.lintDocument,
    });
    if (outcome instanceof ReactionDatabaseError) {
      return outcome;
    }
  } else {
    await updateNewestVersion(database, reaction, { submissionStatus: "changes_requested" });
  }
  const comment = request.comment.trim();
  await database
    .insertInto("arrowpush.reviews")
    .values({
      reactionId: reaction.reactionId,
      reactionVersion: reaction.newestReactionVersion,
      reviewerUserId: request.reviewerUserId,
      reviewDecision: request.reviewDecision,
      comment: comment === "" ? null : comment,
      pinnedNotes: JSON.stringify(request.pinnedNotes),
    })
    .execute();
  return outcome;
}

/**
 * Review a submission: publish it (answering the publish summary) or request changes (null).
 * Refusals: not-allowed, reaction-not-found, not-submitted, own-submission, and publishing's
 * draft-has-lint-errors and licence-not-agreed.
 */
export async function reviewSubmission(
  database: ReactionDatabase,
  request: ReviewRequest,
): Promise<PublishedVersionSummary | null> {
  const outcome = await database
    .transaction()
    .execute((transaction) => reviewInTransaction(transaction, request));
  if (outcome instanceof ReactionDatabaseError) {
    throw outcome;
  }
  return outcome;
}

/**
 * The reviewer's notes on the reaction's newest version while its changes are requested, else
 * null. For its author and reviewers; refusals: reaction-not-found, not-allowed.
 */
export async function reviewNotesFor(
  database: ReactionDatabase,
  reactionSlug: string,
  userId: string,
): Promise<ReviewNotes | null> {
  const reaction = await existingReaction(database, reactionSlug);
  const siteRole = await siteRoleOf(database, userId);
  const mayRead =
    reaction.newestAuthorUserId === userId ||
    (siteRole !== undefined && mayPerform(siteRole, "review"));
  if (!mayRead) {
    throw new ReactionDatabaseError("not-allowed", "these notes are for the version's author");
  }
  if (reaction.newestSubmissionStatus !== "changes_requested") {
    return null;
  }
  const reviewRow = await database
    .selectFrom("arrowpush.reviews as review")
    .innerJoin("arrowpush.users as reviewer", "reviewer.id", "review.reviewerUserId")
    .select([
      "reviewer.name as reviewerName",
      "review.comment",
      "review.pinnedNotes",
      "review.createdAt as reviewedAt",
    ])
    .where("review.reactionId", "=", reaction.reactionId)
    .where("review.reactionVersion", "=", reaction.newestReactionVersion)
    .orderBy("review.createdAt", "desc")
    .limit(1)
    .executeTakeFirst();
  return reviewRow ?? null;
}

/**
 * What a reviewer compares: the submitted version, the newest published version before it (null
 * for a new reaction), its author and note. Refusals as versionToReview's.
 */
export async function reviewMaterial(
  database: ReactionDatabase,
  reactionSlug: string,
  reviewerUserId: string,
): Promise<ReviewMaterial> {
  const reaction = await versionToReview(database, reactionSlug, reviewerUserId);
  const submittedVersion = reaction.newestReactionVersion;
  const versionRow = await database
    .selectFrom("arrowpush.reactionVersions as version")
    .innerJoin("arrowpush.users as author", "author.id", "version.authorUserId")
    .select(["author.name as authorName", "version.submissionNote"])
    .where("version.reactionId", "=", reaction.reactionId)
    .where("version.reactionVersion", "=", submittedVersion)
    .executeTakeFirstOrThrow();
  const previousRow = await database
    .selectFrom("arrowpush.reactionVersions")
    .select("reactionVersion")
    .where("reactionId", "=", reaction.reactionId)
    .where("reactionVersion", "<", submittedVersion)
    .where("submissionStatus", "=", "published")
    .orderBy("reactionVersion", "desc")
    .limit(1)
    .executeTakeFirst();
  return {
    submitted: await readReactionVersion(database, reactionSlug, submittedVersion),
    previousPublished:
      previousRow === undefined
        ? null
        : await readReactionVersion(database, reactionSlug, previousRow.reactionVersion),
    authorName: versionRow.authorName,
    submissionNote: versionRow.submissionNote,
  };
}
