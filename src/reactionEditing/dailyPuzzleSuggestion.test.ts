/**
 * Tests for dailyPuzzleSuggestion.ts: whether Create suggests a reaction for the daily puzzle
 * (docs/SPEC.md §1, owner's rule of 2026-11-26).
 */
import { describe, expect, it } from "vitest";
import { exampleReactionDocuments } from "../testSupport/fixtureFiles.js";
import { suggestedDailyPuzzleEligible } from "./dailyPuzzleSuggestion.js";

/** A one-step reaction with these canonical arrows (the suggestion reads the arrows only). */
function withArrows(...canonicalArrows: string[]): Record<string, unknown> {
  return {
    startStateId: "start",
    steps: [
      {
        stepKey: "only-step",
        fromStateId: "start",
        toStateId: "end",
        stepKind: canonicalArrows.some((arrow) => arrow.includes("~>")) ? "radical" : "polar",
        routePreference: "preferred",
        canonicalArrows,
      },
    ],
  };
}

it.each(exampleReactionDocuments())(
  "suggests %s for the daily puzzle, as authored",
  (fileName, document) => {
    expect(suggestedDailyPuzzleEligible(document), fileName).toBe(document.dailyPuzzleEligible);
  },
);

describe("reactions that make or break a real bond", () => {
  it("a heavy-atom σ bond (SN2, a Lewis adduct)", () => {
    expect(suggestedDailyPuzzleEligible(withArrows("lp O1 -> σ O1-C2", "σ C2-Br3 -> lp Br3"))).toBe(
      true,
    );
    expect(suggestedDailyPuzzleEligible(withArrows("lp N1 -> σ N1-B2"))).toBe(true);
  });

  it("a C–H or B–H bond (hydride transfer, a carbon acid, a radical abstraction)", () => {
    expect(suggestedDailyPuzzleEligible(withArrows("σ B1-H2 -> σ C3-H2", "π C3-O4 -> lp O4"))).toBe(
      true,
    );
    expect(suggestedDailyPuzzleEligible(withArrows("lp O1 -> σ O1-H2", "σ C3-H2 -> π C3-C4"))).toBe(
      true,
    );
    expect(
      suggestedDailyPuzzleEligible(
        withArrows("rad Br1 ~> σ Br1-H2", "σ H2-C3 ~> σ Br1-H2", "σ H2-C3 ~> rad C3"),
      ),
    ).toBe(true);
  });
});

describe("reactions for practice and Learn only", () => {
  it("resonance: only π bonds and lone pairs move", () => {
    expect(suggestedDailyPuzzleEligible(withArrows("lp O1 -> π O1-C2", "π C2-O3 -> lp O3"))).toBe(
      false,
    );
  });

  it("a proton moving between O, N, S or halogen atoms", () => {
    expect(suggestedDailyPuzzleEligible(withArrows("lp O1 -> σ O1-H2", "σ H2-Cl3 -> lp Cl3"))).toBe(
      false,
    );
    expect(suggestedDailyPuzzleEligible(withArrows("lp N1 -> σ N1-H2", "σ H2-O3 -> lp O3"))).toBe(
      false,
    );
  });

  it("a draft with no arrows yet", () => {
    expect(suggestedDailyPuzzleEligible({ startStateId: "start", steps: [] })).toBe(false);
  });
});
