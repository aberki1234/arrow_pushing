/**
 * Tests for versionReading.ts: who may read which stored version. A published version is public;
 * an unpublished one (draft, submitted, changes requested) is read only by its author, the
 * reaction's owner and a user who sees every reaction (a reviewer, the site's owner). Anyone else
 * is told it is not found, as if it did not exist.
 */
import { sql } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { exampleReaction } from "../../../testSupport/reactionEdits.js";
import {
  DATABASE_SETUP_TIMEOUT_MS,
  emptyAllTables,
  insertUser,
  newMigratedDatabase,
} from "../../../testSupport/temporaryDatabase.js";
import type { DatabaseConnection, ReactionDatabase } from "../model/databaseTables.js";
import { ReactionDatabaseError } from "../model/reactionDatabaseErrors.js";
import { saveDraft, startNextVersion } from "./reactionVersions.js";
import { readNewestReactionVersionFor, readReactionVersionFor } from "./versionReading.js";

let connection: DatabaseConnection;
let database: ReactionDatabase;
let siteOwnerUserId: string;
let reviewerUserId: string;
let authorUserId: string;
let otherContributorUserId: string;

beforeAll(async () => {
  connection = await newMigratedDatabase();
  database = connection.database;
}, DATABASE_SETUP_TIMEOUT_MS);

afterAll(async () => {
  await connection.close();
});

beforeEach(async () => {
  await emptyAllTables(connection);
  siteOwnerUserId = await insertUser(connection, "Owner Name");
  reviewerUserId = await insertUser(connection, "Rae Reviewer", "reviewer");
  authorUserId = await insertUser(connection, "Sam Lee", "contributor");
  otherContributorUserId = await insertUser(connection, "Alex Other", "contributor");
});

const SN2_SLUG = "sn2-hydroxide-bromomethane";

function sn2Document(): Record<string, unknown> {
  return exampleReaction("sn2-hydroxide-bromomethane.json");
}

async function publishOpenVersion(): Promise<void> {
  await sql`UPDATE arrowpush.reaction_versions SET submission_status = 'published',
              content_hash = 'hash', published_at = now()
            WHERE submission_status <> 'published' AND reaction_id =
              (SELECT id FROM arrowpush.reactions WHERE reaction_slug = ${SN2_SLUG})`.execute(
    database,
  );
}

async function refusalCodeOf(pending: Promise<unknown>): Promise<string | undefined> {
  const refusal: unknown = await pending.then(
    () => undefined,
    (error: unknown) => error,
  );
  expect(refusal).toBeInstanceOf(ReactionDatabaseError);
  return (refusal as ReactionDatabaseError).refusalCode;
}

describe("reading one version", () => {
  it("lets the author, a reviewer and the site's owner read an unpublished version", async () => {
    await saveDraft(database, sn2Document(), authorUserId);
    for (const userId of [authorUserId, reviewerUserId, siteOwnerUserId]) {
      const storedVersion = await readReactionVersionFor(database, userId, SN2_SLUG, 1);
      expect(storedVersion.submissionStatus).toBe("draft");
    }
  });

  it("tells any other user an unpublished version is not found", async () => {
    await saveDraft(database, sn2Document(), authorUserId);
    const pending = readReactionVersionFor(database, otherContributorUserId, SN2_SLUG, 1);
    expect(await refusalCodeOf(pending)).toBe("version-not-found");
  });

  it("lets anyone read a published version", async () => {
    await saveDraft(database, sn2Document(), authorUserId);
    await publishOpenVersion();
    const storedVersion = await readReactionVersionFor(
      database,
      otherContributorUserId,
      SN2_SLUG,
      1,
    );
    expect(storedVersion.submissionStatus).toBe("published");
  });

  it("lets the reaction's owner read someone else's next version of it", async () => {
    await saveDraft(database, sn2Document(), authorUserId);
    await publishOpenVersion();
    await startNextVersion(database, SN2_SLUG, otherContributorUserId);
    const storedVersion = await readReactionVersionFor(database, authorUserId, SN2_SLUG, 2);
    expect(storedVersion.submissionStatus).toBe("draft");
  });

  it("still refuses a version that does not exist", async () => {
    const pending = readReactionVersionFor(database, siteOwnerUserId, SN2_SLUG, 1);
    expect(await refusalCodeOf(pending)).toBe("version-not-found");
  });
});

describe("reading the newest version", () => {
  it("answers the newest version to a user who may read it", async () => {
    await saveDraft(database, sn2Document(), authorUserId);
    await publishOpenVersion();
    await startNextVersion(database, SN2_SLUG, authorUserId);
    const storedVersion = await readNewestReactionVersionFor(database, authorUserId, SN2_SLUG);
    expect(storedVersion.reactionVersion).toBe(2);
  });

  it("answers anyone else the newest published version", async () => {
    await saveDraft(database, sn2Document(), authorUserId);
    await publishOpenVersion();
    await startNextVersion(database, SN2_SLUG, authorUserId);
    const storedVersion = await readNewestReactionVersionFor(
      database,
      otherContributorUserId,
      SN2_SLUG,
    );
    expect(storedVersion.reactionVersion).toBe(1);
    expect(storedVersion.submissionStatus).toBe("published");
  });

  it("tells anyone else a reaction with no published version is not found", async () => {
    await saveDraft(database, sn2Document(), authorUserId);
    const pending = readNewestReactionVersionFor(database, otherContributorUserId, SN2_SLUG);
    expect(await refusalCodeOf(pending)).toBe("reaction-not-found");
  });

  it("refuses an unknown slug", async () => {
    const pending = readNewestReactionVersionFor(database, siteOwnerUserId, "no-such-reaction");
    expect(await refusalCodeOf(pending)).toBe("reaction-not-found");
  });
});
