/**
 * Tests for reactionVersions.ts: saving drafts, "Edit" making the next version, listing and
 * reading (rules in the module comment, from docs/SPEC.md §5, backend).
 */
import { sql } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MAXIMUM_OPEN_DRAFTS as CREATE_LIMIT } from "../../../create/reactionEditor/model/reviewView.js";
import { exampleReaction } from "../../../testSupport/reactionEdits.js";
import {
  DATABASE_SETUP_TIMEOUT_MS,
  emptyAllTables,
  insertUser,
  newMigratedDatabase,
} from "../../../testSupport/temporaryDatabase.js";
import type { DatabaseConnection, ReactionDatabase } from "../model/databaseTables.js";
import { ReactionDatabaseError } from "../model/reactionDatabaseErrors.js";
import {
  listReactions,
  MAXIMUM_OPEN_DRAFTS,
  readReactionVersion,
  saveDraft,
  startNextVersion,
} from "./reactionVersions.js";

let connection: DatabaseConnection;
let database: ReactionDatabase;
let ownerUserId: string;

beforeAll(async () => {
  connection = await newMigratedDatabase();
  database = connection.database;
}, DATABASE_SETUP_TIMEOUT_MS);

afterAll(async () => {
  await connection.close();
});

beforeEach(async () => {
  await emptyAllTables(connection);
  ownerUserId = await insertUser(connection, "owner");
});

const SN2_SLUG = "sn2-hydroxide-bromomethane";

function sn2Document(): Record<string, unknown> {
  return exampleReaction("sn2-hydroxide-bromomethane.json");
}

/** Mark every version of the slug published, as publishDraft would (without the lint). */
async function markAllPublished(reactionSlug: string): Promise<void> {
  await sql`UPDATE arrowpush.reaction_versions SET submission_status = 'published',
              content_hash = 'hash', published_at = now()
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

describe("saving a draft", () => {
  it("makes version 1 as a draft for a new slug", async () => {
    expect(await saveDraft(database, sn2Document(), ownerUserId)).toEqual({
      reactionSlug: SN2_SLUG,
      reactionVersion: 1,
      submissionStatus: "draft",
    });
    const stored = await readReactionVersion(database, SN2_SLUG, 1);
    expect(stored.reactionDocument).toEqual(sn2Document());
    expect(stored).toMatchObject({ contentHash: null, latestLintReport: null, publishedAt: null });
  });

  it("replaces the same draft when saved again", async () => {
    await saveDraft(database, sn2Document(), ownerUserId);
    const retitled = { ...sn2Document(), title: "SN2, retitled" };
    expect(await saveDraft(database, retitled, ownerUserId)).toMatchObject({ reactionVersion: 1 });
    expect((await readReactionVersion(database, SN2_SLUG, 1)).reactionDocument).toEqual(retitled);
    const versionCount = await database
      .selectFrom("arrowpush.reactionVersions")
      .select((builder) => builder.fn.countAll<string>().as("versionCount"))
      .executeTakeFirstOrThrow();
    expect(Number(versionCount.versionCount)).toBe(1);
  });

  it("numbers the stored document itself, whatever the editor sent", async () => {
    await saveDraft(
      database,
      { ...sn2Document(), reactionVersion: 7, previousReactionVersion: 6 },
      ownerUserId,
    );
    const stored = await readReactionVersion(database, SN2_SLUG, 1);
    expect(stored.reactionDocument).toMatchObject({
      reactionVersion: 1,
      previousReactionVersion: null,
    });
  });
});

describe("refusing to save a draft", () => {
  it("refuses a document without a slug", async () => {
    const withoutSlug = sn2Document();
    delete withoutSlug.reactionSlug;
    await expectRefusal(saveDraft(database, withoutSlug, ownerUserId), "document-has-no-slug");
    await expectRefusal(
      saveDraft(database, { ...withoutSlug, reactionSlug: "" }, ownerUserId),
      "document-has-no-slug",
    );
  });

  it("refuses another user's unpublished version", async () => {
    await saveDraft(database, sn2Document(), ownerUserId);
    const otherUserId = await insertUser(connection, "someone else", "contributor");
    await expectRefusal(saveDraft(database, sn2Document(), otherUserId), "not-version-author");
  });

  it("refuses a reaction whose versions are all published (Edit comes first)", async () => {
    await saveDraft(database, sn2Document(), ownerUserId);
    await markAllPublished(SN2_SLUG);
    await expectRefusal(saveDraft(database, sn2Document(), ownerUserId), "no-unpublished-version");
  });
});

describe("Edit: starting the next version", () => {
  it("copies the newest published version as version n+1, numbered", async () => {
    await saveDraft(database, sn2Document(), ownerUserId);
    await markAllPublished(SN2_SLUG);
    expect(await startNextVersion(database, SN2_SLUG, ownerUserId)).toEqual({
      reactionSlug: SN2_SLUG,
      reactionVersion: 2,
      submissionStatus: "draft",
    });
    const nextVersion = await readReactionVersion(database, SN2_SLUG, 2);
    expect(nextVersion.reactionDocument).toEqual({
      ...sn2Document(),
      reactionVersion: 2,
      previousReactionVersion: 1,
    });
    const retitled = { ...nextVersion.reactionDocument, title: "SN2, version 2" };
    expect(await saveDraft(database, retitled, ownerUserId)).toMatchObject({ reactionVersion: 2 });
    expect((await readReactionVersion(database, SN2_SLUG, 1)).reactionDocument).toEqual(
      sn2Document(),
    );
  });

  it("refuses when an unpublished version exists", async () => {
    await saveDraft(database, sn2Document(), ownerUserId);
    await expectRefusal(
      startNextVersion(database, SN2_SLUG, ownerUserId),
      "unpublished-version-exists",
    );
  });

  it("refuses an unknown slug", async () => {
    await expectRefusal(startNextVersion(database, "no-such", ownerUserId), "reaction-not-found");
  });
});

describe("listing and reading", () => {
  it("lists each reaction by slug with its newest version", async () => {
    await saveDraft(database, sn2Document(), ownerUserId);
    await markAllPublished(SN2_SLUG);
    await startNextVersion(database, SN2_SLUG, ownerUserId);
    const untitled = exampleReaction("aldol-addition-base.json");
    delete untitled.title;
    await saveDraft(database, untitled, ownerUserId);
    const listings = await listReactions(database);
    expect(listings).toEqual([
      {
        reactionSlug: "aldol-addition-base",
        ownerUserId,
        ownerName: "owner",
        newestAuthorUserId: ownerUserId,
        newestAuthorName: "owner",
        title: null,
        newestReactionDocument: untitled,
        newestReactionVersion: 1,
        newestSubmissionStatus: "draft",
        publishedVersionCount: 0,
        updatedAt: expect.any(Date) as unknown,
      },
      {
        reactionSlug: SN2_SLUG,
        ownerUserId,
        ownerName: "owner",
        newestAuthorUserId: ownerUserId,
        newestAuthorName: "owner",
        title: "SN2 substitution",
        newestReactionDocument: {
          ...sn2Document(),
          reactionVersion: 2,
          previousReactionVersion: 1,
        },
        newestReactionVersion: 2,
        newestSubmissionStatus: "draft",
        publishedVersionCount: 1,
        updatedAt: expect.any(Date) as unknown,
      },
    ]);
  });
});

describe("listing one owner's reactions", () => {
  it("lists only that owner's reactions", async () => {
    await saveDraft(database, sn2Document(), ownerUserId);
    const otherUserId = await insertUser(connection, "someone else", "contributor");
    expect(await listReactions(database, { ownerUserId: otherUserId })).toEqual([]);
    expect(
      (await listReactions(database, { ownerUserId })).map((listing) => listing.reactionSlug),
    ).toEqual([SN2_SLUG]);
  });

  it("lists nothing in an empty database", async () => {
    expect(await listReactions(database)).toEqual([]);
  });

  it("refuses a version that is not there", async () => {
    await saveDraft(database, sn2Document(), ownerUserId);
    await expectRefusal(readReactionVersion(database, SN2_SLUG, 2), "version-not-found");
    await expectRefusal(readReactionVersion(database, "no-such", 1), "version-not-found");
  });
});

describe("the open-draft limit", () => {
  it("is the one Create shows", () => {
    expect(CREATE_LIMIT).toBe(MAXIMUM_OPEN_DRAFTS);
  });
});
