/**
 * Tests for draftChangeCheck.ts: a draft save that names the draft it last saw is refused
 * (draft-changed) when the stored draft differs (docs/SPEC.md §6, "Drafting with an assistant").
 */
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { contentHashOf } from "../catalogueBuilding/staticFileNaming.js";
import { exampleReaction } from "../testSupport/reactionEdits.js";
import {
  DATABASE_SETUP_TIMEOUT_MS,
  emptyAllTables,
  insertUser,
  newMigratedDatabase,
} from "../testSupport/temporaryDatabase.js";
import type { DatabaseConnection, ReactionDatabase } from "./databaseTables.js";
import { saveDraftIfUnchanged } from "./draftChangeCheck.js";
import { ReactionDatabaseError } from "./reactionDatabaseErrors.js";
import { readReactionVersion, saveDraft } from "./reactionVersions.js";

const SN2_SLUG = "sn2-hydroxide-bromomethane";

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
  ownerUserId = await insertUser(connection, "Owner Name");
});

function sn2Document(title = "SN2 substitution"): Record<string, unknown> {
  return { ...exampleReaction("sn2-hydroxide-bromomethane.json"), title };
}

async function refusalCodeOf(pending: Promise<unknown>): Promise<string> {
  const refusal: unknown = await pending.then(
    () => undefined,
    (error: unknown) => error,
  );
  expect(refusal).toBeInstanceOf(ReactionDatabaseError);
  return (refusal as ReactionDatabaseError).refusalCode;
}

async function storedDraftHash(): Promise<string> {
  const stored = await readReactionVersion(database, SN2_SLUG, 1);
  return contentHashOf(stored.reactionDocument);
}

it("creates a reaction when told none exists, and answers the stored draft hash", async () => {
  const written = await saveDraftIfUnchanged(database, sn2Document(), ownerUserId, null);
  expect(written).toMatchObject({ reactionSlug: SN2_SLUG, reactionVersion: 1 });
  expect(written.draftContentHash).toBe(await storedDraftHash());
});

it("replaces the draft when the named hash is the stored draft's", async () => {
  const first = await saveDraftIfUnchanged(database, sn2Document(), ownerUserId, null);
  const second = await saveDraftIfUnchanged(
    database,
    sn2Document("Changed title"),
    ownerUserId,
    first.draftContentHash,
  );
  expect(second.draftContentHash).not.toBe(first.draftContentHash);
  expect((await readReactionVersion(database, SN2_SLUG, 1)).reactionDocument.title).toBe(
    "Changed title",
  );
});

it("refuses when the draft changed since (someone saved in Create) or already exists", async () => {
  const first = await saveDraftIfUnchanged(database, sn2Document(), ownerUserId, null);
  await saveDraft(database, sn2Document("Edited in Create"), ownerUserId);
  expect(
    await refusalCodeOf(
      saveDraftIfUnchanged(database, sn2Document("Pushed"), ownerUserId, first.draftContentHash),
    ),
  ).toBe("draft-changed");
  expect(
    await refusalCodeOf(saveDraftIfUnchanged(database, sn2Document(), ownerUserId, null)),
  ).toBe("draft-changed");
  expect((await readReactionVersion(database, SN2_SLUG, 1)).reactionDocument.title).toBe(
    "Edited in Create",
  );
});

it("refuses a named hash for a reaction that does not exist", async () => {
  expect(
    await refusalCodeOf(
      saveDraftIfUnchanged(database, sn2Document(), ownerUserId, "ab".repeat(32)),
    ),
  ).toBe("draft-changed");
});

it("saves without a check when no expectation is given (Create's own saves)", async () => {
  await saveDraft(database, sn2Document(), ownerUserId);
  const written = await saveDraftIfUnchanged(
    database,
    sn2Document("Again"),
    ownerUserId,
    undefined,
  );
  expect(written.draftContentHash).toBe(await storedDraftHash());
});
