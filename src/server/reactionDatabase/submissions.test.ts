/**
 * Tests for submissions.ts (docs/SPEC.md §6, "Contributors"): Submit for review, the review
 * queue, a review's decision (publish or request changes), its notes, and what a reviewer
 * compares. The linter is the real one (RDKit.js).
 */
import { sql } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  type ChemistryToolkit,
  loadChemistryToolkit,
} from "../../tooling/chemistryToolkit/chemistryToolkit.js";
import type { LintFinding } from "../../tooling/reactionLinting/findings/lintFindings.js";
import { lintReaction } from "../../tooling/reactionLinting/rules/reactionLint.js";
import { exampleReaction } from "../../testSupport/reactionEdits.js";
import {
  DATABASE_SETUP_TIMEOUT_MS,
  emptyAllTables,
  insertUser,
  newMigratedDatabase,
} from "../../testSupport/temporaryDatabase.js";
import type { DatabaseConnection, ReactionDatabase } from "./databaseTables.js";
import { ReactionDatabaseError } from "./reactionDatabaseErrors.js";
import { readReactionVersion, saveDraft, startNextVersion } from "./reactionVersions.js";
import {
  reviewMaterial,
  reviewNotesFor,
  reviewQueue,
  reviewSubmission,
  submitForReview,
} from "./submissions.js";

let connection: DatabaseConnection;
let database: ReactionDatabase;
let toolkit: ChemistryToolkit;
let ownerUserId: string;
let contributorUserId: string;

beforeAll(async () => {
  connection = await newMigratedDatabase();
  database = connection.database;
  toolkit = await loadChemistryToolkit();
}, DATABASE_SETUP_TIMEOUT_MS);

afterAll(async () => {
  await connection.close();
});

beforeEach(async () => {
  await emptyAllTables(connection);
  ownerUserId = await insertUser(connection, "Owner Name");
  contributorUserId = await insertUser(connection, "Sam Lee", "contributor");
});

const SN2_SLUG = "sn2-hydroxide-bromomethane";

function sn2Document(): Record<string, unknown> {
  return exampleReaction("sn2-hydroxide-bromomethane.json");
}

const fullLint = (reactionDocument: Readonly<Record<string, unknown>>): LintFinding[] =>
  lintReaction(reactionDocument, toolkit);

async function expectRefusal(pending: Promise<unknown>, refusalCode: string): Promise<void> {
  const refusal: unknown = await pending.then(
    () => undefined,
    (error: unknown) => error,
  );
  expect(refusal).toBeInstanceOf(ReactionDatabaseError);
  expect((refusal as ReactionDatabaseError).refusalCode).toBe(refusalCode);
}

/** The contributor's SN2 draft, submitted with the licence ticked. */
async function submittedSn2(submissionNote = "Please check hint 2."): Promise<void> {
  await saveDraft(database, sn2Document(), contributorUserId);
  await submitForReview(database, {
    reactionSlug: SN2_SLUG,
    authorUserId: contributorUserId,
    licenceAgreedNow: true,
    submissionNote,
    lintDocument: fullLint,
  });
}

async function statusOf(reactionSlug: string, reactionVersion = 1): Promise<string> {
  return (await readReactionVersion(database, reactionSlug, reactionVersion)).submissionStatus;
}

describe("submitting", () => {
  it("submits a clean draft with its note", async () => {
    await submittedSn2();
    expect(await statusOf(SN2_SLUG)).toBe("submitted");
    const [queued] = await reviewQueue(database, ownerUserId);
    expect(queued).toMatchObject({
      reactionSlug: SN2_SLUG,
      reactionVersion: 1,
      authorName: "Sam Lee",
      submissionNote: "Please check hint 2.",
      queueKind: "newReaction",
    });
  });

  it("refuses lint errors, no licence, another's version, a version in review", async () => {
    await saveDraft(database, { ...sn2Document(), mechanismSummary: "" }, contributorUserId);
    const submit = (authorUserId: string, licenceAgreedNow = true): Promise<unknown> =>
      submitForReview(database, {
        reactionSlug: SN2_SLUG,
        authorUserId,
        licenceAgreedNow,
        submissionNote: "",
        lintDocument: fullLint,
      });
    await expectRefusal(submit(contributorUserId), "draft-has-lint-errors");
    await saveDraft(database, sn2Document(), contributorUserId);
    await expectRefusal(submit(contributorUserId, false), "licence-not-agreed");
    await expectRefusal(submit(ownerUserId), "not-version-author");
    await submit(contributorUserId);
    await expectRefusal(submit(contributorUserId), "not-submittable");
  });
});

describe("the review queue", () => {
  it("lists submissions oldest first: new reactions, next versions, resubmissions", async () => {
    await saveDraft(database, { ...sn2Document(), reactionSlug: "owners" }, ownerUserId);
    await sql`UPDATE arrowpush.reaction_versions SET submission_status = 'published',
                content_hash = 'hash', published_at = now()`.execute(database);
    await startNextVersion(database, "owners", contributorUserId);
    const nextVersion = await readReactionVersion(database, "owners", 2);
    await saveDraft(database, nextVersion.reactionDocument, contributorUserId);
    await submitForReview(database, {
      reactionSlug: "owners",
      authorUserId: contributorUserId,
      licenceAgreedNow: true,
      submissionNote: "",
      lintDocument: fullLint,
    });
    await submittedSn2();
    const queue = await reviewQueue(database, ownerUserId);
    expect(queue.map((entry) => [entry.reactionSlug, entry.queueKind])).toEqual([
      ["owners", "nextVersion"],
      [SN2_SLUG, "newReaction"],
    ]);
  });

  it("leaves out blocked authors' submissions, and refuses a contributor", async () => {
    await submittedSn2();
    await expectRefusal(reviewQueue(database, contributorUserId), "not-allowed");
    await database
      .updateTable("arrowpush.users")
      .set({ siteRole: "blocked" })
      .where("id", "=", contributorUserId)
      .execute();
    expect(await reviewQueue(database, ownerUserId)).toEqual([]);
  });
});

describe("reviewing", () => {
  it("requests changes with notes, which the author sees until they submit again", async () => {
    await submittedSn2();
    await reviewSubmission(database, {
      reactionSlug: SN2_SLUG,
      reviewerUserId: ownerUserId,
      reviewDecision: "changes_requested",
      comment: "Lovely; one hint to fix.",
      pinnedNotes: [{ changeKey: "hintTiers state:reactants", note: "Say δ+." }],
      lintDocument: fullLint,
    });
    expect(await statusOf(SN2_SLUG)).toBe("changes_requested");
    expect(await reviewNotesFor(database, SN2_SLUG, contributorUserId)).toMatchObject({
      reviewerName: "Owner Name",
      comment: "Lovely; one hint to fix.",
      pinnedNotes: [{ changeKey: "hintTiers state:reactants", note: "Say δ+." }],
    });
    await submitForReview(database, {
      reactionSlug: SN2_SLUG,
      authorUserId: contributorUserId,
      licenceAgreedNow: false,
      submissionNote: "Fixed.",
      lintDocument: fullLint,
    });
    expect(await reviewNotesFor(database, SN2_SLUG, contributorUserId)).toBeNull();
    expect((await reviewQueue(database, ownerUserId))[0]?.queueKind).toBe("resubmitted");
  });

  it("publishes, with the author's licence agreement", async () => {
    await submittedSn2();
    const published = await reviewSubmission(database, {
      reactionSlug: SN2_SLUG,
      reviewerUserId: ownerUserId,
      reviewDecision: "publish",
      comment: "",
      pinnedNotes: [],
      lintDocument: fullLint,
    });
    expect(published).toMatchObject({ reactionSlug: SN2_SLUG, reactionVersion: 1 });
    expect(await statusOf(SN2_SLUG)).toBe("published");
    expect(await reviewQueue(database, ownerUserId)).toEqual([]);
  });
});

describe("refusing a review", () => {
  it("refuses one's own submission, a contributor, and a version not in review", async () => {
    await submittedSn2();
    const review = (reviewerUserId: string): Promise<unknown> =>
      reviewSubmission(database, {
        reactionSlug: SN2_SLUG,
        reviewerUserId,
        reviewDecision: "publish",
        comment: "",
        pinnedNotes: [],
        lintDocument: fullLint,
      });
    await expectRefusal(review(contributorUserId), "not-allowed");
    const reviewerUserId = await insertUser(connection, "Reviewer", "reviewer");
    await saveDraft(database, { ...sn2Document(), reactionSlug: "reviewers" }, reviewerUserId);
    await submitForReview(database, {
      reactionSlug: "reviewers",
      authorUserId: reviewerUserId,
      licenceAgreedNow: true,
      submissionNote: "",
      lintDocument: fullLint,
    });
    await expectRefusal(
      reviewSubmission(database, {
        reactionSlug: "reviewers",
        reviewerUserId,
        reviewDecision: "publish",
        comment: "",
        pinnedNotes: [],
        lintDocument: fullLint,
      }),
      "own-submission",
    );
    // An edit saved takes it out of review.
    await saveDraft(database, { ...sn2Document(), title: "SN2, edited" }, contributorUserId);
    await expectRefusal(review(ownerUserId), "not-submitted");
  });
});

describe("what a reviewer compares", () => {
  it("gives the submitted version and the newest published one before it", async () => {
    await saveDraft(database, sn2Document(), ownerUserId);
    await sql`UPDATE arrowpush.reaction_versions SET submission_status = 'published',
                content_hash = 'hash', published_at = now()`.execute(database);
    await startNextVersion(database, SN2_SLUG, contributorUserId);
    const nextVersion = await readReactionVersion(database, SN2_SLUG, 2);
    const retitled = { ...nextVersion.reactionDocument, title: "SN2, clearer" };
    await saveDraft(database, retitled, contributorUserId);
    await submitForReview(database, {
      reactionSlug: SN2_SLUG,
      authorUserId: contributorUserId,
      licenceAgreedNow: true,
      submissionNote: "Clearer title.",
      lintDocument: fullLint,
    });
    const material = await reviewMaterial(database, SN2_SLUG, ownerUserId);
    expect(material.submitted.reactionDocument.title).toBe("SN2, clearer");
    expect(material.previousPublished?.reactionDocument).toEqual(sn2Document());
    expect(material).toMatchObject({ authorName: "Sam Lee", submissionNote: "Clearer title." });
  });
});
