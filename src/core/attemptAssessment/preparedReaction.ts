/**
 * A reaction's mechanism prepared once for assessing attempts: state graphs, the arrow steps
 * leaving each state, parsed misconceptions and partial-progress messages, and each state's
 * symmetries. The mechanism has passed its schema check (reactionFiles/reactionFileReading.ts);
 * parsing a state's SMILES, an arrow or an arrow pattern can still throw.
 */
import { type CurvedArrow, parseCurvedArrow } from "../arrowNotation/curvedArrowNotation.js";
import type {
  Misconception,
  ReactionMechanism,
  ReactionStep,
} from "../reactionFiles/reactionFile.js";
import { stateGraphFromMappedSmiles } from "../stateGraphs/mappedSmilesReading.js";
import type { StateGraph } from "../stateGraphs/stateGraph.js";
import { type ArrowPattern, parseArrowPattern } from "./arrowPatterns.js";
import {
  type MapNumberRelabelling,
  mirrorSymmetries,
  skeletonSymmetries,
} from "./skeletonSymmetry.js";
import { stereoDistinguishedHydrogens, withHydrogensFolded } from "./hydrogenFolding.js";

/** An arrow step leaving a state, with its known arrow sets parsed (canonical arrows first). */
export interface PreparedStep {
  readonly stepKey: string;
  readonly stepKind: "polar" | "radical";
  readonly routePreference: ReactionStep["routePreference"];
  readonly toStateId: string;
  readonly knownArrowSets: readonly (readonly CurvedArrow[])[];
}

export interface PreparedMisconception {
  readonly misconceptionId: string;
  readonly misconceptionTag: string | null;
  readonly severity: Misconception["severity"];
  readonly arrowPattern: ArrowPattern;
  readonly feedbackMessage: string;
}

export interface PartialProgressMessage {
  readonly learnerArrows: readonly CurvedArrow[];
  readonly feedbackMessage: string;
}

/** A mechanism prepared for assessing. Symmetries are filled in as they are needed. */
export interface PreparedReaction {
  readonly stateIdToGraph: ReadonlyMap<string, StateGraph>;
  readonly stateIdToLeavingSteps: ReadonlyMap<string, readonly PreparedStep[]>;
  readonly stateIdToMisconceptions: ReadonlyMap<string, readonly PreparedMisconception[]>;
  readonly stateIdToPartialProgressMessages: ReadonlyMap<string, readonly PartialProgressMessage[]>;
  readonly stateIdToSymmetries: Map<string, MapNumberRelabelling[]>;
  /** The symmetries of each state with its drawn hydrogens folded (withHydrogensFolded). */
  readonly stateIdToFoldedSymmetries: Map<string, MapNumberRelabelling[]>;
  /** Item 12d: each state's mirror symmetries (achiral states with stereocentre marks). */
  readonly stateIdToMirrorSymmetries: Map<string, MapNumberRelabelling[]>;
}

function appendTo<Item>(table: Map<string, Item[]>, key: string, item: Item): void {
  table.set(key, [...(table.get(key) ?? []), item]);
}

/** The arrow steps leaving each state (change steps are events, not attempts). */
function preparedSteps(mechanism: ReactionMechanism): Map<string, PreparedStep[]> {
  const stateIdToLeavingSteps = new Map<string, PreparedStep[]>();
  for (const step of mechanism.steps) {
    if (step.stepKind === "change") {
      continue;
    }
    appendTo(stateIdToLeavingSteps, step.fromStateId, {
      stepKey: step.stepKey,
      stepKind: step.stepKind,
      routePreference: step.routePreference,
      toStateId: step.toStateId,
      knownArrowSets: [step.canonicalArrows, ...(step.partialArrowSets ?? [])].map((arrows) =>
        arrows.map(parseCurvedArrow),
      ),
    });
  }
  return stateIdToLeavingSteps;
}

function preparedMisconception(
  misconception: Misconception,
  roles: Readonly<Record<string, readonly number[]>>,
): PreparedMisconception {
  return {
    misconceptionId: misconception.misconceptionId,
    misconceptionTag: misconception.misconceptionTag ?? null,
    severity: misconception.severity,
    arrowPattern: parseArrowPattern(misconception.arrowPattern, roles),
    feedbackMessage: misconception.feedbackMessage,
  };
}

/** Prepare a mechanism (a reaction file's, or a draft's) for assessing attempts. */
export function prepareReaction(mechanism: ReactionMechanism): PreparedReaction {
  const roles = mechanism.atomRoleToMapNumbers ?? {};
  const stateIdToGraph = new Map<string, StateGraph>();
  const stateIdToMisconceptions = new Map<string, PreparedMisconception[]>();
  const stateIdToPartialProgressMessages = new Map<string, PartialProgressMessage[]>();
  for (const [stateId, state] of Object.entries(mechanism.stateIdToState)) {
    stateIdToGraph.set(stateId, stateGraphFromMappedSmiles(state.mappedSmiles));
    stateIdToMisconceptions.set(
      stateId,
      (state.misconceptions ?? []).map((entry) => preparedMisconception(entry, roles)),
    );
    stateIdToPartialProgressMessages.set(
      stateId,
      (state.partialProgressMessages ?? []).map((entry) => ({
        learnerArrows: entry.learnerArrows.map(parseCurvedArrow),
        feedbackMessage: entry.feedbackMessage,
      })),
    );
  }
  return {
    stateIdToGraph,
    stateIdToLeavingSteps: preparedSteps(mechanism),
    stateIdToMisconceptions,
    stateIdToPartialProgressMessages,
    stateIdToSymmetries: new Map(),
    stateIdToFoldedSymmetries: new Map(),
    stateIdToMirrorSymmetries: new Map(),
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

/** A state's skeleton symmetries with its drawn hydrogens folded into hydrogen counts. */
export function foldedSymmetriesOf(
  prepared: PreparedReaction,
  stateId: string,
): MapNumberRelabelling[] {
  const known = prepared.stateIdToFoldedSymmetries.get(stateId);
  if (known !== undefined) {
    return known;
  }
  const graph = graphOf(prepared, stateId);
  const symmetries = skeletonSymmetries(
    withHydrogensFolded(graph, stereoDistinguishedHydrogens(graph)),
  );
  prepared.stateIdToFoldedSymmetries.set(stateId, symmetries);
  return symmetries;
}

/** A state's mirror symmetries (skeletonSymmetry.ts), worked out the first time they are needed. */
export function mirrorSymmetriesOf(
  prepared: PreparedReaction,
  stateId: string,
): MapNumberRelabelling[] {
  const known = prepared.stateIdToMirrorSymmetries.get(stateId);
  if (known !== undefined) {
    return known;
  }
  const symmetries = mirrorSymmetries(graphOf(prepared, stateId));
  prepared.stateIdToMirrorSymmetries.set(stateId, symmetries);
  return symmetries;
}
