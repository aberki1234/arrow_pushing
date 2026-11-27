/**
 * Lint a track file on disk: read it, run the track rules (trackLint.ts) and check its concept
 * figures (conceptFigureChecks.ts). Used by the linter's lint-tracks command and the catalogue
 * build.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { TrackDocument } from "../../core/trackFiles/trackSchemaViolations.js";
import { missingConceptFigureFindings } from "./conceptFigureChecks.js";
import type { LintFinding } from "./lintFindings.js";
import { lintTrack } from "./trackLint.js";

/** `trackDocument` is null when the file cannot be read as JSON or breaks the schema. */
export interface TrackFileLint {
  readonly trackDocument: TrackDocument | null;
  readonly lintFindings: readonly LintFinding[];
}

function fileNotReadable(reason: unknown): TrackFileLint {
  const message = reason instanceof Error ? reason.message : String(reason);
  return {
    trackDocument: null,
    lintFindings: [
      { lintRuleId: "file-not-readable", lintLevel: "error", instancePath: "", message },
    ],
  };
}

/** Every lint finding of the track file at `trackPath`. */
export function lintTrackFile(
  trackPath: string,
  publishedReactionSlugs: ReadonlySet<string>,
): TrackFileLint {
  let trackDocument: unknown;
  try {
    trackDocument = JSON.parse(readFileSync(trackPath, "utf-8"));
  } catch (error) {
    return fileNotReadable(error);
  }
  const ruleFindings = lintTrack(trackDocument, publishedReactionSlugs);
  if (ruleFindings.some((finding) => finding.lintRuleId === "schema-violation")) {
    return { trackDocument: null, lintFindings: ruleFindings };
  }
  const validTrack = trackDocument as TrackDocument; // no schema violation just above
  return {
    trackDocument: validTrack,
    lintFindings: [
      ...ruleFindings,
      ...missingConceptFigureFindings(validTrack, dirname(trackPath)),
    ],
  };
}

/**
 * The reactionSlug of every reaction file (*.json) anywhere under `publishedFolder`: both
 * fixtures/reactions (<slug>.json) and the backup content/published (<slug>/<n>.json).
 */
export function publishedReactionSlugsInFolder(publishedFolder: string): Set<string> {
  const reactionSlugs = new Set<string>();
  const reactionFiles = readdirSync(publishedFolder, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => join(entry.parentPath, entry.name));
  for (const reactionFile of reactionFiles) {
    const document: unknown = JSON.parse(readFileSync(reactionFile, "utf-8"));
    const reactionSlug = (document as { reactionSlug?: unknown }).reactionSlug;
    if (typeof reactionSlug === "string") {
      reactionSlugs.add(reactionSlug);
    }
  }
  return reactionSlugs;
}
