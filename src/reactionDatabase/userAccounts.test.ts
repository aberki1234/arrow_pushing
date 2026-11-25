/**
 * Tests for userAccounts.ts: one user per sign-in account, made on first sign-in.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DATABASE_SETUP_TIMEOUT_MS,
  newMigratedDatabase,
} from "../testSupport/temporaryDatabase.js";
import type { DatabaseConnection } from "./databaseTables.js";
import { findOrCreateUser } from "./userAccounts.js";

let connection: DatabaseConnection;

beforeAll(async () => {
  connection = await newMigratedDatabase();
}, DATABASE_SETUP_TIMEOUT_MS);

afterAll(async () => {
  await connection.close();
});

const OWNER_IDENTITY = {
  oauthProvider: "github",
  oauthSubject: "1234",
  displayName: "Owner",
  siteRole: "owner",
} as const;

describe("finding or creating a user", () => {
  it("makes a user once and finds the same one again, keeping the first role", async () => {
    const firstUserId = await findOrCreateUser(connection.database, OWNER_IDENTITY);
    const againUserId = await findOrCreateUser(connection.database, {
      ...OWNER_IDENTITY,
      siteRole: "contributor",
    });
    expect(againUserId).toBe(firstUserId);
    const storedUser = await connection.database
      .selectFrom("arrowpush.users")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(storedUser).toMatchObject({ id: firstUserId, displayName: "Owner", siteRole: "owner" });
  });

  it("tells accounts apart by provider and subject", async () => {
    const githubUserId = await findOrCreateUser(connection.database, {
      ...OWNER_IDENTITY,
      oauthSubject: "5678",
    });
    const otherProviderUserId = await findOrCreateUser(connection.database, {
      ...OWNER_IDENTITY,
      oauthProvider: "google",
      oauthSubject: "5678",
    });
    expect(otherProviderUserId).not.toBe(githubUserId);
  });
});
