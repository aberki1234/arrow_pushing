/**
 * Tests for ownerAccount.ts. The reference is the account Better Auth stores at sign-in (through
 * the fake GitHub): the user found must be the one that sign-in made.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { DatabaseConnection } from "../reactionDatabase/databaseTables.js";
import {
  OWNER_GITHUB_USER_ID,
  OWNER_PROFILE,
  signInWithFakeGithub,
  testServerSettings,
} from "../testSupport/serverTesting.js";
import {
  DATABASE_SETUP_TIMEOUT_MS,
  emptyAllTables,
  insertUser,
  newMigratedDatabase,
} from "../testSupport/temporaryDatabase.js";
import { OwnerAccountError, userIdForGithubAccount } from "./ownerAccount.js";
import { createServerApplication } from "./serverApplication.js";

let connection: DatabaseConnection;

beforeAll(async () => {
  connection = await newMigratedDatabase();
}, DATABASE_SETUP_TIMEOUT_MS);

afterAll(async () => {
  await connection.close();
});

beforeEach(async () => {
  await emptyAllTables(connection);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("finding the owner's user", () => {
  it("finds the user that signing in with the GitHub id made", async () => {
    const application = createServerApplication({
      database: connection.database,
      settings: testServerSettings(),
      lintDocument: () => [],
      fetchFunction: () => Promise.reject(new Error("unused")),
    });
    await insertUser(connection, "someone else", "contributor");
    await signInWithFakeGithub(application, OWNER_PROFILE);
    const signedInUser = await connection.database
      .selectFrom("arrowpush.users")
      .select("id")
      .where("name", "=", "Owner Name")
      .executeTakeFirstOrThrow();
    expect(await userIdForGithubAccount(connection.database, OWNER_GITHUB_USER_ID)).toBe(
      signedInUser.id,
    );
  });

  it("refuses a GitHub id that has never signed in", async () => {
    await insertUser(connection, "someone else", "owner");
    await expect(userIdForGithubAccount(connection.database, "9999")).rejects.toThrow(
      OwnerAccountError,
    );
  });
});
