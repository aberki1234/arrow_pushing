/**
 * Tests for the 8b actions of editorSession.ts: selecting steps, applying field edits through the
 * undo history, wedges, and saving drawn arrows as answers.
 */
import { describe, expect, it } from "vitest";
import { setStateField } from "../reactionEditing/fieldEdits.js";
import { statesOf, stepsOf } from "../reactionEditing/reactionDraft.js";
import { setArrowType } from "../reactionEditing/arrowDrawing.js";
import { exampleReaction } from "../../testSupport/reactionEdits.js";
import {
  applyDocumentEdit,
  currentDraft,
  openDraft,
  saveDrawnArrowsAs,
  selectState,
  selectStep,
  setEditorMode,
  setWedgeStyle,
  tapOnCanvas,
  updateArrowDrawing,
  type EditorSession,
} from "./editorSession.js";

function session(fileName = "aldol-addition-base.json"): EditorSession {
  return openDraft(exampleReaction(fileName), fileName);
}

describe("selection", () => {
  it("selecting a step selects its from-state; selecting a state clears it", () => {
    const selected = selectStep(session(), "carbon-carbon-bond-formation");
    expect(selected.selectedStepKey).toBe("carbon-carbon-bond-formation");
    expect(selected.selectedStateId).toBe("enolate-and-aldehyde");
    expect(selectState(selected, "enolate").selectedStepKey).toBeNull();
  });
});

describe("edits through the undo history", () => {
  it("applies a field edit, or shows why it is refused and keeps the draft", () => {
    const start = session();
    const document = currentDraft(start);
    const done = applyDocumentEdit(
      start,
      setStateField(document, "enolate", "learnerPrompt", "Now what?"),
    );
    expect((statesOf(currentDraft(done)).enolate as { learnerPrompt: string }).learnerPrompt).toBe(
      "Now what?",
    );
    expect(done.history.past).toHaveLength(1);
    const refused = applyDocumentEdit(
      start,
      setStateField(document, "nowhere", "learnerPrompt", "x"),
    );
    expect(refused.message).toEqual({ tone: "bad", text: 'no state "nowhere"' });
    expect(refused.history.past).toHaveLength(0);
  });

  it("applies the chosen wedge style to a bond tapped in wedges mode (wedge by default)", () => {
    const wedging = setEditorMode(session("sn2-hydroxide-bromomethane.json"), "wedges");
    expect(wedging.wedgeStyle).toBe("wedge");
    const stylesAfterTap = (current: EditorSession): unknown =>
      (statesOf(currentDraft(current)).reactants as { bondToWedgeStyle?: unknown })
        .bondToWedgeStyle;
    const wedged = tapOnCanvas(wedging, { placeKind: "bond", mapNumbers: [2, 3] });
    expect(stylesAfterTap(wedged)).toEqual({ "2-3": "wedge" });
    const dashed = tapOnCanvas(setWedgeStyle(wedged, "dash"), {
      placeKind: "bond",
      mapNumbers: [2, 3],
    });
    expect(stylesAfterTap(dashed)).toEqual({ "2-3": "dash" });
  });
});

describe("saving drawn arrows as answers", () => {
  function homolysisDrawn(): EditorSession {
    let drawing = setEditorMode(session("sn2-hydroxide-bromomethane.json"), "drawArrows");
    drawing = updateArrowDrawing(drawing, (current) => setArrowType(current, "fishHook"));
    drawing = tapOnCanvas(drawing, { placeKind: "bond", mapNumbers: [2, 3] });
    return tapOnCanvas(drawing, { placeKind: "atom", mapNumber: 3 });
  }

  it("saves them as a misconception and clears the drawing", () => {
    const saved = saveDrawnArrowsAs(homolysisDrawn(), {
      answerKind: "misconception",
      severity: "wrong",
      feedbackMessage: "Polar conditions: the bond breaks heterolytically.",
    });
    expect(saved.message).toEqual({ tone: "good", text: "Saved the wrong answer on Start." });
    expect(saved.arrowDrawing?.drawnArrows).toEqual([]);
  });

  it("saves them as a partial progress message", () => {
    const saved = saveDrawnArrowsAs(homolysisDrawn(), {
      answerKind: "partialProgress",
      feedbackMessage: "One more.",
    });
    expect(saved.message).toEqual({
      tone: "good",
      text: 'Saved a "right so far" message on Start.',
    });
  });

  it("refuses a partial arrow set the validator does not accept, keeping the arrows", () => {
    const refused = saveDrawnArrowsAs(homolysisDrawn(), {
      answerKind: "partialArrowSet",
      stepKey: "substitution",
    });
    expect(refused.message.tone).toBe("bad");
    expect(refused.arrowDrawing?.drawnArrows).toHaveLength(1);
    expect(stepsOf(currentDraft(refused))[0]?.partialArrowSets).toBeUndefined();
  });
});
