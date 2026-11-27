/**
 * Change steps: molecules arrive (pasted as ordinary SMILES) or leave (named by any one of their
 * map numbers), with no arrows (docs/schema-design.md §3.4).
 *
 * Rules
 *   * Arriving atoms are numbered from the first free map number (startState.ts), stored as the
 *     step's addedSpecies, and drawn clear of the from-state's atoms (atomPlacement.ts).
 *   * A leaving map number removes its whole molecule (stateGraphs/arrowApplication.ts).
 *   * A change step must be the only step leaving its state; the to-state is always a new state.
 *   * Route preference as for arrow steps (stepGeneration.ts).
 */
import type { ChemistryToolkit } from "../../../tooling/chemistryToolkit/chemistryToolkit.js";
import {
  applySpeciesChange,
  SpeciesChangeError,
} from "../../../core/stateGraphs/arrowApplication.js";
import { stateGraphFromMappedSmiles } from "../../../core/stateGraphs/mappedSmilesReading.js";
import { mappedSmilesFromStateGraph } from "../../../core/stateGraphs/mappedSmilesWriting.js";
import { placedClearOf, type Coordinates } from "./atomPlacement.js";
import {
  addState,
  addStep,
  nextFreeMapNumber,
  type ReactionDocument,
  statesOf,
  stepsOf,
} from "../draft/reactionDraft.js";
import {
  type DraftState,
  StructureEntryError,
  stateFromPastedSmiles,
} from "../draft/startState.js";
import { routePreferenceFor } from "./stepGeneration.js";
import { isRecord } from "../../../core/jsonValues/jsonValues.js";

export type ChangeStepAddition =
  | {
      readonly outcome: "added";
      readonly document: ReactionDocument;
      readonly stepKey: string;
      readonly toStateId: string;
    }
  | { readonly outcome: "refused"; readonly reason: string };

/** What arrives (ordinary SMILES) and what leaves (map numbers); at least one of them. */
export interface SpeciesChange {
  readonly pastedSmiles?: string;
  readonly removedFragmentMapNumbers?: readonly number[];
}

function refused(reason: string): ChangeStepAddition {
  return { outcome: "refused", reason };
}

/** The arriving molecules as a state numbered from the first free map number, or why not. */
function arrivingSpecies(
  document: ReactionDocument,
  pastedSmiles: string | undefined,
  toolkit: Pick<ChemistryToolkit, "readStructure" | "laidOutAtoms">,
): DraftState | undefined | { readonly reason: string } {
  if (pastedSmiles === undefined || pastedSmiles.trim() === "") {
    return undefined;
  }
  try {
    return stateFromPastedSmiles(pastedSmiles, toolkit, nextFreeMapNumber(document));
  } catch (error) {
    if (error instanceof StructureEntryError) {
      return { reason: error.message };
    }
    throw error;
  }
}

/** The to-state: the change applied, existing atoms kept in place, new ones placed clear. */
function changedState(
  fromState: Readonly<Record<string, unknown>>,
  arriving: DraftState | undefined,
  removedFragmentMapNumbers: readonly number[],
): DraftState | { readonly reason: string } {
  try {
    const result = applySpeciesChange(
      stateGraphFromMappedSmiles(String(fromState.mappedSmiles)),
      arriving === undefined ? undefined : stateGraphFromMappedSmiles(arriving.mappedSmiles),
      removedFragmentMapNumbers,
    );
    const fromCoordinates: Coordinates = isRecord(fromState.mapNumberToCoordinates)
      ? (fromState.mapNumberToCoordinates as Coordinates)
      : {};
    const placedArrivals = placedClearOf(fromCoordinates, arriving?.mapNumberToCoordinates ?? {});
    const coordinates = { ...fromCoordinates, ...placedArrivals };
    const mapNumberToCoordinates = Object.fromEntries(
      [...result.mapNumberToAtom.keys()].map((mapNumber): [string, [number, number]] => {
        const [atomX = 0, atomY = 0] = coordinates[String(mapNumber)] ?? [];
        return [String(mapNumber), [atomX, atomY]];
      }),
    );
    return { mappedSmiles: mappedSmilesFromStateGraph(result), mapNumberToCoordinates };
  } catch (error) {
    if (error instanceof SpeciesChangeError) {
      return { reason: `${error.errorCode}: ${error.message}` };
    }
    throw error;
  }
}

/** Add a change step leaving `fromStateId` (see the module comment). */
export function addChangeStep(
  document: ReactionDocument,
  fromStateId: string,
  change: SpeciesChange,
  toolkit: Pick<ChemistryToolkit, "readStructure" | "laidOutAtoms">,
): ChangeStepAddition {
  const fromState = statesOf(document)[fromStateId];
  if (!isRecord(fromState)) {
    return refused(`no state "${fromStateId}"`);
  }
  if (stepsOf(document).some((step) => step.fromStateId === fromStateId)) {
    return refused(
      `a change step must be the only step leaving its state, and "${fromStateId}" has one`,
    );
  }
  const removed = change.removedFragmentMapNumbers ?? [];
  const arriving = arrivingSpecies(document, change.pastedSmiles, toolkit);
  if (arriving !== undefined && "reason" in arriving) {
    return refused(arriving.reason);
  }
  if (arriving === undefined && removed.length === 0) {
    return refused("nothing arrives or leaves");
  }
  const toState = changedState(fromState, arriving, removed);
  if ("reason" in toState) {
    return refused(toState.reason);
  }
  const withState = addState(document, toState);
  const { document: withStep, stepKey } = addStep(withState.document, {
    fromStateId,
    toStateId: withState.stateId,
    stepKind: "change",
    routePreference: routePreferenceFor(document, fromStateId),
    ...(arriving === undefined ? {} : { addedSpecies: arriving.mappedSmiles }),
    ...(removed.length === 0 ? {} : { removedFragmentMapNumbers: [...removed] }),
  });
  return { outcome: "added", document: withStep, stepKey, toStateId: withState.stateId };
}
