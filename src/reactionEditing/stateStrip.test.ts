/** Tests for stateStrip.ts: Create's row of state thumbnails and the names of states. */
import { expect, it } from "vitest";
import { exampleReaction } from "../testSupport/reactionEdits.js";
import { newReactionDraft } from "./reactionDraft.js";
import { stateDisplayNames, stateStripRows } from "./stateStrip.js";

const newDraft = newReactionDraft({
  reactionSlug: "test",
  title: "Test",
  startState: { mappedSmiles: "[OH-:1]", mapNumberToCoordinates: { "1": [0, 0] } },
});

it("shows a new draft as its start state alone", () => {
  expect(stateStripRows(newDraft)).toEqual([
    {
      rowKind: "route",
      depth: 0,
      leavesStateId: null,
      frames: [{ frameKind: "state", stateId: "state-1" }],
      joinsStateId: null,
    },
  ]);
});

it("shows the aldol as one row, its change step among the arrow steps", () => {
  const [route, ...others] = stateStripRows(exampleReaction("aldol-addition-base.json"));
  expect(others).toEqual([]);
  expect(route?.frames).toEqual([
    { frameKind: "state", stateId: "reactants" },
    { frameKind: "step", stepKey: "enolate-formation", stepKind: "polar" },
    { frameKind: "state", stateId: "enolate" },
    { frameKind: "step", stepKey: "second-aldehyde-arrives", stepKind: "change" },
    { frameKind: "state", stateId: "enolate-and-aldehyde" },
    { frameKind: "step", stepKey: "carbon-carbon-bond-formation", stepKind: "polar" },
    { frameKind: "state", stateId: "alkoxide" },
    { frameKind: "step", stepKey: "protonation", stepKind: "polar" },
    { frameKind: "state", stateId: "aldol-product" },
  ]);
});

it("shows the Wittig's betaine route as a branch joining the oxaphosphetane", () => {
  expect(stateStripRows(exampleReaction("wittig-methylenation-cyclohexanone.json"))).toEqual([
    {
      rowKind: "route",
      depth: 0,
      leavesStateId: null,
      frames: [
        { frameKind: "state", stateId: "reactants" },
        { frameKind: "step", stepKey: "cycloaddition", stepKind: "polar" },
        { frameKind: "state", stateId: "oxaphosphetane" },
        { frameKind: "step", stepKey: "retro-cycloaddition", stepKind: "polar" },
        { frameKind: "state", stateId: "products" },
      ],
      joinsStateId: null,
    },
    {
      rowKind: "branch",
      depth: 1,
      leavesStateId: "reactants",
      frames: [
        { frameKind: "step", stepKey: "betaine-formation", stepKind: "polar" },
        { frameKind: "state", stateId: "betaine" },
        { frameKind: "step", stepKey: "ring-closure", stepKind: "polar" },
      ],
      joinsStateId: "oxaphosphetane",
    },
  ]);
});

it("puts states no route reaches in a last, unconnected row", () => {
  const sn2 = exampleReaction("sn2-hydroxide-bromomethane.json");
  expect(stateStripRows({ ...sn2, steps: [] })).toEqual([
    {
      rowKind: "route",
      depth: 0,
      leavesStateId: null,
      frames: [{ frameKind: "state", stateId: "reactants" }],
      joinsStateId: null,
    },
    {
      rowKind: "unconnected",
      depth: 0,
      leavesStateId: null,
      frames: [{ frameKind: "state", stateId: "products" }],
      joinsStateId: null,
    },
  ]);
});

it("names the start, the product and the intermediates in strip order", () => {
  const names = stateDisplayNames(exampleReaction("wittig-methylenation-cyclohexanone.json"));
  expect(Object.fromEntries(names)).toEqual({
    reactants: "Start",
    oxaphosphetane: "Intermediate 1",
    products: "Product",
    betaine: "Intermediate 2",
  });
});

it("calls a new draft's only state Start, not Product", () => {
  expect(Object.fromEntries(stateDisplayNames(newDraft))).toEqual({ "state-1": "Start" });
});
