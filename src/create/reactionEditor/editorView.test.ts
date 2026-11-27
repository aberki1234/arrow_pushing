/** Tests for editorView.ts: what the editor page shows, worked out from the draft. */
import { describe, expect, it } from "vitest";
import { parseCurvedArrow } from "../../core/arrowNotation/curvedArrowNotation.js";
import { newReactionDraft } from "../reactionEditing/reactionDraft.js";
import { exampleReaction } from "../../testSupport/reactionEdits.js";
import { draftDrawing, drawnArrowsOn, mappedSmilesOf, patternArrowsOn } from "./editorView.js";

describe("draftDrawing", () => {
  it("draws any state of the draft at the reaction's scale, with pick targets", () => {
    const sn2 = exampleReaction("sn2-hydroxide-bromomethane.json");
    const { drawing, pixelsPerUnit } = draftDrawing(sn2, "products");
    expect(drawing.atoms.map((atom) => atom.mapNumber).sort()).toEqual([1, 2, 3, 4]);
    expect(drawing.pickTargets.length).toBeGreaterThan(4);
    expect(pixelsPerUnit).toBeGreaterThan(0);
    expect(draftDrawing(sn2, "reactants").pixelsPerUnit).toBe(pixelsPerUnit);
  });

  it("draws a new draft with no steps and no learner text", () => {
    const draft = newReactionDraft({
      reactionSlug: "test",
      title: "Test",
      startState: {
        mappedSmiles: "[OH-:1].[CH3:2][Br:3]",
        mapNumberToCoordinates: { "1": [-2, 0], "2": [0, 0], "3": [1.5, 0] },
      },
    });
    expect(draftDrawing(draft, "state-1").drawing.atoms).toHaveLength(3);
  });
});

describe("drawnArrowsOn", () => {
  it("gives a curve for each arrow", () => {
    const sn2 = exampleReaction("sn2-hydroxide-bromomethane.json");
    const { drawing } = draftDrawing(sn2, "reactants");
    const arrows = ["lp O1 -> σ O1-C2", "σ C2-Br3 -> lp Br3"].map(parseCurvedArrow);
    const drawn = drawnArrowsOn(drawing, arrows);
    expect(drawn).toHaveLength(2);
    expect(drawn[0]?.arrowClass).toBe("");
  });
});

describe("mappedSmilesOf", () => {
  it("gives a state's mapped SMILES, or nothing for an unknown state", () => {
    const sn2 = exampleReaction("sn2-hydroxide-bromomethane.json");
    expect(mappedSmilesOf(sn2, "reactants")).toBe("[OH-:1].[CH3:2][Br:3].[Na+:4]");
    expect(mappedSmilesOf(sn2, "elsewhere")).toBe("");
  });
});

describe("patternArrowsOn", () => {
  it("draws the exact arrows of a pattern and leaves out loosened parts", () => {
    const sn2 = exampleReaction("sn2-hydroxide-bromomethane.json");
    const { drawing } = draftDrawing(sn2, "reactants");
    expect(patternArrowsOn(drawing, "lp O1 -> σ O1-C2; σ C2-Br3 -> lp Br3")).toHaveLength(2);
    expect(patternArrowsOn(drawing, "lp O1 -> Br3; lp @nucleophile -> C2")).toHaveLength(0);
  });
});
