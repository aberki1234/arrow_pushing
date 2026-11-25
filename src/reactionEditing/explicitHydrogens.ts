/**
 * "Show H": one implicit hydrogen of an atom becomes a mapped H atom the learner can tap
 * (docs/SPEC.md §5, editor decisions 2026-11-25).
 *
 * Map numbers name one atom for the whole reaction, so the H is added wherever its atom is:
 *   * in every state holding the atom with at least one implicit H (the atom's count drops by
 *     one, and the H is drawn in the widest free angle round it, atomPlacement.ts);
 *   * in a change step's arriving molecules (addedSpecies) when the atom arrives there, so the
 *     change step still gives its to-state exactly.
 * Arrows never move implicit hydrogens, so an editor-made draft has the same count in every
 * state; states where the atom has no implicit H (hand-written files) are listed and left alone.
 * The H takes the first free map number.
 */
import { stateGraphFromMappedSmiles } from "../stateGraphs/mappedSmilesReading.js";
import { mappedSmilesFromStateGraph } from "../stateGraphs/mappedSmilesWriting.js";
import { bondKey, bondKeyMapNumbers, type StateGraph } from "../stateGraphs/stateGraph.js";
import { type Coordinates, positionInLargestGap } from "./atomPlacement.js";
import { nextFreeMapNumber, type ReactionDocument, statesOf, stepsOf } from "./reactionDraft.js";

export type HydrogenShowing =
  | {
      readonly outcome: "shown";
      readonly document: ReactionDocument;
      readonly hydrogenMapNumber: number;
      /** States holding the atom with no implicit H left, which were not changed. */
      readonly statesWithoutHydrogen: readonly string[];
    }
  | { readonly outcome: "refused"; readonly reason: string };

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function neighboursOf(graph: StateGraph, mapNumber: number): number[] {
  return [...graph.bondToOrder.keys()]
    .map(bondKeyMapNumbers)
    .filter((pair) => pair.includes(mapNumber))
    .map(([first, second]) => (first === mapNumber ? second : first));
}

/** The graph with one of the atom's implicit hydrogens made the mapped atom `hydrogenMapNumber`. */
function withHydrogen(graph: StateGraph, mapNumber: number, hydrogenMapNumber: number): StateGraph {
  const mapNumberToAtom = new Map(graph.mapNumberToAtom);
  const atom = mapNumberToAtom.get(mapNumber);
  if (atom !== undefined) {
    mapNumberToAtom.set(mapNumber, { ...atom, hydrogenCount: atom.hydrogenCount - 1 });
  }
  mapNumberToAtom.set(hydrogenMapNumber, {
    mapNumber: hydrogenMapNumber,
    element: "H",
    hydrogenCount: 0,
    nonbondingElectronCount: 0,
  });
  const bondToOrder = new Map(graph.bondToOrder).set(bondKey(mapNumber, hydrogenMapNumber), 1);
  return { mapNumberToAtom, bondToOrder };
}

function hasImplicitHydrogen(graph: StateGraph, mapNumber: number): boolean {
  return (graph.mapNumberToAtom.get(mapNumber)?.hydrogenCount ?? 0) > 0;
}

/** Every state holding the atom, with the H added where it can be. */
function statesWithHydrogen(
  document: ReactionDocument,
  mapNumber: number,
  hydrogenMapNumber: number,
): { stateIdToState: Record<string, unknown>; statesWithoutHydrogen: string[] } {
  const stateIdToState: Record<string, unknown> = {};
  const statesWithoutHydrogen: string[] = [];
  for (const [stateId, state] of Object.entries(statesOf(document))) {
    const graph = isRecord(state)
      ? stateGraphFromMappedSmiles(String(state.mappedSmiles))
      : undefined;
    if (graph === undefined || !isRecord(state) || !graph.mapNumberToAtom.has(mapNumber)) {
      stateIdToState[stateId] = state;
      continue;
    }
    if (!hasImplicitHydrogen(graph, mapNumber)) {
      statesWithoutHydrogen.push(stateId);
      stateIdToState[stateId] = state;
      continue;
    }
    const coordinates = (
      isRecord(state.mapNumberToCoordinates) ? state.mapNumberToCoordinates : {}
    ) as Coordinates;
    stateIdToState[stateId] = {
      ...state,
      mappedSmiles: mappedSmilesFromStateGraph(withHydrogen(graph, mapNumber, hydrogenMapNumber)),
      mapNumberToCoordinates: {
        ...coordinates,
        [String(hydrogenMapNumber)]: positionInLargestGap(
          coordinates,
          mapNumber,
          neighboursOf(graph, mapNumber),
        ),
      },
    };
  }
  return { stateIdToState, statesWithoutHydrogen };
}

/** Steps with the H added to any arriving molecules holding the atom. */
function stepsWithHydrogen(
  document: ReactionDocument,
  mapNumber: number,
  hydrogenMapNumber: number,
): Readonly<Record<string, unknown>>[] {
  return stepsOf(document).map((step) => {
    if (typeof step.addedSpecies !== "string") {
      return step;
    }
    const species = stateGraphFromMappedSmiles(step.addedSpecies);
    return hasImplicitHydrogen(species, mapNumber)
      ? {
          ...step,
          addedSpecies: mappedSmilesFromStateGraph(
            withHydrogen(species, mapNumber, hydrogenMapNumber),
          ),
        }
      : step;
  });
}

/** Show one implicit H of atom `mapNumber`, chosen in state `stateId` (see the module comment). */
export function showHydrogen(
  document: ReactionDocument,
  stateId: string,
  mapNumber: number,
): HydrogenShowing {
  const state = statesOf(document)[stateId];
  if (!isRecord(state)) {
    return { outcome: "refused", reason: `no state "${stateId}"` };
  }
  const atom = stateGraphFromMappedSmiles(String(state.mappedSmiles)).mapNumberToAtom.get(
    mapNumber,
  );
  if (atom === undefined) {
    return { outcome: "refused", reason: `no atom ${String(mapNumber)} in state "${stateId}"` };
  }
  if (atom.hydrogenCount === 0) {
    return {
      outcome: "refused",
      reason: `${atom.element}${String(mapNumber)} has no implicit hydrogen in state "${stateId}"`,
    };
  }
  const hydrogenMapNumber = nextFreeMapNumber(document);
  const { stateIdToState, statesWithoutHydrogen } = statesWithHydrogen(
    document,
    mapNumber,
    hydrogenMapNumber,
  );
  return {
    outcome: "shown",
    document: {
      ...document,
      stateIdToState,
      steps: stepsWithHydrogen(document, mapNumber, hydrogenMapNumber),
    },
    hydrogenMapNumber,
    statesWithoutHydrogen,
  };
}
