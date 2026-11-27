/** Tests for reactionDraft.ts: a new reaction, and adding states and steps to a draft. */
import { describe, expect, it } from "vitest";
import { schemaViolations } from "../../../core/reactionFiles/schemaViolations.js";
import { exampleReaction } from "../../../testSupport/reactionEdits.js";
import type { DraftState } from "./startState.js";
import {
  addState,
  addStep,
  nextFreeMapNumber,
  newReactionDraft,
  type ReactionDocument,
} from "./reactionDraft.js";

const START_STATE: DraftState = {
  mappedSmiles: "[OH-:1].[CH3:2][Br:3]",
  mapNumberToCoordinates: { "1": [-3, 0], "2": [0, 0], "3": [1.9, 0] },
};

function newDraft(): ReactionDocument {
  return newReactionDraft({ reactionSlug: "sn2-test", title: "SN2 test", startState: START_STATE });
}

describe("newReactionDraft", () => {
  it("holds the slug, title and start state, as version 1", () => {
    const draft = newDraft();
    expect(draft.reactionSlug).toBe("sn2-test");
    expect(draft.title).toBe("SN2 test");
    expect(draft.reactionVersion).toBe(1);
    expect(draft.previousReactionVersion).toBeNull();
    expect(draft.startStateId).toBe("state-1");
    expect(draft.stateIdToState).toEqual({ "state-1": START_STATE });
    expect(draft.steps).toEqual([]);
  });

  it("has every required key, so only what 8b's fields fill in breaks the schema", () => {
    const violatedPaths = new Set(schemaViolations(newDraft()).map((found) => found.instancePath));
    expect([...violatedPaths].sort()).toEqual([
      "/authors",
      "/mechanismSummary",
      "/reactionClasses",
      "/stateIdToState", // at least two states: a new draft has no step yet
      "/steps",
    ]);
  });
});

describe("adding states and steps", () => {
  it("names a new state with the first free state-N and leaves the draft given unchanged", () => {
    const draft = newDraft();
    const { document, stateId } = addState(draft, START_STATE);
    expect(stateId).toBe("state-2");
    expect(Object.keys(document.stateIdToState as object)).toEqual(["state-1", "state-2"]);
    expect(Object.keys(draft.stateIdToState as object)).toEqual(["state-1"]);
  });

  it("names a new step with the first free step-N and appends it", () => {
    const { document, stateId } = addState(newDraft(), START_STATE);
    const step = {
      fromStateId: "state-1",
      toStateId: stateId,
      stepKind: "polar",
      routePreference: "preferred",
      canonicalArrows: ["lp O1 -> σ O1-C2", "σ C2-Br3 -> lp Br3"],
    };
    const { document: withStep, stepKey } = addStep(document, step);
    expect(stepKey).toBe("step-1");
    expect(withStep.steps).toEqual([{ stepKey: "step-1", ...step }]);
    expect(addStep(withStep, step).stepKey).toBe("step-2");
  });

  it("skips names an author already used", () => {
    const sn2 = exampleReaction("sn2-hydroxide-bromomethane.json");
    const states = sn2.stateIdToState as Record<string, unknown>;
    const withState2 = { ...sn2, stateIdToState: { ...states, "state-1": {}, "state-2": {} } };
    expect(addState(withState2, START_STATE).stateId).toBe("state-3");
  });

  it("leaves every other key of the document as it was", () => {
    const sn2 = exampleReaction("sn2-hydroxide-bromomethane.json");
    const { document } = addState(sn2, START_STATE);
    expect({ ...document, stateIdToState: null }).toEqual({ ...sn2, stateIdToState: null });
  });
});

describe("nextFreeMapNumber", () => {
  it("is one more than the largest map number in any state", () => {
    expect(nextFreeMapNumber(newDraft())).toBe(4);
    expect(nextFreeMapNumber(exampleReaction("aldol-addition-base.json"))).toBeGreaterThan(10);
  });
});
