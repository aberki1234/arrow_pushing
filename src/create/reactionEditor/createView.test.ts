/** Tests for createView.ts: the words Create's stages show. */
import { describe, expect, it } from "vitest";
import { teachingChecklist, type TeachingItem } from "../reactionEditing/teachingChecklist.js";
import { exampleReaction } from "../../testSupport/reactionEdits.js";
import { teachingGroupTitle, teachingItemBadge, teachingItemLabel } from "./createView.js";

function groupsOf(fileName: string): ReturnType<typeof teachingChecklist> {
  return teachingChecklist(exampleReaction(fileName), []);
}

describe("teachingGroupTitle", () => {
  it("names a state's group by its step, or its routes", () => {
    const sn2 = exampleReaction("sn2-hydroxide-bromomethane.json");
    expect(
      groupsOf("sn2-hydroxide-bromomethane.json").map((group) => teachingGroupTitle(sn2, group)),
    ).toEqual(["Start → Product", "Whole reaction"]);
    const wittig = exampleReaction("wittig-methylenation-cyclohexanone.json");
    const [reactants] = groupsOf("wittig-methylenation-cyclohexanone.json");
    expect(reactants === undefined ? "" : teachingGroupTitle(wittig, reactants)).toBe(
      "From Start (2 routes)",
    );
  });

  it("names a change step's group by the states it joins", () => {
    const aldol = exampleReaction("aldol-addition-base.json");
    const titles = groupsOf("aldol-addition-base.json").map((group) =>
      teachingGroupTitle(aldol, group),
    );
    expect(titles).toEqual([
      "Start → Intermediate 1",
      "Intermediate 1 → Intermediate 2: molecules change",
      "Intermediate 2 → Intermediate 3",
      "Intermediate 3 → Product",
      "Whole reaction",
    ]);
  });
});

describe("teachingItemLabel", () => {
  it("names each kind of item", () => {
    const sn2 = exampleReaction("sn2-hydroxide-bromomethane.json");
    const items = groupsOf("sn2-hydroxide-bromomethane.json").flatMap((group) => group.items);
    expect(items.map((item) => teachingItemLabel(sn2, item))).toEqual([
      "Question the learner sees",
      "Hints",
      "Common wrong answers",
      "Why it happens",
      "Summary at the end",
    ]);
  });

  it("says which step an explanation is for when several leave the state", () => {
    const wittig = exampleReaction("wittig-methylenation-cyclohexanone.json");
    const [reactants] = groupsOf("wittig-methylenation-cyclohexanone.json");
    expect(reactants?.items.slice(3).map((item) => teachingItemLabel(wittig, item))).toEqual([
      "Why it happens (Start → Intermediate 1)",
      "Why it happens (Start → Intermediate 2)",
    ]);
  });
});

describe("teachingItemBadge", () => {
  const item = (fields: Partial<TeachingItem>): TeachingItem => ({
    itemKind: "hintTiers",
    need: "needed",
    itemStatus: "missing",
    filledCount: 0,
    place: { placeKind: "reaction", field: null },
    lintFindings: [],
    ...fields,
  });

  it.each([
    [item({}), "needed"],
    [item({ itemStatus: "started", filledCount: 1 }), "1 of 3"],
    [item({ itemStatus: "done", filledCount: 3 }), ""],
    [item({ itemKind: "misconceptions", need: "recommended" }), "recommended"],
    [item({ itemKind: "learnerPrompt", need: "optional" }), "optional"],
  ])("marks %j as %j", (teachingItem, badge) => {
    expect(teachingItemBadge(teachingItem)).toBe(badge);
  });
});
