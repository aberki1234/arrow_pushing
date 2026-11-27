/**
 * The repository's backup of published versions (docs/SPEC.md §5, backend, "Content"): the deploy
 * workflow fetches the server's export (GET /api/published-versions), writes each version to
 * content/published/<slug>/<version>.json, commits them, and builds the learner site from them.
 *
 * Rules
 *   - The export must be a list of {reactionSlug, reactionVersion, contentHash, reactionDocument};
 *     anything else is refused before a file is written.
 *   - Each version's contentHash must be the hash the static build gives its document
 *     (staticFileNaming.contentHashOf); a mismatch is refused, since published versions never
 *     change.
 *   - A file is written as 2-space JSON ending in a newline, like the other reaction files.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { contentHashOf, reactionVersionRef } from "./staticFileNaming.js";

/** One published version as the server exports it. */
export interface ExportedVersion {
  readonly reactionSlug: string;
  readonly reactionVersion: number;
  readonly contentHash: string;
  readonly reactionDocument: Record<string, unknown>;
}

export class PublishedBackupError extends Error {
  override readonly name = "PublishedBackupError";
}

/** A slug as the reaction schema allows it: lower-case words joined by "-" (no path). */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isExportedVersion(value: unknown): value is ExportedVersion {
  if (!isJsonObject(value)) {
    return false;
  }
  const { reactionSlug, reactionVersion, contentHash, reactionDocument } = value;
  return (
    typeof reactionSlug === "string" &&
    SLUG_PATTERN.test(reactionSlug) &&
    typeof reactionVersion === "number" &&
    Number.isInteger(reactionVersion) &&
    reactionVersion >= 1 &&
    typeof contentHash === "string" &&
    isJsonObject(reactionDocument)
  );
}

/** The export's versions, checked as in the module comment. Throws PublishedBackupError. */
export function checkedExport(exportBody: unknown): ExportedVersion[] {
  if (!Array.isArray(exportBody)) {
    throw new PublishedBackupError("the export is not a list of published versions");
  }
  return exportBody.map((listEntry: unknown, position) => {
    if (!isExportedVersion(listEntry)) {
      throw new PublishedBackupError(`entry ${String(position)} of the export is not a version`);
    }
    if (contentHashOf(listEntry.reactionDocument) !== listEntry.contentHash) {
      const versionRef = reactionVersionRef(listEntry.reactionSlug, listEntry.reactionVersion);
      throw new PublishedBackupError(`${versionRef}: the content hash is not its document's`);
    }
    return listEntry;
  });
}

/** Write each version under `backupFolder`; returns the written paths, sorted. */
export function writePublishedBackup(
  exportedVersions: readonly ExportedVersion[],
  backupFolder: string,
): string[] {
  const writtenPaths = exportedVersions.map((exportedVersion) => {
    const reactionFolder = join(backupFolder, exportedVersion.reactionSlug);
    mkdirSync(reactionFolder, { recursive: true });
    const filePath = join(reactionFolder, `${String(exportedVersion.reactionVersion)}.json`);
    writeFileSync(filePath, `${JSON.stringify(exportedVersion.reactionDocument, null, 2)}\n`);
    return filePath;
  });
  return writtenPaths.sort();
}
