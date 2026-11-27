/**
 * Tests for stateRegeneration.ts: editing a state's mapped SMILES, then regenerating the states
 * after it. The strongest check: after a real edit (bromoethane for bromomethane, a methyl on the
 * Wittig's ketone, acetone for the aldol's acetaldehyde), the regenerated reaction lints clean.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  type ChemistryToolkit,
  loadChemistryToolkit,
} from "../../../tooling/chemistryToolkit/chemistryToolkit.js";
import { lintReaction } from "../../../tooling/reactionLinting/rules/reactionLint.js";
import { exampleReaction } from "../../../testSupport/reactionEdits.js";
import { type ReactionDocument, statesOf } from "../draft/reactionDraft.js";
import type { DraftState } from "../draft/startState.js";
import { editStateSmiles, regenerateStatesAfter, type StateEdit } from "./stateRegeneration.js";

let toolkit: ChemistryToolkit;

beforeAll(async () => {
  toolkit = await loadChemistryToolkit();
});

function stateOf(document: ReactionDocument, stateId: string): DraftState {
  return statesOf(document)[stateId] as DraftState;
}

function edited(edit: StateEdit): ReactionDocument {
  if (edit.outcome !== "edited") {
    throw new Error(`expected the edit to be made, got: ${edit.reason}`);
  }
  return edit.document;
}

function smilesOf(fileName: string, stateId: string): string {
  return stateOf(exampleReaction(fileName), stateId).mappedSmiles;
}

describe("editStateSmiles", () => {
  const sn2 = exampleReaction("sn2-hydroxide-bromomethane.json");
  const bromoethane = "[OH-:1].[CH2:2]([CH3:5])[Br:3].[Na+:4]";

  it("keeps atoms in place and puts a new one next to its bonded atom", () => {
    const document = edited(editStateSmiles(sn2, "reactants", bromoethane));
    const { mappedSmiles, mapNumberToCoordinates } = stateOf(document, "reactants");
    expect(mappedSmiles).toBe(bromoethane);
    const before = stateOf(sn2, "reactants").mapNumberToCoordinates;
    for (const key of ["1", "2", "3", "4"]) {
      expect(mapNumberToCoordinates[key]).toEqual(before[key]);
    }
    const [carbonX = 0, carbonY = 0] = mapNumberToCoordinates["2"] ?? [];
    const [methylX = 0, methylY = 0] = mapNumberToCoordinates["5"] ?? [];
    expect(Math.hypot(methylX - carbonX, methylY - carbonY)).toBeCloseTo(1.5, 1);
    expect(stateOf(document, "products")).toEqual(stateOf(sn2, "products")); // not regenerated yet
  });

  it.each([
    ["[OH-:1].[CH2:2]([CH3])[Br:3].[Na+:4]", "unmapped-atom"],
    ["c1ccccc1", "aromatic-notation"],
    ["[OH-:1].[CH3:2][Br:3", "malformed-smiles"],
  ])("refuses %s (%s)", (mappedSmiles, reasonPart) => {
    const edit = editStateSmiles(sn2, "reactants", mappedSmiles);
    expect(edit.outcome === "refused" && edit.reason).toContain(reasonPart);
  });
});

describe("regenerateStatesAfter", () => {
  it("re-applies the steps after an edited state, and the reaction still lints clean", () => {
    const sn2 = exampleReaction("sn2-hydroxide-bromomethane.json");
    const document = edited(
      editStateSmiles(sn2, "reactants", "[OH-:1].[CH2:2]([CH3:5])[Br:3].[Na+:4]"),
    );
    const regeneration = regenerateStatesAfter(document, "reactants");
    expect(regeneration.regeneratedStateIds).toEqual(["products"]);
    expect(regeneration.brokenStepKeys).toEqual([]);
    const products = stateOf(regeneration.document, "products");
    expect(products.mappedSmiles).toBe("[OH:1][CH2:2][CH3:5].[Br-:3].[Na+:4]");
    expect(products.mapNumberToCoordinates["1"]).toEqual(
      stateOf(sn2, "products").mapNumberToCoordinates["1"],
    );
    expect(lintReaction(regeneration.document, toolkit)).toEqual([]);
  });

  it("keeps both Wittig routes rejoining at the same oxaphosphetane", () => {
    const fileName = "wittig-methylenation-cyclohexanone.json";
    const withMethyl = smilesOf(fileName, "reactants").replace("[CH2:6]", "[CH:6]([CH3:90])");
    expect(withMethyl).toContain("[CH3:90]");
    const document = edited(editStateSmiles(exampleReaction(fileName), "reactants", withMethyl));
    const regeneration = regenerateStatesAfter(document, "reactants");
    expect(regeneration.brokenStepKeys).toEqual([]);
    expect([...regeneration.regeneratedStateIds].sort()).toEqual([
      "betaine",
      "oxaphosphetane",
      "products",
    ]);
    expect(lintReaction(regeneration.document, toolkit)).toEqual([]);
  });
});

describe("regenerateStatesAfter through change steps and broken steps", () => {
  it("regenerates through a change step", () => {
    const fileName = "aldol-addition-base.json";
    const acetone = smilesOf(fileName, "reactants").replace(
      "[CH:5]=[O:6]",
      "[C:5]([CH3:11])=[O:6]",
    );
    const document = edited(editStateSmiles(exampleReaction(fileName), "reactants", acetone));
    const regeneration = regenerateStatesAfter(document, "reactants");
    expect(regeneration.brokenStepKeys).toEqual([]);
    expect(regeneration.regeneratedStateIds).toEqual([
      "enolate",
      "enolate-and-aldehyde",
      "alkoxide",
      "aldol-product",
    ]);
    expect(lintReaction(regeneration.document, toolkit)).toEqual([]);
  });

  it("lists a step whose arrows no longer apply and leaves its state as it was", () => {
    const sn2 = exampleReaction("sn2-hydroxide-bromomethane.json");
    const document = edited(editStateSmiles(sn2, "reactants", "[OH-:1].[CH3:2][Cl:3].[Na+:4]"));
    const regeneration = regenerateStatesAfter(
      edited(editStateSmiles(document, "reactants", "[OH-:1].[CH4:2].[Na+:4]")),
      "reactants",
    );
    expect(regeneration.brokenStepKeys).toEqual(["substitution"]);
    expect(regeneration.regeneratedStateIds).toEqual([]);
    expect(stateOf(regeneration.document, "products")).toEqual(stateOf(sn2, "products"));
  });

  it("changes nothing when the edited state still gives the same states", () => {
    const sn2 = exampleReaction("sn2-hydroxide-bromomethane.json");
    const regeneration = regenerateStatesAfter(sn2, "reactants");
    expect(regeneration).toEqual({ document: sn2, regeneratedStateIds: [], brokenStepKeys: [] });
  });
});
