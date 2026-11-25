/**
 * Compile the track files into the catalogue's `tracks` (docs/schema-design.md §6.1).
 *
 * Steps
 *   1. readTrackFolder(): read every *.json in the tracks folder, lint it (lint errors refuse the
 *      build, warnings are printed) and list the concept figures to copy.
 *   2. compileTracks(): leave out set items whose reaction is not published, then problem sets
 *      left with no set item, then tracks left with no problem set; sort the tracks by slug.
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { type CatalogueTrack, conceptFigureFilePath } from "../catalogue/catalogueReading.js";
import { lintTrackFile } from "../reactionLinting/trackFileLint.js";
import type { ProblemSet, TrackDocument } from "../trackFiles/trackSchemaViolations.js";
import { CatalogueBuildError } from "./catalogueBuildErrors.js";

/** A concept figure: the file to read and its path in the built site. */
export interface ConceptFigureCopy {
  readonly sourcePath: string;
  readonly sitePath: string;
}

export interface ReadTracks {
  readonly trackDocuments: readonly TrackDocument[];
  readonly conceptFigureCopies: readonly ConceptFigureCopy[];
}

function compareText(first: string, second: string): number {
  if (first === second) {
    return 0;
  }
  return first < second ? -1 : 1;
}

/** The problem set with only its published set items, or null if none is published. */
function publishedPart(
  problemSet: ProblemSet,
  publishedReactionSlugs: ReadonlySet<string>,
): ProblemSet | null {
  const setItems = problemSet.setItems.filter((setItem) =>
    publishedReactionSlugs.has(setItem.reactionSlug),
  );
  return setItems.length === 0 ? null : { ...problemSet, setItems };
}

/**
 * The tracks as the catalogue holds them. Throws CatalogueBuildError track-slug-duplicated when
 * two track files share a slug.
 */
export function compileTracks(
  trackDocuments: readonly TrackDocument[],
  publishedReactionSlugs: ReadonlySet<string>,
): CatalogueTrack[] {
  const seenTrackSlugs = new Set<string>();
  const tracks: CatalogueTrack[] = [];
  for (const { trackSlug, title, goal, problemSets: authoredProblemSets } of trackDocuments) {
    if (seenTrackSlugs.has(trackSlug)) {
      throw new CatalogueBuildError(
        "track-slug-duplicated",
        `two track files are called ${trackSlug}`,
      );
    }
    seenTrackSlugs.add(trackSlug);
    // The catalogue has its own format version, so the track's is not copied.
    const problemSets = authoredProblemSets
      .map((problemSet) => publishedPart(problemSet, publishedReactionSlugs))
      .filter((problemSet) => problemSet !== null);
    if (problemSets.length > 0) {
      tracks.push({ trackSlug, title, goal, problemSets });
    }
  }
  return tracks.sort((first, second) => compareText(first.trackSlug, second.trackSlug));
}

function conceptFigureCopies(track: TrackDocument, tracksFolder: string): ConceptFigureCopy[] {
  return track.problemSets.flatMap((problemSet) =>
    (problemSet.conceptFigurePaths ?? []).map((figurePath) => ({
      sourcePath: join(tracksFolder, figurePath),
      sitePath: conceptFigureFilePath(track.trackSlug, figurePath),
    })),
  );
}

/** One track file, linted; throws on a file that cannot be read or has a lint error. */
function readTrackFile(
  trackPath: string,
  publishedReactionSlugs: ReadonlySet<string>,
  printLine: (line: string) => void,
): TrackDocument {
  const { trackDocument, lintFindings } = lintTrackFile(trackPath, publishedReactionSlugs);
  const errors = lintFindings.filter((finding) => finding.lintLevel === "error");
  if (errors.some((finding) => finding.lintRuleId === "file-not-readable")) {
    throw new CatalogueBuildError(
      "track-file-not-readable",
      `${trackPath}: ${errors[0]?.message ?? ""}`,
    );
  }
  if (errors.length > 0 || trackDocument === null) {
    const places = errors.map(
      (finding) => `${finding.lintRuleId} at ${finding.instancePath || "/"}`,
    );
    throw new CatalogueBuildError(
      "track-file-has-lint-errors",
      `${trackPath}: ${places.join(", ")}`,
    );
  }
  for (const finding of lintFindings) {
    printLine(
      `${trackPath}: ${finding.lintLevel} ${finding.lintRuleId} at ` +
        `${finding.instancePath || "/"}: ${finding.message}`,
    );
  }
  return trackDocument;
}

/**
 * Every track file in `tracksFolder` (none if the folder does not exist), linted against
 * `publishedReactionSlugs`. Throws CatalogueBuildError track-file-not-readable or
 * track-file-has-lint-errors; prints each warning with `printLine`.
 */
export function readTrackFolder(
  tracksFolder: string,
  publishedReactionSlugs: ReadonlySet<string>,
  printLine: (line: string) => void,
): ReadTracks {
  if (!existsSync(tracksFolder)) {
    return { trackDocuments: [], conceptFigureCopies: [] };
  }
  const trackPaths = readdirSync(tracksFolder)
    .filter((name) => name.endsWith(".json"))
    .sort(compareText)
    .map((name) => join(tracksFolder, name));
  const trackDocuments = trackPaths.map((trackPath) =>
    readTrackFile(trackPath, publishedReactionSlugs, printLine),
  );
  return {
    trackDocuments,
    conceptFigureCopies: trackDocuments.flatMap((track) =>
      conceptFigureCopies(track, tracksFolder),
    ),
  };
}
