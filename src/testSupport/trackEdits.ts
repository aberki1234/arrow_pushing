/**
 * The example track (fixtures/tracks/first-mechanisms.json) and the edit cases of
 * fixtures/lint_cases/track_edits.json, which make it break track lint rules.
 */
import { join } from "node:path";
import { type Catalogue, readCatalogue } from "../catalogue/catalogueReading.js";
import {
  fixtureCaseEntries,
  fixturesFolderPath,
  isRecord,
  readFixtureJson,
} from "./fixtureFiles.js";
import { applyReactionEdits } from "./reactionEdits.js";

export interface TrackEditCase {
  readonly caseName: string;
  readonly edits: readonly Record<string, unknown>[];
  readonly expectedLintRuleIds: readonly string[];
}

/** The folder holding the example track file and its figures. */
export function exampleTracksFolder(): string {
  return join(fixturesFolderPath(), "tracks");
}

/** A fresh copy of the example track document. */
export function exampleTrack(): Record<string, unknown> {
  const document = readFixtureJson("tracks/first-mechanisms.json");
  if (!isRecord(document)) {
    throw new Error("tracks/first-mechanisms.json must hold a JSON object");
  }
  return document;
}

/** The slugs of the four example reactions: the published reactions of the track tests. */
export const EXAMPLE_REACTION_SLUGS: ReadonlySet<string> = new Set([
  "aldol-addition-base",
  "radical-bromination-methane",
  "sn2-hydroxide-bromomethane",
  "wittig-methylenation-cyclohexanone",
]);

export function trackEditCases(): TrackEditCase[] {
  return fixtureCaseEntries("lint_cases/track_edits.json", "cases").map((entry) => {
    const { caseName, edits, expectedLintRuleIds } = entry;
    if (
      typeof caseName !== "string" ||
      !Array.isArray(edits) ||
      !edits.every(isRecord) ||
      !Array.isArray(expectedLintRuleIds) ||
      !expectedLintRuleIds.every((ruleId) => typeof ruleId === "string")
    ) {
      throw new Error(`malformed track lint case ${JSON.stringify(caseName)}`);
    }
    return { caseName, edits, expectedLintRuleIds };
  });
}

/** The example track with the edits of one case applied. */
export function editedTrack(caseName: string): Record<string, unknown> {
  const editCase = trackEditCases().find((candidate) => candidate.caseName === caseName);
  if (editCase === undefined) {
    throw new Error(`no track lint case "${caseName}"`);
  }
  return applyReactionEdits(exampleTrack(), editCase.edits);
}

/**
 * A catalogue holding the four example reactions (version 1, stand-in hashes) and the example
 * track as the catalogue build compiles it (every reaction published, so nothing left out).
 */
export function exampleLearnCatalogue(): Catalogue {
  // The catalogue's track is the track file without its format version.
  const track = Object.fromEntries(
    Object.entries(exampleTrack()).filter(([key]) => key !== "formatVersion"),
  );
  const slugToTitle: Record<string, string> = {
    "aldol-addition-base": "Aldol addition",
    "radical-bromination-methane": "Radical bromination",
    "sn2-hydroxide-bromomethane": "SN2 substitution",
    "wittig-methylenation-cyclohexanone": "Wittig reaction",
  };
  return readCatalogue({
    formatVersion: 1,
    builtAt: "2026-12-01T10:00:00Z",
    reactions: Object.entries(slugToTitle).map(([reactionSlug, title]) => ({
      reactionSlug,
      latestReactionVersion: 1,
      reactionVersionToContentHash: { "1": "0".repeat(64) },
      title,
      subtitle: null,
      reactionClasses: ["substitution"],
      difficultyTier: 1,
      dailyPuzzleEligible: true,
    })),
    tracks: [track],
    dateToDailyReactionVersionRef: {},
  });
}
