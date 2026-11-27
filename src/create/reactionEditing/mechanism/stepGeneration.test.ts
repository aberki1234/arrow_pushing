/**
 * Tests for stepGeneration.ts: drawn arrows become a step, and the state they give becomes a new
 * state or joins an existing one.
 *
 * The strongest check replays the example reactions: starting from a draft holding only an
 * example's start state, drawing each example step's canonical arrows in turn must give exactly
 * the example's states, join where the example's routes rejoin, and choose the same route
 * preferences.
 */
import { describe, expect, it } from "vitest";
import { parseCurvedArrow } from "../../../core/arrowNotation/curvedArrowNotation.js";
import { stateGraphFromMappedSmiles } from "../../../core/stateGraphs/mappedSmilesReading.js";
import { stateGraphToJson } from "../../../core/stateGraphs/stateGraph.js";
import { exampleReaction } from "../../../testSupport/reactionEdits.js";
import {
  newReactionDraft,
  type ReactionDocument,
  statesOf,
  stepsOf,
} from "../draft/reactionDraft.js";
import type { DraftState } from "../draft/startState.js";
import { addArrowStep, type StepGeneration } from "./stepGeneration.js";

function stateOf(document: ReactionDocument, stateId: string): DraftState {
  return statesOf(document)[stateId] as DraftState;
}

function graphJson(document: ReactionDocument, stateId: string): unknown {
  return stateGraphToJson(stateGraphFromMappedSmiles(stateOf(document, stateId).mappedSmiles));
}

function draftWithStart(mappedSmiles: string): ReactionDocument {
  const graph = stateGraphFromMappedSmiles(mappedSmiles);
  const mapNumberToCoordinates = Object.fromEntries(
    [...graph.mapNumberToAtom.keys()].map((mapNumber): [string, [number, number]] => [
      String(mapNumber),
      [mapNumber, 0],
    ]),
  );
  return newReactionDraft({
    reactionSlug: "test",
    title: "Test",
    startState: { mappedSmiles, mapNumberToCoordinates },
  });
}

function draw(
  document: ReactionDocument,
  fromStateId: string,
  notations: string[],
): StepGeneration {
  return addArrowStep(document, fromStateId, notations.map(parseCurvedArrow));
}

function added(generation: StepGeneration): Extract<StepGeneration, { outcome: "added" }> {
  if (generation.outcome !== "added") {
    throw new Error(`expected the step to be added, got: ${generation.reason}`);
  }
  return generation;
}

function refusalOf(generation: StepGeneration): string {
  return generation.outcome === "refused" ? generation.reason : "added";
}

describe("replaying the example reactions", () => {
  it.each([
    "sn2-hydroxide-bromomethane.json",
    "radical-bromination-methane.json",
    "wittig-methylenation-cyclohexanone.json",
  ])("%s gives the example's states, joins and route preferences", (fileName) => {
    const example = exampleReaction(fileName);
    const exampleStart = stateOf(example, String(example.startStateId));
    let document = newReactionDraft({
      reactionSlug: "replay",
      title: "Replay",
      startState: exampleStart,
    });
    const exampleToDraftStateId = new Map([[String(example.startStateId), "state-1"]]);
    for (const step of stepsOf(example)) {
      const fromStateId = exampleToDraftStateId.get(String(step.fromStateId)) ?? "?";
      const generation = added(draw(document, fromStateId, step.canonicalArrows as string[]));
      const alreadyDrawn = exampleToDraftStateId.get(String(step.toStateId));
      expect(generation.joinedExistingState).toBe(alreadyDrawn !== undefined);
      if (alreadyDrawn !== undefined) {
        expect(generation.toStateId).toBe(alreadyDrawn);
      }
      document = generation.document;
      exampleToDraftStateId.set(String(step.toStateId), generation.toStateId);
      expect(graphJson(document, generation.toStateId)).toEqual(
        graphJson(example, String(step.toStateId)),
      );
      expect(stepsOf(document).at(-1)?.routePreference).toBe(step.routePreference);
      expect(stepsOf(document).at(-1)?.stepKind).toBe(step.stepKind);
    }
  });
});

describe("addArrowStep", () => {
  const sn2 = draftWithStart("[OH-:1].[CH3:2][Br:3]");
  const substitution = ["lp O1 -> σ O1-C2", "σ C2-Br3 -> lp Br3"];

  it("keeps every atom where it was in the from-state", () => {
    const generation = added(draw(sn2, "state-1", substitution));
    expect(stateOf(generation.document, generation.toStateId).mapNumberToCoordinates).toEqual(
      stateOf(sn2, "state-1").mapNumberToCoordinates,
    );
    expect(stateOf(generation.document, generation.toStateId).mappedSmiles).toBe(
      "[OH:1][CH3:2].[Br-:3]",
    );
  });

  it("stores the arrows in their printed form and names the step", () => {
    const generation = added(draw(sn2, "state-1", ["lp O1 -> sigma C2-O1", "σ C2-Br3 -> lp Br3"]));
    expect(stepsOf(generation.document)).toEqual([
      {
        stepKey: "step-1",
        fromStateId: "state-1",
        toStateId: "state-2",
        stepKind: "polar",
        routePreference: "preferred",
        canonicalArrows: ["lp O1 -> σ O1-C2", "σ C2-Br3 -> lp Br3"],
      },
    ]);
    expect(generation.stepKey).toBe("step-1");
  });

  it.each([
    [[], "no arrows"],
    [["lp O1 -> σ O1-C2", "σ C2-Br3 ~> rad Br3"], "pair arrows and fish-hooks"],
    [["lp O1 -> σ O1-C2"], "octet-exceeded"],
  ])("refuses %j (%s)", (notations, reasonPart) => {
    expect(refusalOf(draw(sn2, "state-1", notations))).toContain(reasonPart);
  });
});

describe("addArrowStep refusing arrows the validator would not accept", () => {
  const acetaldehyde = draftWithStart("[OH-:1].[H:2][CH2:3][CH:4]=[O:5]");
  const carbonylThereAndBack = ["π C4-O5 -> lp O5", "lp O5 -> π C4-O5"];

  it("refuses redundant arrows, as the validator would", () => {
    const withRedundantPair = ["lp O1 -> σ O1-H2", "σ H2-C3 -> lp C3", ...carbonylThereAndBack];
    expect(refusalOf(draw(acetaldehyde, "state-1", withRedundantPair))).toContain(
      "redundant-arrow",
    );
  });

  it("refuses arrows that change nothing", () => {
    expect(refusalOf(draw(acetaldehyde, "state-1", carbonylThereAndBack))).toContain(
      "give back the state",
    );
  });
});

describe("addArrowStep and the states already drawn", () => {
  const sn2 = draftWithStart("[OH-:1].[CH3:2][Br:3]");
  const substitution = ["lp O1 -> σ O1-C2", "σ C2-Br3 -> lp Br3"];

  it("refuses arrows that lead back to an earlier state (a cycle)", () => {
    const { document } = added(draw(sn2, "state-1", substitution));
    const back = draw(document, "state-2", ["lp Br3 -> σ C2-Br3", "σ O1-C2 -> lp O1"]);
    expect(refusalOf(back)).toContain('state "state-1"');
  });

  it("refuses a second step from one state to a state it already reaches", () => {
    const { document } = added(draw(sn2, "state-1", substitution));
    expect(refusalOf(draw(document, "state-1", substitution))).toContain("already");
  });

  it("makes a later step from the same state an accepted branch", () => {
    const enol = draftWithStart("[OH-:1].[H:2][CH2:3][CH:4]=[O:5]");
    const first = added(draw(enol, "state-1", ["lp O1 -> σ O1-H2", "σ H2-C3 -> lp C3"]));
    const second = added(
      draw(first.document, "state-1", [
        "lp O1 -> σ O1-H2",
        "σ H2-C3 -> π C3-C4",
        "π C4-O5 -> lp O5",
      ]),
    );
    expect(stepsOf(second.document).map((step) => step.routePreference)).toEqual([
      "preferred",
      "accepted",
    ]);
    // The enolate's two drawings are resonance forms: a new state, with a warning.
    expect(second.joinedExistingState).toBe(false);
    expect(second.resonanceFormOfStateId).toBe(first.toStateId);
    expect(first.resonanceFormOfStateId).toBeNull();
  });

  it("joins a state reached by symmetry-equivalent atoms", () => {
    const water = draftWithStart("[H:2][O:1][H:3].[NH2-:4]");
    const first = added(draw(water, "state-1", ["lp N4 -> σ N4-H2", "σ O1-H2 -> lp O1"]));
    const viaOtherH = draw(first.document, "state-1", ["lp N4 -> σ N4-H3", "σ O1-H3 -> lp O1"]);
    expect(refusalOf(viaOtherH)).toContain("already");
  });

  it("refuses a from-state that does not exist", () => {
    expect(refusalOf(draw(sn2, "state-9", substitution))).toContain('no state "state-9"');
  });
});
