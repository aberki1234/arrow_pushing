/**
 * A reaction file being edited: a new draft, and the edits that add states and steps.
 *
 * Every edit returns a new document and leaves the one given unchanged (the undo history keeps
 * the old ones). A draft has every key the schema requires; until the 8b form fields fill them,
 * the classes, authors and mechanism summary are empty, and a new draft has no steps.
 * Names the editor makes: states "state-1", "state-2", …; steps "step-1", "step-2", … (the first
 * free one), renamed with the 8b form fields.
 */
import type { DraftState } from "./startState.js";
import { stateGraphFromMappedSmiles } from "../../../core/stateGraphs/mappedSmilesReading.js";
import { isRecord } from "../../../core/jsonValues/jsonValues.js";

/** A reaction file's JSON, read only; edits make new documents. */
export type ReactionDocument = Readonly<Record<string, unknown>>;

const FORMAT_VERSION = 1;
const LICENCE = "CC-BY-SA-4.0";

export function statesOf(document: ReactionDocument): Readonly<Record<string, unknown>> {
  return isRecord(document.stateIdToState) ? document.stateIdToState : {};
}

export function stepsOf(document: ReactionDocument): readonly Readonly<Record<string, unknown>>[] {
  return Array.isArray(document.steps) ? document.steps.filter(isRecord) : [];
}

/** "<prefix>-N" for the smallest N from 1 not in `usedNames`. */
function firstFreeName(prefix: string, usedNames: Iterable<string>): string {
  const used = new Set(usedNames);
  let number = 1;
  while (used.has(`${prefix}-${String(number)}`)) {
    number += 1;
  }
  return `${prefix}-${String(number)}`;
}

export function newReactionDraft(fields: {
  readonly reactionSlug: string;
  readonly title: string;
  readonly startState: DraftState;
}): ReactionDocument {
  const startStateId = firstFreeName("state", []);
  return {
    formatVersion: FORMAT_VERSION,
    reactionSlug: fields.reactionSlug,
    reactionVersion: 1,
    previousReactionVersion: null,
    title: fields.title,
    reactionClasses: [],
    difficultyTier: 1,
    conditionsLabel: "",
    dailyPuzzleEligible: false,
    atomRoleToMapNumbers: {},
    spectatorMapNumbers: [],
    startStateId,
    stateIdToState: { [startStateId]: structuredClone(fields.startState) },
    steps: [],
    mechanismSummary: "",
    references: [],
    authors: [],
    licence: LICENCE,
  };
}

/** The document with `state` added under the first free "state-N". */
export function addState(
  document: ReactionDocument,
  state: object,
): { document: ReactionDocument; stateId: string } {
  const states = statesOf(document);
  const stateId = firstFreeName("state", Object.keys(states));
  return {
    document: { ...document, stateIdToState: { ...states, [stateId]: structuredClone(state) } },
    stateId,
  };
}

/** The document with `step` appended under the first free "step-N" (its stepKey). */
export function addStep(
  document: ReactionDocument,
  step: object,
): { document: ReactionDocument; stepKey: string } {
  const steps = stepsOf(document);
  const stepKey = firstFreeName(
    "step",
    steps.map((existing) => String(existing.stepKey)),
  );
  return {
    document: { ...document, steps: [...steps, { stepKey, ...structuredClone(step) }] },
    stepKey,
  };
}

/** The map numbers of one state: from its SMILES, or its coordinate keys if unreadable. */
function mapNumbersOfState(state: unknown): number[] {
  if (!isRecord(state)) {
    return [];
  }
  try {
    const graph = stateGraphFromMappedSmiles(String(state.mappedSmiles));
    return [...graph.mapNumberToAtom.keys()];
  } catch {
    return Object.keys(isRecord(state.mapNumberToCoordinates) ? state.mapNumberToCoordinates : {})
      .map(Number)
      .filter(Number.isInteger);
  }
}

/** One more than the largest map number in any state (1 for a reaction with no atoms). */
export function nextFreeMapNumber(document: ReactionDocument): number {
  const mapNumbers = Object.values(statesOf(document)).flatMap(mapNumbersOfState);
  return Math.max(0, ...mapNumbers) + 1;
}
