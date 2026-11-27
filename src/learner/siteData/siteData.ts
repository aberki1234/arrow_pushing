/**
 * Loading the learner site's static data: catalogue.json and the content-hashed reaction files
 * (written by the catalogue build, docs/schema-design.md section 6). Fetching is passed in, so
 * tests need no network.
 */
import {
  type Catalogue,
  readCatalogue,
  reactionFilePath,
} from "../../core/catalogue/catalogueReading.js";
import { reactionVersionRef as refOfVersion } from "../../core/catalogue/reactionVersionRefs.js";
import type { ReactionFile } from "../../core/reactionFiles/reactionFile.js";
import { readReactionFile } from "../../core/reactionFiles/reactionFileReading.js";

export const CATALOGUE_PATH = "catalogue.json";

/** Reads the JSON at a path relative to the site root. */
export type JsonFetcher = (sitePath: string) => Promise<unknown>;

export type SiteDataErrorCode =
  "not-found" | "unknown-reaction-version" | "invalid-catalogue" | "invalid-reaction-file";

/** Data the site could not load; `errorCode` says why, the message is for people. */
export class SiteDataError extends Error {
  readonly errorCode: SiteDataErrorCode;

  constructor(errorCode: SiteDataErrorCode, message: string) {
    super(message);
    this.name = "SiteDataError";
    this.errorCode = errorCode;
  }
}

/** The browser's fetch, failing with not-found on any HTTP error. */
export const fetchSiteJson: JsonFetcher = async (sitePath) => {
  const response = await fetch(sitePath);
  if (!response.ok) {
    throw new SiteDataError("not-found", `${sitePath}: HTTP ${String(response.status)}`);
  }
  return (await response.json()) as unknown;
};

export async function loadCatalogue(fetcher: JsonFetcher): Promise<Catalogue> {
  const catalogueDocument = await fetcher(CATALOGUE_PATH);
  try {
    return readCatalogue(catalogueDocument);
  } catch (error) {
    throw new SiteDataError("invalid-catalogue", String(error));
  }
}

/** The reaction file of `reactionVersionRef`, schema-checked, its slug and version matching. */
export async function loadReactionFile(
  fetcher: JsonFetcher,
  catalogue: Catalogue,
  reactionVersionRef: string,
): Promise<ReactionFile> {
  const filePath = reactionFilePath(catalogue, reactionVersionRef);
  if (filePath === null) {
    throw new SiteDataError(
      "unknown-reaction-version",
      `the catalogue has no reaction version ${reactionVersionRef}`,
    );
  }
  const reading = readReactionFile(await fetcher(filePath));
  if (!("reactionFile" in reading)) {
    const places = reading.schemaViolations.map((violation) => violation.instancePath || "/");
    throw new SiteDataError(
      "invalid-reaction-file",
      `${filePath} is not a valid reaction file: ${places.join(", ")}`,
    );
  }
  const { reactionFile } = reading;
  const fileRef = refOfVersion(reactionFile.reactionSlug, reactionFile.reactionVersion);
  if (fileRef !== reactionVersionRef) {
    throw new SiteDataError(
      "invalid-reaction-file",
      `${filePath} holds ${fileRef}, not ${reactionVersionRef}`,
    );
  }
  return reactionFile;
}
