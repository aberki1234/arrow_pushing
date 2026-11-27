/**
 * Tests for editorSession.ts: the editor page's state and what each action does to it. The
 * chemistry is tested in src/create/reactionEditing; these check the wiring between actions, the
 * undo history, the selected state and the messages the page shows.
 */
import { describe, expect, it } from "vitest";
import { exampleReaction } from "../../../testSupport/reactionEdits.js";
import {
  applyStateSmiles,
  editorRedo,
  editorUndo,
  makeArrowStep,
  openDraft,
  removeStep,
  selectState,
  setEditorMode,
  tapOnCanvas,
  type EditorSession,
} from "./editorSession.js";

function sn2Session(): EditorSession {
  return openDraft(exampleReaction("sn2-hydroxide-bromomethane.json"), "sn2.json");
}

function drawSubstitution(session: EditorSession): EditorSession {
  let drawing = setEditorMode(selectState(session, "reactants"), "drawArrows");
  drawing = tapOnCanvas(drawing, { placeKind: "lonePair", mapNumber: 1 });
  drawing = tapOnCanvas(drawing, { placeKind: "atom", mapNumber: 2 });
  drawing = tapOnCanvas(drawing, { placeKind: "bond", mapNumbers: [2, 3] });
  return tapOnCanvas(drawing, { placeKind: "atom", mapNumber: 3 });
}

describe("opening and selecting", () => {
  it("opens a draft at its start state, with nothing to undo", () => {
    const session = sn2Session();
    expect(session.selectedStateId).toBe("reactants");
    expect(session.fileName).toBe("sn2.json");
    expect(session.history.past).toEqual([]);
  });

  it("starts a fresh drawing when another state is selected while drawing", () => {
    const drawn = drawSubstitution(sn2Session());
    expect(drawn.arrowDrawing?.drawnArrows).toHaveLength(2);
    const elsewhere = selectState(drawn, "products");
    expect(elsewhere.arrowDrawing?.stateId).toBe("products");
    expect(elsewhere.arrowDrawing?.drawnArrows).toEqual([]);
  });
});

describe("making steps", () => {
  it("adds a step from the drawn arrows, selects its to-state and can be undone", () => {
    const sn2 = exampleReaction("sn2-hydroxide-bromomethane.json");
    const withoutProducts = openDraft(
      {
        ...sn2,
        steps: [],
        stateIdToState: { reactants: (sn2.stateIdToState as Record<string, unknown>).reactants },
      },
      "sn2.json",
    );
    const made = makeArrowStep(drawSubstitution(withoutProducts));
    expect(made.message).toEqual({ tone: "good", text: "Step made: Start → Product." });
    expect(made.selectedStateId).toBe("state-1");
    expect(made.selectedStepKey).toBe("step-1");
    // Still drawing: a fresh drawing on the new state, ready for the next step.
    expect(made.arrowDrawing?.stateId).toBe("state-1");
    expect(made.arrowDrawing?.drawnArrows).toEqual([]);
    expect(editorUndo(made).history.present).toBe(withoutProducts.history.present);
    expect(editorRedo(editorUndo(made)).history.present).toBe(made.history.present);
  });

  it("keeps the arrows and shows why when the step is refused", () => {
    const refused = makeArrowStep(drawSubstitution(sn2Session()));
    expect(refused.message.tone).toBe("bad");
    expect(refused.message.text).toContain("already reaches");
    expect(refused.arrowDrawing?.drawnArrows).toHaveLength(2);
    expect(refused.history.past).toEqual([]);
  });
});

describe("other edits", () => {
  it("shows an H by tapping an atom in show-H mode", () => {
    const session = setEditorMode(sn2Session(), "showHydrogen");
    const shown = tapOnCanvas(session, { placeKind: "atom", mapNumber: 2 });
    expect(shown.message.text).toContain("H5");
    expect(shown.history.past).toHaveLength(1);
  });

  it("edits a state's SMILES and regenerates the states after it", () => {
    const edited = applyStateSmiles(sn2Session(), "[OH-:1].[CH2:2]([CH3:5])[Br:3].[Na+:4]", true);
    expect(edited.message).toEqual({ tone: "good", text: "Regenerated products." });
    expect(edited.history.past).toHaveLength(1);
  });

  it("deletes a step and says which states went with it", () => {
    const removed = removeStep(sn2Session(), "substitution");
    expect(removed.message.text).toBe("Deleted substitution and the state products.");
    expect(removed.selectedStateId).toBe("reactants");
  });
});
