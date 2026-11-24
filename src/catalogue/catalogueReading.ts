/**
 * Reading catalogue.json in the learner site: today's daily puzzle and where a reaction
 * version's static file is.
 *
 * catalogue.json is written by the catalogue build (python/catalogue_building) and has the shape
 * of schema/catalogue.schema.json; docs/schema-design.md section 6.
 *
 * Terms
 *   reaction version ref  "<reaction slug>@<reaction version>", e.g. "aldol-addition-base@3".
 *   local date            The learner's calendar date, "YYYY-MM-DD" in their own time zone: the
 *                         daily puzzle changes at each learner's own midnight.
 *   reaction file path    "r/<slug>/<version>.<first 8 hex of the content hash>.json", relative to
 *                         the site root.
 */
import { Ajv2020 } from "ajv/dist/2020.js";
import catalogueSchemaJson from "../../schema/catalogue.schema.json";
import {
  schemaViolationsFromErrors,
  type SchemaViolation,
} from "../reactionFiles/schemaViolations.js";

export interface CatalogueEntry {
  readonly reactionSlug: string;
  readonly latestReactionVersion: number;
  readonly reactionVersionToContentHash: Readonly<Record<string, string>>;
  readonly title: string;
  readonly subtitle: string | null;
  readonly reactionClasses: readonly string[];
  readonly difficultyTier: number;
  readonly dailyPuzzleEligible: boolean;
}

export interface Catalogue {
  readonly formatVersion: 1;
  readonly builtAt: string;
  readonly reactions: readonly CatalogueEntry[];
  readonly dateToDailyReactionVersionRef: Readonly<Record<string, string>>;
}

const CONTENT_HASH_CHARACTERS_IN_FILE_NAME = 8;
// The slug pattern of docs/schema-design.md section 1, then "@" and a version from 1.
const reactionVersionRefPattern = /^([a-z0-9]+(?:-[a-z0-9]+)*)@([1-9][0-9]*)$/;

// allErrors: report every violation, not only the first, as the Python build does.
const validateCatalogue = new Ajv2020({ allErrors: true }).compile(catalogueSchemaJson);

/** Every schema violation in the document, sorted by instance path; empty if it is valid. */
export function catalogueSchemaViolations(catalogueDocument: unknown): SchemaViolation[] {
  if (validateCatalogue(catalogueDocument)) {
    return [];
  }
  return schemaViolationsFromErrors(validateCatalogue.errors ?? []);
}

/** The document as a Catalogue; throws an Error listing the violations if it is not valid. */
export function readCatalogue(catalogueDocument: unknown): Catalogue {
  const violations = catalogueSchemaViolations(catalogueDocument);
  if (violations.length > 0) {
    const violationLines = violations.map(
      (violation) => `${violation.instancePath || "/"}: ${violation.message}`,
    );
    throw new Error(`catalogue.json is not valid: ${violationLines.join("; ")}`);
  }
  return catalogueDocument as Catalogue;
}

/** The learner's local date of `moment` as "YYYY-MM-DD". */
export function localDateText(moment: Date): string {
  const year = String(moment.getFullYear()).padStart(4, "0");
  const month = String(moment.getMonth() + 1).padStart(2, "0");
  const day = String(moment.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** The value under `key` only if it is the object's own key (not "constructor", say). */
function ownValue(record: Readonly<Record<string, string>>, key: string): string | null {
  return Object.hasOwn(record, key) ? (record[key] ?? null) : null;
}

/** The daily puzzle's reaction version ref on `localDate`, or null outside the calendar. */
export function dailyReactionVersionRefForDate(
  catalogue: Catalogue,
  localDate: string,
): string | null {
  return ownValue(catalogue.dateToDailyReactionVersionRef, localDate);
}

/** The static file of a reaction version ref, or null if the catalogue does not hold it. */
export function reactionFilePath(catalogue: Catalogue, reactionVersionRef: string): string | null {
  const refMatch = reactionVersionRefPattern.exec(reactionVersionRef);
  if (refMatch === null) {
    return null;
  }
  const [, reactionSlug = "", versionText = ""] = refMatch;
  const entry = catalogue.reactions.find((candidate) => candidate.reactionSlug === reactionSlug);
  const contentHash = entry && ownValue(entry.reactionVersionToContentHash, versionText);
  if (!contentHash) {
    return null;
  }
  const shortHash = contentHash.slice(0, CONTENT_HASH_CHARACTERS_IN_FILE_NAME);
  return `r/${reactionSlug}/${versionText}.${shortHash}.json`;
}
