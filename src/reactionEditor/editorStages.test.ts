/**
 * Tests for the Create stages of editorSession.ts (docs/SPEC.md §5, "Create"): the stage a draft
 * opens on, switching stages, selecting a teaching item, and going to a finding's place.
 */
import { describe, expect, it } from "vitest";
import { newReactionDraft } from "../reactionEditing/reactionDraft.js";
import { exampleReaction } from "../testSupport/reactionEdits.js";
import {
  goToPlace,
  openDraft,
  selectState,
  selectTeachingItem,
  setStage,
  type EditorSession,
} from "./editorSession.js";

type JsonRecord = Record<string, unknown>;

function sn2WithoutPrompt(): JsonRecord {
  const sn2 = exampleReaction("sn2-hydroxide-bromomethane.json");
  const states = sn2.stateIdToState as Record<string, JsonRecord>;
  const reactants = { ...states.reactants };
  delete reactants.learnerPrompt;
  return { ...sn2, stateIdToState: { ...states, reactants } };
}

function open(document: JsonRecord): EditorSession {
  return openDraft(document, `${String(document.reactionSlug)}.json`);
}

describe("opening a draft", () => {
  it("opens a new draft on the mechanism stage, drawing arrows on its start state", () => {
    const draft = newReactionDraft({
      reactionSlug: "test",
      title: "Test",
      startState: { mappedSmiles: "[OH-:1]", mapNumberToCoordinates: { "1": [0, 0] } },
    });
    const session = open(draft);
    expect([session.stage, session.mode, session.selectedStateId]).toEqual([
      "mechanism",
      "drawArrows",
      "state-1",
    ]);
    expect(session.arrowDrawing?.stateId).toBe("state-1");
  });

  it("opens a finished example on the publish stage, at its start state", () => {
    const session = open(exampleReaction("sn2-hydroxide-bromomethane.json"));
    expect([session.stage, session.mode, session.selectedStateId]).toEqual([
      "publish",
      "look",
      "reactants",
    ]);
  });

  it("opens a draft with a needed teaching item missing on that item", () => {
    const session = open(sn2WithoutPrompt());
    expect(session.stage).toBe("teaching");
    expect(session.teachingItemKey).toBe("learnerPrompt state:reactants");
  });
});

describe("switching stages", () => {
  it("draws arrows on the selected state on the mechanism stage, and only there", () => {
    const aldol = selectState(open(exampleReaction("aldol-addition-base.json")), "alkoxide");
    const drawing = setStage(aldol, "mechanism");
    expect([drawing.mode, drawing.arrowDrawing?.stateId]).toEqual(["drawArrows", "alkoxide"]);
    const publishing = setStage(drawing, "publish");
    expect([publishing.mode, publishing.arrowDrawing]).toEqual(["look", null]);
  });

  it("clears the last stage's message when another stage opens", () => {
    const session = open(exampleReaction("aldol-addition-base.json"));
    const withMessage = { ...session, message: { tone: "good" as const, text: "Step made." } };
    expect(setStage(withMessage, "teaching").message.text).toBe("");
    expect(setStage(withMessage, "mechanism").message.text).toBe("");
    expect(setStage(withMessage, withMessage.stage).message.text).toBe("Step made.");
  });

  it("selects the first teaching item not done when the teaching stage opens", () => {
    const session = setStage(open(sn2WithoutPrompt()), "start");
    expect(setStage(session, "teaching").teachingItemKey).toBe("learnerPrompt state:reactants");
    const done = setStage(open(exampleReaction("sn2-hydroxide-bromomethane.json")), "teaching");
    expect(done.teachingItemKey).toBe("learnerPrompt state:reactants");
  });
});

describe("teaching items", () => {
  it("shows the item's state, drawing arrows only for wrong answers", () => {
    const aldol = setStage(open(exampleReaction("aldol-addition-base.json")), "teaching");
    const wrongAnswers = selectTeachingItem(aldol, "misconceptions state:alkoxide");
    expect([wrongAnswers.selectedStateId, wrongAnswers.mode]).toEqual(["alkoxide", "drawArrows"]);
    expect(wrongAnswers.arrowDrawing?.stateId).toBe("alkoxide");
    const explanation = selectTeachingItem(wrongAnswers, "explanationAfterStep step:protonation");
    expect([explanation.selectedStateId, explanation.mode]).toEqual(["alkoxide", "look"]);
    expect(explanation.teachingItemKey).toBe("explanationAfterStep step:protonation");
  });
});

describe("going to a finding's place", () => {
  const aldol = (): EditorSession => open(exampleReaction("aldol-addition-base.json"));

  it("goes to a teaching item on the teaching stage", () => {
    const session = goToPlace(aldol(), {
      placeKind: "step",
      stepKey: "protonation",
      field: "explanationAfterStep",
    });
    expect([session.stage, session.teachingItemKey]).toEqual([
      "teaching",
      "explanationAfterStep step:protonation",
    ]);
  });

  it("goes to a state or step on the mechanism stage", () => {
    const atState = goToPlace(aldol(), {
      placeKind: "state",
      stateId: "alkoxide",
      field: "mappedSmiles",
    });
    expect([atState.stage, atState.selectedStateId]).toEqual(["mechanism", "alkoxide"]);
    const atStep = goToPlace(aldol(), {
      placeKind: "step",
      stepKey: "protonation",
      field: "canonicalArrows",
    });
    expect([atStep.stage, atStep.selectedStepKey]).toEqual(["mechanism", "protonation"]);
  });

  it("goes to the reaction's fields on their stage", () => {
    expect(goToPlace(aldol(), { placeKind: "reaction", field: "authors" }).stage).toBe("publish");
    expect(goToPlace(aldol(), { placeKind: "reaction", field: "title" }).stage).toBe("start");
  });
});
