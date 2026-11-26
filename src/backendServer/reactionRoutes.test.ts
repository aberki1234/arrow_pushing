/**
 * Tests for reactionRoutes.ts: the editor's API end to end on the SN2 example, signed in through
 * the fake GitHub, with the real linter (RDKit.js). The reference is the route table in the module
 * comment and refusalAnswers.ts's statuses.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { contentHashOf } from "../catalogueBuilding/staticFileNaming.js";
import { loadChemistryToolkit } from "../chemistryToolkit/chemistryToolkit.js";
import type { DatabaseConnection } from "../reactionDatabase/databaseTables.js";
import { lintReaction } from "../reactionLinting/reactionLint.js";
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
import type { FetchFunction } from "./serverDependencies.js";
import { createServerApplication } from "./serverApplication.js";

let connection: DatabaseConnection;
let application: ReturnType<typeof createServerApplication>;
let sessionCookieHeader: string;
/** What the deploy request answers; each test may change it. */
let deployAnswer: () => Promise<Response>;
let deployRequestCount: number;

beforeAll(async () => {
  connection = await newMigratedDatabase();
  const toolkit = await loadChemistryToolkit();
  const deployFetch: FetchFunction = () => {
    deployRequestCount += 1;
    return deployAnswer();
  };
  application = createServerApplication({
    database: connection.database,
    settings: testServerSettings(),
    lintDocument: (reactionDocument) => lintReaction(reactionDocument, toolkit),
    fetchFunction: deployFetch,
  });
}, DATABASE_SETUP_TIMEOUT_MS);

afterAll(async () => {
  await connection.close();
});

beforeEach(async () => {
  await emptyAllTables(connection);
  ({ sessionCookieHeader } = await signInWithFakeGithub(application, OWNER_PROFILE));
  vi.unstubAllGlobals();
  deployAnswer = (): Promise<Response> => Promise.resolve(new Response(null, { status: 204 }));
  deployRequestCount = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const SN2_SLUG = "sn2-hydroxide-bromomethane";

function sn2Document(): Record<string, unknown> {
  return exampleReaction("sn2-hydroxide-bromomethane.json");
}

/** A request as the editor sends it: same origin, JSON, signed in unless told otherwise. */
async function apiRequest(
  method: string,
  path: string,
  options: { body?: unknown; signedIn?: boolean } = {},
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = { origin: TEST_BASE_URL };
  if (options.signedIn !== false) {
    headers.cookie = sessionCookieHeader;
  }
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

const saveSn2 = (): Promise<{ status: number; body: unknown }> =>
  apiRequest("PUT", `/api/reactions/${SN2_SLUG}/draft`, { body: sn2Document() });

const publishSn2 = (licenceAgreed = true): Promise<{ status: number; body: unknown }> =>
  apiRequest("POST", `/api/reactions/${SN2_SLUG}/publish`, { body: { licenceAgreed } });

describe("signing in is required", () => {
  it("answers 401 to every reaction route without a session", async () => {
    for (const [method, path] of [
      ["GET", "/api/reactions"],
      ["GET", `/api/reactions/${SN2_SLUG}`],
      ["GET", `/api/reactions/${SN2_SLUG}/versions/1`],
      ["PUT", `/api/reactions/${SN2_SLUG}/draft`],
      ["POST", `/api/reactions/${SN2_SLUG}/next-version`],
      ["POST", `/api/reactions/${SN2_SLUG}/publish`],
    ] as const) {
      const body = method === "GET" ? undefined : {};
      const answer = await apiRequest(method, path, { body, signedIn: false });
      expect(answer.status, `${method} ${path}`).toBe(401);
    }
  });
});

describe("a reaction's way from draft to published", () => {
  it("saves, lists, reads, publishes (starting the deploy) and edits", async () => {
    expect(await saveSn2()).toEqual({
      status: 200,
      body: {
        reactionSlug: SN2_SLUG,
        reactionVersion: 1,
        submissionStatus: "draft",
        draftContentHash: expect.stringMatching(/^[0-9a-f]{64}$/) as unknown,
      },
    });
    expect((await apiRequest("GET", "/api/reactions")).body).toMatchObject([
      { reactionSlug: SN2_SLUG, newestSubmissionStatus: "draft" },
    ]);
    const stored = await apiRequest("GET", `/api/reactions/${SN2_SLUG}/versions/1`);
    expect(stored.body).toMatchObject({ reactionDocument: sn2Document(), contentHash: null });
    const newest = await apiRequest("GET", `/api/reactions/${SN2_SLUG}`);
    expect(newest.body).toEqual(stored.body);
    expect(await publishSn2()).toEqual({
      status: 200,
      body: {
        reactionSlug: SN2_SLUG,
        reactionVersion: 1,
        contentHash: contentHashOf(sn2Document()),
        lintWarnings: [],
        deployStart: "started",
      },
    });
    expect(deployRequestCount).toBe(1);
    expect(await apiRequest("POST", `/api/reactions/${SN2_SLUG}/next-version`)).toEqual({
      status: 200,
      body: { reactionSlug: SN2_SLUG, reactionVersion: 2, submissionStatus: "draft" },
    });
  });

  it("still publishes when the deploy request fails, saying so", async () => {
    deployAnswer = (): Promise<Response> => Promise.reject(new Error("GitHub is down"));
    await saveSn2();
    const published = await publishSn2();
    expect(published.status).toBe(200);
    expect(published.body).toMatchObject({ reactionVersion: 1, deployStart: "failed" });
  });
});

describe("the reaction list", () => {
  it("lists each reaction with its progress in Create, not its document", async () => {
    await saveSn2();
    const listing = await apiRequest("GET", "/api/reactions");
    expect(listing.body).toMatchObject([
      {
        reactionSlug: SN2_SLUG,
        newestSubmissionStatus: "draft",
        creationProgress: {
          arrowStepCount: 1,
          teachingDoneCount: 5,
          teachingItemCount: 5,
          neededLeftCount: 0,
        },
      },
    ]);
    expect((listing.body as Record<string, unknown>[])[0]).not.toHaveProperty(
      "newestReactionDocument",
    );
  });
});

describe("refusals of the request", () => {
  it("refuses a document whose slug is not the address's (400) and a non-object body", async () => {
    const otherSlug = await apiRequest("PUT", "/api/reactions/other-slug/draft", {
      body: sn2Document(),
    });
    expect(otherSlug.status).toBe(400);
    const notObject = await apiRequest("PUT", `/api/reactions/${SN2_SLUG}/draft`, { body: [1] });
    expect(notObject.status).toBe(400);
  });

  it("answers 404 for an unknown version and a version that is not a number", async () => {
    await saveSn2();
    expect((await apiRequest("GET", `/api/reactions/${SN2_SLUG}/versions/2`)).status).toBe(404);
    expect((await apiRequest("GET", "/api/reactions/no-such")).status).toBe(404);
    expect((await apiRequest("GET", `/api/reactions/${SN2_SLUG}/versions/latest`)).status).toBe(
      404,
    );
    expect((await apiRequest("POST", "/api/reactions/no-such/publish", { body: {} })).status).toBe(
      404,
    );
  });
});

describe("refusals because of the reaction's versions", () => {
  it("answers 409 for Edit beside a draft and for saving when all are published", async () => {
    await saveSn2();
    const editAnswer = await apiRequest("POST", `/api/reactions/${SN2_SLUG}/next-version`);
    expect(editAnswer).toMatchObject({
      status: 409,
      body: { refusalCode: "unpublished-version-exists" },
    });
    await publishSn2();
    expect(await saveSn2()).toMatchObject({
      status: 409,
      body: { refusalCode: "no-unpublished-version" },
    });
  });

  it("answers 422 with the findings for a draft with lint errors, and for no licence", async () => {
    await apiRequest("PUT", `/api/reactions/${SN2_SLUG}/draft`, {
      body: { ...sn2Document(), title: "" },
    });
    const lintRefusal = await publishSn2();
    expect(lintRefusal).toMatchObject({
      status: 422,
      body: { refusalCode: "draft-has-lint-errors" },
    });
    expect((lintRefusal.body as { lintFindings: unknown[] }).lintFindings.length).toBeGreaterThan(
      0,
    );
    await saveSn2();
    expect(await publishSn2(false)).toMatchObject({
      status: 422,
      body: { refusalCode: "licence-not-agreed" },
    });
    expect(deployRequestCount).toBe(0);
  });
});

describe("the published-versions export", () => {
  it("is public and lists only published versions", async () => {
    await saveSn2();
    expect(await apiRequest("GET", "/api/published-versions", { signedIn: false })).toEqual({
      status: 200,
      body: [],
    });
    await publishSn2();
    const exported = await apiRequest("GET", "/api/published-versions", { signedIn: false });
    expect(exported.body).toEqual([
      {
        reactionSlug: SN2_SLUG,
        reactionVersion: 1,
        contentHash: contentHashOf(sn2Document()),
        reactionDocument: sn2Document(),
      },
    ]);
  });
});
