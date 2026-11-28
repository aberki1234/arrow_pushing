/**
 * Tests for versionChanges.ts: what changed between two versions of a reaction, as the review
 * screen lists it (docs/SPEC.md §6, "Contributors"), on the SN2 example.
 */
import { describe, expect, it } from "vitest";
import { exampleReaction } from "../../../testSupport/reactionEdits.js";
import { placeOfChangeKey, versionChanges } from "./versionChanges.js";

type JsonRecord = Record<string, unknown>;

function sn2(): JsonRecord {
  return exampleReaction("sn2-hydroxide-bromomethane.json");
}

/** The SN2 document with its start state's fields changed. */
function withStartState(fields: JsonRecord): JsonRecord {
  const document = sn2();
  const states = document.stateIdToState as Record<string, JsonRecord>;
  return {
    ...document,
    stateIdToState: { ...states, reactants: { ...states.reactants, ...fields } },
  };
}

function startState(): JsonRecord {
  return (sn2().stateIdToState as Record<string, JsonRecord>).reactants ?? {};
}

describe("the change list", () => {
  it("is empty for the same document, ignoring version numbers and authors", () => {
    const next = { ...sn2(), reactionVersion: 2, previousReactionVersion: 1, authors: [] };
    expect(versionChanges(sn2(), next)).toEqual([]);
  });

  it("gives a changed hint as a word diff, placed on its state's hints", () => {
    const hints = [...(startState().hintTiers as string[])];
    hints[1] = "The nucleophile attacks the δ+ carbon as the C–Br bond breaks.";
    const [change] = versionChanges(sn2(), withStartState({ hintTiers: hints }));
    expect(change).toMatchObject({
      changeKey: "state:reactants hintTiers:1",
      heading: "Start · Hint 2",
      changeKind: "changed",
      entryKind: "text",
      place: { placeKind: "state", stateId: "reactants", field: "hintTiers" },
    });
    expect(change?.textPieces.map((piece) => piece.pieceKind)).toContain("inserted");
  });

  it("gives a new wrong answer as added, with its state for the drawing", () => {
    const added = {
      misconceptionId: "lone-pair-on-bromine",
      misconceptionTag: "leaving-group-attacks",
      severity: "wrong",
      arrowPattern: "lp Br3 -> C2",
      feedbackMessage: "Bromide is the leaving group.",
    };
    const misconceptions = [...(startState().misconceptions as JsonRecord[]), added];
    const [change] = versionChanges(sn2(), withStartState({ misconceptions }));
    expect(change).toMatchObject({
      changeKey: "state:reactants misconception:lone-pair-on-bromine",
      heading: "Start · Common wrong answer",
      changeKind: "added",
      entryKind: "misconception",
      stateId: "reactants",
      misconceptionId: "lone-pair-on-bromine",
      textPieces: [
        { pieceKind: "inserted", text: "lp Br3 -> C2 (wrong): Bromide is the leaving group." },
      ],
    });
  });
});

describe("structures, steps and the reaction's fields", () => {
  it("lists an added stereo question as a change to its step (docs/stereo-question.md)", () => {
    const steps = sn2().steps as JsonRecord[];
    const question = { acceptEnantiomer: false, otherArrangements: [] };
    const withQuestion = { ...sn2(), steps: [{ ...steps[0], stereoQuestion: question }] };
    const changes = versionChanges(sn2(), withQuestion);
    expect(changes.map((change) => [change.changeKey, change.heading, change.changeKind])).toEqual([
      ["step:substitution stereoQuestion", "Start → Product · Stereo question", "added"],
    ]);
  });

  it("gives a changed structure, and a step's changed arrows and explanation", () => {
    const document = withStartState({ mappedSmiles: "[OH-:1].[CH3:2][Br:3].[K+:4]" });
    const steps = document.steps as JsonRecord[];
    const changedStep = {
      ...steps[0],
      canonicalArrows: ["lp O1 -> σ O1-C2"],
      explanationAfterStep: "Concerted.",
    };
    const changes = versionChanges(sn2(), { ...document, steps: [changedStep] });
    expect(changes.map((change) => [change.changeKey, change.heading, change.entryKind])).toEqual([
      ["state:reactants structure", "Start · Structure", "structure"],
      ["step:substitution canonicalArrows", "Start → Product · Arrows", "text"],
      ["step:substitution explanationAfterStep", "Start → Product · Why it happens", "text"],
    ]);
    expect(changes[0]?.stateId).toBe("reactants");
  });
});

describe("the reaction's fields, and whole states and steps", () => {
  it("lists the reaction's own fields first, in a fixed order", () => {
    const changes = versionChanges(sn2(), {
      ...sn2(),
      mechanismSummary: "One step.",
      title: "SN2",
      difficultyTier: 2,
    });
    expect(changes.map((change) => change.heading)).toEqual([
      "Name",
      "Difficulty",
      "Summary at the end",
    ]);
    expect(changes[1]?.textPieces).toEqual([
      { pieceKind: "deleted", text: "1" },
      { pieceKind: "inserted", text: "2" },
    ]);
  });

  it("gives a removed state and step as removed", () => {
    const document = sn2();
    const states = document.stateIdToState as Record<string, JsonRecord>;
    const changes = versionChanges(document, {
      ...document,
      stateIdToState: { reactants: states.reactants },
      steps: [],
    });
    expect(changes.every((change) => change.changeKind === "removed")).toBe(true);
    expect(changes.map((change) => change.changeKey)).toContain("state:products structure");
  });

  it("lists everything as added for a new reaction", () => {
    const changes = versionChanges(null, sn2());
    expect(changes.length).toBeGreaterThan(10);
    expect(changes.every((change) => change.changeKind === "added")).toBe(true);
    expect(changes[0]).toMatchObject({
      heading: "Name",
      textPieces: [{ text: "SN2 substitution" }],
    });
  });
});

describe("where a pinned note points", () => {
  it("is the entry's place, or its state or step once the draft no longer has the entry", () => {
    expect(placeOfChangeKey(sn2(), "state:reactants hintTiers:1")).toEqual({
      placeKind: "state",
      stateId: "reactants",
      field: "hintTiers",
    });
    expect(placeOfChangeKey(sn2(), "state:reactants hintTiers:9")).toEqual({
      placeKind: "state",
      stateId: "reactants",
      field: null,
    });
    expect(placeOfChangeKey(sn2(), "step:gone canonicalArrows")).toEqual({
      placeKind: "step",
      stepKey: "gone",
      field: null,
    });
    expect(placeOfChangeKey(sn2(), "title")).toEqual({ placeKind: "reaction", field: "title" });
  });
});
