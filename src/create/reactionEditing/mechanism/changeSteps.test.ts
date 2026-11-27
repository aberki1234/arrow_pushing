/**
 * Tests for changeSteps.ts (molecules arrive or leave) and atomPlacement.ts (where new atoms go).
 *
 * The aldol example is replayed in full: its second acetaldehyde arrives by a change step. The
 * editor numbers arriving atoms from the first free map number (7, 8, 9) where the example used
 * 8, 9, 10, so the example's later arrows and states are renumbered before they are compared.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { parseCurvedArrow } from "../../../core/arrowNotation/curvedArrowNotation.js";
import {
  relabelCurvedArrow,
  relabelStateGraph,
} from "../../../core/attemptAssessment/skeletonSymmetry.js";
import {
  type ChemistryToolkit,
  loadChemistryToolkit,
} from "../../../tooling/chemistryToolkit/chemistryToolkit.js";
import { stateGraphFromMappedSmiles } from "../../../core/stateGraphs/mappedSmilesReading.js";
import { stateGraphToJson } from "../../../core/stateGraphs/stateGraph.js";
import { exampleReaction } from "../../../testSupport/reactionEdits.js";
import { placedClearOf } from "./atomPlacement.js";
import { addChangeStep, type ChangeStepAddition } from "./changeSteps.js";
import {
  newReactionDraft,
  type ReactionDocument,
  statesOf,
  stepsOf,
} from "../draft/reactionDraft.js";
import type { DraftState } from "../draft/startState.js";
import { addArrowStep } from "./stepGeneration.js";

let toolkit: ChemistryToolkit;

beforeAll(async () => {
  toolkit = await loadChemistryToolkit();
});

const SN2_PRODUCTS: DraftState = {
  mappedSmiles: "[OH:1][CH3:2].[Br-:3]",
  mapNumberToCoordinates: { "1": [-1.5, 0], "2": [0, 0], "3": [2, 1] },
};

function sn2ProductsDraft(): ReactionDocument {
  return newReactionDraft({ reactionSlug: "test", title: "Test", startState: SN2_PRODUCTS });
}

function stateOf(document: ReactionDocument, stateId: string): DraftState {
  return statesOf(document)[stateId] as DraftState;
}

function added(change: ChangeStepAddition): Extract<ChangeStepAddition, { outcome: "added" }> {
  if (change.outcome !== "added") {
    throw new Error(`expected the change step to be added, got: ${change.reason}`);
  }
  return change;
}

function refusalOf(change: ChangeStepAddition): string {
  return change.outcome === "refused" ? change.reason : "added";
}

describe("placedClearOf", () => {
  it("moves new atoms one bond length right of the drawing, centred on it vertically", () => {
    const existing = { "1": [0, -1], "2": [2, 1] } as const;
    const placed = placedClearOf(existing, { "7": [10, 10], "8": [11.5, 10] });
    expect(placed).toEqual({ "7": [3.5, 0], "8": [5, 0] });
  });

  it("leaves new atoms where they are when there is no drawing", () => {
    expect(placedClearOf({}, { "1": [1, 2] })).toEqual({ "1": [1, 2] });
  });
});

describe("addChangeStep", () => {
  it("adds a pasted molecule numbered from the first free map number, clear of the drawing", () => {
    const change = added(
      addChangeStep(sn2ProductsDraft(), "state-1", { pastedSmiles: "O" }, toolkit),
    );
    const toState = stateOf(change.document, change.toStateId);
    expect(toState.mappedSmiles).toBe("[OH:1][CH3:2].[Br-:3].[OH2:4]");
    expect(toState.mapNumberToCoordinates["1"]).toEqual([-1.5, 0]);
    expect(toState.mapNumberToCoordinates["4"]?.[0]).toBeGreaterThanOrEqual(3.5);
    expect(stepsOf(change.document)).toEqual([
      {
        stepKey: "step-1",
        fromStateId: "state-1",
        toStateId: "state-2",
        stepKind: "change",
        routePreference: "preferred",
        addedSpecies: "[OH2:4]",
      },
    ]);
  });

  it("removes the whole molecule holding a map number", () => {
    const change = added(
      addChangeStep(sn2ProductsDraft(), "state-1", { removedFragmentMapNumbers: [3] }, toolkit),
    );
    const toState = stateOf(change.document, change.toStateId);
    expect(toState.mappedSmiles).toBe("[OH:1][CH3:2]");
    expect(Object.keys(toState.mapNumberToCoordinates)).toEqual(["1", "2"]);
    expect(stepsOf(change.document)[0]?.removedFragmentMapNumbers).toEqual([3]);
  });
});

describe("addChangeStep refusing", () => {
  it.each([
    [{}, "nothing"],
    [{ pastedSmiles: "C1CC(" }, "cannot read"],
    [{ removedFragmentMapNumbers: [9] }, "removed-map-number-absent"],
  ])("refuses %j (%s)", (change, reasonPart) => {
    expect(refusalOf(addChangeStep(sn2ProductsDraft(), "state-1", change, toolkit))).toContain(
      reasonPart,
    );
  });

  it("refuses a change step from a state another step already leaves, and the reverse", () => {
    const sn2 = newReactionDraft({
      reactionSlug: "test",
      title: "Test",
      startState: { mappedSmiles: "[OH-:1].[CH3:2][Br:3]", mapNumberToCoordinates: {} },
    });
    const arrows = ["lp O1 -> σ O1-C2", "σ C2-Br3 -> lp Br3"].map(parseCurvedArrow);
    const withArrowStep = addArrowStep(sn2, "state-1", arrows);
    if (withArrowStep.outcome !== "added") {
      throw new Error(withArrowStep.reason);
    }
    const change = addChangeStep(withArrowStep.document, "state-1", { pastedSmiles: "O" }, toolkit);
    expect(refusalOf(change)).toContain("only step");
    const withChange = added(addChangeStep(sn2, "state-1", { pastedSmiles: "O" }, toolkit));
    const arrowsAfterChange = addArrowStep(withChange.document, "state-1", arrows);
    expect(arrowsAfterChange.outcome === "refused" && arrowsAfterChange.reason).toContain(
      "change step",
    );
  });
});

describe("replaying the aldol example", () => {
  it("gives the example's states, renumbered as the editor numbers arriving atoms", () => {
    const example = exampleReaction("aldol-addition-base.json");
    const renumbering = new Map([[8, 7], [9, 8], [10, 9]]); // prettier-ignore
    const exampleGraph = (stateId: string): unknown =>
      stateGraphToJson(
        relabelStateGraph(
          stateGraphFromMappedSmiles(stateOf(example, stateId).mappedSmiles),
          renumbering,
        ),
      );
    let document = newReactionDraft({
      reactionSlug: "replay",
      title: "Replay",
      startState: stateOf(example, "reactants"),
    });
    let fromStateId = "state-1";
    for (const step of stepsOf(example)) {
      const change =
        step.stepKind === "change"
          ? addChangeStep(document, fromStateId, { pastedSmiles: "CC=O" }, toolkit)
          : addArrowStep(
              document,
              fromStateId,
              (step.canonicalArrows as string[]).map((notation) =>
                relabelCurvedArrow(parseCurvedArrow(notation), renumbering),
              ),
            );
      if (change.outcome !== "added") {
        throw new Error(`${String(step.stepKey)}: ${change.reason}`);
      }
      document = change.document;
      fromStateId = change.toStateId;
      const drawn = stateGraphToJson(
        stateGraphFromMappedSmiles(stateOf(document, fromStateId).mappedSmiles),
      );
      expect(drawn).toEqual(exampleGraph(String(step.toStateId)));
    }
    expect(stepsOf(document).map((step) => step.stepKind)).toEqual([
      "polar",
      "change",
      "polar",
      "polar",
    ]);
  });
});
