/**
 * Write the built static files into an output folder that must be new or empty.
 *
 * Files written (paths relative to the output folder)
 *   catalogue.json                    the catalogue, 2-space JSON for people reading it
 *   r/<slug>/<version>.<hash 8>.json  each published version's canonical JSON bytes
 */
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { BuiltCatalogue } from "./catalogueAssembly.js";
import { CatalogueBuildError } from "./catalogueBuildErrors.js";
import type { PublishedVersion } from "./publishedVersions.js";
import { canonicalJsonBytes, reactionFilePath } from "./staticFileNaming.js";

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

/** Write the catalogue and every published version's file. */
export function writeSite(
  outputFolder: string,
  catalogue: BuiltCatalogue,
  publishedVersions: readonly PublishedVersion[],
): void {
  checkOutputFolderUsable(outputFolder);
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
