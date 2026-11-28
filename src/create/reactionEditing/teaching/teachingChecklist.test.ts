/** Tests for teachingChecklist.ts: Create's Teaching to-do list. */
import { expect, it } from "vitest";
import type { LintFinding } from "../../../tooling/reactionLinting/findings/lintFindings.js";
import { exampleReaction } from "../../../testSupport/reactionEdits.js";
import { newReactionDraft } from "../draft/reactionDraft.js";
import {
  nextTeachingItemKey,
  type TeachingGroup,
  teachingChecklist,
  teachingCounts,
  teachingItemKey,
} from "./teachingChecklist.js";

type JsonRecord = Record<string, unknown>;

function withStateFields(document: JsonRecord, stateId: string, fields: JsonRecord): JsonRecord {
  const states = document.stateIdToState as Record<string, JsonRecord>;
  return {
    ...document,
    stateIdToState: { ...states, [stateId]: { ...states[stateId], ...fields } },
  };
}

/** "<groupKind> <subject>: <itemKind> <need> <status> <count>" lines, to compare at a glance. */
function itemLines(groups: readonly TeachingGroup[]): string[] {
  return groups.flatMap((group) =>
    group.items.map(
      (item) =>
        `${group.groupKind} ${String(group.groupSubject)}: ${item.itemKind} ${item.need} ` +
        `${item.itemStatus} ${String(item.filledCount)}`,
    ),
  );
}

it("lists the SN2 example as all done", () => {
  const groups = teachingChecklist(exampleReaction("sn2-hydroxide-bromomethane.json"), []);
  expect(itemLines(groups)).toEqual([
    "state reactants: learnerPrompt needed done 1",
    "state reactants: hintTiers needed done 3",
    "state reactants: misconceptions recommended done 3",
    "state reactants: explanationAfterStep recommended done 1",
    "reaction null: mechanismSummary needed done 1",
  ]);
  expect(groups[0]?.items[3]?.place).toEqual({
    placeKind: "step",
    stepKey: "substitution",
    field: "explanationAfterStep",
  });
  expect(teachingCounts(groups)).toEqual({ doneCount: 5, itemCount: 5, neededLeftCount: 0 });
});

it("lists a new draft's summary alone, still needed", () => {
  const draft = newReactionDraft({
    reactionSlug: "test",
    title: "Test",
    startState: { mappedSmiles: "[OH-:1]", mapNumberToCoordinates: { "1": [0, 0] } },
  });
  const groups = teachingChecklist(draft, []);
  expect(itemLines(groups)).toEqual(["reaction null: mechanismSummary needed missing 0"]);
  expect(teachingCounts(groups)).toEqual({ doneCount: 0, itemCount: 1, neededLeftCount: 1 });
});

it("marks a missing prompt, one hint tier and no misconceptions", () => {
  const sn2 = withStateFields(exampleReaction("sn2-hydroxide-bromomethane.json"), "reactants", {
    learnerPrompt: undefined,
    hintTiers: ["Which atom is electron-poor?"],
    misconceptions: [],
  });
  const groups = teachingChecklist(JSON.parse(JSON.stringify(sn2)) as JsonRecord, []);
  expect(itemLines(groups).slice(0, 3)).toEqual([
    "state reactants: learnerPrompt needed missing 0",
    "state reactants: hintTiers needed started 1",
    "state reactants: misconceptions recommended missing 0",
  ]);
  expect(teachingCounts(groups)).toEqual({ doneCount: 2, itemCount: 5, neededLeftCount: 1 });
});

it("counts blank text as missing", () => {
  const sn2 = exampleReaction("sn2-hydroxide-bromomethane.json");
  const groups = teachingChecklist({ ...sn2, mechanismSummary: "  " }, []);
  expect(itemLines(groups).at(-1)).toBe("reaction null: mechanismSummary needed missing 0");
});

it("follows the aldol's strip order, with its change step's caption", () => {
  const groups = teachingChecklist(exampleReaction("aldol-addition-base.json"), []);
  expect(groups.map((group) => `${group.groupKind} ${String(group.groupSubject)}`)).toEqual([
    "state reactants",
    "changeStep second-aldehyde-arrives",
    "state enolate-and-aldehyde",
    "state alkoxide",
    "reaction null",
  ]);
  expect(itemLines(groups)).toContain(
    "changeStep second-aldehyde-arrives: caption recommended done 1",
  );
});

it("asks for the explanation of each step leaving a branching state", () => {
  const groups = teachingChecklist(exampleReaction("wittig-methylenation-cyclohexanone.json"), []);
  const reactantsLines = itemLines(groups).filter((line) => line.startsWith("state reactants"));
  expect(reactantsLines.slice(3)).toEqual([
    "state reactants: explanationAfterStep recommended done 1",
    "state reactants: explanationAfterStep recommended done 1",
  ]);
  expect(itemLines(groups)).toContain("state betaine: explanationAfterStep recommended missing 0");
});

it("attaches lint findings at an item's place to that item", () => {
  const sn2 = exampleReaction("sn2-hydroxide-bromomethane.json");
  const promptMissing: LintFinding = {
    lintRuleId: "learner-prompt-missing",
    lintLevel: "error",
    instancePath: "/stateIdToState/reactants",
    message: 'state "reactants": arrows are drawn here, so it needs a learnerPrompt',
  };
  const fewHints: LintFinding = {
    lintRuleId: "fewer-than-three-hint-tiers",
    lintLevel: "warning",
    instancePath: "/stateIdToState/reactants/hintTiers",
    message: "…",
  };
  const neverFires: LintFinding = {
    lintRuleId: "misconception-never-fires",
    lintLevel: "warning",
    instancePath: "/stateIdToState/reactants/misconceptions/1",
    message: "…",
  };
  const elsewhere: LintFinding = {
    lintRuleId: "schema-violation",
    lintLevel: "error",
    instancePath: "/title",
    message: "…",
  };
  const [stateGroup] = teachingChecklist(sn2, [promptMissing, fewHints, neverFires, elsewhere]);
  expect(stateGroup?.items.map((item) => item.lintFindings)).toEqual([
    [promptMissing],
    [fewHints],
    [neverFires],
    [],
  ]);
});

it("keys each item by its kind and place", () => {
  const [stateGroup] = teachingChecklist(exampleReaction("sn2-hydroxide-bromomethane.json"), []);
  expect(stateGroup?.items.map(teachingItemKey)).toEqual([
    "learnerPrompt state:reactants",
    "hintTiers state:reactants",
    "misconceptions state:reactants",
    "explanationAfterStep step:substitution",
  ]);
});

it("finds the next item not done after the current one, wrapping round", () => {
  const sn2 = exampleReaction("sn2-hydroxide-bromomethane.json");
  const states = sn2.stateIdToState as Record<string, Record<string, unknown>>;
  const partly = {
    ...sn2,
    mechanismSummary: "",
    stateIdToState: { ...states, reactants: { ...states.reactants, hintTiers: ["One"] } },
  };
  const groups = teachingChecklist(partly, []);
  expect(nextTeachingItemKey(groups, null)).toBe("hintTiers state:reactants");
  expect(nextTeachingItemKey(groups, "hintTiers state:reactants")).toBe(
    "mechanismSummary reaction:",
  );
  expect(nextTeachingItemKey(groups, "mechanismSummary reaction:")).toBe(
    "hintTiers state:reactants",
  );
});

it("moves on to the next item when every item is done", () => {
  const groups = teachingChecklist(exampleReaction("sn2-hydroxide-bromomethane.json"), []);
  expect(nextTeachingItemKey(groups, null)).toBe("learnerPrompt state:reactants");
  expect(nextTeachingItemKey(groups, "learnerPrompt state:reactants")).toBe(
    "hintTiers state:reactants",
  );
});

it("offers a stereo question on a step that sets a stereocentre, and only there", () => {
  // docs/stereo-question.md: optional; done once the step asks one.
  const inversion = exampleReaction("sn2-2-bromobutane-inversion.json");
  const lines = itemLines(teachingChecklist(inversion, []));
  expect(lines).toContain("state reactants: stereoQuestion optional done 1");
  const plain = itemLines(
    teachingChecklist(exampleReaction("sn2-hydroxide-bromomethane.json"), []),
  );
  expect(plain.some((line) => line.includes("stereoQuestion"))).toBe(false);
  const steps = (inversion.steps as JsonRecord[]).map((step) =>
    Object.fromEntries(Object.entries(step).filter(([key]) => key !== "stereoQuestion")),
  );
  expect(itemLines(teachingChecklist({ ...inversion, steps }, []))).toContain(
    "state reactants: stereoQuestion optional missing 0",
  );
});
