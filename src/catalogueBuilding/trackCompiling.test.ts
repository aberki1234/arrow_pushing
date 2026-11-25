/**
 * Tests for trackCompiling.ts on the example track (fixtures/tracks/first-mechanisms.json):
 * polar-steps holds sn2 and aldol, radical-chain holds the radical bromination, and the
 * checkpoint holds the radical bromination and sn2. Expected results are worked out by hand from
 * the compile rules in docs/schema-design.md §6.1.
 */
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import type { TrackDocument } from "../trackFiles/trackSchemaViolations.js";
import { newTemporaryFolder } from "../testSupport/reactionCopies.js";
import {
  EXAMPLE_REACTION_SLUGS,
  exampleTrack,
  exampleTracksFolder,
} from "../testSupport/trackEdits.js";
import { CatalogueBuildError } from "./catalogueBuildErrors.js";
import { compileTracks, readTrackFolder } from "./trackCompiling.js";

const SN2_SLUG = "sn2-hydroxide-bromomethane";
const RADICAL_SLUG = "radical-bromination-methane";

function exampleTrackDocument(changedKeys: Record<string, unknown> = {}): TrackDocument {
  return { ...exampleTrack(), ...changedKeys } as unknown as TrackDocument;
}

function publishedExcept(...slugs: string[]): Set<string> {
  return new Set([...EXAMPLE_REACTION_SLUGS].filter((slug) => !slugs.includes(slug)));
}

/** [problem set slug, its reaction slugs] for each problem set of the track. */
function problemSetSlugsAndItems(track: {
  problemSets: TrackDocument["problemSets"];
}): [string, string[]][] {
  return track.problemSets.map((problemSet) => [
    problemSet.problemSetSlug,
    problemSet.setItems.map((setItem) => setItem.reactionSlug),
  ]);
}

it("with every reaction published, a track is the file without its format version", () => {
  const { formatVersion, ...expectedTrack } = exampleTrackDocument();
  expect(formatVersion).toBe(1);
  expect(compileTracks([exampleTrackDocument()], EXAMPLE_REACTION_SLUGS)).toEqual([expectedTrack]);
});

it("set items whose reaction is not published are left out", () => {
  const [track] = compileTracks([exampleTrackDocument()], publishedExcept(SN2_SLUG));
  expect(track && problemSetSlugsAndItems(track)).toEqual([
    ["polar-steps", ["aldol-addition-base"]],
    ["radical-chain", [RADICAL_SLUG]],
    ["first-checkpoint", [RADICAL_SLUG]],
  ]);
});

it("a problem set left with no set item is hidden", () => {
  const [track] = compileTracks([exampleTrackDocument()], publishedExcept(RADICAL_SLUG));
  expect(track && problemSetSlugsAndItems(track)).toEqual([
    ["polar-steps", [SN2_SLUG, "aldol-addition-base"]],
    ["first-checkpoint", [SN2_SLUG]],
  ]);
});

it("a track left with no problem set is hidden", () => {
  expect(compileTracks([exampleTrackDocument()], new Set())).toEqual([]);
});

it("tracks are sorted by slug", () => {
  const tracks = compileTracks(
    [exampleTrackDocument({ trackSlug: "zeta" }), exampleTrackDocument({ trackSlug: "alpha" })],
    EXAMPLE_REACTION_SLUGS,
  );
  expect(tracks.map((track) => track.trackSlug)).toEqual(["alpha", "zeta"]);
});

it("two tracks with one slug refuse the build", () => {
  const compileTwice = (): unknown =>
    compileTracks([exampleTrackDocument(), exampleTrackDocument()], EXAMPLE_REACTION_SLUGS);
  expect(compileTwice).toThrow(CatalogueBuildError);
  expect(compileTwice).toThrow(/first-mechanisms/);
  try {
    compileTwice();
  } catch (error) {
    expect((error as CatalogueBuildError).errorCode).toBe("track-slug-duplicated");
  }
});

/** A tracks folder holding the example track (edited by `changedKeys`) and its figure. */
function tracksFolderCopy(changedKeys: Record<string, unknown> = {}): string {
  const tracksFolder = join(newTemporaryFolder("tracks"), "tracks");
  mkdirSync(join(tracksFolder, "figures"), { recursive: true });
  copyFileSync(
    join(exampleTracksFolder(), "figures", "curved-arrow.svg"),
    join(tracksFolder, "figures", "curved-arrow.svg"),
  );
  writeFileSync(
    join(tracksFolder, "first-mechanisms.json"),
    JSON.stringify({ ...exampleTrack(), ...changedKeys }),
  );
  return tracksFolder;
}

function errorCodeOf(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    if (error instanceof CatalogueBuildError) {
      return error.errorCode;
    }
    throw error;
  }
  return "no error";
}

it("reading the example tracks folder gives the track and its figure's site path", () => {
  const printedLines: string[] = [];
  const tracksFolder = tracksFolderCopy();
  const readTracks = readTrackFolder(tracksFolder, EXAMPLE_REACTION_SLUGS, (line) =>
    printedLines.push(line),
  );
  expect(readTracks.trackDocuments.map((track) => track.trackSlug)).toEqual(["first-mechanisms"]);
  expect(readTracks.conceptFigureCopies).toEqual([
    {
      sourcePath: join(tracksFolder, "figures", "curved-arrow.svg"),
      sitePath: "t/first-mechanisms/figures/curved-arrow.svg",
    },
  ]);
  expect(printedLines).toEqual([]);
});

it("a tracks folder that does not exist holds no tracks", () => {
  const missingFolder = join(newTemporaryFolder("tracks"), "absent");
  expect(readTrackFolder(missingFolder, EXAMPLE_REACTION_SLUGS, () => undefined)).toEqual({
    trackDocuments: [],
    conceptFigureCopies: [],
  });
});

it("lint warnings are printed with the file and do not refuse", () => {
  const printedLines: string[] = [];
  readTrackFolder(tracksFolderCopy(), publishedExcept("aldol-addition-base"), (line) =>
    printedLines.push(line),
  );
  expect(printedLines).toHaveLength(1);
  expect(printedLines[0]).toMatch(
    /first-mechanisms\.json: warning set-item-not-published at \/problemSets\/0\/setItems\/1/,
  );
});

it("a lint error refuses the build", () => {
  const tracksFolder = tracksFolderCopy({ goal: "" });
  expect(errorCodeOf(() => readTrackFolder(tracksFolder, EXAMPLE_REACTION_SLUGS, () => {}))).toBe(
    "track-file-has-lint-errors",
  );
});

it("a missing concept figure refuses the build", () => {
  const figurelessFolder = newTemporaryFolder("tracks");
  writeFileSync(join(figurelessFolder, "first-mechanisms.json"), JSON.stringify(exampleTrack()));
  expect(
    errorCodeOf(() => readTrackFolder(figurelessFolder, EXAMPLE_REACTION_SLUGS, () => {})),
  ).toBe("track-file-has-lint-errors");
});

it("a file that is not JSON refuses the build", () => {
  const tracksFolder = tracksFolderCopy();
  writeFileSync(join(tracksFolder, "broken.json"), "{ not json");
  expect(errorCodeOf(() => readTrackFolder(tracksFolder, EXAMPLE_REACTION_SLUGS, () => {}))).toBe(
    "track-file-not-readable",
  );
});
