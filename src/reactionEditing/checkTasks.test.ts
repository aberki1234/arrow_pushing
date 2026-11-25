/** Tests for checkTasks.ts: lint findings as tasks in plain words on Create's Publish stage. */
import { expect, it } from "vitest";
import type { LintFinding } from "../reactionLinting/lintFindings.js";
import { exampleReaction } from "../testSupport/reactionEdits.js";
import { checkTasks, publishChecks } from "./checkTasks.js";

const sn2 = exampleReaction("sn2-hydroxide-bromomethane.json");
const sn2WithOneHint = {
  ...sn2,
  stateIdToState: {
    ...(sn2.stateIdToState as Record<string, Record<string, unknown>>),
    reactants: {
      ...(sn2.stateIdToState as Record<string, Record<string, unknown>>).reactants,
      hintTiers: ["Which atom is electron-poor?"],
    },
  },
};

function finding(
  lintRuleId: string,
  instancePath: string,
  message = "…",
  lintLevel: "error" | "warning" = "error",
): LintFinding {
  return { lintRuleId, lintLevel, instancePath, message };
}

it.each([
  [
    finding("learner-prompt-missing", "/stateIdToState/reactants"),
    "Start has no question for the learner",
    "teaching",
  ],
  [finding("hint-tiers-missing", "/stateIdToState/reactants"), "Start has no hint", "teaching"],
  [
    finding(
      "schema-violation",
      "/mechanismSummary",
      "minLength: must NOT have fewer than 1 characters",
    ),
    "The summary at the end is empty",
    "teaching",
  ],
  [
    finding("schema-violation", "/reactionClasses", "minItems: must NOT have fewer than 1 items"),
    "Choose a reaction type",
    "publish",
  ],
  [
    finding("schema-violation", "/authors", "minItems: must NOT have fewer than 1 items"),
    "Name at least one author",
    "publish",
  ],
  [
    finding("schema-violation", "/steps", "minItems: must NOT have fewer than 1 items"),
    "Draw the first step",
    "mechanism",
  ],
  [
    finding("step-does-not-reproduce-to-state", "/steps/0/canonicalArrows", "the arrows give X"),
    "Start → Product: the arrows give X",
    "mechanism",
  ],
  [
    finding(
      "misconception-hides-correct-answer",
      "/stateIdToState/reactants/misconceptions/0",
      "it matches",
    ),
    "A wrong answer on Start: it matches",
    "teaching",
  ],
  [
    finding("too-many-skeleton-symmetries", "/stateIdToState/products/mappedSmiles", "too many"),
    "Product: too many",
    "mechanism",
  ],
])("writes %j as %j (%s)", (lintFinding, taskText, stage) => {
  const [task] = checkTasks(sn2, [lintFinding]);
  expect(task?.taskText).toBe(taskText);
  expect(task?.stage).toBe(stage);
  expect(task?.lintLevel).toBe(lintFinding.lintLevel);
});

it("counts the hints written in the three-tier advice", () => {
  const [task] = checkTasks(sn2WithOneHint, [
    finding("fewer-than-three-hint-tiers", "/stateIdToState/reactants/hintTiers", "…", "warning"),
  ]);
  expect(task).toEqual({
    lintLevel: "warning",
    taskText: "Start has 1 hint; three work best",
    stage: "teaching",
    place: { placeKind: "state", stateId: "reactants", field: "hintTiers" },
  });
});

it("lists a new draft's schema violations about the missing step once", () => {
  const tasks = checkTasks(sn2, [
    finding(
      "schema-violation",
      "/stateIdToState",
      "minProperties: must NOT have fewer than 2 properties",
    ),
    finding("schema-violation", "/steps", "minItems: must NOT have fewer than 1 items"),
  ]);
  expect(tasks.map((task) => task.taskText)).toEqual(["Draw the first step"]);
});

it("keeps the message of a finding it has no wording for, at its place's stage", () => {
  const [task] = checkTasks(sn2, [finding("schema-violation", "/title", "minLength: too short")]);
  expect(task).toEqual({
    lintLevel: "error",
    taskText: "minLength: too short",
    stage: "start",
    place: { placeKind: "reaction", field: "title" },
  });
});

it("adds the needed teaching items still missing, which a schema violation hides from lint", () => {
  const states = sn2.stateIdToState as Record<string, Record<string, unknown>>;
  const { reactants } = states;
  const bare = {
    ...sn2,
    mechanismSummary: "",
    stateIdToState: { ...states, reactants: { ...reactants, learnerPrompt: "", hintTiers: [] } },
  };
  const summaryFinding = finding(
    "schema-violation",
    "/mechanismSummary",
    "minLength: must NOT have fewer than 1 characters",
  );
  expect(publishChecks(bare, [summaryFinding])).toEqual([
    {
      lintLevel: "error",
      taskText: "The summary at the end is empty",
      stage: "teaching",
      place: { placeKind: "reaction", field: "mechanismSummary" },
    },
    {
      lintLevel: "error",
      taskText: "Start has no question for the learner",
      stage: "teaching",
      place: { placeKind: "state", stateId: "reactants", field: "learnerPrompt" },
    },
    {
      lintLevel: "error",
      taskText: "Start has no hint",
      stage: "teaching",
      place: { placeKind: "state", stateId: "reactants", field: "hintTiers" },
    },
  ]);
});
