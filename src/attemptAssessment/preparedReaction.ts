/**
 * A reaction file read once for assessing attempts: state graphs, the arrow steps leaving each
 * state, parsed misconceptions and partial-progress messages, and each state's symmetries.
 *
 * The TypeScript twin of python/attempt_assessment/prepared_reaction.py. The document is assumed
 * schema-valid; its fields are still checked as they are read, instead of being cast.
 */
import { type CurvedArrow, parseCurvedArrow } from "../arrowNotation/curvedArrowNotation.js";
import { stateGraphFromMappedSmiles } from "../stateGraphs/mappedSmilesReading.js";
import type { StateGraph } from "../stateGraphs/stateGraph.js";
import { type ArrowPattern, parseArrowPattern } from "./arrowPatterns.js";
import { type MapNumberRelabelling, skeletonSymmetries } from "./skeletonSymmetry.js";

/** An arrow step leaving a state, with its known arrow sets parsed (canonical arrows first). */
export interface PreparedStep {
  readonly stepKey: string;
  readonly stepKind: "polar" | "radical";
  readonly routePreference: string;
  readonly toStateId: string;
  readonly knownArrowSets: readonly (readonly CurvedArrow[])[];
}

export interface PreparedMisconception {
  readonly misconceptionId: string;
  readonly misconceptionTag: string | null;
  readonly severity: string;
  readonly arrowPattern: ArrowPattern;
  readonly feedbackMessage: string;
}

export interface PartialProgressMessage {
  readonly learnerArrows: readonly CurvedArrow[];
  readonly feedbackMessage: string;
}

/** A reaction file read once for assessing. Symmetries are filled in as they are needed. */
export interface PreparedReaction {
  readonly stateIdToGraph: ReadonlyMap<string, StateGraph>;
  readonly stateIdToLeavingSteps: ReadonlyMap<string, readonly PreparedStep[]>;
  readonly stateIdToMisconceptions: ReadonlyMap<string, readonly PreparedMisconception[]>;
  readonly stateIdToPartialProgressMessages: ReadonlyMap<string, readonly PartialProgressMessage[]>;
  readonly stateIdToSymmetries: Map<string, MapNumberRelabelling[]>;
}

type DocumentRecord = Readonly<Record<string, unknown>>;

function isDocumentRecord(value: unknown): value is DocumentRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordsIn(value: unknown): DocumentRecord[] {
  return Array.isArray(value) ? value.filter(isDocumentRecord) : [];
}

function textIn(record: DocumentRecord, key: string): string {
  const value = record[key];
  if (typeof value !== "string") {
    throw new Error(`reaction file: "${key}" must be text`);
  }
  return value;
}

function arrowsIn(value: unknown): CurvedArrow[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").map(parseCurvedArrow)
    : [];
}

function roleTableIn(value: unknown): Record<string, number[]> {
  const roleTable: Record<string, number[]> = {};
  for (const [roleName, mapNumbers] of Object.entries(isDocumentRecord(value) ? value : {})) {
    roleTable[roleName] = Array.isArray(mapNumbers)
      ? mapNumbers.filter((item): item is number => typeof item === "number")
      : [];
  }
  return roleTable;
}

function appendTo<Item>(table: Map<string, Item[]>, key: string, item: Item): void {
  table.set(key, [...(table.get(key) ?? []), item]);
}

/** The arrow steps leaving each state (change steps are events, not attempts). */
function preparedSteps(reactionDocument: DocumentRecord): Map<string, PreparedStep[]> {
  const stateIdToLeavingSteps = new Map<string, PreparedStep[]>();
  for (const step of recordsIn(reactionDocument.steps)) {
    const stepKind = textIn(step, "stepKind");
    if (stepKind !== "polar" && stepKind !== "radical") {
      continue;
    }
    const partialArrowSets = Array.isArray(step.partialArrowSets) ? step.partialArrowSets : [];
    appendTo(stateIdToLeavingSteps, textIn(step, "fromStateId"), {
      stepKey: textIn(step, "stepKey"),
      stepKind,
      routePreference: textIn(step, "routePreference"),
      toStateId: textIn(step, "toStateId"),
      knownArrowSets: [arrowsIn(step.canonicalArrows), ...partialArrowSets.map(arrowsIn)],
    });
  }
  return stateIdToLeavingSteps;
}

function preparedMisconception(
  entry: DocumentRecord,
  roles: Record<string, number[]>,
): PreparedMisconception {
  return {
    misconceptionId: textIn(entry, "misconceptionId"),
    misconceptionTag: typeof entry.misconceptionTag === "string" ? entry.misconceptionTag : null,
    severity: textIn(entry, "severity"),
    arrowPattern: parseArrowPattern(textIn(entry, "arrowPattern"), roles),
    feedbackMessage: textIn(entry, "feedbackMessage"),
  };
}

/** Read a (schema-valid) reaction file for assessing attempts. */
export function prepareReaction(
  reactionDocument: Readonly<Record<string, unknown>>,
): PreparedReaction {
  const roles = roleTableIn(reactionDocument.atomRoleToMapNumbers);
  const states = isDocumentRecord(reactionDocument.stateIdToState)
    ? reactionDocument.stateIdToState
    : {};
  const stateIdToGraph = new Map<string, StateGraph>();
  const stateIdToMisconceptions = new Map<string, PreparedMisconception[]>();
  const stateIdToPartialProgressMessages = new Map<string, PartialProgressMessage[]>();
  for (const [stateId, state] of Object.entries(states)) {
    if (!isDocumentRecord(state)) {
      throw new Error(`reaction file: state "${stateId}" must be an object`);
    }
    stateIdToGraph.set(stateId, stateGraphFromMappedSmiles(textIn(state, "mappedSmiles")));
    stateIdToMisconceptions.set(
      stateId,
      recordsIn(state.misconceptions).map((entry) => preparedMisconception(entry, roles)),
    );
    stateIdToPartialProgressMessages.set(
      stateId,
      recordsIn(state.partialProgressMessages).map((entry) => ({
        learnerArrows: arrowsIn(entry.learnerArrows),
        feedbackMessage: textIn(entry, "feedbackMessage"),
      })),
    );
  }
  return {
    stateIdToGraph,
    stateIdToLeavingSteps: preparedSteps(reactionDocument),
    stateIdToMisconceptions,
    stateIdToPartialProgressMessages,
    stateIdToSymmetries: new Map(),
  };
}

/** The graph of a state; throws for an unknown state id. */
export function graphOf(prepared: PreparedReaction, stateId: string): StateGraph {
  const graph = prepared.stateIdToGraph.get(stateId);
  if (graph === undefined) {
    throw new Error(`no state "${stateId}"`);
  }
  return graph;
}

/** A state's skeleton symmetries, worked out the first time they are needed. */
export function symmetriesOf(prepared: PreparedReaction, stateId: string): MapNumberRelabelling[] {
  const known = prepared.stateIdToSymmetries.get(stateId);
  if (known !== undefined) {
    return known;
  }
  const symmetries = skeletonSymmetries(graphOf(prepared, stateId));
  prepared.stateIdToSymmetries.set(stateId, symmetries);
  return symmetries;
}
