/**
 * Tests for explicitHydrogens.ts ("show H"). The strongest check: after showing an H in an
 * example reaction, the full linter still finds nothing wrong, so every state, change step and
 * step's arrows stay consistent with the new mapped hydrogen.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { parseCurvedArrow } from "../../core/arrowNotation/curvedArrowNotation.js";
import {
  type ChemistryToolkit,
  loadChemistryToolkit,
} from "../../tooling/chemistryToolkit/chemistryToolkit.js";
import { lintReaction } from "../../tooling/reactionLinting/reactionLint.js";
import { exampleReaction } from "../../testSupport/reactionEdits.js";
import { positionInLargestGap } from "./atomPlacement.js";
import { type HydrogenShowing, showHydrogen } from "./explicitHydrogens.js";
import {
  addState,
  newReactionDraft,
  type ReactionDocument,
  statesOf,
  stepsOf,
} from "./reactionDraft.js";
import type { DraftState } from "./startState.js";
import { addArrowStep } from "./stepGeneration.js";

let toolkit: ChemistryToolkit;

beforeAll(async () => {
  toolkit = await loadChemistryToolkit();
});

function stateOf(document: ReactionDocument, stateId: string): DraftState {
  return statesOf(document)[stateId] as DraftState;
}

function shown(showing: HydrogenShowing): Extract<HydrogenShowing, { outcome: "shown" }> {
  if (showing.outcome !== "shown") {
    throw new Error(`expected the H to be shown, got: ${showing.reason}`);
  }
  return showing;
}

function distance(
  first: readonly number[] | undefined,
  second: readonly number[] | undefined,
): number {
  return Math.hypot((first?.[0] ?? 0) - (second?.[0] ?? 0), (first?.[1] ?? 0) - (second?.[1] ?? 0));
}

describe("positionInLargestGap", () => {
  it("puts the new atom one bond length away, in the middle of the widest free angle", () => {
    const coordinates = { "1": [0, 0], "2": [1.5, 0], "3": [-1.5, 0] };
    const [newX, newY] = positionInLargestGap(coordinates, 1, [2, 3]);
    expect(Math.hypot(newX, newY)).toBeCloseTo(1.5);
    expect(Math.abs(newX)).toBeLessThan(1e-9); // straight up or down, away from both neighbours
  });

  it("points up from an atom with no neighbours", () => {
    expect(positionInLargestGap({ "1": [2, 3] }, 1, [])).toEqual([2, 4.5]);
  });
});

describe("showHydrogen", () => {
  it("adds the H to every state holding the atom, and the reaction still lints clean", () => {
    const sn2 = exampleReaction("sn2-hydroxide-bromomethane.json");
    const showing = shown(showHydrogen(sn2, "reactants", 2));
    expect(showing.hydrogenMapNumber).toBe(5);
    expect(showing.statesWithoutHydrogen).toEqual([]);
    expect(stateOf(showing.document, "reactants").mappedSmiles).toBe(
      "[OH-:1].[CH2:2]([Br:3])[H:5].[Na+:4]",
    );
    expect(stateOf(showing.document, "products").mappedSmiles).toContain("[H:5]");
    expect(lintReaction(showing.document, toolkit)).toEqual([]);
  });

  it("places the H one bond length from its atom and clear of the other atoms", () => {
    const sn2 = exampleReaction("sn2-hydroxide-bromomethane.json");
    const { mapNumberToCoordinates } = stateOf(
      shown(showHydrogen(sn2, "reactants", 2)).document,
      "reactants",
    );
    expect(distance(mapNumberToCoordinates["5"], mapNumberToCoordinates["2"])).toBeCloseTo(1.5, 1);
    for (const other of ["1", "3", "4"]) {
      expect(distance(mapNumberToCoordinates["5"], mapNumberToCoordinates[other])).toBeGreaterThan(
        1.2,
      );
    }
  });
});

describe("showHydrogen beyond one state", () => {
  it("adds the H to a change step's arriving molecule too", () => {
    const aldol = exampleReaction("aldol-addition-base.json");
    const showing = shown(showHydrogen(aldol, "enolate-and-aldehyde", 8));
    const change = stepsOf(showing.document).find((step) => step.stepKind === "change");
    expect(change?.addedSpecies).toContain(`[H:${String(showing.hydrogenMapNumber)}]`);
    expect(stateOf(showing.document, "enolate")).toEqual(stateOf(aldol, "enolate"));
    expect(lintReaction(showing.document, toolkit)).toEqual([]);
  });

  it("lets arrows use the hydrogen afterwards", () => {
    const draft = newReactionDraft({
      reactionSlug: "test",
      title: "Test",
      startState: {
        mappedSmiles: "[OH-:1].[CH3:2][CH:3]=[O:4]",
        mapNumberToCoordinates: { "1": [0, 0], "2": [2, 0], "3": [3.5, 0], "4": [4.5, 1] },
      },
    });
    const showing = shown(showHydrogen(draft, "state-1", 2));
    const arrows = ["lp O1 -> σ O1-H5", "σ C2-H5 -> π C2-C3", "π C3-O4 -> lp O4"];
    expect(addArrowStep(showing.document, "state-1", arrows.map(parseCurvedArrow)).outcome).toBe(
      "added",
    );
  });
});

describe("showHydrogen where it cannot", () => {
  it("lists, and leaves alone, a state where the atom has no implicit H", () => {
    const draft = newReactionDraft({
      reactionSlug: "test",
      title: "Test",
      startState: {
        mappedSmiles: "[CH3:1][OH:2]",
        mapNumberToCoordinates: { "1": [0, 0], "2": [1.5, 0] },
      },
    });
    const ketone: DraftState = {
      mappedSmiles: "[C:1]#[O+:2]",
      mapNumberToCoordinates: { "1": [0, 0], "2": [1.5, 0] },
    };
    const { document } = addState(draft, ketone);
    const showing = shown(showHydrogen(document, "state-1", 1));
    expect(showing.statesWithoutHydrogen).toEqual(["state-2"]);
    expect(stateOf(showing.document, "state-2")).toEqual(ketone);
  });

  it.each([
    ["reactants", 3, "no implicit hydrogen"],
    ["reactants", 9, "no atom 9"],
    ["elsewhere", 2, 'no state "elsewhere"'],
  ])("refuses state %s atom %i (%s)", (stateId, mapNumber, reasonPart) => {
    const showing = showHydrogen(
      exampleReaction("sn2-hydroxide-bromomethane.json"),
      stateId,
      mapNumber,
    );
    expect(showing.outcome === "refused" && showing.reason).toContain(reasonPart);
  });
});
