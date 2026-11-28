/**
 * Stereo in the editor (item 12c): wedges follow the SMILES marks after every edit that can change
 * marks or coordinates, and drawn arrows join a state with marks. The reference is the drawing
 * reader (drawing/moleculeDrawing/shared/stereoDrawing.ts, itself checked against RDKit): the
 * marks read from the wedges must be the state's marks.
 */
import { describe, expect, it } from "vitest";
import { parseCurvedArrow } from "../../../core/arrowNotation/curvedArrowNotation.js";
import { stateGraphFromMappedSmiles } from "../../../core/stateGraphs/mappedSmilesReading.js";
import { tetrahedralMarksFromDrawing } from "../../../drawing/moleculeDrawing/shared/stereoDrawing.js";
import { exampleReaction } from "../../../testSupport/reactionEdits.js";
import { type ReactionDocument, statesOf, stepsOf } from "../draft/reactionDraft.js";
import type { DraftState } from "../draft/startState.js";
import { moveAtom } from "./atomDragging.js";
import { editStateSmiles, regenerateStatesAfter, type StateEdit } from "./stateRegeneration.js";
import { addArrowStep } from "./stepGeneration.js";

const exampleFile = "sn2-2-bromobutane-inversion.json";

function stateOf(document: ReactionDocument, stateId: string): DraftState {
  return statesOf(document)[stateId] as DraftState;
}

function edited(edit: StateEdit): ReactionDocument {
  if (edit.outcome !== "edited") {
    throw new Error(`expected the edit to be made, got: ${edit.reason}`);
  }
  return edit.document;
}

/** Whether the state's wedges show exactly its SMILES marks. */
function wedgesShowMarks(document: ReactionDocument, stateId: string): boolean {
  const state = stateOf(document, stateId);
  const graph = stateGraphFromMappedSmiles(state.mappedSmiles);
  const read = tetrahedralMarksFromDrawing(
    graph,
    state.mapNumberToCoordinates,
    state.bondToWedgeStyle ?? {},
  );
  const marks = graph.mapNumberToTetrahedralMark ?? new Map<number, string>();
  return (
    read.size === marks.size && [...marks].every(([centre, mark]) => read.get(centre) === mark)
  );
}

describe("wedges follow the marks", () => {
  it("editing the SMILES to the other enantiomer redraws the wedge", () => {
    const document = edited(
      editStateSmiles(
        exampleReaction(exampleFile),
        "reactants",
        "[OH-:1].[CH3:5][C@H:2]([Br:3])[CH2:6][CH3:7].[Na+:4]",
      ),
    );
    expect(wedgesShowMarks(document, "reactants")).toBe(true);
  });

  it("editing the SMILES to drop the mark removes the wedge", () => {
    const document = edited(
      editStateSmiles(
        exampleReaction(exampleFile),
        "reactants",
        "[OH-:1].[CH3:5][CH:2]([Br:3])[CH2:6][CH3:7].[Na+:4]",
      ),
    );
    expect(stateOf(document, "reactants").bondToWedgeStyle).toBeUndefined();
  });

  it("dragging a neighbour across another keeps the configuration drawn", () => {
    // C6 (flat bond, at 240 degrees) is dragged to 60 degrees, between Br3 (0) and C5 (120): the
    // order of the bonds around C2 is reversed, so the old wedge would show the other enantiomer.
    const example = exampleReaction(exampleFile);
    const pixelsPerUnit = 40;
    const delta = { deltaX: 1.5 * pixelsPerUnit, deltaY: -2.6 * pixelsPerUnit };
    const moved = moveAtom(example, "reactants", 6, delta, pixelsPerUnit);
    expect(stateOf(moved, "reactants").mapNumberToCoordinates["6"]).toEqual([0.75, 1.3]);
    expect(wedgesShowMarks(moved, "reactants")).toBe(true);
  });

  it("regenerated states keep their wedges in step with their marks", () => {
    const document = edited(
      editStateSmiles(
        exampleReaction(exampleFile),
        "reactants",
        "[OH-:1].[CH3:5][C@@H:2]([Br:3])[CH2:6][CH2:7][CH3:8].[Na+:4]",
      ),
    );
    const regeneration = regenerateStatesAfter(document, "reactants");
    expect(regeneration.brokenStepKeys).toEqual([]);
    expect(wedgesShowMarks(regeneration.document, "products")).toBe(true);
  });
});

describe("drawn arrows and marks", () => {
  it("the canonical arrows drawn again join the products state that has marks", () => {
    const example = exampleReaction(exampleFile);
    const withoutStep = { ...example, steps: [] };
    const generation = addArrowStep(
      withoutStep,
      "reactants",
      ["lp O1 -> σ O1-C2", "σ C2-Br3 -> lp Br3"].map(parseCurvedArrow),
    );
    expect(generation.outcome).toBe("added");
    if (generation.outcome === "added") {
      expect(generation.toStateId).toBe("products");
      expect(generation.joinedExistingState).toBe(true);
      expect(stepsOf(generation.document)).toHaveLength(1);
    }
  });
});
