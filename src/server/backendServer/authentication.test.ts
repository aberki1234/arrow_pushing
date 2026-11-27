/**
 * Tests for authentication.ts: signing in with GitHub or Google through Better Auth's real routes,
 * with a fake GitHub and Google (testSupport/serverTesting.ts). The reference is the rules in the
 * module comment: anyone gets a user (a contributor) and a 30-day session; the allow-listed GitHub
 * account is the owner; one verified email links a person's two accounts.
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
  signInWithFakeGoogle,
  TEST_BASE_URL,
  testServerSettings,
} from "../../testSupport/serverTesting.js";
import {
  DATABASE_SETUP_TIMEOUT_MS,
  emptyAllTables,
  newMigratedDatabase,
} from "../../testSupport/temporaryDatabase.js";
import { createAuthentication, SESSION_LIFETIME_DAYS, signInProviders } from "./authentication.js";
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

describe("the client's address, for rate limiting", () => {
  it("is read from CF-Connecting-IP first (Render's Cloudflare edge), then X-Forwarded-For", () => {
    const { options } = createAuthentication(connection.database, testServerSettings());
    expect(options.advanced?.ipAddress?.ipAddressHeaders).toEqual([
      "cf-connecting-ip",
      "x-forwarded-for",
    ]);
  });
});

describe("the providers offered", () => {
  it("offers Google only when its settings are given", async () => {
    expect(signInProviders(testServerSettings())).toEqual(["github", "google"]);
    const githubOnly = testServerSettings({
      signIn: { ...testServerSettings().signIn, google: null },
    });
    expect(signInProviders(githubOnly)).toEqual(["github"]);
    const answer = await application.request(`${TEST_BASE_URL}/api/sign-in-providers`);
    expect(await answer.json()).toEqual(["github", "google"]);
  });
});

describe("signing in the owner's GitHub account", () => {
  it("signs in the allow-listed account as owner, with a 30-day session", async () => {
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

async function storedUsers(): Promise<{ name: string; siteRole: string }[]> {
  return connection.database
    .selectFrom("arrowpush.users")
    .select(["name", "siteRole"])
    .orderBy("name")
    .execute();
}

async function storedProviders(): Promise<string[]> {
  const accountRows = await connection.database
    .selectFrom("arrowpush.accounts")
    .select("providerId")
    .orderBy("providerId")
    .execute();
  return accountRows.map((accountRow) => accountRow.providerId);
}

const GOOGLE_PROFILE = {
  sub: "google-77",
  name: "Sam Lee",
  email: "sam@example.com",
  emailVerified: true,
};

describe("anyone signs in as a contributor", () => {
  it("signs in a GitHub account not on the allow-list as a contributor", async () => {
    const { sessionCookieHeader } = await signInWithFakeGithub(application, STRANGER_PROFILE);
    expect(sessionCookieHeader).toContain("arrowpush.session_token=");
    expect(await storedUsers()).toEqual([{ name: "stranger", siteRole: "contributor" }]);
  });

  it("signs in with Google as a contributor", async () => {
    const { callbackResponse, sessionCookieHeader } = await signInWithFakeGoogle(
      application,
      GOOGLE_PROFILE,
    );
    expect(callbackResponse.headers.get("location")).toBe("/");
    expect(sessionCookieHeader).toContain("arrowpush.session_token=");
    expect(await storedUsers()).toEqual([{ name: "Sam Lee", siteRole: "contributor" }]);
    expect(await storedProviders()).toEqual(["google"]);
  });

  it("keeps a blocked user able to sign in, as blocked", async () => {
    const { sessionCookieHeader } = await signInWithFakeGithub(application, STRANGER_PROFILE);
    await connection.database.updateTable("arrowpush.users").set({ siteRole: "blocked" }).execute();
    const meResponse = await application.request(`${TEST_BASE_URL}/api/me`, {
      headers: { cookie: sessionCookieHeader },
    });
    expect(await meResponse.json()).toMatchObject({ siteRole: "blocked", siteActions: [] });
  });
});

describe("one person's two accounts", () => {
  it("links Google and GitHub with one verified email, the GitHub owner as owner", async () => {
    await signInWithFakeGoogle(application, { ...GOOGLE_PROFILE, email: OWNER_PROFILE.email });
    const { sessionCookieHeader } = await signInWithFakeGithub(application, OWNER_PROFILE);
    expect(sessionCookieHeader).toContain("arrowpush.session_token=");
    expect(await storedUsers()).toEqual([{ name: "Sam Lee", siteRole: "owner" }]);
    expect(await storedProviders()).toEqual(["github", "google"]);
  });

  it("does not link an unverified Google email to an existing user", async () => {
    await signInWithFakeGithub(application, STRANGER_PROFILE);
    const { sessionCookieHeader } = await signInWithFakeGoogle(application, {
      ...GOOGLE_PROFILE,
      email: STRANGER_PROFILE.email,
      emailVerified: false,
    });
    expect(sessionCookieHeader).not.toContain("session_token");
    expect(await storedProviders()).toEqual(["github"]);
  });
});

describe("the session", () => {
  it("is read back, and ends at sign-out", async () => {
    const { sessionCookieHeader } = await signInWithFakeGithub(application, OWNER_PROFILE);
    const meResponse = await application.request(`${TEST_BASE_URL}/api/me`, {
      headers: { cookie: sessionCookieHeader },
    });
    expect(meResponse.status).toBe(200);
    expect(await meResponse.json()).toEqual({
      userId: expect.any(String) as unknown,
      displayName: "Owner Name",
      siteRole: "owner",
      siteActions: [
        "createReactions",
        "seeEveryReaction",
        "submitForReview",
        "publish",
        "review",
        "manageUsers",
        "keepUnlimitedDrafts",
      ],
    });
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
