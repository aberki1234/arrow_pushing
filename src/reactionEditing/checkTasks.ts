/**
 * Create's Publish stage shows the lint findings as tasks in plain words, each with the stage
 * that fixes it and the place to go to (docs/SPEC.md §5, "Create", stage 4). States are named as
 * the strip names them (stateStrip.ts). A finding with no plain wording keeps its message.
 * Findings that become the same task (a new draft's schema violations about having no step yet)
 * are listed once.
 */
import type { LintFinding, LintLevel } from "../reactionLinting/lintFindings.js";
import type { CreationStage } from "./creationProgress.js";
import { type LintPlace, placeOfFinding } from "./lintPlaces.js";
import { type ReactionDocument, statesOf, stepsOf } from "./reactionDraft.js";
import { stateDisplayNames } from "./stateStrip.js";

export interface CheckTask {
  readonly lintLevel: LintLevel;
  readonly taskText: string;
  readonly stage: CreationStage;
  readonly place: LintPlace;
}

/** The reaction's fields each stage edits; any other reaction field is on Publish. */
const REACTION_FIELD_TO_STAGE: Readonly<Record<string, CreationStage>> = {
  title: "start",
  conditionsLabel: "start",
  startStateId: "mechanism",
  stateIdToState: "mechanism",
  steps: "mechanism",
  abbreviatedGroups: "mechanism",
  spectatorMapNumbers: "mechanism",
  mechanismSummary: "teaching",
};

/** State and step fields written on Teaching; their other fields are the Mechanism stage's. */
const TEACHING_FIELDS: ReadonlySet<string> = new Set([
  "learnerPrompt",
  "hintTiers",
  "misconceptions",
  "partialProgressMessages",
  "explanationAfterStep",
  "caption",
]);

/** Schema violations a new draft has, by place, and the task each stands for. */
const SCHEMA_PLACE_TO_TASK: Readonly<Record<string, readonly [string, CreationStage]>> = {
  "/mechanismSummary": ["The summary at the end is empty", "teaching"],
  "/reactionClasses": ["Choose a reaction type", "publish"],
  "/authors": ["Name at least one author", "publish"],
  "/steps": ["Draw the first step", "mechanism"],
  "/stateIdToState": ["Draw the first step", "mechanism"],
};

/** The linter's own naming of a place, which the task's wording replaces. */
const NAMED_PLACE_PREFIX = /^(?:change step|step|state) "[^"]*": /;

interface TaskWriting {
  readonly document: ReactionDocument;
  readonly stateIdToName: ReadonlyMap<string, string>;
}

function stageOfPlace(place: LintPlace): CreationStage {
  if (place.placeKind === "reaction") {
    return REACTION_FIELD_TO_STAGE[place.field ?? ""] ?? "publish";
  }
  return place.field !== null && TEACHING_FIELDS.has(place.field) ? "teaching" : "mechanism";
}

function stateName(writing: TaskWriting, stateId: unknown): string {
  return writing.stateIdToName.get(String(stateId)) ?? String(stateId);
}

/** "Start", "A wrong answer on Start", "Start → Product" or "" for the reaction. */
function placeName(writing: TaskWriting, place: LintPlace): string {
  if (place.placeKind === "state") {
    const name = stateName(writing, place.stateId);
    return place.field === "misconceptions" ? `A wrong answer on ${name}` : name;
  }
  if (place.placeKind === "step") {
    const step = stepsOf(writing.document).find((candidate) => candidate.stepKey === place.stepKey);
    return `${stateName(writing, step?.fromStateId)} → ${stateName(writing, step?.toStateId)}`;
  }
  return "";
}

function hintTierCount(writing: TaskWriting, stateId: string): number {
  const state = statesOf(writing.document)[stateId] as
    Readonly<Record<string, unknown>> | undefined;
  return Array.isArray(state?.hintTiers) ? state.hintTiers.length : 0;
}

/** The wording of a learner-text rule on a state, or undefined. */
function learnerTextWording(
  writing: TaskWriting,
  finding: LintFinding,
  place: LintPlace,
): string | undefined {
  if (place.placeKind !== "state") {
    return undefined;
  }
  const name = stateName(writing, place.stateId);
  if (finding.lintRuleId === "learner-prompt-missing") {
    return `${name} has no question for the learner`;
  }
  if (finding.lintRuleId === "hint-tiers-missing") {
    return `${name} has no hint`;
  }
  if (finding.lintRuleId === "fewer-than-three-hint-tiers") {
    const count = hintTierCount(writing, place.stateId);
    return `${name} has ${String(count)} hint${count === 1 ? "" : "s"}; three work best`;
  }
  return undefined;
}

function taskFor(writing: TaskWriting, finding: LintFinding): CheckTask {
  const place = placeOfFinding(writing.document, finding);
  const { lintLevel } = finding;
  const schemaTask =
    finding.lintRuleId === "schema-violation"
      ? SCHEMA_PLACE_TO_TASK[finding.instancePath]
      : undefined;
  if (schemaTask !== undefined) {
    return { lintLevel, taskText: schemaTask[0], stage: schemaTask[1], place };
  }
  const learnerText = learnerTextWording(writing, finding, place);
  if (learnerText !== undefined) {
    return { lintLevel, taskText: learnerText, stage: "teaching", place };
  }
  const name = placeName(writing, place);
  const message = finding.message.replace(NAMED_PLACE_PREFIX, "");
  const taskText = name === "" ? message : `${name}: ${message}`;
  return { lintLevel, taskText, stage: stageOfPlace(place), place };
}

export function checkTasks(
  document: ReactionDocument,
  lintFindings: readonly LintFinding[],
): CheckTask[] {
  const writing: TaskWriting = { document, stateIdToName: stateDisplayNames(document) };
  const tasks: CheckTask[] = [];
  for (const finding of lintFindings) {
    const task = taskFor(writing, finding);
    if (!tasks.some((listed) => listed.taskText === task.taskText)) {
      tasks.push(task);
    }
  }
  return tasks;
}
