/**
 * The Learn page's level cards (SPEC §5 "Learn", decided 2026-11-26, item 11): one card per
 * curriculum level, holding its tracks in code order. A level's rows are its live tracks (in the
 * catalogue) among its planned ones (docs/curriculum.md, copied below as PLANNED_TRACKS: keep it
 * in step with that file). A level with a live track is open; one without is folded.
 *
 * A track from a catalogue built before item 11 has no level or code: it goes under Foundations,
 * after the planned tracks.
 */
import type { Catalogue, CatalogueTrack } from "../catalogue/catalogueReading.js";
import { catalogueTracks } from "../catalogue/catalogueReading.js";
import {
  CURRICULUM_LEVELS,
  CURRICULUM_LEVEL_TO_LETTER,
  type CurriculumLevel,
} from "../trackFiles/trackSchemaViolations.js";

export interface PlannedTrack {
  readonly curriculumCode: string;
  readonly title: string;
}

/** Every track of docs/curriculum.md, in order. */
export const PLANNED_TRACKS: readonly PlannedTrack[] = [
  ["F1", "Curved arrows"],
  ["F2", "Nucleophilic substitution"],
  ["F3", "Elimination"],
  ["F4", "Addition to alkenes"],
  ["F5", "Carbonyl addition"],
  ["F6", "Carboxylic acid derivatives"],
  ["F7", "Electrophilic aromatic substitution"],
  ["C1", "Enols and enolates"],
  ["C2", "Carbonyl condensations"],
  ["C3", "Conjugate addition"],
  ["C4", "Nucleophilic aromatic substitution"],
  ["C5", "Oxidation and reduction"],
  ["C6", "Rearrangements"],
  ["C7", "Radical reactions"],
  ["C8", "Pericyclic reactions I"],
  ["C9", "Mechanisms in biology"],
  ["A1", "Stereoelectronics and conformation"],
  ["A2", "Neighbouring groups"],
  ["A3", "Sigmatropic and named rearrangements"],
  ["A4", "Ylides, carbenes and nitrenes"],
  ["A5", "Heterocycles"],
  ["A6", "Organocatalysis"],
  ["A7", "Protecting groups and chemoselectivity"],
  ["A8", "Pericyclic reactions II"],
  ["A9", "Metal-catalysed reactions"],
  ["G1", "Robinson's tropinone (1917)"],
  ["G2", "Wieland–Miescher ketone"],
  ["G3", "Johnson's progesterone (1971)"],
  ["G4", "Corey's prostaglandin F₂α (1969)"],
  ["G5", "Woodward's reserpine (1956)"],
].map(([curriculumCode = "", title = ""]) => ({ curriculumCode, title }));

const LEVEL_TO_TEXTS: Readonly<
  Record<CurriculumLevel, { title: string; yearText: string; description: string }>
> = {
  foundations: {
    title: "Foundations",
    yearText: "First year",
    description: "Curved arrows and the reactions every later track builds on.",
  },
  core: {
    title: "Core",
    yearText: "Second year",
    description:
      "Enolates, condensations, conjugate addition, rearrangements, radicals and the first " +
      "pericyclic reactions.",
  },
  advanced: {
    title: "Advanced",
    yearText: "Third and fourth year",
    description:
      "Stereoelectronics, named rearrangements, ylides and carbenes, heterocycles, " +
      "organocatalysis, protecting groups, metal catalysis.",
  },
  graduate: {
    title: "Graduate",
    yearText: "Synthesis case studies",
    description:
      "One track per published synthesis: its key steps in order, with the real conditions.",
  },
};

/** A row of a level card: a live track, or a planned one shown as "Coming soon". */
export type LevelRow =
  | { readonly rowKind: "live"; readonly curriculumCode: string; readonly track: CatalogueTrack }
  | { readonly rowKind: "planned"; readonly curriculumCode: string; readonly title: string };

export interface TrackLevel {
  readonly level: CurriculumLevel;
  readonly title: string;
  readonly yearText: string;
  readonly description: string;
  /** The first letter of the level's codes, shown as its badge. */
  readonly letter: string;
  /** Live and planned tracks in code order; live tracks without a planned code last. */
  readonly rows: readonly LevelRow[];
  /** True when the level holds a live track. */
  readonly isOpen: boolean;
}

function rowsOf(level: CurriculumLevel, tracks: readonly CatalogueTrack[]): LevelRow[] {
  const letter = CURRICULUM_LEVEL_TO_LETTER[level];
  const isInLevel = (track: CatalogueTrack): boolean => (track.level ?? "foundations") === level;
  const levelTracks = tracks.filter(isInLevel);
  const planned = PLANNED_TRACKS.filter((plan) => plan.curriculumCode.startsWith(letter));
  const plannedRows = planned.map((plan): LevelRow => {
    const track = levelTracks.find((candidate) => candidate.curriculumCode === plan.curriculumCode);
    return track === undefined
      ? { rowKind: "planned", ...plan }
      : { rowKind: "live", curriculumCode: plan.curriculumCode, track };
  });
  const plannedCodes = new Set(planned.map((plan) => plan.curriculumCode));
  const unplannedRows = levelTracks
    .filter((track) => !plannedCodes.has(track.curriculumCode ?? ""))
    .map((track): LevelRow => ({
      rowKind: "live",
      curriculumCode: track.curriculumCode ?? "",
      track,
    }));
  return [...plannedRows, ...unplannedRows];
}

/** The four levels in curriculum order, each with its rows. */
export function trackLevels(catalogue: Catalogue): TrackLevel[] {
  const tracks = catalogueTracks(catalogue);
  return CURRICULUM_LEVELS.map((level) => {
    const rows = rowsOf(level, tracks);
    return {
      level,
      ...LEVEL_TO_TEXTS[level],
      letter: CURRICULUM_LEVEL_TO_LETTER[level],
      rows,
      isOpen: rows.some((row) => row.rowKind === "live"),
    };
  });
}
