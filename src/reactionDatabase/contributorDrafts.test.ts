/**
 * Tests for the contributors' rules of reactionVersions.ts (docs/SPEC.md §6, "Contributors"):
 * who saves which version, improving someone else's published reaction, the open-drafts limit,
 * a blocked user, saving a submitted version, and what each user's list shows.
 */
import { sql } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { exampleReaction } from "../testSupport/reactionEdits.js";
import {
  DATABASE_SETUP_TIMEOUT_MS,
  emptyAllTables,
  insertUser,
  newMigratedDatabase,
} from "../testSupport/temporaryDatabase.js";
import type { DatabaseConnection, ReactionDatabase } from "./databaseTables.js";
import { ReactionDatabaseError } from "./reactionDatabaseErrors.js";
import {
  listReactionsFor,
  MAXIMUM_OPEN_DRAFTS,
  readReactionVersion,
  saveDraft,
  startNextVersion,
} from "./reactionVersions.js";

let connection: DatabaseConnection;
let database: ReactionDatabase;
let ownerUserId: string;
let contributorUserId: string;

beforeAll(async () => {
  connection = await newMigratedDatabase();
  database = connection.database;
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

function draftNamed(reactionSlug: string): Record<string, unknown> {
  return { ...sn2Document(), reactionSlug };
}

async function setStatus(reactionSlug: string, submissionStatus: string): Promise<void> {
  await sql`UPDATE arrowpush.reaction_versions SET submission_status = ${submissionStatus},
              content_hash = CASE WHEN ${submissionStatus} = 'published' THEN 'hash' END,
              published_at = CASE WHEN ${submissionStatus} = 'published' THEN now() END
            WHERE submission_status <> 'published' AND reaction_id =
              (SELECT id FROM arrowpush.reactions WHERE reaction_slug = ${reactionSlug})`.execute(
    database,
  );
}

async function expectRefusal(pending: Promise<unknown>, refusalCode: string): Promise<void> {
  const refusal: unknown = await pending.then(
    () => undefined,
    (error: unknown) => error,
  );
  expect(refusal).toBeInstanceOf(ReactionDatabaseError);
  expect((refusal as ReactionDatabaseError).refusalCode).toBe(refusalCode);
}

describe("a contributor's drafts", () => {
  it("saves a new reaction as its owner", async () => {
    expect(await saveDraft(database, draftNamed("pinacol"), contributorUserId)).toEqual({
      reactionSlug: "pinacol",
      reactionVersion: 1,
      submissionStatus: "draft",
    });
  });

  it(`refuses a draft beyond ${String(MAXIMUM_OPEN_DRAFTS)} open ones`, async () => {
    for (let number = 1; number <= MAXIMUM_OPEN_DRAFTS; number += 1) {
      await saveDraft(database, draftNamed(`draft-${String(number)}`), contributorUserId);
    }
    await expectRefusal(
      saveDraft(database, draftNamed("one-too-many"), contributorUserId),
      "too-many-open-drafts",
    );
    await setStatus("draft-1", "published");
    await saveDraft(database, draftNamed("one-more"), contributorUserId);
    // Saving an open draft again is never refused by the limit.
    await saveDraft(database, draftNamed("draft-2"), contributorUserId);
  });

  it("refuses a blocked user", async () => {
    const blockedUserId = await insertUser(connection, "spam", "blocked");
    await expectRefusal(saveDraft(database, draftNamed("spam"), blockedUserId), "not-allowed");
  });

  it("takes a saved submitted version out of review, keeping changes requested", async () => {
    await saveDraft(database, draftNamed("pinacol"), contributorUserId);
    await setStatus("pinacol", "submitted");
    const edited = { ...draftNamed("pinacol"), title: "Pinacol, edited" };
    expect(await saveDraft(database, edited, contributorUserId)).toMatchObject({
      submissionStatus: "draft",
    });
    await setStatus("pinacol", "changes_requested");
    expect(await saveDraft(database, draftNamed("pinacol"), contributorUserId)).toMatchObject({
      submissionStatus: "changes_requested",
    });
  });

  it("keeps a submitted version in review when the same document is saved again", async () => {
    await saveDraft(database, draftNamed("pinacol"), contributorUserId);
    await setStatus("pinacol", "submitted");
    expect(await saveDraft(database, draftNamed("pinacol"), contributorUserId)).toMatchObject({
      submissionStatus: "submitted",
    });
  });
});

describe("improving someone else's published reaction", () => {
  it("starts its next version, adding the contributor to the authors", async () => {
    await saveDraft(database, sn2Document(), ownerUserId);
    await setStatus(SN2_SLUG, "published");
    expect(await startNextVersion(database, SN2_SLUG, contributorUserId)).toMatchObject({
      reactionVersion: 2,
    });
    const nextVersion = await readReactionVersion(database, SN2_SLUG, 2);
    expect(nextVersion.reactionDocument.authors).toEqual([
      ...(sn2Document().authors as unknown[]),
      { name: "Sam Lee", url: null },
    ]);
    // The contributor saves it; the reaction's owner may not, while it is the contributor's.
    await saveDraft(database, nextVersion.reactionDocument, contributorUserId);
    await expectRefusal(
      saveDraft(database, nextVersion.reactionDocument, ownerUserId),
      "not-version-author",
    );
  });

  it("does not add the owner improving their own reaction", async () => {
    await saveDraft(database, sn2Document(), ownerUserId);
    await setStatus(SN2_SLUG, "published");
    await startNextVersion(database, SN2_SLUG, ownerUserId);
    const nextVersion = await readReactionVersion(database, SN2_SLUG, 2);
    expect(nextVersion.reactionDocument.authors).toEqual(sn2Document().authors);
  });

  it("refuses a blocked user", async () => {
    await saveDraft(database, sn2Document(), ownerUserId);
    await setStatus(SN2_SLUG, "published");
    const blockedUserId = await insertUser(connection, "spam", "blocked");
    await expectRefusal(startNextVersion(database, SN2_SLUG, blockedUserId), "not-allowed");
  });
});

describe("each user's list", () => {
  it("shows a contributor their own reactions and every published one", async () => {
    await saveDraft(database, draftNamed("owner-draft"), ownerUserId);
    await saveDraft(database, draftNamed("owner-published"), ownerUserId);
    await setStatus("owner-published", "published");
    await saveDraft(database, draftNamed("sams-draft"), contributorUserId);
    const slugsFor = async (userId: string): Promise<string[]> =>
      (await listReactionsFor(database, userId)).map((listing) => listing.reactionSlug);
    expect(await slugsFor(contributorUserId)).toEqual(["owner-published", "sams-draft"]);
    expect(await slugsFor(ownerUserId)).toEqual(["owner-draft", "owner-published", "sams-draft"]);
  });

  it("shows a contributor the next version they started of someone else's reaction", async () => {
    await saveDraft(database, sn2Document(), ownerUserId);
    await setStatus(SN2_SLUG, "published");
    await startNextVersion(database, SN2_SLUG, contributorUserId);
    const [listing] = await listReactionsFor(database, contributorUserId);
    expect(listing).toMatchObject({
      reactionSlug: SN2_SLUG,
      newestReactionVersion: 2,
      newestAuthorName: "Sam Lee",
      ownerName: "Owner Name",
    });
  });
});
