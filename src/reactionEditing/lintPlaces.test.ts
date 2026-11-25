/** Tests for lintPlaces.ts: where a lint finding sends the author. */
import { describe, expect, it } from "vitest";
import { exampleReaction } from "../testSupport/reactionEdits.js";
import { placeOfFinding } from "./lintPlaces.js";

const wittig = exampleReaction("wittig-methylenation-cyclohexanone.json");

function finding(instancePath: string, message = ""): { instancePath: string; message: string } {
  return { instancePath, message };
}

describe("placeOfFinding", () => {
  it.each([
    [
      "/stateIdToState/betaine/hintTiers",
      { placeKind: "state", stateId: "betaine", field: "hintTiers" },
    ],
    ["/stateIdToState/betaine", { placeKind: "state", stateId: "betaine", field: null }],
    [
      "/steps/2/canonicalArrows",
      { placeKind: "step", stepKey: "ring-closure", field: "canonicalArrows" },
    ],
    ["/steps/1", { placeKind: "step", stepKey: "betaine-formation", field: null }],
    ["/mechanismSummary", { placeKind: "reaction", field: "mechanismSummary" }],
    ["", { placeKind: "reaction", field: null }],
    ["/abbreviatedGroups/0", { placeKind: "reaction", field: "abbreviatedGroups" }],
  ])("%s", (instancePath, expectedPlace) => {
    expect(placeOfFinding(wittig, finding(instancePath))).toEqual(expectedPlace);
  });

  it("reads the state from the message of a finding about all states", () => {
    expect(
      placeOfFinding(wittig, finding("/stateIdToState", "state betaine: map number 3 is Cl here")),
    ).toEqual({
      placeKind: "state",
      stateId: "betaine",
      field: "mappedSmiles",
    });
    expect(
      placeOfFinding(wittig, finding("/stateIdToState", "2 states have no step leaving them")),
    ).toEqual({
      placeKind: "reaction",
      field: "stateIdToState",
    });
  });

  it("unescapes pointer parts; a step that is not there falls back to the reaction", () => {
    expect(placeOfFinding(wittig, finding("/stateIdToState/a~1b"))).toEqual({
      placeKind: "state",
      stateId: "a/b",
      field: null,
    });
    expect(placeOfFinding(wittig, finding("/steps/9/stepKey"))).toEqual({
      placeKind: "reaction",
      field: "steps",
    });
  });
});
