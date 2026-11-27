/**
 * Tests for publishedBackup.ts. The reference for hashes is staticFileNaming.contentHashOf, the
 * static build's own; the files written are read back and parsed.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { exampleReaction } from "../../../testSupport/reactionEdits.js";
import { newTemporaryFolder } from "../../../testSupport/reactionCopies.js";
import { checkedExport, PublishedBackupError, writePublishedBackup } from "./publishedBackup.js";
import { contentHashOf } from "../naming/staticFileNaming.js";

function exportedSn2(): Record<string, unknown> {
  const reactionDocument = exampleReaction("sn2-hydroxide-bromomethane.json");
  return {
    reactionSlug: "sn2-hydroxide-bromomethane",
    reactionVersion: 1,
    contentHash: contentHashOf(reactionDocument),
    reactionDocument,
  };
}

describe("checking the export", () => {
  it("accepts a list of versions whose hashes match their documents", () => {
    expect(checkedExport([exportedSn2()])).toEqual([exportedSn2()]);
    expect(checkedExport([])).toEqual([]);
  });

  it("refuses a body that is not such a list", () => {
    for (const exportBody of [
      null,
      { versions: [] },
      [{ ...exportedSn2(), reactionVersion: "1" }],
      [{ ...exportedSn2(), reactionVersion: 0 }],
      [{ ...exportedSn2(), reactionSlug: "../escape" }],
      [{ ...exportedSn2(), reactionDocument: [] }],
    ]) {
      expect(() => checkedExport(exportBody), JSON.stringify(exportBody)).toThrow(
        PublishedBackupError,
      );
    }
  });

  it("refuses a version whose hash is not its document's", () => {
    expect(() => checkedExport([{ ...exportedSn2(), contentHash: "0".repeat(64) }])).toThrow(
      /sn2-hydroxide-bromomethane@1/,
    );
  });
});

describe("writing the backup", () => {
  it("writes <slug>/<version>.json as 2-space JSON and returns the paths", () => {
    const backupFolder = newTemporaryFolder("published-backup");
    const [sn2Version] = checkedExport([exportedSn2()]);
    if (sn2Version === undefined) {
      throw new Error("the export has one version");
    }
    const secondVersion = { ...sn2Version, reactionVersion: 2 };
    const writtenPaths = writePublishedBackup([secondVersion, sn2Version], backupFolder);
    const firstPath = join(backupFolder, "sn2-hydroxide-bromomethane", "1.json");
    expect(writtenPaths).toEqual([
      firstPath,
      join(backupFolder, "sn2-hydroxide-bromomethane", "2.json"),
    ]);
    const writtenText = readFileSync(firstPath, "utf-8");
    expect(writtenText).toBe(`${JSON.stringify(sn2Version.reactionDocument, null, 2)}\n`);
  });
});
