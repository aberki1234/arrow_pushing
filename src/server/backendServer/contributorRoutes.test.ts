/**
 * Tests for contributorRoutes.ts end to end: the owner signs in with the fake GitHub, a
 * contributor with the fake Google; the real linter (RDKit.js). The reference is the route table
 * in the module comment and docs/SPEC.md §6 "Contributors": submit, request changes with notes,
 * resubmit, publish (starting the deploy); the Users page for the owner only.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadChemistryToolkit } from "../../tooling/chemistryToolkit/chemistryToolkit.js";
import type { DatabaseConnection } from "../reactionDatabase/model/databaseTables.js";
import { lintReaction } from "../../tooling/reactionLinting/rules/reactionLint.js";
import { exampleReaction } from "../../testSupport/reactionEdits.js";
import {
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
import { createServerApplication } from "./serverApplication.js";

let connection: DatabaseConnection;
let application: ReturnType<typeof createServerApplication>;
let ownerCookie: string;
let contributorCookie: string;
let deployRequestCount: number;

beforeAll(async () => {
  connection = await newMigratedDatabase();
  const toolkit = await loadChemistryToolkit();
  application = createServerApplication({
    database: connection.database,
    settings: testServerSettings(),
    lintDocument: (reactionDocument) => lintReaction(reactionDocument, toolkit),
    fetchFunction: () => {
      deployRequestCount += 1;
      return Promise.resolve(new Response(null, { status: 204 }));
    },
  });
}, DATABASE_SETUP_TIMEOUT_MS);

afterAll(async () => {
  await connection.close();
});

beforeEach(async () => {
  await emptyAllTables(connection);
  ({ sessionCookieHeader: ownerCookie } = await signInWithFakeGithub(application, OWNER_PROFILE));
  ({ sessionCookieHeader: contributorCookie } = await signInWithFakeGoogle(application, {
    sub: "google-5",
    name: "Sam Lee",
    email: "sam@example.com",
    emailVerified: true,
  }));
  vi.unstubAllGlobals();
  deployRequestCount = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const SN2_SLUG = "sn2-hydroxide-bromomethane";

async function apiRequest(
  cookie: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = { origin: TEST_BASE_URL, cookie };
  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }
  const response = await application.request(`${TEST_BASE_URL}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, body: text === "" ? null : (JSON.parse(text) as unknown) };
}

type Answer = Promise<{ status: number; body: unknown }>;

const asContributor = (method: string, path: string, body?: unknown): Answer =>
  apiRequest(contributorCookie, method, path, body);
const asOwner = (method: string, path: string, body?: unknown): Answer =>
  apiRequest(ownerCookie, method, path, body);

async function contributorSubmitsSn2(): Promise<void> {
  const draft = exampleReaction("sn2-hydroxide-bromomethane.json");
  expect((await asContributor("PUT", `/api/reactions/${SN2_SLUG}/draft`, draft)).status).toBe(200);
  const submitted = await asContributor("POST", `/api/reactions/${SN2_SLUG}/submit`, {
    licenceAgreed: true,
    submissionNote: "First one!",
  });
  expect(submitted).toEqual({ status: 200, body: { submissionStatus: "submitted" } });
}

describe("signing in is required", () => {
  it("answers 401 to every contributor route without a session", async () => {
    for (const [method, path] of [
      ["POST", `/api/reactions/${SN2_SLUG}/submit`],
      ["GET", `/api/reactions/${SN2_SLUG}/review-notes`],
      ["GET", "/api/review-queue"],
      ["GET", `/api/reactions/${SN2_SLUG}/review`],
      ["POST", `/api/reactions/${SN2_SLUG}/review`],
      ["GET", "/api/users"],
      ["PUT", "/api/users/00000000-0000-0000-0000-000000000000/role"],
    ] as const) {
      const answer = await apiRequest("", method, path, method === "GET" ? undefined : {});
      expect(answer.status, `${method} ${path}`).toBe(401);
    }
  });
});

describe("a submission's way through review", () => {
  it("submits, gets changes requested with notes, resubmits and is published", async () => {
    await contributorSubmitsSn2();
    const queue = await asOwner("GET", "/api/review-queue");
    expect(queue.body).toMatchObject([
      { reactionSlug: SN2_SLUG, authorName: "Sam Lee", queueKind: "newReaction" },
    ]);
    const material = await asOwner("GET", `/api/reactions/${SN2_SLUG}/review`);
    expect(material.body).toMatchObject({ previousPublished: null, submissionNote: "First one!" });
    const requested = await asOwner("POST", `/api/reactions/${SN2_SLUG}/review`, {
      reviewDecision: "changes_requested",
      comment: "Nearly.",
      pinnedNotes: [{ changeKey: "title", note: "Shorter?" }],
    });
    expect(requested).toEqual({ status: 200, body: { published: null, deployStart: null } });
    const notes = await asContributor("GET", `/api/reactions/${SN2_SLUG}/review-notes`);
    expect(notes.body).toMatchObject({ comment: "Nearly.", reviewerName: "Owner Name" });
    await asContributor("POST", `/api/reactions/${SN2_SLUG}/submit`, { licenceAgreed: false });
    const published = await asOwner("POST", `/api/reactions/${SN2_SLUG}/review`, {
      reviewDecision: "publish",
    });
    expect(published.status).toBe(200);
    expect(published.body).toMatchObject({ published: { reactionVersion: 1 } });
    expect(deployRequestCount).toBe(1);
  });

  it("refuses the contributor the queue, and a bad review body", async () => {
    await contributorSubmitsSn2();
    expect((await asContributor("GET", "/api/review-queue")).status).toBe(403);
    const badDecision = await asOwner("POST", `/api/reactions/${SN2_SLUG}/review`, {
      reviewDecision: "maybe",
    });
    expect(badDecision.status).toBe(400);
    const badNotes = await asOwner("POST", `/api/reactions/${SN2_SLUG}/review`, {
      reviewDecision: "publish",
      pinnedNotes: "all good",
    });
    expect(badNotes.status).toBe(400);
  });

  it("refuses the owner publishing the contributor's draft directly", async () => {
    await contributorSubmitsSn2();
    const direct = await asOwner("POST", `/api/reactions/${SN2_SLUG}/publish`, {
      licenceAgreed: true,
    });
    expect(direct.status).toBe(403);
  });
});

describe("the Users page", () => {
  it("lists users and changes a role, for the owner only", async () => {
    const users = await asOwner("GET", "/api/users");
    const listed = users.body as { userId: string; displayName: string; providers: string[] }[];
    expect(listed.map((user) => [user.displayName, user.providers])).toEqual([
      ["Owner Name", ["github"]],
      ["Sam Lee", ["google"]],
    ]);
    const samUserId = listed[1]?.userId ?? "";
    expect(await asOwner("PUT", `/api/users/${samUserId}/role`, { siteRole: "reviewer" })).toEqual({
      status: 200,
      body: { siteRole: "reviewer" },
    });
    expect(
      (await asOwner("PUT", `/api/users/${samUserId}/role`, { siteRole: "owner" })).status,
    ).toBe(400);
    expect(
      (await asOwner("PUT", "/api/users/not-a-user/role", { siteRole: "reviewer" })).status,
    ).toBe(404);
    expect((await asContributor("GET", "/api/users")).status).toBe(403);
  });
});
