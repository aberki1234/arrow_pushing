/**
 * The parts of a (schema-valid) reaction file a step session uses, read once: its states and
 * steps, typed, plus the reaction prepared for assessing attempts.
 */
import {
  type CurvedArrow,
  parseCurvedArrow,
} from "../../core/arrowNotation/curvedArrowNotation.js";
import {
  type PreparedReaction,
  prepareReaction,
} from "../../core/attemptAssessment/attemptAssessment.js";
import type {
  AbbreviatedGroup,
  StateDisplayFields,
} from "../../drawing/moleculeDrawing/state/stateDrawing.js";

export interface SessionState {
  readonly stateId: string;
  readonly mappedSmiles: string;
  readonly displayFields: StateDisplayFields;
  readonly learnerPrompt: string;
  readonly hintTiers: readonly string[];
}

export interface SessionStep {
  readonly stepKey: string;
  readonly fromStateId: string;
  readonly toStateId: string;
  readonly stepKind: "polar" | "radical" | "change";
  readonly routePreference: "preferred" | "accepted";
  readonly canonicalArrows: readonly CurvedArrow[];
  readonly explanationAfterStep: string;
  /** A change step's event text, e.g. "A second acetaldehyde arrives". */
  readonly caption: string;
}

export interface SessionReaction {
  readonly reactionSlug: string;
  readonly reactionVersion: number;
  readonly title: string;
  readonly subtitle: string;
  readonly reactionClasses: readonly string[];
  readonly difficultyTier: number;
  readonly conditionsLabel: string;
  readonly mechanismSummary: string;
  readonly authors: readonly { readonly name: string; readonly url: string | null }[];
  readonly licence: string;
  readonly references: readonly string[];
  readonly startStateId: string;
  readonly spectatorMapNumbers: readonly number[];
  readonly abbreviatedGroups: readonly AbbreviatedGroup[];
  readonly stateIdToState: ReadonlyMap<string, SessionState>;
  readonly steps: readonly SessionStep[];
  readonly prepared: PreparedReaction;
}

type DocumentRecord = Readonly<Record<string, unknown>>;

function isDocumentRecord(value: unknown): value is DocumentRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textOr(record: DocumentRecord, key: string, fallback: string): string {
  const value = record[key];
  return typeof value === "string" ? value : fallback;
}

function requiredText(record: DocumentRecord, key: string): string {
  const value = record[key];
  if (typeof value !== "string") {
    throw new Error(`reaction file: "${key}" must be text`);
  }
  return value;
}

function textList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function numberList(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((item): item is number => typeof item === "number")
    : [];
}

function abbreviatedGroupsIn(value: unknown): AbbreviatedGroup[] {
  return (Array.isArray(value) ? value : []).filter(isDocumentRecord).map((group) => ({
    groupLabel: requiredText(group, "groupLabel"),
    attachmentMapNumber: Number(group["attachmentMapNumber"]),
    mapNumbers: numberList(group["mapNumbers"]),
  }));
}

function sessionStateOf(stateId: string, state: DocumentRecord): SessionState {
  return {
    stateId,
    mappedSmiles: requiredText(state, "mappedSmiles"),
    // The schema has checked the display fields' shape.
    displayFields: state as unknown as StateDisplayFields,
    learnerPrompt: textOr(state, "learnerPrompt", "Draw the arrows for the next step."),
    hintTiers: textList(state["hintTiers"]),
  };
}

function sessionStepOf(step: DocumentRecord): SessionStep {
  const stepKind = requiredText(step, "stepKind");
  const routePreference = requiredText(step, "routePreference");
  return {
    stepKey: requiredText(step, "stepKey"),
    fromStateId: requiredText(step, "fromStateId"),
    toStateId: requiredText(step, "toStateId"),
    stepKind: stepKind === "radical" || stepKind === "change" ? stepKind : "polar",
    routePreference: routePreference === "accepted" ? "accepted" : "preferred",
    canonicalArrows: textList(step["canonicalArrows"]).map(parseCurvedArrow),
    explanationAfterStep: textOr(step, "explanationAfterStep", ""),
    caption: textOr(step, "caption", ""),
  };
}

export function readSessionReaction(reactionDocument: DocumentRecord): SessionReaction {
  const states = isDocumentRecord(reactionDocument["stateIdToState"])
    ? reactionDocument["stateIdToState"]
    : {};
  const stateIdToState = new Map<string, SessionState>();
  for (const [stateId, state] of Object.entries(states)) {
    if (isDocumentRecord(state)) {
      stateIdToState.set(stateId, sessionStateOf(stateId, state));
    }
  }
  const steps = Array.isArray(reactionDocument["steps"]) ? reactionDocument["steps"] : [];
  const reactionVersion = reactionDocument["reactionVersion"];
  const difficultyTier = reactionDocument["difficultyTier"];
  return {
    reactionSlug: requiredText(reactionDocument, "reactionSlug"),
    reactionVersion: typeof reactionVersion === "number" ? reactionVersion : 1,
    title: requiredText(reactionDocument, "title"),
    subtitle: textOr(reactionDocument, "subtitle", ""),
    reactionClasses: textList(reactionDocument["reactionClasses"]),
    difficultyTier: typeof difficultyTier === "number" ? difficultyTier : 1,
    conditionsLabel: textOr(reactionDocument, "conditionsLabel", ""),
    mechanismSummary: textOr(reactionDocument, "mechanismSummary", ""),
    authors: (Array.isArray(reactionDocument["authors"]) ? reactionDocument["authors"] : [])
      .filter(isDocumentRecord)
      .map((author) => ({
        name: textOr(author, "name", ""),
        url: typeof author["url"] === "string" ? author["url"] : null,
      })),
    licence: textOr(reactionDocument, "licence", ""),
    references: textList(reactionDocument["references"]),
    startStateId: requiredText(reactionDocument, "startStateId"),
    spectatorMapNumbers: numberList(reactionDocument["spectatorMapNumbers"]),
    abbreviatedGroups: abbreviatedGroupsIn(reactionDocument["abbreviatedGroups"]),
    stateIdToState,
    steps: steps.filter(isDocumentRecord).map(sessionStepOf),
    prepared: prepareReaction(reactionDocument),
  };
}

/** The steps leaving `stateId`, preferred first. */
export function stepsLeaving(reaction: SessionReaction, stateId: string): SessionStep[] {
  const leaving = reaction.steps.filter((step) => step.fromStateId === stateId);
  return [
    ...leaving.filter((step) => step.routePreference === "preferred"),
    ...leaving.filter((step) => step.routePreference !== "preferred"),
  ];
}

/** Arrow steps on the preferred route from `stateId` to the end (change steps not counted). */
export function preferredArrowStepsFrom(reaction: SessionReaction, stateId: string): number {
  let count = 0;
  const visited = new Set<string>();
  for (
    let step = stepsLeaving(reaction, stateId)[0];
    step !== undefined && !visited.has(step.toStateId);
    step = stepsLeaving(reaction, step.toStateId)[0]
  ) {
    visited.add(step.toStateId);
    count += step.stepKind === "change" ? 0 : 1;
  }
  return count;
}
