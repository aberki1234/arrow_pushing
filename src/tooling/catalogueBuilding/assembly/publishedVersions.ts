/**
 * Read the published reaction files a build starts from; refuse any not fit to publish.
 *
 * Terms
 *   published version  One reaction file given to the build: its slug, version, parsed document
 *                      and content hash (staticFileNaming).
 * Steps
 *   1. readPublishedVersion() reads one file, lints it (reactionLinting) and refuses it on any lint
 *      error; lint warnings are returned for the command line to print. A superseded version
 *      (an older version of a reaction that has a newer one) is history: a rule added since it
 *      was published (such as the item 12c wedge check) must not stop the build, so its lint
 *      errors are returned with the warnings instead. A schema violation still refuses it.
 *      supersededVersionPaths() says which files are superseded.
 *   2. checkVersionNumbering() refuses a slug/version given twice and a slug whose versions are
 *      not exactly 1..n.
 */
import { readFileSync } from "node:fs";
import type { ChemistryToolkit } from "../../chemistryToolkit/chemistryToolkit.js";
import type { LintFinding } from "../../reactionLinting/findings/lintFindings.js";
import { lintReaction } from "../../reactionLinting/rules/reactionLint.js";
import { CatalogueBuildError } from "../naming/catalogueBuildErrors.js";
import { contentHashOf } from "../naming/staticFileNaming.js";
import { reactionVersionRef } from "../../../core/catalogue/reactionVersionRefs.js";
import { isRecord } from "../../../core/jsonValues/jsonValues.js";
import type { ReactionFile } from "../../../core/reactionFiles/reactionFile.js";
import { readReactionFile } from "../../../core/reactionFiles/reactionFileReading.js";

export interface PublishedVersion {
  readonly reactionSlug: string;
  readonly reactionVersion: number;
  /** The file, schema-checked and lint-clean. */
  readonly reactionDocument: ReactionFile;
  readonly contentHash: string;
  readonly sourcePath: string;
}

function readReactionJson(reactionPath: string): Record<string, unknown> {
  let document: unknown;
  try {
    document = JSON.parse(readFileSync(reactionPath, "utf-8"));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new CatalogueBuildError("reaction-file-not-readable", `${reactionPath}: ${reason}`);
  }
  if (!isRecord(document)) {
    throw new CatalogueBuildError(
      "reaction-file-not-readable",
      `${reactionPath}: the file does not hold a JSON object`,
    );
  }
  return document;
}

function findingLine(finding: LintFinding): string {
  return `${finding.lintRuleId} at ${finding.instancePath || "/"}: ${finding.message}`;
}

/**
 * The file as a published version, and its lint warnings. Throws CatalogueBuildError
 * reaction-file-not-readable or reaction-file-has-lint-errors (listing every error).
 */
export function readPublishedVersion(
  reactionPath: string,
  toolkit: Pick<ChemistryToolkit, "readAtoms" | "canonicalStereoSmiles">,
  options: { readonly superseded?: boolean } = {},
): { publishedVersion: PublishedVersion; lintWarnings: LintFinding[] } {
  const reactionDocument = readReactionJson(reactionPath);
  const lintFindings = lintReaction(reactionDocument, toolkit);
  const lintErrors = lintFindings.filter(
    (finding) =>
      finding.lintLevel === "error" &&
      (options.superseded !== true || finding.lintRuleId === "schema-violation"),
  );
  if (lintErrors.length > 0) {
    throw new CatalogueBuildError(
      "reaction-file-has-lint-errors",
      `${reactionPath}: ${lintErrors.map(findingLine).join("; ")}`,
    );
  }
  // No schema violation was found, so the schema holds.
  const reading = readReactionFile(reactionDocument);
  if (!("reactionFile" in reading)) {
    throw new Error(`${reactionPath}: lint-clean but not a reaction file`);
  }
  const { reactionFile } = reading;
  const publishedVersion: PublishedVersion = {
    reactionSlug: reactionFile.reactionSlug,
    reactionVersion: reactionFile.reactionVersion,
    reactionDocument: reactionFile,
    contentHash: contentHashOf(reactionFile),
    sourcePath: reactionPath,
  };
  return { publishedVersion, lintWarnings: lintFindings };
}

/**
 * Throws CatalogueBuildError reaction-version-duplicated or reaction-versions-not-consecutive (a
 * slug's versions must be exactly 1..n).
 */
export function checkVersionNumbering(publishedVersions: readonly PublishedVersion[]): void {
  const slugToVersions = new Map<string, PublishedVersion[]>();
  for (const version of publishedVersions) {
    slugToVersions.set(version.reactionSlug, [
      ...(slugToVersions.get(version.reactionSlug) ?? []),
      version,
    ]);
  }
  for (const [reactionSlug, slugVersions] of [...slugToVersions].sort(([first], [second]) =>
    first < second ? -1 : 1,
  )) {
    const versionNumbers = slugVersions
      .map((version) => version.reactionVersion)
      .sort((first, second) => first - second);
    const duplicated = versionNumbers.find((number, index) => number === versionNumbers[index + 1]);
    if (duplicated !== undefined) {
      const duplicatedPaths = slugVersions
        .filter((version) => version.reactionVersion === duplicated)
        .map((version) => version.sourcePath);
      const duplicatedRef = reactionVersionRef(reactionSlug, duplicated);
      throw new CatalogueBuildError(
        "reaction-version-duplicated",
        `${duplicatedRef} is given twice: ${duplicatedPaths.join(", ")}`,
      );
    }
    if (versionNumbers.some((number, index) => number !== index + 1)) {
      throw new CatalogueBuildError(
        "reaction-versions-not-consecutive",
        `${reactionSlug} has versions [${versionNumbers.join(", ")}]; they must be 1 to ` +
          `${String(versionNumbers.length)} with none missing`,
      );
    }
  }
}

/**
 * The paths whose file is not the newest version of its reaction among `reactionPaths`. A file
 * that cannot be read counts as newest, so readPublishedVersion() reports it.
 */
export function supersededVersionPaths(reactionPaths: readonly string[]): Set<string> {
  const pathToSlugAndVersion = new Map<string, readonly [string, number]>();
  for (const reactionPath of reactionPaths) {
    try {
      const document = readReactionJson(reactionPath);
      pathToSlugAndVersion.set(reactionPath, [
        String(document.reactionSlug),
        Number(document.reactionVersion),
      ]);
    } catch {
      // Reported when the file is read for the build.
    }
  }
  const slugToNewest = new Map<string, number>();
  for (const [slug, version] of pathToSlugAndVersion.values()) {
    slugToNewest.set(slug, Math.max(version, slugToNewest.get(slug) ?? version));
  }
  return new Set(
    [...pathToSlugAndVersion]
      .filter(([, [slug, version]]) => version < (slugToNewest.get(slug) ?? version))
      .map(([reactionPath]) => reactionPath),
  );
}
