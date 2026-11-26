/**
 * The built editor's store (reactionEditor/serverReactionStore.ts) against the real server, signed
 * in through the fake GitHub, with the real linter: the editor's requests are the ones the server
 * answers. The reference is reactionRoutes.ts's route table and the publishing rules (SPEC §5).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadChemistryToolkit } from "../chemistryToolkit/chemistryToolkit.js";
import type { DatabaseConnection } from "../reactionDatabase/databaseTables.js";
import { contributorClient } from "../reactionEditor/contributorClient.js";
import { serverReactionStore } from "../reactionEditor/serverReactionStore.js";
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
import { createServerApplication } from "./serverApplication.js";

let connection: DatabaseConnection;
let application: ReturnType<typeof createServerApplication>;

beforeAll(async () => {
  connection = await newMigratedDatabase();
  const toolkit = await loadChemistryToolkit();
  application = createServerApplication({
    database: connection.database,
    settings: testServerSettings(),
    lintDocument: (reactionDocument) => lintReaction(reactionDocument, toolkit),
    fetchFunction: () => Promise.resolve(new Response(null, { status: 204 })),
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

const SN2_SLUG = "sn2-hydroxide-bromomethane";
const SN2_FILE_NAME = `${SN2_SLUG}.json`;

/** The browser's fetch on the editor's page: same origin, sending the cookie it holds. */
function browserFetch(cookieHeader: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set("origin", TEST_BASE_URL);
    if (cookieHeader !== "") {
      headers.set("cookie", cookieHeader);
    }
    const path = input instanceof Request ? input.url : input.toString();
    return Promise.resolve(application.request(`${TEST_BASE_URL}${path}`, { ...init, headers }));
  };
}

async function signedInStore(): Promise<ReturnType<typeof serverReactionStore>> {
  const { sessionCookieHeader } = await signInWithFakeGithub(application, OWNER_PROFILE);
  vi.unstubAllGlobals();
  return serverReactionStore(browserFetch(sessionCookieHeader));
}

describe("signing in", () => {
  it("knows who is signed in, and no one without a session", async () => {
    expect(await (await signedInStore()).signedInUser()).toEqual({
      userId: expect.any(String) as unknown,
      displayName: "Owner Name",
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
    expect(await serverReactionStore(browserFetch("")).signedInUser()).toBeNull();
  });

  it("signs out: the session ends", async () => {
    const { sessionCookieHeader } = await signInWithFakeGithub(application, OWNER_PROFILE);
    vi.unstubAllGlobals();
    const store = serverReactionStore(browserFetch(sessionCookieHeader));
    expect(await store.signedInUser()).not.toBeNull();
    await contributorClient(browserFetch(sessionCookieHeader)).signOut();
    expect(await store.signedInUser()).toBeNull();
  });

  it("gets the providers and each one's sign-in address", async () => {
    const client = contributorClient(browserFetch(""));
    expect(await client.signInProviders()).toEqual(["github", "google"]);
    expect(await client.signInAddress("github")).toMatch(
      /^https:\/\/github\.com\/login\/oauth\/authorize\?/,
    );
    expect(await client.signInAddress("google")).toMatch(
      /^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/,
    );
  });
});

/** The SN2 example's progress in Create: one step, every teaching item done. */
const SN2_PROGRESS = {
  arrowStepCount: 1,
  teachingDoneCount: 5,
  teachingItemCount: 5,
  neededLeftCount: 0,
};

/** The store's list: the owner's SN2 draft alone. */
async function expectSn2ListedAsDraft(
  store: ReturnType<typeof serverReactionStore>,
): Promise<void> {
  const ownerUserId = (await store.signedInUser())?.userId;
  const owner = { ownerUserId, ownerName: "Owner Name" };
  const author = { newestAuthorUserId: ownerUserId, newestAuthorName: "Owner Name" };
  expect(await store.list()).toEqual([
    {
      fileName: SN2_FILE_NAME,
      reactionSlug: SN2_SLUG,
      title: exampleReaction(SN2_FILE_NAME).title,
      newestReactionVersion: 1,
      newestSubmissionStatus: "draft",
      ...owner,
      ...author,
      creationProgress: SN2_PROGRESS,
    },
  ]);
}

describe("a reaction from draft to published, from the editor", () => {
  it("saves, lists, reads, refuses Publish without the licence, publishes and edits", async () => {
    const store = await signedInStore();
    expect(store.storagePlace).toBe("the server");
    await store.save(SN2_FILE_NAME, exampleReaction(SN2_FILE_NAME));
    await expectSn2ListedAsDraft(store);
    expect(await store.read(SN2_FILE_NAME)).toEqual(exampleReaction(SN2_FILE_NAME));
    expect(await store.publish(SN2_SLUG, false)).toMatchObject({
      outcome: "refused",
      lintFindingCount: 0,
    });
    expect(await store.publish(SN2_SLUG, true)).toEqual({
      outcome: "published",
      reactionVersion: 1,
      lintWarningCount: 0,
      deployStart: "started",
    });
    expect(await store.startNextVersion(SN2_SLUG)).toBe(2);
    expect(await store.read(SN2_FILE_NAME)).toMatchObject({
      reactionVersion: 2,
      previousReactionVersion: 1,
    });
  });

  it("reports a lint refusal with its finding count, and a refused save as an error", async () => {
    const store = await signedInStore();
    await store.save(SN2_FILE_NAME, { ...exampleReaction(SN2_FILE_NAME), title: "" });
    const refusal = await store.publish(SN2_SLUG, true);
    expect(refusal.outcome).toBe("refused");
    expect(refusal.outcome === "refused" && refusal.lintFindingCount).toBeGreaterThan(0);
    await store.save(SN2_FILE_NAME, exampleReaction(SN2_FILE_NAME));
    await store.publish(SN2_SLUG, true);
    await expect(store.save(SN2_FILE_NAME, exampleReaction(SN2_FILE_NAME))).rejects.toThrow(
      /published/,
    );
  });
});
