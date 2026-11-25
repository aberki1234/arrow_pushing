/**
 * Check a track file against the track schema (schema/track.schema.json).
 *
 * Terms (docs/schema-design.md §0)
 *   track          A top-level Learn path: ordered problem sets, one file per track,
 *                  content/tracks/<trackSlug>.json.
 *   problem set    An authored, ordered list of set items teaching one concept, opened by a
 *                  concept card. A checkpoint is the problem set that ends a track.
 *   set item       A reaction slug (always its latest published version) and why it is there.
 *   track document One track file, parsed from JSON.
 */
import { Ajv2020 } from "ajv/dist/2020.js";
import trackSchemaJson from "../../schema/track.schema.json";
import {
  schemaViolationsFromErrors,
  type SchemaViolation,
} from "../reactionFiles/schemaViolations.js";

export interface SetItem {
  readonly reactionSlug: string;
  readonly whyThisOne: string;
}

export interface ProblemSet {
  readonly problemSetSlug: string;
  readonly title: string;
  readonly conceptInOneLine: string;
  /** Paragraphs in a small Markdown subset (docs/schema-design.md §6.1). */
  readonly conceptCard: string;
  /** SVG files relative to the track file's folder, e.g. "figures/arenium-ion.svg". */
  readonly conceptFigurePaths?: readonly string[];
  readonly checkpoint: boolean;
  readonly setItems: readonly SetItem[];
}

export interface TrackDocument {
  readonly formatVersion: 1;
  readonly trackSlug: string;
  readonly title: string;
  readonly goal: string;
  readonly problemSets: readonly ProblemSet[];
}

/** The track schema; the catalogue schema refers to its problem set. */
export const trackSchema: object = trackSchemaJson;

// allErrors: report every violation, not only the first.
const validateTrack = new Ajv2020({ allErrors: true }).compile(trackSchema);

/** Every schema violation in the document, sorted by instance path; empty if it is valid. */
export function trackSchemaViolations(trackDocument: unknown): SchemaViolation[] {
  if (validateTrack(trackDocument)) {
    return [];
  }
  return schemaViolationsFromErrors(validateTrack.errors ?? []);
}
