/**
 * The practice page's list (decided 2026-11-25, item 7c): one card per catalogue reaction with the
 * learner's mastery, filtered by type (reaction class), difficulty and status, and searched by
 * title and subtitle. The filters live in the URL hash ("#/practice?type=carbonyl&status=new").
 *
 * Status: new (never finished), practised (finished, not mastered), mastered.
 */
import type { Catalogue } from "../../core/catalogue/catalogueReading.js";
import { MASTERED_PERCENT, type ReactionMastery } from "./reactionMastery.js";

export type PracticeStatus = "new" | "practised" | "mastered";

export interface PracticeFilters {
  readonly reactionClass: string | null;
  readonly difficultyTier: number | null;
  readonly practiceStatus: PracticeStatus | null;
  readonly searchText: string;
}

export interface PracticeCard {
  readonly reactionSlug: string;
  readonly reactionVersionRef: string;
  readonly title: string;
  readonly subtitle: string;
  readonly reactionClasses: readonly string[];
  readonly difficultyTier: number;
  readonly practiceStatus: PracticeStatus;
  /** null for a reaction never finished. */
  readonly masteryPercent: number | null;
  /** The last run was on an older version than the catalogue's latest. */
  readonly isUpdated: boolean;
}

export const NO_FILTERS: PracticeFilters = {
  reactionClass: null,
  difficultyTier: null,
  practiceStatus: null,
  searchText: "",
};

const PRACTICE_STATUSES: readonly PracticeStatus[] = ["new", "practised", "mastered"];
const CLASS_PATTERN = /^[a-z]+([ -][a-z]+)*$/;
const MAXIMUM_DIFFICULTY_TIER = 3;

/** Filters from the query after "#/practice?"; unknown or malformed values are ignored. */
export function parsePracticeFilters(query: string): PracticeFilters {
  const parameters = new URLSearchParams(query);
  const reactionClass = parameters.get("type");
  const difficulty = Number(parameters.get("difficulty"));
  const status = parameters.get("status");
  return {
    reactionClass:
      reactionClass !== null && CLASS_PATTERN.test(reactionClass) ? reactionClass : null,
    difficultyTier:
      Number.isInteger(difficulty) && difficulty >= 1 && difficulty <= MAXIMUM_DIFFICULTY_TIER
        ? difficulty
        : null,
    practiceStatus: PRACTICE_STATUSES.find((candidate) => candidate === status) ?? null,
    searchText: parameters.get("search") ?? "",
  };
}

/** The query for the filters ("" for none), in a fixed order. */
export function practiceFiltersQuery(filters: PracticeFilters): string {
  const parameters = new URLSearchParams();
  if (filters.reactionClass !== null) {
    parameters.set("type", filters.reactionClass);
  }
  if (filters.difficultyTier !== null) {
    parameters.set("difficulty", String(filters.difficultyTier));
  }
  if (filters.practiceStatus !== null) {
    parameters.set("status", filters.practiceStatus);
  }
  if (filters.searchText !== "") {
    parameters.set("search", filters.searchText);
  }
  return parameters.toString();
}

function statusOf(mastery: ReactionMastery | undefined): PracticeStatus {
  if (mastery === undefined) {
    return "new";
  }
  return mastery.masteryPercent >= MASTERED_PERCENT ? "mastered" : "practised";
}

export function practiceCards(
  catalogue: Catalogue,
  mastery: ReadonlyMap<string, ReactionMastery>,
): PracticeCard[] {
  return catalogue.reactions.map((entry) => {
    const learned = mastery.get(entry.reactionSlug);
    return {
      reactionSlug: entry.reactionSlug,
      reactionVersionRef: `${entry.reactionSlug}@${String(entry.latestReactionVersion)}`,
      title: entry.title,
      subtitle: entry.subtitle ?? "",
      reactionClasses: entry.reactionClasses,
      difficultyTier: entry.difficultyTier,
      practiceStatus: statusOf(learned),
      masteryPercent: learned?.masteryPercent ?? null,
      isUpdated: learned !== undefined && learned.lastReactionVersion < entry.latestReactionVersion,
    };
  });
}

export function filteredCards(
  cards: readonly PracticeCard[],
  filters: PracticeFilters,
): PracticeCard[] {
  const search = filters.searchText.trim().toLowerCase();
  return cards.filter(
    (card) =>
      (filters.reactionClass === null || card.reactionClasses.includes(filters.reactionClass)) &&
      (filters.difficultyTier === null || card.difficultyTier === filters.difficultyTier) &&
      (filters.practiceStatus === null || card.practiceStatus === filters.practiceStatus) &&
      (search === "" || `${card.title} ${card.subtitle}`.toLowerCase().includes(search)),
  );
}

/** Up to `limit` other reactions sharing a class with `reactionSlug`, for the finished view. */
export function relatedCards(
  cards: readonly PracticeCard[],
  reactionSlug: string,
  limit = 3,
): PracticeCard[] {
  const own = cards.find((card) => card.reactionSlug === reactionSlug);
  if (own === undefined) {
    return [];
  }
  return cards
    .filter(
      (card) =>
        card.reactionSlug !== reactionSlug &&
        card.reactionClasses.some((reactionClass) => own.reactionClasses.includes(reactionClass)),
    )
    .slice(0, limit);
}
