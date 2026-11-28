/**
 * Keeping a state's wedges in step with its SMILES marks (item 12c, docs/stereo-validation.md):
 * the marks are the truth, and after any edit that can change marks or coordinates (a SMILES
 * edit, a regenerated or new state, a dragged atom) the wedges are redrawn with wedgesForMarks:
 * wedges that still show their centre's mark stay, others are replaced, wedges at unmarked atoms
 * go.
 */
import { stateGraphFromMappedSmiles } from "../../../core/stateGraphs/mappedSmilesReading.js";
import type { StateGraph } from "../../../core/stateGraphs/stateGraph.js";
import {
  type BondToWedgeStyle,
  type WedgeStyle,
  wedgesForMarks,
} from "../../../drawing/moleculeDrawing/shared/stereoDrawing.js";
import { isRecord } from "../../../core/jsonValues/jsonValues.js";

type JsonRecord = Readonly<Record<string, unknown>>;

/** A state with its wedges redrawn: the same fields, and bondToWedgeStyle only when needed. */
export type WithRedrawnWedges<State> = Omit<State, "bondToWedgeStyle"> & {
  readonly bondToWedgeStyle?: Record<string, WedgeStyle>;
};

/**
 * The state with its bondToWedgeStyle redrawn from the marks of `graph` (the state's own graph
 * when not given); the key is removed when no wedge is needed.
 */
export function withWedgesForMarks<State extends JsonRecord>(
  state: State,
  graph?: StateGraph,
): WithRedrawnWedges<State> {
  const stateGraph = graph ?? stateGraphFromMappedSmiles(String(state.mappedSmiles));
  const coordinates = (
    isRecord(state.mapNumberToCoordinates) ? state.mapNumberToCoordinates : {}
  ) as Readonly<Record<string, readonly number[]>>;
  const current = (
    isRecord(state.bondToWedgeStyle) ? state.bondToWedgeStyle : {}
  ) as BondToWedgeStyle;
  const wedges = wedgesForMarks(stateGraph, coordinates, current);
  const withoutWedges = Object.fromEntries(
    Object.entries(state).filter(([key]) => key !== "bondToWedgeStyle"),
  ) as Omit<State, "bondToWedgeStyle">;
  return Object.keys(wedges).length === 0
    ? withoutWedges
    : { ...withoutWedges, bondToWedgeStyle: wedges };
}
