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
 *   wedges        a tap on a bond cycles its wedge style (display only)
 * The side panel shows one tab: the reaction's fields, the selected state's, the selected step's,
 * or the lint findings. Field edits (reactionEditing/fieldEdits.ts, drawnAnswers.ts) all go
 * through applyDocumentEdit(), so each can be undone.
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
import {
  addMisconceptionFromArrows,
  addPartialArrowSet,
  addPartialProgressMessage,
  type MisconceptionFields,
} from "../reactionEditing/drawnAnswers.js";
import { cycleWedgeStyle } from "../reactionEditing/fieldEdits.js";
import type { LintPlace } from "../reactionEditing/lintPlaces.js";
import { type ReactionDocument, statesOf, stepsOf } from "../reactionEditing/reactionDraft.js";
import { editStateSmiles, regenerateStatesAfter } from "../reactionEditing/stateRegeneration.js";
import { deleteStep } from "../reactionEditing/stepDeletion.js";
import { addArrowStep } from "../reactionEditing/stepGeneration.js";

export type EditorMode = "look" | "drawArrows" | "moveAtoms" | "showHydrogen" | "wedges";

export type SideTab = "reaction" | "state" | "step" | "lint";

export interface EditorMessage {
  readonly tone: "neutral" | "good" | "bad";
  readonly text: string;
}

export interface EditorSession {
  readonly history: EditHistory;
  /** The file the draft is saved as in content/reactions/. */
  readonly fileName: string;
  readonly selectedStateId: string;
  /** The step whose fields the step tab shows, if one is selected. */
  readonly selectedStepKey: string | null;
  readonly sideTab: SideTab;
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
  const stepStillThere = stepsOf(document).some((step) => step.stepKey === session.selectedStepKey);
  const selectedStepKey = stepStillThere ? session.selectedStepKey : null;
  return { ...session, history, selectedStateId, selectedStepKey, arrowDrawing, message };
}

function refusedWith(session: EditorSession, reason: string): EditorSession {
  return { ...session, message: { tone: "bad", text: reason } };
}

export function openDraft(document: ReactionDocument, fileName: string): EditorSession {
  return {
    history: startHistory(document),
    fileName,
    selectedStateId: startStateIdOf(document),
    selectedStepKey: null,
    sideTab: "state",
    mode: "look",
    arrowDrawing: null,
    message: NO_MESSAGE,
  };
}

export function selectState(session: EditorSession, stateId: string): EditorSession {
  const sideTab = session.sideTab === "step" ? "state" : session.sideTab;
  return withDraft(
    { ...session, selectedStepKey: null, sideTab },
    session.history,
    NO_MESSAGE,
    stateId,
  );
}

/** Select a step: its from-state is shown, and the step tab. */
export function selectStep(session: EditorSession, stepKey: string): EditorSession {
  const step = stepsOf(currentDraft(session)).find((candidate) => candidate.stepKey === stepKey);
  if (step === undefined) {
    return session;
  }
  const selected = withDraft(session, session.history, NO_MESSAGE, String(step.fromStateId));
  return { ...selected, selectedStepKey: stepKey, sideTab: "step" };
}

export function setSideTab(session: EditorSession, sideTab: SideTab): EditorSession {
  return { ...session, sideTab };
}

/** Show the place a lint finding points at (reactionEditing/lintPlaces.ts). */
export function goToPlace(session: EditorSession, place: LintPlace): EditorSession {
  if (place.placeKind === "step") {
    return selectStep(session, place.stepKey);
  }
  if (place.placeKind === "state") {
    return { ...selectState(session, place.stateId), sideTab: "state" };
  }
  return { ...session, sideTab: "reaction" };
}

/** Record a field edit, or show why it was refused (the draft is then unchanged). */
export function applyDocumentEdit(
  session: EditorSession,
  edit:
    | { readonly outcome: "edited"; readonly document: ReactionDocument }
    | { readonly outcome: "refused"; readonly reason: string },
  successText = "",
): EditorSession {
  if (edit.outcome === "refused") {
    return refusedWith(session, edit.reason);
  }
  const message: EditorMessage =
    successText === "" ? NO_MESSAGE : { tone: "good", text: successText };
  return withDraft(session, recordEdit(session.history, edit.document), message);
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
  if (session.mode === "wedges" && tapped.placeKind === "bond") {
    return applyDocumentEdit(
      session,
      cycleWedgeStyle(currentDraft(session), session.selectedStateId, tapped.mapNumbers),
    );
  }
  return session;
}

/** What the drawn arrows are saved as (drawnAnswers.ts). */
export type DrawnAnswer =
  | ({ readonly answerKind: "misconception" } & MisconceptionFields)
  | { readonly answerKind: "partialProgress"; readonly feedbackMessage: string }
  | { readonly answerKind: "partialArrowSet"; readonly stepKey: string };

/** Save the drawn arrows as a misconception, partial progress message or partial arrow set. */
export function saveDrawnArrowsAs(session: EditorSession, answer: DrawnAnswer): EditorSession {
  const arrows = session.arrowDrawing?.drawnArrows ?? [];
  const document = currentDraft(session);
  const stateId = session.selectedStateId;
  let edit;
  let text: string;
  if (answer.answerKind === "misconception") {
    edit = addMisconceptionFromArrows(document, stateId, arrows, answer);
    const ids = edit.outcome === "edited" ? misconceptionIdsOn(edit.document, stateId) : [];
    text = `Saved ${ids.at(-1) ?? "the misconception"} on ${stateId}.`;
  } else if (answer.answerKind === "partialProgress") {
    edit = addPartialProgressMessage(document, stateId, arrows, answer.feedbackMessage);
    text = `Saved a partial progress message on ${stateId}.`;
  } else {
    edit = addPartialArrowSet(document, answer.stepKey, arrows);
    text = `Saved another complete arrow set for ${answer.stepKey}.`;
  }
  return applyDocumentEdit(session, edit, text);
}

function misconceptionIdsOn(document: ReactionDocument, stateId: string): string[] {
  const state = statesOf(document)[stateId];
  const entries: unknown[] =
    typeof state === "object" &&
    state !== null &&
    "misconceptions" in state &&
    Array.isArray(state.misconceptions)
      ? state.misconceptions
      : [];
  return entries.map((entry) =>
    typeof entry === "object" && entry !== null && "misconceptionId" in entry
      ? String(entry.misconceptionId)
      : "",
  );
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
