/**
 * What the editor page shows, worked out from the draft: a state's drawing (the learner site's
 * own drawing code, so the author sees what the learner will), the arrows drawn on it, and a
 * state's mapped SMILES. Kept out of the Svelte components so it can be tested.
 */
import {
  type CurvedArrow,
  parseCurvedArrow,
} from "../../../core/arrowNotation/curvedArrowNotation.js";
import { graphOf } from "../../../core/attemptAssessment/preparedReaction.js";
import {
  type DrawnCurvedArrow,
  drawCurvedArrow,
} from "../../../drawing/moleculeDrawing/curvedArrowGeometry.js";
import { drawState, type StateDrawing } from "../../../drawing/moleculeDrawing/stateDrawing.js";
import { type ReactionDocument, statesOf } from "../../reactionEditing/draft/reactionDraft.js";
import { readSessionReaction } from "../../../learner/stepSession/sessionReaction.js";
import { drawingScaleOf } from "../../../learner/learnerSite/model/stepScreenView.js";

/** A state drawn at the reaction's scale (pixels per RDKit unit, from the start state). */
export function draftDrawing(
  document: ReactionDocument,
  stateId: string,
): { drawing: StateDrawing; pixelsPerUnit: number } {
  const reaction = readSessionReaction(document);
  const state = reaction.stateIdToState.get(stateId);
  if (state === undefined) {
    throw new Error(`no state "${stateId}"`);
  }
  const pixelsPerUnit = drawingScaleOf(reaction);
  const drawing = drawState(
    graphOf(reaction.prepared, stateId),
    state.displayFields,
    pixelsPerUnit,
    {
      spectatorMapNumbers: reaction.spectatorMapNumbers,
      abbreviatedGroups: reaction.abbreviatedGroups,
    },
  );
  return { drawing, pixelsPerUnit };
}

/** The curves of the author's arrows on the drawing. */
export function drawnArrowsOn(
  drawing: StateDrawing,
  arrows: readonly CurvedArrow[],
): { drawn: DrawnCurvedArrow; arrowClass: string }[] {
  return arrows.map((curvedArrow) => ({
    drawn: drawCurvedArrow(drawing, curvedArrow),
    arrowClass: "",
  }));
}

/** The state's mapped SMILES, or "" for a state the draft does not have. */
export function mappedSmilesOf(document: ReactionDocument, stateId: string): string {
  const state = statesOf(document)[stateId];
  const smiles =
    typeof state === "object" && state !== null && "mappedSmiles" in state
      ? state.mappedSmiles
      : "";
  return typeof smiles === "string" ? smiles : "";
}

/**
 * The curves of a wrong answer's arrow pattern, for the review screen: each part written as an
 * exact arrow ("lp O1 -> σ O1-C2"; reactionEditing/teaching/drawnAnswers.ts stores drawn answers
 * so) is drawn; a loosened part ("lp O1 -> Br3", "@nucleophile") cannot be drawn and is left out.
 */
export function patternArrowsOn(
  drawing: StateDrawing,
  arrowPattern: string,
): { drawn: DrawnCurvedArrow; arrowClass: string }[] {
  return arrowPattern.split(";").flatMap((part) => {
    try {
      return drawnArrowsOn(drawing, [parseCurvedArrow(part.trim())]);
    } catch {
      return [];
    }
  });
}
