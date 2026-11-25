/**
 * Arrows the author draws on a state become a misconception, a partial progress message or
 * another complete arrow set of a step (docs/SPEC.md §5, editor decisions 2026-11-25; the formats
 * are docs/schema-design.md §5.2 and §5.3).
 *
 * Rules
 *   * A misconception is stored as the exact arrows drawn ("a; b" in the pattern grammar), with
 *     the next free id "misconception-N". It is refused when the arrows are a correct answer for
 *     a step leaving the state, or when its pattern would hide one (lint rule 7, the linter's own
 *     check). Its text can then be loosened (checked as it is changed), and entries reordered:
 *     the first match wins.
 *   * A partial progress message pairs the drawn (incomplete) arrows with a message.
 *   * A partial arrow set is kept only if the validator accepts it for its step, and it is not
 *     the canonical arrows or a set already listed.
 * Messages must not be empty.
 */
import { type CurvedArrow, formatCurvedArrow } from "../arrowNotation/curvedArrowNotation.js";
import { ArrowPatternError, parseArrowPattern } from "../attemptAssessment/arrowPatterns.js";
import { prepareReaction } from "../attemptAssessment/preparedReaction.js";
import { readLintedReaction } from "../reactionLinting/lintedReaction.js";
import {
  misconceptionMatchingFindings,
  withoutInvalidPatterns,
} from "../reactionLinting/misconceptionRules.js";
import { assessForStepAlone } from "../reactionLinting/stepReproduction.js";
import { type ReactionDocument, statesOf, stepsOf } from "./reactionDraft.js";

export type AnswerEdit =
  | { readonly outcome: "edited"; readonly document: ReactionDocument }
  | { readonly outcome: "refused"; readonly reason: string };

export interface MisconceptionFields {
  readonly severity: "wrong" | "plausible";
  readonly feedbackMessage: string;
  readonly misconceptionTag?: string;
}

type JsonRecord = Readonly<Record<string, unknown>>;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const edited = (document: ReactionDocument): AnswerEdit => ({ outcome: "edited", document });
const refused = (reason: string): AnswerEdit => ({ outcome: "refused", reason });

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordsIn(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function withStateKey(
  document: ReactionDocument,
  stateId: string,
  key: string,
  value: unknown,
): ReactionDocument {
  const state = statesOf(document)[stateId] as JsonRecord;
  return {
    ...document,
    stateIdToState: { ...statesOf(document), [stateId]: { ...state, [key]: value } },
  };
}

function allMisconceptionIds(document: ReactionDocument): string[] {
  return Object.values(statesOf(document)).flatMap((state) =>
    recordsIn(isRecord(state) ? state.misconceptions : undefined).map((entry) =>
      String(entry.misconceptionId),
    ),
  );
}

function nextMisconceptionId(document: ReactionDocument): string {
  const used = new Set(allMisconceptionIds(document));
  let number = 1;
  while (used.has(`misconception-${String(number)}`)) {
    number += 1;
  }
  return `misconception-${String(number)}`;
}

/** The key of a step leaving the state for which the validator accepts the arrows, if any. */
function stepAccepting(
  document: ReactionDocument,
  stateId: string,
  curvedArrows: readonly CurvedArrow[],
): string | undefined {
  const prepared = prepareReaction(document);
  return (prepared.stateIdToLeavingSteps.get(stateId) ?? []).find(
    (step) => assessForStepAlone(prepared, step, stateId, curvedArrows) !== undefined,
  )?.stepKey;
}

/** Whether the linter finds that the misconception hides a correct answer. */
function hidesCorrectAnswer(document: ReactionDocument, misconceptionId: string): boolean {
  const reaction = readLintedReaction(document);
  const prepared = prepareReaction(withoutInvalidPatterns(document, reaction));
  return misconceptionMatchingFindings(reaction, prepared).some(
    (finding) =>
      finding.lintRuleId === "misconception-hides-correct-answer" &&
      finding.message.includes(`"${misconceptionId}"`),
  );
}

export function addMisconceptionFromArrows(
  document: ReactionDocument,
  stateId: string,
  curvedArrows: readonly CurvedArrow[],
  fields: MisconceptionFields,
): AnswerEdit {
  const state = statesOf(document)[stateId];
  if (!isRecord(state)) {
    return refused(`no state "${stateId}"`);
  }
  if (curvedArrows.length === 0) {
    return refused("there are no arrows: draw the wrong answer first");
  }
  if (fields.feedbackMessage.trim() === "") {
    return refused("write the message the learner sees");
  }
  const acceptingStep = stepAccepting(document, stateId, curvedArrows);
  if (acceptingStep !== undefined) {
    return refused(`these arrows are a correct answer for step "${acceptingStep}"`);
  }
  const misconceptionId = nextMisconceptionId(document);
  const tag = fields.misconceptionTag?.trim() ?? "";
  const entry = {
    misconceptionId,
    ...(tag === "" ? {} : { misconceptionTag: tag }),
    severity: fields.severity,
    arrowPattern: curvedArrows.map(formatCurvedArrow).join("; "),
    feedbackMessage: fields.feedbackMessage.trim(),
  };
  const withEntry = withStateKey(document, stateId, "misconceptions", [
    ...recordsIn(state.misconceptions),
    entry,
  ]);
  return hidesCorrectAnswer(withEntry, misconceptionId)
    ? refused(
        "the pattern would hide a correct answer: the learner drawing it would be told it is wrong",
      )
    : edited(withEntry);
}

/** The misconception with `changes` applied, or why a change is refused. */
function changedMisconception(
  document: ReactionDocument,
  entry: JsonRecord,
  changes: Readonly<Record<string, string>>,
): JsonRecord | string {
  let changed: JsonRecord = entry;
  for (const [key, rawValue] of Object.entries(changes)) {
    const value = rawValue.trim();
    const problem = changeProblem(document, entry, key, value);
    if (problem !== undefined) {
      return problem;
    }
    changed =
      key === "misconceptionTag" && value === ""
        ? Object.fromEntries(Object.entries(changed).filter(([existing]) => existing !== key))
        : { ...changed, [key]: value };
  }
  return changed;
}

function patternProblem(document: ReactionDocument, pattern: string): string | undefined {
  try {
    const roles = isRecord(document.atomRoleToMapNumbers) ? document.atomRoleToMapNumbers : {};
    parseArrowPattern(pattern, roles as Readonly<Record<string, readonly number[]>>);
    return undefined;
  } catch (error) {
    if (error instanceof ArrowPatternError) {
      return `${error.errorCode}: ${error.message}`;
    }
    throw error;
  }
}

function idProblem(
  document: ReactionDocument,
  entry: JsonRecord,
  newId: string,
): string | undefined {
  if (!SLUG_PATTERN.test(newId)) {
    return `"${newId}" is not a slug`;
  }
  return newId !== entry.misconceptionId && allMisconceptionIds(document).includes(newId)
    ? `"${newId}" is already used`
    : undefined;
}

/** What a check of one new field value sees. */
interface ProposedChange {
  readonly document: ReactionDocument;
  readonly entry: JsonRecord;
  readonly value: string;
}

/** Why a new value of each misconception field is refused, or undefined. */
const MISCONCEPTION_CHANGE_CHECKS: Readonly<
  Record<string, (change: ProposedChange) => string | undefined>
> = {
  arrowPattern: ({ document, value }) => patternProblem(document, value),
  misconceptionId: ({ document, entry, value }) => idProblem(document, entry, value),
  misconceptionTag: ({ value }) =>
    value === "" || SLUG_PATTERN.test(value) ? undefined : `"${value}" is not a slug`,
  severity: ({ value }) =>
    value === "wrong" || value === "plausible" ? undefined : "severity is wrong or plausible",
  feedbackMessage: ({ value }) => (value === "" ? "write the message the learner sees" : undefined),
};

function changeProblem(
  document: ReactionDocument,
  entry: JsonRecord,
  key: string,
  value: string,
): string | undefined {
  const check = MISCONCEPTION_CHANGE_CHECKS[key];
  return check === undefined
    ? `"${key}" is not a misconception field`
    : check({ document, entry, value });
}

/** Run `change` on the state's misconception list, if the misconception is there. */
function withMisconceptions(
  document: ReactionDocument,
  stateId: string,
  misconceptionId: string,
  change: (entries: JsonRecord[], position: number) => JsonRecord[] | string,
): AnswerEdit {
  const state = statesOf(document)[stateId];
  const entries = recordsIn(isRecord(state) ? state.misconceptions : undefined);
  const position = entries.findIndex((entry) => entry.misconceptionId === misconceptionId);
  if (position < 0) {
    return refused(`no misconception "${misconceptionId}" on state "${stateId}"`);
  }
  const changed = change(entries, position);
  return typeof changed === "string"
    ? refused(changed)
    : edited(withStateKey(document, stateId, "misconceptions", changed));
}

/**
 * Change fields: arrowPattern, feedbackMessage, severity, misconceptionTag ("" removes it),
 * misconceptionId.
 */
export function updateMisconception(
  document: ReactionDocument,
  stateId: string,
  misconceptionId: string,
  changes: Readonly<Record<string, string>>,
): AnswerEdit {
  return withMisconceptions(document, stateId, misconceptionId, (entries, position) => {
    const changed = changedMisconception(document, entries[position] ?? {}, changes);
    return typeof changed === "string"
      ? changed
      : entries.map((entry, index) => (index === position ? changed : entry));
  });
}

export function moveMisconception(
  document: ReactionDocument,
  stateId: string,
  misconceptionId: string,
  delta: -1 | 1,
): AnswerEdit {
  return withMisconceptions(document, stateId, misconceptionId, (entries, position) => {
    const target = position + delta;
    if (target < 0 || target >= entries.length) {
      return entries;
    }
    const moved = [...entries];
    [moved[position], moved[target]] = [moved[target] ?? {}, moved[position] ?? {}];
    return moved;
  });
}

export function removeMisconception(
  document: ReactionDocument,
  stateId: string,
  misconceptionId: string,
): AnswerEdit {
  return withMisconceptions(document, stateId, misconceptionId, (entries, position) =>
    entries.filter((unusedEntry, index) => index !== position),
  );
}

export function addPartialProgressMessage(
  document: ReactionDocument,
  stateId: string,
  curvedArrows: readonly CurvedArrow[],
  feedbackMessage: string,
): AnswerEdit {
  const state = statesOf(document)[stateId];
  if (!isRecord(state)) {
    return refused(`no state "${stateId}"`);
  }
  if (curvedArrows.length === 0 || feedbackMessage.trim() === "") {
    return refused("draw the incomplete arrows and write the message the learner sees");
  }
  const entry = {
    learnerArrows: curvedArrows.map(formatCurvedArrow),
    feedbackMessage: feedbackMessage.trim(),
  };
  return edited(
    withStateKey(document, stateId, "partialProgressMessages", [
      ...recordsIn(state.partialProgressMessages),
      entry,
    ]),
  );
}

function sameArrowSet(first: readonly string[], second: readonly string[]): boolean {
  const sorted = (notations: readonly string[]): string => [...notations].sort().join("\n");
  return sorted(first) === sorted(second);
}

export function addPartialArrowSet(
  document: ReactionDocument,
  stepKey: string,
  curvedArrows: readonly CurvedArrow[],
): AnswerEdit {
  const step = stepsOf(document).find((candidate) => candidate.stepKey === stepKey);
  if (step === undefined || step.stepKind === "change") {
    return refused(`no arrow step "${stepKey}"`);
  }
  const notations = curvedArrows.map(formatCurvedArrow);
  const listedSets: unknown[] = Array.isArray(step.partialArrowSets) ? step.partialArrowSets : [];
  const known: unknown[] = [step.canonicalArrows, ...listedSets];
  if (
    known.some(
      (arrowSet) => Array.isArray(arrowSet) && sameArrowSet(arrowSet.map(String), notations),
    )
  ) {
    return refused("the step already has this arrow set");
  }
  const prepared = prepareReaction(document);
  const fromStateId = String(step.fromStateId);
  const preparedStep = (prepared.stateIdToLeavingSteps.get(fromStateId) ?? []).find(
    (candidate) => candidate.stepKey === stepKey,
  );
  if (
    preparedStep === undefined ||
    assessForStepAlone(prepared, preparedStep, fromStateId, curvedArrows) === undefined
  ) {
    return refused(`the validator has not accepted these arrows for step "${stepKey}"`);
  }
  const partialArrowSets = [...listedSets, notations];
  return edited({
    ...document,
    steps: stepsOf(document).map((candidate) =>
      candidate.stepKey === stepKey ? { ...candidate, partialArrowSets } : candidate,
    ),
  });
}
