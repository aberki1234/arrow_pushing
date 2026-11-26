/**
 * The example track (fixtures/tracks/first-mechanisms.json) and the edit cases of
 * fixtures/lint_cases/track_edits.json, which make it break track lint rules.
 */
import { join } from "node:path";
import { type Catalogue, readCatalogue } from "../catalogue/catalogueReading.js";
import {
  exampleReactionDocuments,
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

/** The drawing fields of an example reaction's state, as the catalogue holds them. */
function schemeStateOf(
  document: Record<string, unknown>,
  stateId: string,
): Record<string, unknown> {
  const stateIdToState = document["stateIdToState"];
  const state = isRecord(stateIdToState) ? stateIdToState[stateId] : undefined;
  if (!isRecord(state)) {
    throw new Error(`the example reaction has no state ${stateId}`);
  }
  return {
    mappedSmiles: state["mappedSmiles"],
    mapNumberToCoordinates: state["mapNumberToCoordinates"],
  };
}

/** What an example reaction's card draws: its conditions and its start state. */
function exampleSchemeFields(reactionSlug: string): Record<string, unknown> {
  const document = exampleReactionDocuments().find(
    ([name]) => name === `${reactionSlug}.json`,
  )?.[1];
  if (document === undefined) {
    throw new Error(`no example reaction ${reactionSlug}`);
  }
  return {
    conditionsLabel: document["conditionsLabel"],
    startState: schemeStateOf(document, String(document["startStateId"])),
  };
}

/**
 * A catalogue holding the four example reactions (version 1, stand-in hashes, with what their
 * cards draw) and the example track as the catalogue build compiles it (every reaction
 * published, so nothing left out; its showcase, the SN2, ends at its "products" state).
 */
export function exampleLearnCatalogue(): Catalogue {
  // The catalogue's track is the track file without its format version.
  const sn2 = exampleReactionDocuments().find(
    ([name]) => name === "sn2-hydroxide-bromomethane.json",
  )?.[1];
  const track = {
    ...Object.fromEntries(
      Object.entries(exampleTrack()).filter(([key]) => key !== "formatVersion"),
    ),
    showcaseProductState: sn2 === undefined ? undefined : schemeStateOf(sn2, "products"),
  };
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
      ...exampleSchemeFields(reactionSlug),
    })),
    tracks: [track],
    dateToDailyReactionVersionRef: {},
  });
}
