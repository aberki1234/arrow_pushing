/**
 * The parts of a reaction file a step session uses, read once: its states and steps, typed, plus
 * the mechanism prepared for assessing attempts. The file has passed its schema check
 * (core/reactionFiles/reactionFileReading.ts); only fields the schema leaves optional get a
 * fallback here (no prompt, no subtitle, no explanation, no caption).
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
  ReactionFile,
  ReactionState,
  ReactionStep,
} from "../../core/reactionFiles/reactionFile.js";
import type {
  AbbreviatedGroup,
  StateDisplayFields,
} from "../../drawing/moleculeDrawing/state/stateDrawing.js";

/** The prompt of a state that has none (lint warns about it). */
const DEFAULT_LEARNER_PROMPT = "Draw the arrows for the next step.";

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

function sessionStateOf(stateId: string, state: ReactionState): SessionState {
  return {
    stateId,
    mappedSmiles: state.mappedSmiles,
    displayFields: state,
    learnerPrompt: state.learnerPrompt ?? DEFAULT_LEARNER_PROMPT,
    hintTiers: state.hintTiers ?? [],
  };
}

function sessionStepOf(step: ReactionStep): SessionStep {
  return {
    stepKey: step.stepKey,
    fromStateId: step.fromStateId,
    toStateId: step.toStateId,
    stepKind: step.stepKind,
    routePreference: step.routePreference,
    canonicalArrows: step.stepKind === "change" ? [] : step.canonicalArrows.map(parseCurvedArrow),
    explanationAfterStep: step.explanationAfterStep ?? "",
    caption: step.caption ?? "",
  };
}

export function readSessionReaction(reactionFile: ReactionFile): SessionReaction {
  return {
    reactionSlug: reactionFile.reactionSlug,
    reactionVersion: reactionFile.reactionVersion,
    title: reactionFile.title,
    subtitle: reactionFile.subtitle ?? "",
    reactionClasses: reactionFile.reactionClasses,
    difficultyTier: reactionFile.difficultyTier,
    conditionsLabel: reactionFile.conditionsLabel,
    mechanismSummary: reactionFile.mechanismSummary,
    authors: reactionFile.authors,
    licence: reactionFile.licence,
    references: reactionFile.references,
    startStateId: reactionFile.startStateId,
    spectatorMapNumbers: reactionFile.spectatorMapNumbers,
    abbreviatedGroups: reactionFile.abbreviatedGroups ?? [],
    stateIdToState: new Map(
      Object.entries(reactionFile.stateIdToState).map(([stateId, state]) => [
        stateId,
        sessionStateOf(stateId, state),
      ]),
    ),
    steps: reactionFile.steps.map(sessionStepOf),
    prepared: prepareReaction(reactionFile),
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
