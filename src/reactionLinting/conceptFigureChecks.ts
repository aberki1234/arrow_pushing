/**
 * The one track rule that reads the file system:
 *   concept-figure-missing (error) a concept figure path names no file beside the track file.
 */
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import type { TrackDocument } from "../trackFiles/trackSchemaViolations.js";
import { type LintFinding, lintError } from "./lintFindings.js";

/**
 * A finding for each concept figure that is not a file under `trackFolder` (the folder holding
 * the track file). The document must already be schema-valid, so each path is "figures/<name>.svg".
 */
export function missingConceptFigureFindings(
  trackDocument: TrackDocument,
  trackFolder: string,
): LintFinding[] {
  const findings: LintFinding[] = [];
  trackDocument.problemSets.forEach((problemSet, problemSetPosition) => {
    (problemSet.conceptFigurePaths ?? []).forEach((figurePath, figurePosition) => {
      const figureFile = join(trackFolder, figurePath);
      if (!existsSync(figureFile) || !statSync(figureFile).isFile()) {
        findings.push(
          lintError(
            "concept-figure-missing",
            ["problemSets", problemSetPosition, "conceptFigurePaths", figurePosition],
            `${figurePath} is not a file beside the track file (looked for ${figureFile})`,
          ),
        );
      }
    });
  });
  return findings;
}
