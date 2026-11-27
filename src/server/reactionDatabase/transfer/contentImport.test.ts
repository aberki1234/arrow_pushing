/**
 * Tests for contentImport.ts and publishedExport.ts: the four examples go in as published version 1
 * and come out of the export unchanged (their content hash is the reference); drafts are stored but
 * never exported; a second import changes nothing.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { contentHashOf } from "../../../tooling/catalogueBuilding/staticFileNaming.js";
import {
  type ChemistryToolkit,
  loadChemistryToolkit,
} from "../../../tooling/chemistryToolkit/chemistryToolkit.js";
import type { LintFinding } from "../../../tooling/reactionLinting/findings/lintFindings.js";
import { lintReaction } from "../../../tooling/reactionLinting/rules/reactionLint.js";
import { newTemporaryFolder } from "../../../testSupport/reactionCopies.js";
import { exampleReaction } from "../../../testSupport/reactionEdits.js";
import {
  DATABASE_SETUP_TIMEOUT_MS,
  emptyAllTables,
  insertUser,
  newMigratedDatabase,
} from "../../../testSupport/temporaryDatabase.js";
import { importReactionFiles, type ReactionFileImport } from "./contentImport.js";
import type { DatabaseConnection, ReactionDatabase } from "../model/databaseTables.js";
import { publishedVersionsForExport } from "./publishedExport.js";
import { ReactionDatabaseError } from "../model/reactionDatabaseErrors.js";
import { listReactions } from "../reactions/reactionVersions.js";

let connection: DatabaseConnection;
let database: ReactionDatabase;
let toolkit: ChemistryToolkit;
let ownerUserId: string;
let folder: string;

beforeAll(async () => {
  connection = await newMigratedDatabase();
  database = connection.database;
  toolkit = await loadChemistryToolkit();
}, DATABASE_SETUP_TIMEOUT_MS);

afterAll(async () => {
  await connection.close();
});

beforeEach(async () => {
  await emptyAllTables(connection);
  ownerUserId = await insertUser(connection, "owner");
  folder = newTemporaryFolder("content-import");
});

const EXAMPLE_FILE_NAMES = [
  "aldol-addition-base.json",
  "radical-bromination-methane.json",
  "sn2-hydroxide-bromomethane.json",
  "wittig-methylenation-cyclohexanone.json",
];

function writtenFile(fileName: string, reactionDocument: unknown): string {
  const filePath = join(folder, fileName);
  writeFileSync(filePath, JSON.stringify(reactionDocument), "utf-8");
  return filePath;
}

/** The four examples to publish unless `overrides` names other files (written only if used). */
function fileImport(overrides: Partial<ReactionFileImport> = {}): ReactionFileImport {
  return {
    publishedFilePaths:
      overrides.publishedFilePaths ??
      EXAMPLE_FILE_NAMES.map((fileName) => writtenFile(fileName, exampleReaction(fileName))),
    draftFilePaths: [],
    ownerUserId,
    lintDocument: (reactionDocument): LintFinding[] => lintReaction(reactionDocument, toolkit),
    ...overrides,
  };
}

describe("importing the examples and drafts", () => {
  it("publishes the four examples as version 1, exported unchanged", async () => {
    const summary = await importReactionFiles(database, fileImport());
    const exampleSlugs = EXAMPLE_FILE_NAMES.map((fileName) => fileName.replace(/\.json$/, ""));
    expect(summary).toEqual({ publishedSlugs: exampleSlugs, draftSlugs: [], skippedSlugs: [] });
    const exported = await publishedVersionsForExport(database);
    expect(exported.map((version) => version.reactionSlug)).toEqual(exampleSlugs);
    for (const [position, fileName] of EXAMPLE_FILE_NAMES.entries()) {
      expect(exported[position]).toEqual({
        reactionSlug: exampleSlugs[position],
        reactionVersion: 1,
        contentHash: contentHashOf(exampleReaction(fileName)),
        reactionDocument: exampleReaction(fileName),
      });
    }
  });
});

describe("importing drafts and importing again", () => {
  it("stores a draft with lint errors as a draft, never exported", async () => {
    const brokenDraft = { ...exampleReaction("sn2-hydroxide-bromomethane.json") };
    brokenDraft.reactionSlug = "sn2-draft";
    brokenDraft.title = "";
    const summary = await importReactionFiles(
      database,
      fileImport({
        publishedFilePaths: [],
        draftFilePaths: [writtenFile("sn2-draft.json", brokenDraft)],
      }),
    );
    expect(summary).toEqual({ publishedSlugs: [], draftSlugs: ["sn2-draft"], skippedSlugs: [] });
    expect(await publishedVersionsForExport(database)).toEqual([]);
    expect((await listReactions(database))[0]?.newestSubmissionStatus).toBe("draft");
  });

  it("skips every slug already there on a second run", async () => {
    await importReactionFiles(database, fileImport());
    const secondSummary = await importReactionFiles(database, fileImport());
    expect(secondSummary.publishedSlugs).toEqual([]);
    expect(secondSummary.skippedSlugs).toHaveLength(4);
    expect(await publishedVersionsForExport(database)).toHaveLength(4);
  });

  it("refuses an example with lint errors, naming it", async () => {
    const broken = { ...exampleReaction("sn2-hydroxide-bromomethane.json"), title: "" };
    const pending = importReactionFiles(
      database,
      fileImport({ publishedFilePaths: [writtenFile("sn2-hydroxide-bromomethane.json", broken)] }),
    );
    await expect(pending).rejects.toBeInstanceOf(ReactionDatabaseError);
    await expect(pending).rejects.toThrow(/sn2-hydroxide-bromomethane/);
  });
});

describe("exporting", () => {
  it("exports nothing from an empty database", async () => {
    expect(await publishedVersionsForExport(database)).toEqual([]);
  });
});
