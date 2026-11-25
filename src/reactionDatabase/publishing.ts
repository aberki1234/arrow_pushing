/**
 * Publish a reaction's draft (docs/SPEC.md §5, backend, "Publishing").
 *
 * Steps, all in one transaction
 *   1. Find the reaction's unpublished version and check the publisher is an owner or reviewer.
 *   2. Lint the document; save the findings as the version's latest lint report. Any lint error
 *      refuses the publish (the report stays saved, so the editor can show it).
 *   3. The licence (CC BY-SA 4.0) is agreed once per author: the version records today's date
 *      when the publisher agrees now, else the date of the author's earliest agreement; with
 *      neither, the publish is refused.
 *   4. submitted, then published: the status, submitted_at, published_at and the content hash of
 *      the document (catalogueBuilding/staticFileNaming.contentHashOf, as the static build names
 *      its files).
 * A refusal after step 2 is returned from the transaction, not thrown in it, so that the saved
 * lint report is committed; publishDraft() throws it afterwards.
 */
import { contentHashOf } from "../catalogueBuilding/staticFileNaming.js";
import type { LintFinding } from "../reactionLinting/lintFindings.js";
import type { ReactionDatabase } from "./databaseTables.js";
import { ReactionDatabaseError } from "./reactionDatabaseErrors.js";
import { findReaction, type ReactionWithNewestVersion } from "./reactionVersions.js";

export interface PublishRequest {
  readonly reactionSlug: string;
  readonly publisherUserId: string;
  /** The publisher ticked the licence agreement for this publish. */
  readonly licenceAgreedNow: boolean;
  /** The full linter (reactionLinting/reactionLint.lintReaction with RDKit.js loaded). */
  readonly lintDocument: (reactionDocument: Readonly<Record<string, unknown>>) => LintFinding[];
}

export interface PublishedVersionSummary {
  readonly reactionSlug: string;
  readonly reactionVersion: number;
  readonly contentHash: string;
  /** Warnings do not block publishing; they are shown to the publisher. */
  readonly lintWarnings: LintFinding[];
}

/** Step 1: the unpublished version, if the publisher may publish it. Throws the refusals. */
async function draftToPublish(
  database: ReactionDatabase,
  publishRequest: PublishRequest,
): Promise<ReactionWithNewestVersion> {
  const { reactionSlug } = publishRequest;
  const reaction = await findReaction(database, reactionSlug);
  if (reaction === undefined) {
    throw new ReactionDatabaseError("reaction-not-found", `no reaction "${reactionSlug}"`);
  }
  if (reaction.newestSubmissionStatus === "published") {
    throw new ReactionDatabaseError(
      "no-unpublished-version",
      `every version of "${reactionSlug}" is already published`,
    );
  }
  const publisher = await database
    .selectFrom("arrowpush.users")
    .select("siteRole")
    .where("id", "=", publishRequest.publisherUserId)
    .executeTakeFirst();
  if (publisher?.siteRole !== "owner" && publisher?.siteRole !== "reviewer") {
    throw new ReactionDatabaseError(
      "not-allowed-to-publish",
      "only the owner or a reviewer publishes",
    );
  }
  return reaction;
}

/** Step 3: when the author's licence agreement is dated, or undefined if they never agreed. */
async function licenceAgreementDate(
  database: ReactionDatabase,
  authorUserId: string,
  licenceAgreedNow: boolean,
): Promise<Date | undefined> {
  if (licenceAgreedNow) {
    return new Date();
  }
  const earliestAgreement = await database
    .selectFrom("arrowpush.reactionVersions")
    .select("licenceAgreedAt")
    .where("authorUserId", "=", authorUserId)
    .where("licenceAgreedAt", "is not", null)
    .orderBy("licenceAgreedAt")
    .limit(1)
    .executeTakeFirst();
  return earliestAgreement?.licenceAgreedAt ?? undefined;
}

async function publishInTransaction(
  database: ReactionDatabase,
  publishRequest: PublishRequest,
): Promise<PublishedVersionSummary | ReactionDatabaseError> {
  const reaction = await draftToPublish(database, publishRequest);
  const versionRow = database
    .updateTable("arrowpush.reactionVersions")
    .where("reactionId", "=", reaction.reactionId)
    .where("reactionVersion", "=", reaction.newestReactionVersion);
  const lintFindings = publishRequest.lintDocument(reaction.newestReactionDocument);
  await versionRow.set({ latestLintReport: JSON.stringify(lintFindings) }).execute();
  if (lintFindings.some((finding) => finding.lintLevel === "error")) {
    return new ReactionDatabaseError(
      "draft-has-lint-errors",
      `"${publishRequest.reactionSlug}" has lint errors`,
      lintFindings,
    );
  }
  const licenceAgreedAt = await licenceAgreementDate(
    database,
    reaction.newestAuthorUserId,
    publishRequest.licenceAgreedNow,
  );
  if (licenceAgreedAt === undefined) {
    return new ReactionDatabaseError(
      "licence-not-agreed",
      "agree to publish under CC BY-SA 4.0 first",
    );
  }
  const submittedAt = new Date();
  await versionRow.set({ submissionStatus: "submitted", submittedAt, licenceAgreedAt }).execute();
  const contentHash = contentHashOf(reaction.newestReactionDocument);
  await versionRow
    .set({ submissionStatus: "published", contentHash, publishedAt: new Date() })
    .execute();
  return {
    reactionSlug: publishRequest.reactionSlug,
    reactionVersion: reaction.newestReactionVersion,
    contentHash,
    lintWarnings: lintFindings.filter((finding) => finding.lintLevel === "warning"),
  };
}

/**
 * Publish the reaction's unpublished version. Refusals (ReactionDatabaseError):
 * reaction-not-found, no-unpublished-version, not-allowed-to-publish, draft-has-lint-errors (with
 * the findings), licence-not-agreed.
 */
export async function publishDraft(
  database: ReactionDatabase,
  publishRequest: PublishRequest,
): Promise<PublishedVersionSummary> {
  const publishOutcome = await database
    .transaction()
    .execute((transaction) => publishInTransaction(transaction, publishRequest));
  if (publishOutcome instanceof ReactionDatabaseError) {
    throw publishOutcome;
  }
  return publishOutcome;
}
