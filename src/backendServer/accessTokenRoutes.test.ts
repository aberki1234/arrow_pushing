/**
 * Tests for access tokens on the server (accessTokenRequests.ts through requireSignIn): a token
 * reads its user's reactions and saves drafts, and nothing else (docs/SPEC.md §6, "Drafting with
 * an assistant").
 */
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { mintAccessToken, revokeAccessToken } from "../reactionDatabase/accessTokens.js";
import type { DatabaseConnection } from "../reactionDatabase/databaseTables.js";
import { exampleReaction } from "../testSupport/reactionEdits.js";
import {
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
import { createServerApplication } from "./serverApplication.js";

const SN2_SLUG = "sn2-hydroxide-bromomethane";

let connection: DatabaseConnection;
let application: ReturnType<typeof createServerApplication>;
let accessToken: string;
let accessTokenId: string;

beforeAll(async () => {
  connection = await newMigratedDatabase();
  application = createServerApplication({
    database: connection.database,
    settings: testServerSettings(),
    lintDocument: () => [],
    fetchFunction: () => Promise.resolve(new Response(null, { status: 204 })),
  });
}, DATABASE_SETUP_TIMEOUT_MS);

afterAll(async () => {
  await connection.close();
});

beforeEach(async () => {
  await emptyAllTables(connection);
  await signInWithFakeGithub(application, OWNER_PROFILE);
  const minted = await mintAccessToken(connection.database, {
    userEmail: OWNER_PROFILE.email,
    tokenName: "drafting",
    lifetimeDays: 30,
    now: new Date(),
  });
  ({ plainToken: accessToken, accessTokenId } = minted);
});

/** A request as the draft-sync command line sends it: no Origin, no cookie, the bearer token. */
async function tokenRequest(
  method: string,
  path: string,
  options: { body?: unknown; token?: string; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${options.token ?? accessToken}`,
    ...options.headers,
  };
  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
  }
  const response = await application.request(`${TEST_BASE_URL}${path}`, {
    method,
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const text = await response.text();
  return { status: response.status, body: text === "" ? null : (JSON.parse(text) as unknown) };
}

it("saves a draft as the token's user and reads it back", async () => {
  const me = await tokenRequest("GET", "/api/me");
  expect(me.status).toBe(200);
  expect(me.body).toMatchObject({ displayName: "Owner Name", siteRole: "owner" });

  const saved = await tokenRequest("PUT", `/api/reactions/${SN2_SLUG}/draft`, {
    body: exampleReaction("sn2-hydroxide-bromomethane.json"),
  });
  expect(saved.status).toBe(200);
  expect((await tokenRequest("GET", `/api/reactions/${SN2_SLUG}`)).status).toBe(200);
  expect((await tokenRequest("GET", `/api/reactions/${SN2_SLUG}/versions/1`)).status).toBe(200);
  const listings = await tokenRequest("GET", "/api/reactions");
  expect(JSON.stringify(listings.body)).toContain(SN2_SLUG);
});

it("refuses (403) every other route, even for the owner", async () => {
  await tokenRequest("PUT", `/api/reactions/${SN2_SLUG}/draft`, {
    body: exampleReaction("sn2-hydroxide-bromomethane.json"),
  });
  for (const [method, path] of [
    ["POST", `/api/reactions/${SN2_SLUG}/publish`],
    ["POST", `/api/reactions/${SN2_SLUG}/next-version`],
    ["POST", `/api/reactions/${SN2_SLUG}/submit`],
    ["GET", "/api/review-queue"],
    ["GET", "/api/users"],
  ] as const) {
    const body = method === "GET" ? undefined : { licenceAgreed: true };
    const answer = await tokenRequest(method, path, body === undefined ? {} : { body });
    expect(answer.status, `${method} ${path}`).toBe(403);
    expect(JSON.stringify(answer.body)).toContain("access token");
  }
});

it("answers 401 to an unknown or revoked token", async () => {
  expect((await tokenRequest("GET", "/api/reactions", { token: "ap_wrong" })).status).toBe(401);
  await revokeAccessToken(connection.database, accessTokenId, new Date());
  expect((await tokenRequest("GET", "/api/reactions")).status).toBe(401);
});

it("saves only over the draft it last saw (If-None-Match: * or If-Match: <hash>)", async () => {
  const document = exampleReaction("sn2-hydroxide-bromomethane.json");
  const path = `/api/reactions/${SN2_SLUG}/draft`;
  const created = await tokenRequest("PUT", path, {
    body: document,
    headers: { "if-none-match": "*" },
  });
  expect(created.status).toBe(200);
  const { draftContentHash } = created.body as { draftContentHash: string };
  expect(draftContentHash).toMatch(/^[0-9a-f]{64}$/);

  const again = await tokenRequest("PUT", path, {
    body: document,
    headers: { "if-none-match": "*" },
  });
  expect(again.status).toBe(409);
  expect(again.body).toMatchObject({ refusalCode: "draft-changed" });

  const replaced = await tokenRequest("PUT", path, {
    body: { ...document, title: "Pushed again" },
    headers: { "if-match": `"${draftContentHash}"` },
  });
  expect(replaced.status).toBe(200);
  const stale = await tokenRequest("PUT", path, {
    body: document,
    headers: { "if-match": draftContentHash },
  });
  expect(stale.status).toBe(409);
});
