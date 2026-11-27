/** Tests for mechanismOutline.ts: the editor's mechanism panel as rows. */
import { describe, expect, it } from "vitest";
import { exampleReaction } from "../../../testSupport/reactionEdits.js";
import { mechanismOutline } from "./mechanismOutline.js";
import { newReactionDraft } from "../draft/reactionDraft.js";

describe("mechanismOutline", () => {
  it("lists the Wittig's preferred route, the betaine branch under the state it leaves", () => {
    expect(mechanismOutline(exampleReaction("wittig-methylenation-cyclohexanone.json"))).toEqual([
      { rowKind: "state", depth: 0, stateId: "reactants" },
      { rowKind: "step", depth: 1, stepKey: "betaine-formation", toStateId: "betaine" },
      { rowKind: "state", depth: 1, stateId: "betaine" },
      { rowKind: "step", depth: 1, stepKey: "ring-closure", toStateId: "oxaphosphetane" },
      { rowKind: "join", depth: 1, stateId: "oxaphosphetane" },
      { rowKind: "step", depth: 0, stepKey: "cycloaddition", toStateId: "oxaphosphetane" },
      { rowKind: "state", depth: 0, stateId: "oxaphosphetane" },
      { rowKind: "step", depth: 0, stepKey: "retro-cycloaddition", toStateId: "products" },
      { rowKind: "state", depth: 0, stateId: "products" },
    ]);
  });

  it("lists a linear reaction as one column", () => {
    const rows = mechanismOutline(exampleReaction("aldol-addition-base.json"));
    expect(rows.map((row) => row.depth)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(rows.filter((row) => row.rowKind === "state").map((row) => row.stateId)).toEqual([
      "reactants",
      "enolate",
      "enolate-and-aldehyde",
      "alkoxide",
      "aldol-product",
    ]);
  });

  it("lists a new draft as its start state alone", () => {
    const draft = newReactionDraft({
      reactionSlug: "test",
      title: "Test",
      startState: { mappedSmiles: "[OH-:1]", mapNumberToCoordinates: { "1": [0, 0] } },
    });
    expect(mechanismOutline(draft)).toEqual([{ rowKind: "state", depth: 0, stateId: "state-1" }]);
  });

  it("lists states no route reaches at the end", () => {
    const sn2 = exampleReaction("sn2-hydroxide-bromomethane.json");
    const rows = mechanismOutline({ ...sn2, steps: [] });
    expect(rows).toEqual([
      { rowKind: "state", depth: 0, stateId: "reactants" },
      { rowKind: "state", depth: 0, stateId: "products" },
    ]);
  });
});
