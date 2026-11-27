/**
 * Publish a reaction's draft (docs/SPEC.md §5, backend, "Publishing").
 *
 * Steps, all in one transaction
 *   1. Find the reaction's unpublished version and check the publisher is the owner (the only
 *      role that publishes directly) and its author: anything else is published through review
 *      (submissions.ts).
 *   2. Lint the document; save the findings as the version's latest lint report. Any lint error
 *      refuses the publish (the report stays saved, so the editor can show it).
 *   3. The licence (CC BY-SA 4.0) is agreed once per author: the version records today's date
 *      when the publisher agrees now, else the date of the author's earliest agreement; with
 *      neither, the publish is refused.
 *   4. submitted (unless it already is), then published: the status, submitted_at, published_at
 *      and the content hash of
 *      the document (catalogueBuilding/staticFileNaming.contentHashOf, as the static build names
 *      its files).
 * A refusal after step 2 is returned from the transaction, not thrown in it, so that the saved
 * lint report is committed; publishDraft() throws it afterwards.
 */
import { contentHashOf } from "../../../tooling/catalogueBuilding/staticFileNaming.js";
import type { LintFinding } from "../../../tooling/reactionLinting/findings/lintFindings.js";
import type { ReactionDatabase } from "../model/databaseTables.js";
import { ReactionDatabaseError } from "../model/reactionDatabaseErrors.js";
import { findReaction, type ReactionWithNewestVersion } from "./reactionVersions.js";
import { mayPerform } from "../model/sitePermissions.js";

export interface PublishRequest {
  readonly reactionSlug: string;
  readonly publisherUserId: string;
  /** The publisher ticked the licence agreement for this publish. */
  readonly licenceAgreedNow: boolean;
  /** The full linter (reactionLinting/rules/reactionLint.lintReaction with RDKit.js loaded). */
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
  if (publisher === undefined || !mayPerform(publisher.siteRole, "publish")) {
    throw new ReactionDatabaseError(
      "not-allowed-to-publish",
      "only the owner publishes directly: submit it for review",
    );
  }
  if (reaction.newestAuthorUserId !== publishRequest.publisherUserId) {
    throw new ReactionDatabaseError(
      "not-version-author",
      `version ${String(reaction.newestReactionVersion)} of "${reactionSlug}" is another ` +
        "user's: it is published through review",
    );
  }
  return reaction;
}

/** Step 3: when the author's licence agreement is dated, or undefined if they never agreed. */
export async function licenceAgreementDate(
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

/** What steps 2 to 4 need, whoever decided to publish (publishDraft or a review). */
export interface PublishSteps {
  readonly licenceAgreedNow: boolean;
  readonly lintDocument: PublishRequest["lintDocument"];
}

/** Lint and save the report (step 2); the findings, and the refusal if any is an error. */
export async function lintAndRecord(
  database: ReactionDatabase,
  reaction: ReactionWithNewestVersion,
  lintDocument: PublishRequest["lintDocument"],
): Promise<{ lintFindings: LintFinding[]; lintRefusal: ReactionDatabaseError | undefined }> {
  const lintFindings = lintDocument(reaction.newestReactionDocument);
  await database
    .updateTable("arrowpush.reactionVersions")
    .set({ latestLintReport: JSON.stringify(lintFindings) })
    .where("reactionId", "=", reaction.reactionId)
    .where("reactionVersion", "=", reaction.newestReactionVersion)
    .execute();
  const hasError = lintFindings.some((finding) => finding.lintLevel === "error");
  const lintRefusal = hasError
    ? new ReactionDatabaseError(
        "draft-has-lint-errors",
        `"${String(reaction.newestReactionDocument.reactionSlug)}" has lint errors`,
        lintFindings,
      )
    : undefined;
  return { lintFindings, lintRefusal };
}

/** Steps 2 to 4 on the reaction's unpublished version; a refusal is returned, not thrown. */
export async function publishNewestVersion(
  database: ReactionDatabase,
  reaction: ReactionWithNewestVersion,
  publishSteps: PublishSteps,
): Promise<PublishedVersionSummary | ReactionDatabaseError> {
  const versionRow = database
    .updateTable("arrowpush.reactionVersions")
    .where("reactionId", "=", reaction.reactionId)
    .where("reactionVersion", "=", reaction.newestReactionVersion);
  const { lintFindings, lintRefusal } = await lintAndRecord(
    database,
    reaction,
    publishSteps.lintDocument,
  );
  if (lintRefusal !== undefined) {
    return lintRefusal;
  }
  const licenceAgreedAt = await licenceAgreementDate(
    database,
    reaction.newestAuthorUserId,
    publishSteps.licenceAgreedNow,
  );
  if (licenceAgreedAt === undefined) {
    return new ReactionDatabaseError(
      "licence-not-agreed",
      "agree to publish under CC BY-SA 4.0 first",
    );
  }
  if (reaction.newestSubmissionStatus !== "submitted") {
    await versionRow
      .set({ submissionStatus: "submitted", submittedAt: new Date(), licenceAgreedAt })
      .execute();
  }
  const contentHash = contentHashOf(reaction.newestReactionDocument);
  await versionRow
    .set({ submissionStatus: "published", contentHash, publishedAt: new Date() })
    .execute();
  return {
    reactionSlug: String(reaction.newestReactionDocument.reactionSlug),
    reactionVersion: reaction.newestReactionVersion,
    contentHash,
    lintWarnings: lintFindings.filter((finding) => finding.lintLevel === "warning"),
  };
}

/**
 * Publish the reaction's unpublished version. Refusals (ReactionDatabaseError):
 * reaction-not-found, no-unpublished-version, not-allowed-to-publish, not-version-author,
 * draft-has-lint-errors (with the findings), licence-not-agreed.
 */
export async function publishDraft(
  database: ReactionDatabase,
  publishRequest: PublishRequest,
): Promise<PublishedVersionSummary> {
  const publishOutcome = await database
    .transaction()
    .execute(async (transaction) =>
      publishNewestVersion(
        transaction,
        await draftToPublish(transaction, publishRequest),
        publishRequest,
      ),
    );
  if (publishOutcome instanceof ReactionDatabaseError) {
    throw publishOutcome;
  }
  return publishOutcome;
}
