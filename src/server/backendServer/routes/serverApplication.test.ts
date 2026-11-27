/**
 * Tests for serverApplication.ts: what holds for every route: the cross-site request check and
 * the editor's files at every address outside /api.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DatabaseConnection } from "../../reactionDatabase/model/databaseTables.js";
import { newTemporaryFolder } from "../../../testSupport/reactionCopies.js";
import { TEST_BASE_URL, testServerSettings } from "../../../testSupport/serverTesting.js";
import {
  DATABASE_SETUP_TIMEOUT_MS,
  newMigratedDatabase,
} from "../../../testSupport/temporaryDatabase.js";
import { createServerApplication } from "./serverApplication.js";

let connection: DatabaseConnection;
let application: ReturnType<typeof createServerApplication>;

const EDITOR_PAGE = "<!doctype html><title>Reaction editor</title>";

beforeAll(async () => {
  connection = await newMigratedDatabase();
  const editorFilesFolder = newTemporaryFolder("built-editor");
  mkdirSync(join(editorFilesFolder, "assets"), { recursive: true });
  writeFileSync(join(editorFilesFolder, "index.html"), EDITOR_PAGE);
  writeFileSync(join(editorFilesFolder, "assets", "editor.js"), "console.log('editor');");
  application = createServerApplication({
    database: connection.database,
    settings: testServerSettings({ editorFilesFolder }),
    lintDocument: () => [],
    fetchFunction: () => Promise.reject(new Error("unused")),
  });
}, DATABASE_SETUP_TIMEOUT_MS);

afterAll(async () => {
  await connection.close();
});

describe("cross-site requests", () => {
  it("refuses a form POST from another site (403)", async () => {
    const response = await application.request(`${TEST_BASE_URL}/api/reactions/x/publish`, {
      method: "POST",
      headers: {
        origin: "https://evil.example",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: "licenceAgreed=true",
    });
    expect(response.status).toBe(403);
  });
});

describe("the editor's files", () => {
  it("serves index.html at / and the assets by path", async () => {
    const pageResponse = await application.request(`${TEST_BASE_URL}/`);
    expect(pageResponse.status).toBe(200);
    expect(await pageResponse.text()).toBe(EDITOR_PAGE);
    const scriptResponse = await application.request(`${TEST_BASE_URL}/assets/editor.js`);
    expect(await scriptResponse.text()).toContain("editor");
  });

  it("answers 404 for a missing file and an unknown API address", async () => {
    expect((await application.request(`${TEST_BASE_URL}/missing.js`)).status).toBe(404);
    const apiResponse = await application.request(`${TEST_BASE_URL}/api/no-such-route`);
    expect(apiResponse.status).toBe(404);
    expect(await apiResponse.json()).toEqual({ error: "no such API route" });
  });
});
