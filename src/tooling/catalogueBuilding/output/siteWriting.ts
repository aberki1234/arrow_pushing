/**
 * Write the built static files into an output folder that must be new or empty.
 *
 * Files written (paths relative to the output folder)
 *   catalogue.json                    the catalogue, 2-space JSON for people reading it
 *   r/<slug>/<version>.<hash 8>.json  each published version's canonical JSON bytes
 *   t/<track slug>/figures/<name>.svg each concept figure, copied as it is
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { BuiltCatalogue } from "../assembly/catalogueAssembly.js";
import { CatalogueBuildError } from "../naming/catalogueBuildErrors.js";
import type { PublishedVersion } from "../assembly/publishedVersions.js";
import { canonicalJsonBytes, reactionFilePath } from "../naming/staticFileNaming.js";
import type { ConceptFigureCopy } from "../assembly/trackCompiling.js";

const CATALOGUE_FILE_NAME = "catalogue.json";

/**
 * Throws CatalogueBuildError output-folder-not-empty unless the folder is new or empty, so a
 * build never mixes its files with an older build's.
 */
export function checkOutputFolderUsable(outputFolder: string): void {
  if (
    existsSync(outputFolder) &&
    (!statSync(outputFolder).isDirectory() || readdirSync(outputFolder).length > 0)
  ) {
    throw new CatalogueBuildError(
      "output-folder-not-empty",
      `${outputFolder} already exists and is not an empty folder`,
    );
  }
}

/** Write the catalogue, every published version's file and every concept figure. */
export function writeSite(
  outputFolder: string,
  catalogue: BuiltCatalogue,
  publishedVersions: readonly PublishedVersion[],
  conceptFigureCopies: readonly ConceptFigureCopy[] = [],
): void {
  checkOutputFolderUsable(outputFolder);
  for (const figure of conceptFigureCopies) {
    const sitePath = join(outputFolder, figure.sitePath);
    mkdirSync(dirname(sitePath), { recursive: true });
    copyFileSync(figure.sourcePath, sitePath);
  }
  for (const version of publishedVersions) {
    const filePath = join(
      outputFolder,
      reactionFilePath(version.reactionSlug, version.reactionVersion, version.contentHash),
    );
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, canonicalJsonBytes(version.reactionDocument));
  }
  writeFileSync(
    join(outputFolder, CATALOGUE_FILE_NAME),
    `${JSON.stringify(catalogue, null, 2)}\n`,
    "utf-8",
  );
}
