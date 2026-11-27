/**
 * Tests for draftSync/draftSync.ts: pushing lint-clean reaction files to the server as drafts and
 * pulling drafts back (docs/SPEC.md §6, "Drafting with an assistant"), end to end against the real
 * server application on PGlite, with an access token.
 */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mintAccessToken } from "../reactionDatabase/accessTokens.js";
import type { DatabaseConnection } from "../reactionDatabase/databaseTables.js";
import { saveDraft } from "../reactionDatabase/reactionVersions.js";
import type { LintFinding } from "../../tooling/reactionLinting/findings/lintFindings.js";
import { exampleReaction } from "../../testSupport/reactionEdits.js";
import {
  OWNER_PROFILE,
  signInWithFakeGithub,
  TEST_BASE_URL,
  testServerSettings,
} from "../../testSupport/serverTesting.js";
import {
  DATABASE_SETUP_TIMEOUT_MS,
  emptyAllTables,
  newMigratedDatabase,
} from "../../testSupport/temporaryDatabase.js";
import {
  type DraftSyncSettings,
  pullDraftFile,
  pushDraftFile,
} from "../../tooling/draftSync/draftSync.js";
import { createServerApplication } from "./serverApplication.js";

const SN2_SLUG = "sn2-hydroxide-bromomethane";
const LINT_ERROR: LintFinding = {
  lintRuleId: "state-not-reproduced",
  lintLevel: "error",
  instancePath: "/steps/0",
  message: "the arrows do not give state-2",
};

let connection: DatabaseConnection;
let application: ReturnType<typeof createServerApplication>;
let settings: DraftSyncSettings;
let reactionsFolder: string;
let lintFindingsToReport: LintFinding[];

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
  lintFindingsToReport = [];
  reactionsFolder = mkdtempSync(join(tmpdir(), "draft-sync-"));
  settings = {
    serverUrl: TEST_BASE_URL,
    accessToken: minted.plainToken,
    fetchFunction: async (url: string, init: RequestInit): Promise<Response> =>
      application.request(url, init),
    lintDocument: (): LintFinding[] => lintFindingsToReport,
  };
});

function writeReactionFile(title = "SN2 substitution"): string {
  const filePath = join(reactionsFolder, `${SN2_SLUG}.json`);
  const document = { ...exampleReaction("sn2-hydroxide-bromomethane.json"), title };
  writeFileSync(filePath, `${JSON.stringify(document, null, 2)}\n`);
  return filePath;
}

function syncStateOnDisk(): unknown {
  return JSON.parse(readFileSync(join(reactionsFolder, ".draft-sync.json"), "utf-8"));
}

describe("pushing a draft", () => {
  it("pushes a new reaction, remembers its hash, and pushes again over it", async () => {
    const filePath = writeReactionFile();
    const first = await pushDraftFile(filePath, settings);
    expect(first).toMatchObject({ outcome: "pushed", reactionSlug: SN2_SLUG, reactionVersion: 1 });
    const hashPattern = expect.stringMatching(/^[0-9a-f]{64}$/) as unknown;
    expect(syncStateOnDisk()).toEqual({
      reactionSlugToDraftContentHash: { [SN2_SLUG]: hashPattern },
    });
    writeReactionFile("Pushed twice");
    expect(await pushDraftFile(filePath, settings)).toMatchObject({ outcome: "pushed" });
  });

  it("pushes a new version of a published reaction as a draft (version 2)", async () => {
    await pushDraftFile(writeReactionFile(), settings);
    await sql`UPDATE arrowpush.reaction_versions SET submission_status = 'published',
                content_hash = 'hash', published_at = now()`.execute(connection.database);
    const nextFolder = mkdtempSync(join(tmpdir(), "draft-sync-next-"));
    const nextPath = join(nextFolder, `${SN2_SLUG}.json`);
    const nextDocument = {
      ...exampleReaction("sn2-hydroxide-bromomethane.json"),
      title: "Better hints",
      reactionVersion: 2,
      previousReactionVersion: 1,
    };
    writeFileSync(nextPath, JSON.stringify(nextDocument));
    expect(await pushDraftFile(nextPath, settings)).toMatchObject({
      outcome: "pushed",
      reactionVersion: 2,
    });
  });

  it("refuses to send a file with lint errors, and sends one with only warnings", async () => {
    const filePath = writeReactionFile();
    lintFindingsToReport = [LINT_ERROR];
    expect(await pushDraftFile(filePath, settings)).toEqual({
      outcome: "has-lint-errors",
      reactionSlug: SN2_SLUG,
      lintFindings: [LINT_ERROR],
    });
    lintFindingsToReport = [{ ...LINT_ERROR, lintLevel: "warning" }];
    expect(await pushDraftFile(filePath, settings)).toMatchObject({ outcome: "pushed" });
  });
});

describe("a draft edited in Create", () => {
  it("is refused when the draft was edited in Create since, until it is pulled", async () => {
    const filePath = writeReactionFile();
    await pushDraftFile(filePath, settings);
    const ownerUserId = (
      await connection.database.selectFrom("arrowpush.users").select("id").executeTakeFirstOrThrow()
    ).id;
    await saveDraft(
      connection.database,
      { ...exampleReaction("sn2-hydroxide-bromomethane.json"), title: "Edited in Create" },
      ownerUserId,
    );
    writeReactionFile("Pushed over the edit");
    expect(await pushDraftFile(filePath, settings)).toMatchObject({
      outcome: "refused",
      refusalCode: "draft-changed",
    });

    expect(await pullDraftFile(SN2_SLUG, reactionsFolder, settings)).toMatchObject({
      outcome: "pulled",
      filePath,
    });
    const pulled = JSON.parse(readFileSync(filePath, "utf-8")) as Record<string, unknown>;
    expect(pulled.title).toBe("Edited in Create");
    expect(await pushDraftFile(filePath, settings)).toMatchObject({ outcome: "pushed" });
  });
});

describe("a bad token", () => {
  it("reports a refusal for a bad token", async () => {
    const filePath = writeReactionFile();
    expect(await pushDraftFile(filePath, { ...settings, accessToken: "ap_wrong" })).toMatchObject({
      outcome: "refused",
      httpStatus: 401,
    });
  });
});

describe("pulling a draft", () => {
  it("reports a reaction the server does not have", async () => {
    expect(await pullDraftFile("no-such-reaction", reactionsFolder, settings)).toMatchObject({
      outcome: "refused",
      httpStatus: 404,
    });
  });
});
