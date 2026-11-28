/**
 * Editing a state's structure, and regenerating the states after it on request
 * (docs/SPEC.md §5, editor decisions 2026-11-25).
 *
 * editStateSmiles
 *   The author edits a state's mapped SMILES in place (the strict subset: every atom mapped), so
 *   atoms keep their map numbers and the steps' arrows still name the same atoms. Atoms still
 *   there keep their coordinates; a new atom bonded to a placed one goes in that atom's widest
 *   free angle; any others are put in a row clear of the drawing. Later states are not touched.
 *
 * regenerateStatesAfter
 *   Starting from the edited state, each step leaving a changed state is applied again (its
 *   canonical arrows, or a change step's molecules):
 *     the arrows no longer apply                  the step is listed as broken
 *     the result is the to-state as it was        nothing changes past it
 *     the to-state was already regenerated (a join) and the result differs   listed as broken
 *     otherwise                                   the to-state is replaced and its steps follow
 *   A regenerated state keeps its own coordinates for atoms still there, and takes the from-
 *   state's for atoms new to it. Broken steps leave their to-states unchanged.
 */
import { parseCurvedArrow } from "../../../core/arrowNotation/curvedArrowNotation.js";
import {
  ArrowApplicationError,
  applyCurvedArrows,
  applySpeciesChange,
  withStereoFromToState,
  SpeciesChangeError,
} from "../../../core/stateGraphs/arrowApplication.js";
import {
  MappedSmilesError,
  stateGraphFromMappedSmiles,
} from "../../../core/stateGraphs/mappedSmilesReading.js";
import { mappedSmilesFromStateGraph } from "../../../core/stateGraphs/mappedSmilesWriting.js";
import {
  bondKeyMapNumbers,
  type StateGraph,
  stateGraphsEqual,
} from "../../../core/stateGraphs/stateGraph.js";
import { type Coordinates, placedClearOf, positionInLargestGap } from "./atomPlacement.js";
import { type ReactionDocument, statesOf, stepsOf } from "../draft/reactionDraft.js";
import { isRecord } from "../../../core/jsonValues/jsonValues.js";

export type StateEdit =
  | { readonly outcome: "edited"; readonly document: ReactionDocument }
  | { readonly outcome: "refused"; readonly reason: string };

export interface StateRegeneration {
  readonly document: ReactionDocument;
  /** In the order they were regenerated. */
  readonly regeneratedStateIds: readonly string[];
  readonly brokenStepKeys: readonly string[];
}

type JsonRecord = Readonly<Record<string, unknown>>;

function coordinatesOf(state: JsonRecord): Coordinates {
  return (
    isRecord(state.mapNumberToCoordinates) ? state.mapNumberToCoordinates : {}
  ) as Coordinates;
}

function neighboursOf(graph: StateGraph, mapNumber: number): number[] {
  return [...graph.bondToOrder.keys()]
    .map(bondKeyMapNumbers)
    .filter((pair) => pair.includes(mapNumber))
    .map(([first, second]) => (first === mapNumber ? second : first));
}

/** Coordinates for every atom of `graph`: kept where known, new atoms placed (module comment). */
function coordinatesFor(graph: StateGraph, known: Coordinates): Record<string, readonly number[]> {
  const placed: Record<string, readonly number[]> = {};
  for (const mapNumber of graph.mapNumberToAtom.keys()) {
    const position = known[String(mapNumber)];
    if (position !== undefined) {
      placed[String(mapNumber)] = position;
    }
  }
  let unplaced = [...graph.mapNumberToAtom.keys()].filter(
    (mapNumber) => !(String(mapNumber) in placed),
  );
  for (let placedOne = true; placedOne;) {
    placedOne = false;
    for (const mapNumber of unplaced) {
      const anchor = neighboursOf(graph, mapNumber).find(
        (neighbour) => String(neighbour) in placed,
      );
      if (anchor !== undefined) {
        const anchorNeighbours = neighboursOf(graph, anchor).filter(
          (neighbour) => String(neighbour) in placed,
        );
        placed[String(mapNumber)] = positionInLargestGap(placed, anchor, anchorNeighbours);
        placedOne = true;
      }
    }
    unplaced = unplaced.filter((mapNumber) => !(String(mapNumber) in placed));
  }
  const row = Object.fromEntries(
    unplaced.map((mapNumber, index) => [String(mapNumber), [1.5 * index, 0]]),
  );
  return { ...placed, ...placedClearOf(placed, row) };
}

/** Replace a state's mapped SMILES (see the module comment). */
export function editStateSmiles(
  document: ReactionDocument,
  stateId: string,
  mappedSmiles: string,
): StateEdit {
  const state = statesOf(document)[stateId];
  if (!isRecord(state)) {
    return { outcome: "refused", reason: `no state "${stateId}"` };
  }
  let graph: StateGraph;
  try {
    graph = stateGraphFromMappedSmiles(mappedSmiles);
  } catch (error) {
    if (error instanceof MappedSmilesError) {
      return { outcome: "refused", reason: `${error.errorCode}: ${error.message}` };
    }
    throw error;
  }
  const editedState = {
    ...state,
    mappedSmiles,
    mapNumberToCoordinates: coordinatesFor(graph, coordinatesOf(state)),
  };
  return {
    outcome: "edited",
    document: { ...document, stateIdToState: { ...statesOf(document), [stateId]: editedState } },
  };
}

/** The step applied to `fromGraph`, or undefined if it no longer applies. */
function appliedStep(step: JsonRecord, fromGraph: StateGraph): StateGraph | undefined {
  try {
    if (step.stepKind === "change") {
      const added =
        typeof step.addedSpecies === "string"
          ? stateGraphFromMappedSmiles(step.addedSpecies)
          : undefined;
      const removed = Array.isArray(step.removedFragmentMapNumbers)
        ? step.removedFragmentMapNumbers.map(Number)
        : [];
      return applySpeciesChange(fromGraph, added, removed);
    }
    const arrows = Array.isArray(step.canonicalArrows) ? step.canonicalArrows.map(String) : [];
    return applyCurvedArrows(fromGraph, arrows.map(parseCurvedArrow));
  } catch (error) {
    if (error instanceof ArrowApplicationError || error instanceof SpeciesChangeError) {
      return undefined;
    }
    throw error;
  }
}

/** The states being regenerated: each state's current JSON, and what has happened so far. */
interface Regeneration {
  readonly states: Record<string, JsonRecord>;
  readonly regeneratedStateIds: string[];
  readonly brokenStepKeys: string[];
}

function graphIn(regeneration: Regeneration, stateId: string): StateGraph {
  return stateGraphFromMappedSmiles(String(regeneration.states[stateId]?.mappedSmiles));
}

/** Apply one step leaving a changed state; returns whether its to-state changed. */
function regenerateStep(
  regeneration: Regeneration,
  step: JsonRecord,
  fromGraph: StateGraph,
): boolean {
  const fromStateId = String(step.fromStateId);
  const toStateId = String(step.toStateId);
  const applied = appliedStep(step, fromGraph);
  // A centre the step makes or changes keeps the configuration the author gave the to-state.
  const result =
    applied === undefined
      ? undefined
      : withStereoFromToState(applied, graphIn(regeneration, toStateId));
  const unchanged =
    result !== undefined && stateGraphsEqual(result, graphIn(regeneration, toStateId));
  if (
    result === undefined ||
    (regeneration.regeneratedStateIds.includes(toStateId) && !unchanged)
  ) {
    regeneration.brokenStepKeys.push(String(step.stepKey));
    return false;
  }
  if (unchanged) {
    return false;
  }
  const known = {
    ...coordinatesOf(regeneration.states[fromStateId] ?? {}),
    ...coordinatesOf(regeneration.states[toStateId] ?? {}),
  };
  regeneration.states[toStateId] = {
    ...regeneration.states[toStateId],
    mappedSmiles: mappedSmilesFromStateGraph(result),
    mapNumberToCoordinates: coordinatesFor(result, known),
  };
  regeneration.regeneratedStateIds.push(toStateId);
  return true;
}

/** Regenerate the states after `stateId` (see the module comment). */
export function regenerateStatesAfter(
  document: ReactionDocument,
  stateId: string,
): StateRegeneration {
  const regeneration: Regeneration = { states: {}, regeneratedStateIds: [], brokenStepKeys: [] };
  for (const [id, state] of Object.entries(statesOf(document))) {
    regeneration.states[id] = isRecord(state) ? state : {};
  }
  const toVisit = [stateId];
  for (
    let fromStateId = toVisit.shift();
    fromStateId !== undefined;
    fromStateId = toVisit.shift()
  ) {
    const fromGraph = graphIn(regeneration, fromStateId);
    for (const step of stepsOf(document).filter(
      (candidate) => candidate.fromStateId === fromStateId,
    )) {
      if (regenerateStep(regeneration, step, fromGraph)) {
        toVisit.push(String(step.toStateId));
      }
    }
  }
  const { states, regeneratedStateIds, brokenStepKeys } = regeneration;
  return {
    document: regeneratedStateIds.length > 0 ? { ...document, stateIdToState: states } : document,
    regeneratedStateIds,
    brokenStepKeys,
  };
}
