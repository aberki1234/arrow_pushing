/**
 * Tests for authentication.ts: signing in with GitHub through Better Auth's real routes, with a
 * fake GitHub (testSupport/serverTesting.ts). The reference is the rules in the module comment:
 * only allow-listed GitHub ids get a user and a session, as owners, for 30 days.
 */
import { getSchema } from "better-auth/db";
import type { Kysely } from "kysely";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { DatabaseConnection } from "../reactionDatabase/databaseTables.js";
import {
  cookieHeaderFrom,
  FAKE_GITHUB_ACCESS_TOKEN,
  OWNER_PROFILE,
  signInWithFakeGithub,
  TEST_BASE_URL,
  testServerSettings,
} from "../testSupport/serverTesting.js";
import {
  DATABASE_SETUP_TIMEOUT_MS,
  emptyAllTables,
  newMigratedDatabase,
} from "../testSupport/temporaryDatabase.js";
import {
  createAuthentication,
  isAllowedGithubProfile,
  SESSION_LIFETIME_DAYS,
} from "./authentication.js";
import { createServerApplication } from "./serverApplication.js";

let connection: DatabaseConnection;
let application: ReturnType<typeof createServerApplication>;

beforeAll(async () => {
  connection = await newMigratedDatabase();
  application = createServerApplication({
    database: connection.database,
    settings: testServerSettings(),
    lintDocument: () => [],
    fetchFunction: () => Promise.reject(new Error("no deploy in these tests")),
  });
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

const STRANGER_PROFILE = { id: 2002, login: "stranger", name: null, email: "stranger@example.com" };

async function rowCounts(): Promise<{ users: number; sessions: number }> {
  const users = await connection.database.selectFrom("arrowpush.users").select("id").execute();
  const sessions = await connection.database
    .selectFrom("arrowpush.sessions")
    .select("id")
    .execute();
  return { users: users.length, sessions: sessions.length };
}

describe("the tables", () => {
  /**
   * Reference: Postgres itself. For each table Better Auth uses, select every column it reads,
   * through our connection (schema arrowpush, camelCase names to snake_case), so a missing table
   * or column fails the query. (Better Auth's own getMigrations() compares the camelCase field
   * names with the snake_case columns without the plugin, so it cannot be used here.)
   */
  it("migration 0001 has every table and column Better Auth uses", async () => {
    const authentication = createAuthentication(connection.database, testServerSettings());
    const authTables = getSchema(authentication.options);
    const untypedDatabase = connection.database as unknown as Kysely<
      Record<string, Record<string, unknown>>
    >;
    expect(Object.keys(authTables).sort()).toEqual([
      "accounts",
      "sessions",
      "users",
      "verifications",
    ]);
    for (const [tableName, authTable] of Object.entries(authTables)) {
      const columnNames = ["id", ...Object.keys(authTable.fields)];
      await expect(
        untypedDatabase.selectFrom(`arrowpush.${tableName}`).select(columnNames).execute(),
        tableName,
      ).resolves.toEqual([]);
    }
  });
});

describe("the allow-list check", () => {
  it("allows a profile whose numeric id is listed, and nothing else", () => {
    expect(isAllowedGithubProfile({ id: 1001, login: "owner" }, ["1001"])).toBe(true);
    expect(isAllowedGithubProfile({ id: 2002 }, ["1001"])).toBe(false);
    expect(isAllowedGithubProfile({ id: "1001" }, ["1001"])).toBe(false);
    expect(isAllowedGithubProfile({ login: "1001" }, ["1001"])).toBe(false);
    expect(isAllowedGithubProfile(undefined, ["1001"])).toBe(false);
    expect(isAllowedGithubProfile({ id: 1001 }, [])).toBe(false);
  });
});

describe("signing in an allowed GitHub account", () => {
  it("signs in an allowed account as owner, with a 30-day session", async () => {
    const before = Date.now();
    const { callbackResponse, sessionCookieHeader } = await signInWithFakeGithub(
      application,
      OWNER_PROFILE,
    );
    expect(callbackResponse.status).toBe(302);
    expect(callbackResponse.headers.get("location")).toBe("/");
    const sessionCookie = callbackResponse.headers
      .getSetCookie()
      .find((setCookie) => setCookie.startsWith("arrowpush.session_token="));
    expect(sessionCookie).toMatch(/HttpOnly/i);
    expect(sessionCookie).toMatch(/SameSite=Lax/i);
    const storedUser = await connection.database
      .selectFrom("arrowpush.users")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(storedUser).toMatchObject({ name: "Owner Name", siteRole: "owner" });
    const storedSession = await connection.database
      .selectFrom("arrowpush.sessions")
      .selectAll()
      .executeTakeFirstOrThrow();
    const lifetimeDays = (storedSession.expiresAt.getTime() - before) / (24 * 60 * 60 * 1000);
    expect(lifetimeDays).toBeCloseTo(SESSION_LIFETIME_DAYS, 1);
    expect(sessionCookieHeader).toContain("arrowpush.session_token=");
  });

  it("links the GitHub id as the account and stores the token encrypted", async () => {
    await signInWithFakeGithub(application, OWNER_PROFILE);
    const storedAccount = await connection.database
      .selectFrom("arrowpush.accounts")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(storedAccount).toMatchObject({ providerId: "github", accountId: "1001" });
    expect(storedAccount.accessToken).not.toBeNull();
    expect(storedAccount.accessToken).not.toContain(FAKE_GITHUB_ACCESS_TOKEN);
  });
});

describe("refusing other GitHub accounts", () => {
  it("refuses an account not on the allow-list: no user, no session", async () => {
    const { callbackResponse, sessionCookieHeader } = await signInWithFakeGithub(
      application,
      STRANGER_PROFILE,
    );
    expect(callbackResponse.status).toBe(302);
    expect(callbackResponse.headers.get("location")).toMatch(/error=/);
    expect(sessionCookieHeader).not.toContain("session_token");
    expect(await rowCounts()).toEqual({ users: 0, sessions: 0 });
  });

  it("refuses a known user whose GitHub id has been taken off the allow-list", async () => {
    await signInWithFakeGithub(application, OWNER_PROFILE);
    const withoutOwner = createServerApplication({
      database: connection.database,
      settings: testServerSettings({
        signIn: { ...testServerSettings().signIn, allowedGithubUserIds: ["3003"] },
      }),
      lintDocument: () => [],
      fetchFunction: () => Promise.reject(new Error("unused")),
    });
    const { sessionCookieHeader } = await signInWithFakeGithub(withoutOwner, OWNER_PROFILE);
    expect(sessionCookieHeader).not.toContain("session_token");
    expect((await rowCounts()).sessions).toBe(1);
  });
});

describe("the session", () => {
  it("is read back, and ends at sign-out", async () => {
    const { sessionCookieHeader } = await signInWithFakeGithub(application, OWNER_PROFILE);
    const meResponse = await application.request(`${TEST_BASE_URL}/api/me`, {
      headers: { cookie: sessionCookieHeader },
    });
    expect(meResponse.status).toBe(200);
    expect(await meResponse.json()).toEqual({ displayName: "Owner Name", siteRole: "owner" });
    const signOutResponse = await application.request(`${TEST_BASE_URL}/api/auth/sign-out`, {
      method: "POST",
      headers: { cookie: sessionCookieHeader, origin: TEST_BASE_URL },
    });
    expect(signOutResponse.status).toBe(200);
    expect(cookieHeaderFrom(signOutResponse)).not.toContain("session_token=");
    expect((await rowCounts()).sessions).toBe(0);
    const afterResponse = await application.request(`${TEST_BASE_URL}/api/me`, {
      headers: { cookie: sessionCookieHeader },
    });
    expect(afterResponse.status).toBe(401);
  });

  it("answers 401 without a cookie and with a forged one", async () => {
    for (const cookie of ["", "arrowpush.session_token=forged.signature"]) {
      const meResponse = await application.request(`${TEST_BASE_URL}/api/me`, {
        headers: { cookie },
      });
      expect(meResponse.status).toBe(401);
    }
  });
});
