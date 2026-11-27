/** Tests for siteUsers.ts: the owner's Users page (docs/SPEC.md §6, "Contributors"). */
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import {
  DATABASE_SETUP_TIMEOUT_MS,
  emptyAllTables,
  insertUser,
  newMigratedDatabase,
} from "../../testSupport/temporaryDatabase.js";
import type { DatabaseConnection, ReactionDatabase } from "./databaseTables.js";
import { ReactionDatabaseError } from "./reactionDatabaseErrors.js";
import { saveDraft } from "./reactionVersions.js";
import { listSiteUsers, setSiteRole } from "./siteUsers.js";
import { exampleReaction } from "../../testSupport/reactionEdits.js";

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
  await database
    .insertInto("arrowpush.accounts")
    .values({
      accountId: "g-1",
      providerId: "google",
      userId: contributorUserId,
      updatedAt: new Date(),
    })
    .execute();
});

async function expectRefusal(pending: Promise<unknown>, refusalCode: string): Promise<void> {
  const refusal: unknown = await pending.then(
    () => undefined,
    (error: unknown) => error,
  );
  expect(refusal).toBeInstanceOf(ReactionDatabaseError);
  expect((refusal as ReactionDatabaseError).refusalCode).toBe(refusalCode);
}

it("lists every user with their providers, role and open and published versions", async () => {
  await saveDraft(database, exampleReaction("sn2-hydroxide-bromomethane.json"), contributorUserId);
  const users = await listSiteUsers(database, ownerUserId);
  expect(users.map((user) => ({ ...user, joinedAt: undefined }))).toEqual([
    {
      userId: ownerUserId,
      displayName: "Owner Name",
      providers: [],
      siteRole: "owner",
      openVersionCount: 0,
      publishedVersionCount: 0,
      joinedAt: undefined,
    },
    {
      userId: contributorUserId,
      displayName: "Sam Lee",
      providers: ["google"],
      siteRole: "contributor",
      openVersionCount: 1,
      publishedVersionCount: 0,
      joinedAt: undefined,
    },
  ]);
});

it("lets the owner make a contributor a reviewer, or block them", async () => {
  await setSiteRole(database, { ownerUserId, userId: contributorUserId, siteRole: "reviewer" });
  await setSiteRole(database, { ownerUserId, userId: contributorUserId, siteRole: "blocked" });
  const users = await listSiteUsers(database, ownerUserId);
  expect(users.find((user) => user.userId === contributorUserId)?.siteRole).toBe("blocked");
});

it("refuses others, the owner's own role, making an owner, an unknown user", async () => {
  await expectRefusal(listSiteUsers(database, contributorUserId), "not-allowed");
  await expectRefusal(
    setSiteRole(database, {
      ownerUserId: contributorUserId,
      userId: ownerUserId,
      siteRole: "blocked",
    }),
    "not-allowed",
  );
  await expectRefusal(
    setSiteRole(database, { ownerUserId, userId: ownerUserId, siteRole: "contributor" }),
    "role-not-assignable",
  );
  await expectRefusal(
    setSiteRole(database, { ownerUserId, userId: contributorUserId, siteRole: "owner" }),
    "role-not-assignable",
  );
  await expectRefusal(
    setSiteRole(database, {
      ownerUserId,
      userId: "00000000-0000-0000-0000-000000000000",
      siteRole: "reviewer",
    }),
    "user-not-found",
  );
});
