/**
 * Dragging an atom: a move on screen becomes a move in the state's stored coordinates. Only that
 * atom in that state moves (docs/SPEC.md §5: the author tidies each state's layout).
 * Screen y points down, stored y points up (RDKit units); positions are rounded to 0.01.
 */
import { type ReactionDocument, statesOf } from "./reactionDraft.js";

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const rounded = (value: number): number => Math.round(value * 100) / 100 + 0;

/** The document with one atom moved by a screen drag, at `pixelsPerUnit` (the reaction's scale). */
export function moveAtom(
  document: ReactionDocument,
  stateId: string,
  mapNumber: number,
  screenDelta: { readonly deltaX: number; readonly deltaY: number },
  pixelsPerUnit: number,
): ReactionDocument {
  const state = statesOf(document)[stateId];
  const coordinates =
    isRecord(state) && isRecord(state.mapNumberToCoordinates) ? state.mapNumberToCoordinates : {};
  const position = coordinates[String(mapNumber)];
  if (!isRecord(state) || !Array.isArray(position)) {
    return document;
  }
  const [atomX = 0, atomY = 0] = position.map(Number);
  const moved = [
    rounded(atomX + screenDelta.deltaX / pixelsPerUnit),
    rounded(atomY - screenDelta.deltaY / pixelsPerUnit),
  ];
  const movedState = {
    ...state,
    mapNumberToCoordinates: { ...coordinates, [String(mapNumber)]: moved },
  };
  return { ...document, stateIdToState: { ...statesOf(document), [stateId]: movedState } };
}
