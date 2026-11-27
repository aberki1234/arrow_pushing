/** Tests for practiceList.ts. */
import { describe, expect, test } from "vitest";
import { type Catalogue, readCatalogue } from "../../core/catalogue/catalogueReading.js";
import { emptyProgress, withRun } from "../learnerProgress/learnerProgress.js";
import { isRecord, readFixtureJson } from "../../testSupport/fixtureFiles.js";
import { runOf, stepOf } from "../../testSupport/progressExamples.js";
import {
  NO_FILTERS,
  filteredCards,
  parsePracticeFilters,
  practiceCards,
  practiceFiltersQuery,
  relatedCards,
} from "./practiceList.js";
import { masteryBySlug } from "./reactionMastery.js";

function exampleCatalogue(): Catalogue {
  const cases = readFixtureJson("catalogue/catalogue_reading_cases.json");
  return readCatalogue(isRecord(cases) ? cases["catalogue"] : undefined);
}

describe("filters in the hash", () => {
  test("parse and print round trip, in a fixed order", () => {
    const filters = parsePracticeFilters(
      "status=new&type=carbonyl&difficulty=2&search=aldol%20base",
    );
    expect(filters).toEqual({
      reactionClass: "carbonyl",
      difficultyTier: 2,
      practiceStatus: "new",
      searchText: "aldol base",
    });
    expect(practiceFiltersQuery(filters)).toBe(
      "type=carbonyl&difficulty=2&status=new&search=aldol+base",
    );
    expect(practiceFiltersQuery(NO_FILTERS)).toBe("");
  });

  test("a class name with a space round trips", () => {
    const filters = parsePracticeFilters("type=aromatic+substitution");
    expect(filters.reactionClass).toBe("aromatic substitution");
    expect(practiceFiltersQuery(filters)).toBe("type=aromatic+substitution");
  });

  test("unknown or malformed values are ignored", () => {
    expect(parsePracticeFilters("status=perfect&difficulty=9&colour=red")).toEqual(NO_FILTERS);
  });
});

describe("cards", () => {
  // SN2 version 1 run, while the catalogue's latest is version 2: "updated".
  const progress = withRun(
    emptyProgress(),
    runOf("sn2-hydroxide-bromomethane@1", "2026-12-01T09:00:00Z", [stepOf("afterRetry")]),
  );
  const cards = practiceCards(exampleCatalogue(), masteryBySlug(progress));

  test("one card per reaction with the learner's status", () => {
    expect(
      cards.map((card) => [card.reactionSlug, card.practiceStatus, card.masteryPercent]),
    ).toEqual([
      ["aldol-addition-base", "new", null],
      ["sn2-hydroxide-bromomethane", "practised", 67],
    ]);
    expect(cards[1]?.reactionVersionRef).toBe("sn2-hydroxide-bromomethane@2");
    expect(cards[1]?.isUpdated).toBe(true);
    expect(cards[0]?.isUpdated).toBe(false);
  });

  test("filtering by type, difficulty, status and search", () => {
    const slugsFor = (query: string): string[] =>
      filteredCards(cards, parsePracticeFilters(query)).map((card) => card.reactionSlug);
    expect(slugsFor("type=substitution")).toEqual(["sn2-hydroxide-bromomethane"]);
    expect(slugsFor("difficulty=2")).toEqual(["aldol-addition-base"]);
    expect(slugsFor("status=new")).toEqual(["aldol-addition-base"]);
    expect(slugsFor("status=mastered")).toEqual([]);
    expect(slugsFor("search=BROMIDE")).toEqual(["sn2-hydroxide-bromomethane"]);
    expect(slugsFor("")).toHaveLength(2);
  });

  test("related reactions share a class", () => {
    expect(relatedCards(cards, "aldol-addition-base")).toEqual([]);
  });
});
