/**
 * Tests for trackLevels.ts: the Learn page's level cards (SPEC §5 "Learn", item 11). The
 * catalogue tracks are stand-ins with only the keys the grouping reads; the planned tracks are
 * those of docs/curriculum.md.
 */
import { expect, it } from "vitest";
import type { Catalogue, CatalogueTrack } from "../../core/catalogue/catalogueReading.js";
import { PLANNED_TRACKS, type LevelRow, trackLevels } from "./trackLevels.js";

function standInTrack(
  trackSlug: string,
  changedKeys: Partial<CatalogueTrack> = {},
): CatalogueTrack {
  return {
    trackSlug,
    title: trackSlug,
    goal: "A goal.",
    level: "foundations",
    curriculumCode: "F1",
    problemSets: [],
    ...changedKeys,
  };
}

function catalogueWith(tracks: readonly CatalogueTrack[]): Catalogue {
  return {
    formatVersion: 1,
    builtAt: "2026-12-01T10:00:00Z",
    reactions: [],
    tracks,
    dateToDailyReactionVersionRef: {},
  };
}

/** Each row as its curriculum code and whether it is live. */
function rowCodes(rows: readonly LevelRow[]): string[] {
  return rows.map((row) =>
    row.rowKind === "live" ? `${row.curriculumCode} live` : `${row.curriculumCode} planned`,
  );
}

it("the four levels come in curriculum order with their names and years", () => {
  const levels = trackLevels(catalogueWith([]));
  expect(levels.map((level) => [level.level, level.title, level.yearText, level.letter])).toEqual([
    ["foundations", "Foundations", "First year", "F"],
    ["core", "Core", "Second year", "C"],
    ["advanced", "Advanced", "Third and fourth year", "A"],
    ["graduate", "Graduate", "Synthesis case studies", "G"],
  ]);
});

it("a level's live tracks sit among its planned ones in code order", () => {
  const [foundations] = trackLevels(
    catalogueWith([
      standInTrack("electrophilic-aromatic-substitution", { curriculumCode: "F7" }),
      standInTrack("curved-arrows", { curriculumCode: "F1" }),
    ]),
  );
  expect(rowCodes(foundations?.rows ?? [])).toEqual([
    "F1 live",
    "F2 planned",
    "F3 planned",
    "F4 planned",
    "F5 planned",
    "F6 planned",
    "F7 live",
  ]);
  expect(foundations?.isOpen).toBe(true);
});

it("a level without a live track is folded and lists its planned tracks", () => {
  const core = trackLevels(catalogueWith([standInTrack("curved-arrows")]))[1];
  expect(core?.isOpen).toBe(false);
  expect(core?.rows.every((row) => row.rowKind === "planned")).toBe(true);
  expect(core?.rows[0]).toEqual({
    rowKind: "planned",
    curriculumCode: "C1",
    title: "Enols and enolates",
  });
});

it("a live track keeps its catalogue entry in its row", () => {
  const track = standInTrack("curved-arrows");
  const [foundations] = trackLevels(catalogueWith([track]));
  expect(foundations?.rows[0]).toEqual({ rowKind: "live", curriculumCode: "F1", track });
});

it("a live track whose code is not in the plan still shows, after the planned ones", () => {
  const [foundations] = trackLevels(
    catalogueWith([standInTrack("extra", { curriculumCode: "F12" })]),
  );
  expect(rowCodes(foundations?.rows ?? []).at(-1)).toBe("F12 live");
});

it("a track from a catalogue built before item 11 goes under Foundations, after the plan", () => {
  const { level, curriculumCode, ...olderTrack } = standInTrack("older");
  expect([level, curriculumCode]).toEqual(["foundations", "F1"]);
  const [foundations] = trackLevels(catalogueWith([olderTrack]));
  expect(foundations?.rows.at(-1)).toEqual({
    rowKind: "live",
    curriculumCode: "",
    track: olderTrack,
  });
});

it("the planned tracks are the curriculum's, each code once", () => {
  const codes = PLANNED_TRACKS.map((planned) => planned.curriculumCode);
  expect(codes.slice(0, 7)).toEqual(["F1", "F2", "F3", "F4", "F5", "F6", "F7"]);
  expect(new Set(codes).size).toBe(codes.length);
  expect(codes).toHaveLength(7 + 9 + 9 + 5);
});
