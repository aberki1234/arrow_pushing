/**
 * The editor page's state, and what each of the author's actions does to it. Every edit goes
 * through the undo history (reactionEditing/editHistory.ts); refused edits leave the draft as it
 * was and say why. The chemistry is in src/reactionEditing; this module only wires it together.
 *
 * Modes
 *   look          select states and steps
 *   drawArrows    taps on the selected state draw arrows; "Make step" turns them into a step
 *   moveAtoms     drag atoms to tidy the selected state's layout
 *   showHydrogen  a tap on an atom shows one of its implicit hydrogens
 */
import type { ChemistryToolkit } from "../chemistryToolkit/chemistryToolkit.js";
import type { TappedPlace } from "../stepSession/arrowPicking.js";
import { type ArrowDrawing, startArrowDrawing, tapPlace } from "../reactionEditing/arrowDrawing.js";
import { moveAtom } from "../reactionEditing/atomDragging.js";
import { addChangeStep, type SpeciesChange } from "../reactionEditing/changeSteps.js";
import {
  type EditHistory,
  recordEdit,
  redo,
  startHistory,
  undo,
} from "../reactionEditing/editHistory.js";
import { showHydrogen } from "../reactionEditing/explicitHydrogens.js";
import { type ReactionDocument, statesOf } from "../reactionEditing/reactionDraft.js";
import { editStateSmiles, regenerateStatesAfter } from "../reactionEditing/stateRegeneration.js";
import { deleteStep } from "../reactionEditing/stepDeletion.js";
import { addArrowStep } from "../reactionEditing/stepGeneration.js";

export type EditorMode = "look" | "drawArrows" | "moveAtoms" | "showHydrogen";

export interface EditorMessage {
  readonly tone: "neutral" | "good" | "bad";
  readonly text: string;
}

export interface EditorSession {
  readonly history: EditHistory;
  /** The file the draft is saved as in content/reactions/. */
  readonly fileName: string;
  readonly selectedStateId: string;
  readonly mode: EditorMode;
  /** The arrows being drawn on the selected state (drawArrows mode only). */
  readonly arrowDrawing: ArrowDrawing | null;
  readonly message: EditorMessage;
}

const NO_MESSAGE: EditorMessage = { tone: "neutral", text: "" };

export function currentDraft(session: EditorSession): ReactionDocument {
  return session.history.present;
}

function startStateIdOf(document: ReactionDocument): string {
  return String(document.startStateId);
}

/** The session after the draft changed: the selection kept if its state still exists. */
function withDraft(
  session: EditorSession,
  history: EditHistory,
  message: EditorMessage,
  stateId?: string,
): EditorSession {
  const document = history.present;
  const wanted = stateId ?? session.selectedStateId;
  const selectedStateId = wanted in statesOf(document) ? wanted : startStateIdOf(document);
  const arrowDrawing =
    session.mode === "drawArrows" ? startArrowDrawing(document, selectedStateId) : null;
  return { ...session, history, selectedStateId, arrowDrawing, message };
}

function refusedWith(session: EditorSession, reason: string): EditorSession {
  return { ...session, message: { tone: "bad", text: reason } };
}

export function openDraft(document: ReactionDocument, fileName: string): EditorSession {
  return {
    history: startHistory(document),
    fileName,
    selectedStateId: startStateIdOf(document),
    mode: "look",
    arrowDrawing: null,
    message: NO_MESSAGE,
  };
}

export function selectState(session: EditorSession, stateId: string): EditorSession {
  return withDraft(session, session.history, NO_MESSAGE, stateId);
}

export function setEditorMode(session: EditorSession, mode: EditorMode): EditorSession {
  return withDraft({ ...session, mode }, session.history, NO_MESSAGE);
}

/** Change the arrows being drawn (picking, undo, arrow type: reactionEditing/arrowDrawing.ts). */
export function updateArrowDrawing(
  session: EditorSession,
  change: (drawing: ArrowDrawing) => ArrowDrawing,
): EditorSession {
  return session.arrowDrawing === null
    ? session
    : { ...session, arrowDrawing: change(session.arrowDrawing) };
}

function revealHydrogenAt(session: EditorSession, mapNumber: number): EditorSession {
  const showing = showHydrogen(currentDraft(session), session.selectedStateId, mapNumber);
  if (showing.outcome === "refused") {
    return refusedWith(session, showing.reason);
  }
  const skipped = showing.statesWithoutHydrogen;
  const note = skipped.length === 0 ? "" : ` Not in ${skipped.join(", ")}: no implicit H there.`;
  const text = `Showed H${String(showing.hydrogenMapNumber)} on atom ${String(mapNumber)}.${note}`;
  return withDraft(session, recordEdit(session.history, showing.document), { tone: "good", text });
}

/** A tap on the canvas: an arrow pick while drawing, an atom's H in show-H mode. */
export function tapOnCanvas(session: EditorSession, tapped: TappedPlace): EditorSession {
  if (session.mode === "drawArrows") {
    return updateArrowDrawing(session, (drawing) => tapPlace(drawing, tapped));
  }
  if (session.mode === "showHydrogen" && tapped.placeKind === "atom") {
    return revealHydrogenAt(session, tapped.mapNumber);
  }
  return session;
}

/** The drawn arrows become a step (reactionEditing/stepGeneration.ts). */
export function makeArrowStep(session: EditorSession): EditorSession {
  const arrows = session.arrowDrawing?.drawnArrows ?? [];
  const generation = addArrowStep(currentDraft(session), session.selectedStateId, arrows);
  if (generation.outcome === "refused") {
    return refusedWith(session, generation.reason);
  }
  const joined = generation.joinedExistingState
    ? `Added ${generation.stepKey}, joining ${generation.toStateId}.`
    : `Added ${generation.stepKey} to a new state, ${generation.toStateId}.`;
  const warning =
    generation.resonanceFormOfStateId === null
      ? ""
      : ` It is a resonance form of ${generation.resonanceFormOfStateId}; lint will flag it.`;
  const history = recordEdit(session.history, generation.document);
  return withDraft(
    session,
    history,
    { tone: "good", text: joined + warning },
    generation.toStateId,
  );
}

/** Molecules arrive or leave at the selected state (reactionEditing/changeSteps.ts). */
export function addChange(
  session: EditorSession,
  change: SpeciesChange,
  toolkit: Pick<ChemistryToolkit, "readStructure" | "laidOutAtoms">,
): EditorSession {
  const addition = addChangeStep(currentDraft(session), session.selectedStateId, change, toolkit);
  if (addition.outcome === "refused") {
    return refusedWith(session, addition.reason);
  }
  const text = `Added change step ${addition.stepKey} to a new state, ${addition.toStateId}.`;
  return withDraft(
    session,
    recordEdit(session.history, addition.document),
    { tone: "good", text },
    addition.toStateId,
  );
}

/** Replace the selected state's mapped SMILES, then (if asked) regenerate the states after it. */
export function applyStateSmiles(
  session: EditorSession,
  mappedSmiles: string,
  regenerate: boolean,
): EditorSession {
  const edit = editStateSmiles(currentDraft(session), session.selectedStateId, mappedSmiles);
  if (edit.outcome === "refused") {
    return refusedWith(session, edit.reason);
  }
  if (!regenerate) {
    return withDraft(session, recordEdit(session.history, edit.document), {
      tone: "good",
      text: "Changed the state.",
    });
  }
  const regeneration = regenerateStatesAfter(edit.document, session.selectedStateId);
  const regenerated = regeneration.regeneratedStateIds;
  const broken = regeneration.brokenStepKeys;
  const text = [
    regenerated.length === 0
      ? "Nothing after this state changed."
      : `Regenerated ${regenerated.join(", ")}.`,
    broken.length === 0 ? "" : `Steps whose arrows no longer apply: ${broken.join(", ")}.`,
  ]
    .filter((part) => part !== "")
    .join(" ");
  const message: EditorMessage = { tone: broken.length === 0 ? "good" : "bad", text };
  return withDraft(session, recordEdit(session.history, regeneration.document), message);
}

/** Delete a step and the states left unreachable (the page confirms first). */
export function removeStep(session: EditorSession, stepKey: string): EditorSession {
  const deletion = deleteStep(currentDraft(session), stepKey);
  if (deletion.outcome === "refused") {
    return refusedWith(session, deletion.reason);
  }
  const removed = deletion.removedStateIds;
  const states = removed.length === 1 ? "the state" : "the states";
  const text =
    removed.length === 0
      ? `Deleted ${stepKey}.`
      : `Deleted ${stepKey} and ${states} ${removed.join(", ")}.`;
  return withDraft(session, recordEdit(session.history, deletion.document), { tone: "good", text });
}

/** Move one atom of the selected state by a screen drag. */
export function dragAtom(
  session: EditorSession,
  mapNumber: number,
  screenDelta: { readonly deltaX: number; readonly deltaY: number },
  pixelsPerUnit: number,
): EditorSession {
  const moved = moveAtom(
    currentDraft(session),
    session.selectedStateId,
    mapNumber,
    screenDelta,
    pixelsPerUnit,
  );
  return withDraft(session, recordEdit(session.history, moved), NO_MESSAGE);
}

export function editorUndo(session: EditorSession): EditorSession {
  return withDraft(session, undo(session.history), NO_MESSAGE);
}

export function editorRedo(session: EditorSession): EditorSession {
  return withDraft(session, redo(session.history), NO_MESSAGE);
}
