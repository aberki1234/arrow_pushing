/**
 * The author drawing arrows on one state of the draft: taps become curved arrows by the same
 * picking rules the learner has (stepSession/arrowPicking.ts: π electrons first, then σ; a new
 * bond picked as itself, the dashed line), but on any state, including one no step leaves yet. The
 * arrows then become a step with stepGeneration.addArrowStep().
 */
import type { CurvedArrow, ElectronLocus } from "../arrowNotation/curvedArrowNotation.js";
import { stateGraphFromMappedSmiles } from "../stateGraphs/mappedSmilesReading.js";
import type { StateGraph } from "../stateGraphs/stateGraph.js";
import {
  type ArrowType,
  electronsMovedBy,
  type TappedPlace,
  tapToDestinationLocus,
  tapToSourceLocus,
} from "../stepSession/arrowPicking.js";
import { type ReactionDocument, statesOf } from "./reactionDraft.js";

export interface ArrowDrawing {
  readonly stateId: string;
  readonly graph: StateGraph;
  readonly arrowType: ArrowType;
  readonly drawnArrows: readonly CurvedArrow[];
  readonly pendingSource: ElectronLocus | null;
  /** Why the last tap was refused, for the author. */
  readonly pickMessage: string | null;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** No arrows yet; fish-hooks first in a reaction classed as radical. */
export function startArrowDrawing(document: ReactionDocument, stateId: string): ArrowDrawing {
  const state = statesOf(document)[stateId];
  if (!isRecord(state)) {
    throw new Error(`no state "${stateId}"`);
  }
  const classes = Array.isArray(document.reactionClasses) ? document.reactionClasses : [];
  return {
    stateId,
    graph: stateGraphFromMappedSmiles(String(state.mappedSmiles)),
    arrowType: classes.includes("radical") ? "fishHook" : "pair",
    drawnArrows: [],
    pendingSource: null,
    pickMessage: null,
  };
}

function withArrow(
  drawing: ArrowDrawing,
  source: ElectronLocus,
  destination: ElectronLocus,
): ArrowDrawing {
  const curvedArrow: CurvedArrow = {
    source,
    destination,
    electronsMoved: electronsMovedBy(drawing.arrowType),
  };
  return { ...cancelPick(drawing), drawnArrows: [...drawing.drawnArrows, curvedArrow] };
}

/** A tap picks the source, then the destination. */
export function tapPlace(drawing: ArrowDrawing, tapped: TappedPlace): ArrowDrawing {
  if (drawing.pendingSource === null) {
    const sourcePick = tapToSourceLocus(
      drawing.graph,
      tapped,
      drawing.drawnArrows,
      drawing.arrowType,
    );
    return sourcePick.pickOutcome === "source"
      ? { ...drawing, pendingSource: sourcePick.source, pickMessage: null }
      : { ...drawing, pickMessage: sourcePick.refusalMessage };
  }
  const destinationPick = tapToDestinationLocus(
    drawing.graph,
    drawing.pendingSource,
    tapped,
    drawing.arrowType,
  );
  if (destinationPick.pickOutcome === "refused") {
    return { ...drawing, pickMessage: destinationPick.refusalMessage };
  }
  return withArrow(drawing, drawing.pendingSource, destinationPick.destination);
}

/** Esc: drop the picked source. */
export function cancelPick(drawing: ArrowDrawing): ArrowDrawing {
  return { ...drawing, pendingSource: null, pickMessage: null };
}

export function undoArrow(drawing: ArrowDrawing): ArrowDrawing {
  return { ...cancelPick(drawing), drawnArrows: drawing.drawnArrows.slice(0, -1) };
}

export function clearArrows(drawing: ArrowDrawing): ArrowDrawing {
  return { ...cancelPick(drawing), drawnArrows: [] };
}

export function setArrowType(drawing: ArrowDrawing, arrowType: ArrowType): ArrowDrawing {
  return { ...cancelPick(drawing), arrowType };
}
