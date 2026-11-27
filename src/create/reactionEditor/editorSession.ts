/**
 * The editor page's state, and what each of the author's actions does to it. Every edit goes
 * through the undo history (reactionEditing/mechanism/editHistory.ts); refused edits leave the
 * draft as it was and say why. The chemistry is in src/create/reactionEditing; this module only
 * wires it together.
 *
 * Modes
 *   look          select states and steps
 *   drawArrows    taps on the selected state draw arrows; "Make step" turns them into a step
 *   moveAtoms     drag atoms to tidy the selected state's layout
 *   showHydrogen  a tap on an atom shows one of its implicit hydrogens
 *   wedges        a tap on a bond gives it the chosen wedge style (wedgeStyle; display only):
 *                 narrow end on the more substituted atom, a second tap flips it
 * Stages (docs/SPEC.md §5, "Create"): a draft opens on the stage its progress points to
 * (reactionEditing/publishing/creationProgress.ts). Arrows are drawn on the mechanism stage, and on
 * the teaching stage while its "Common wrong answers" item is open; elsewhere the drawing only
 * shows. Field edits (reactionEditing/draft/fieldEdits.ts, drawnAnswers.ts) all go through
 * applyDocumentEdit(), so each can be undone.
 */
import type { ChemistryToolkit } from "../../tooling/chemistryToolkit/chemistryToolkit.js";
import type { TappedPlace } from "../../learner/stepSession/arrowPicking.js";
import {
  type ArrowDrawing,
  startArrowDrawing,
  tapPlace,
} from "../reactionEditing/mechanism/arrowDrawing.js";
import { moveAtom } from "../reactionEditing/mechanism/atomDragging.js";
import { addChangeStep, type SpeciesChange } from "../reactionEditing/mechanism/changeSteps.js";
import {
  type EditHistory,
  recordEdit,
  redo,
  startHistory,
  undo,
} from "../reactionEditing/mechanism/editHistory.js";
import { showHydrogen } from "../reactionEditing/mechanism/explicitHydrogens.js";
import {
  addMisconceptionFromArrows,
  addPartialArrowSet,
  addPartialProgressMessage,
  type MisconceptionFields,
} from "../reactionEditing/teaching/drawnAnswers.js";
import { applyWedgeStyle, type WedgeStyleChoice } from "../reactionEditing/draft/fieldEdits.js";
import { stageOfPlace } from "../reactionEditing/publishing/checkTasks.js";
import {
  type CreationStage,
  creationProgress,
  openingStage,
} from "../reactionEditing/publishing/creationProgress.js";
import type { LintPlace } from "../reactionEditing/draft/lintPlaces.js";
import {
  type ReactionDocument,
  statesOf,
  stepsOf,
} from "../reactionEditing/draft/reactionDraft.js";
import {
  editStateSmiles,
  regenerateStatesAfter,
} from "../reactionEditing/mechanism/stateRegeneration.js";
import { deleteStep } from "../reactionEditing/mechanism/stepDeletion.js";
import { stateDisplayNames, stateStripRows } from "../reactionEditing/outline/stateStrip.js";
import { addArrowStep } from "../reactionEditing/mechanism/stepGeneration.js";
import {
  nextTeachingItemKey,
  teachingChecklist,
  teachingItemKey,
} from "../reactionEditing/teaching/teachingChecklist.js";

export type EditorMode = "look" | "drawArrows" | "moveAtoms" | "showHydrogen" | "wedges";

export interface EditorMessage {
  readonly tone: "neutral" | "good" | "bad";
  readonly text: string;
}

export interface EditorSession {
  readonly history: EditHistory;
  /** The file the draft is saved as in content/reactions/. */
  readonly fileName: string;
  readonly selectedStateId: string;
  /** The step whose fields the mechanism stage shows, if one is selected. */
  readonly selectedStepKey: string | null;
  /** Create's stage on screen (docs/SPEC.md §5, "Create"). */
  readonly stage: CreationStage;
  /** The Teaching item open (teachingChecklist.teachingItemKey), if one is. */
  readonly teachingItemKey: string | null;
  /**
   * The field a check asked to see (goToPlace): the page opens its folded section, scrolls to it
   * and focuses it. Numbered, so that the same check clicked again shows it again.
   */
  readonly focusRequest: { readonly field: string; readonly requestNumber: number } | null;
  readonly mode: EditorMode;
  /** The style a bond tapped in wedges mode is given. */
  readonly wedgeStyle: WedgeStyleChoice;
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

/** The first state of the route that no step leaves yet: where drawing goes on. */
function stateToContinueFrom(document: ReactionDocument): string {
  const steps = stepsOf(document);
  const [route] = stateStripRows(document);
  const open = route?.frames.find(
    (frame) =>
      frame.frameKind === "state" && !steps.some((step) => step.fromStateId === frame.stateId),
  );
  return open?.frameKind === "state" ? open.stateId : startStateIdOf(document);
}

export function openDraft(document: ReactionDocument, fileName: string): EditorSession {
  const stage = openingStage(creationProgress(document));
  const opened: EditorSession = {
    history: startHistory(document),
    fileName,
    selectedStateId:
      stage === "mechanism" ? stateToContinueFrom(document) : startStateIdOf(document),
    selectedStepKey: null,
    stage: "start",
    teachingItemKey: null,
    focusRequest: null,
    mode: "look",
    wedgeStyle: "wedge",
    arrowDrawing: null,
    message: NO_MESSAGE,
  };
  return setStage(opened, stage);
}

export function selectState(session: EditorSession, stateId: string): EditorSession {
  return withDraft({ ...session, selectedStepKey: null }, session.history, NO_MESSAGE, stateId);
}

/** Select a step: its from-state is shown. */
export function selectStep(session: EditorSession, stepKey: string): EditorSession {
  const step = stepsOf(currentDraft(session)).find((candidate) => candidate.stepKey === stepKey);
  if (step === undefined) {
    return session;
  }
  const selected = withDraft(session, session.history, NO_MESSAGE, String(step.fromStateId));
  return { ...selected, selectedStepKey: stepKey };
}

const MECHANISM_MODES: readonly EditorMode[] = [
  "drawArrows",
  "moveAtoms",
  "showHydrogen",
  "wedges",
];

/** Show a stage. The teaching stage keeps its open item, or opens the first not done. */
export function setStage(session: EditorSession, stage: CreationStage): EditorSession {
  if (stage === "teaching") {
    const groups = teachingChecklist(currentDraft(session), []);
    const keys = groups.flatMap((group) => group.items.map(teachingItemKey));
    const kept = keys.find((key) => key === session.teachingItemKey);
    const key = kept ?? nextTeachingItemKey(groups, null);
    if (key !== null) {
      return selectTeachingItem(session, key);
    }
  }
  const mode =
    stage === "mechanism"
      ? MECHANISM_MODES.includes(session.mode)
        ? session.mode
        : "drawArrows"
      : "look";
  const message = stage === session.stage ? session.message : NO_MESSAGE;
  return withDraft({ ...session, stage, mode }, session.history, message);
}

/** Open a teaching item: its state is shown; arrows are drawn there for wrong answers. */
export function selectTeachingItem(session: EditorSession, itemKey: string): EditorSession {
  const document = currentDraft(session);
  const item = teachingChecklist(document, [])
    .flatMap((group) => group.items)
    .find((candidate) => teachingItemKey(candidate) === itemKey);
  if (item === undefined) {
    return session;
  }
  const { place } = item;
  const stateId =
    place.placeKind === "state"
      ? place.stateId
      : place.placeKind === "step"
        ? String(stepsOf(document).find((step) => step.stepKey === place.stepKey)?.fromStateId)
        : session.selectedStateId;
  const mode = item.itemKind === "misconceptions" ? "drawArrows" : "look";
  return withDraft(
    { ...session, stage: "teaching", teachingItemKey: itemKey, mode, selectedStepKey: null },
    session.history,
    NO_MESSAGE,
    stateId,
  );
}

/** The teaching item at `place`, or else the first one on the same state or step. */
function teachingItemKeyAt(document: ReactionDocument, place: LintPlace): string | null {
  const items = teachingChecklist(document, []).flatMap((group) => group.items);
  const subjectOf = (candidate: LintPlace): string => JSON.stringify({ ...candidate, field: null });
  const exact = items.find((item) => JSON.stringify(item.place) === JSON.stringify(place));
  const sameSubject = items.find((item) => subjectOf(item.place) === subjectOf(place));
  const found = exact ?? sameSubject;
  return found === undefined ? null : teachingItemKey(found);
}

/** Show the place a lint finding points at, on the stage that edits it, asking for its field. */
export function goToPlace(session: EditorSession, place: LintPlace): EditorSession {
  const shown = goToPlaceOnItsStage(session, place);
  const requestNumber = (session.focusRequest?.requestNumber ?? 0) + 1;
  return {
    ...shown,
    focusRequest: place.field === null ? null : { field: place.field, requestNumber },
  };
}

/** The place's stage, with its teaching item, state or step selected (checkTasks.ts). */
function goToPlaceOnItsStage(session: EditorSession, place: LintPlace): EditorSession {
  const stage = stageOfPlace(place);
  if (stage === "teaching") {
    const key = teachingItemKeyAt(currentDraft(session), place);
    return key === null ? setStage(session, stage) : selectTeachingItem(session, key);
  }
  const staged = setStage(session, stage);
  if (stage === "mechanism" && place.placeKind === "step") {
    return selectStep(staged, place.stepKey);
  }
  if (stage === "mechanism" && place.placeKind === "state") {
    return selectState(staged, place.stateId);
  }
  return staged;
}

/** A field edit (reactionEditing/draft/fieldEdits.ts, drawnAnswers.ts): the new draft, or why not.
 * */
export type DocumentEdit =
  | { readonly outcome: "edited"; readonly document: ReactionDocument }
  | { readonly outcome: "refused"; readonly reason: string };

/** Record a field edit, or show why it was refused (the draft is then unchanged). */
export function applyDocumentEdit(
  session: EditorSession,
  edit: DocumentEdit,
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

/** Choose the style that a bond tapped in wedges mode is given. */
export function setWedgeStyle(session: EditorSession, wedgeStyle: WedgeStyleChoice): EditorSession {
  return { ...session, wedgeStyle };
}

/** Change the arrows being drawn (picking, undo, arrow type:
 * reactionEditing/mechanism/arrowDrawing.ts). */
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
      applyWedgeStyle(
        currentDraft(session),
        session.selectedStateId,
        tapped.mapNumbers,
        session.wedgeStyle,
      ),
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
  const stateName = stateDisplayNames(document).get(stateId) ?? stateId;
  if (answer.answerKind === "misconception") {
    edit = addMisconceptionFromArrows(document, stateId, arrows, answer);
    text = `Saved the wrong answer on ${stateName}.`;
  } else if (answer.answerKind === "partialProgress") {
    edit = addPartialProgressMessage(document, stateId, arrows, answer.feedbackMessage);
    text = `Saved a "right so far" message on ${stateName}.`;
  } else {
    edit = addPartialArrowSet(document, answer.stepKey, arrows);
    text = "Saved another complete arrow set for this step.";
  }
  return applyDocumentEdit(session, edit, text);
}

/** The drawn arrows become a step (reactionEditing/mechanism/stepGeneration.ts). */
export function makeArrowStep(session: EditorSession): EditorSession {
  const arrows = session.arrowDrawing?.drawnArrows ?? [];
  const generation = addArrowStep(currentDraft(session), session.selectedStateId, arrows);
  if (generation.outcome === "refused") {
    return refusedWith(session, generation.reason);
  }
  const names = stateDisplayNames(generation.document);
  const nameOf = (stateId: string): string => names.get(stateId) ?? stateId;
  const fromTo = `${nameOf(session.selectedStateId)} → ${nameOf(generation.toStateId)}`;
  const joined = generation.joinedExistingState
    ? `Step made: ${fromTo}, joining a state you already have.`
    : `Step made: ${fromTo}.`;
  const warning =
    generation.resonanceFormOfStateId === null
      ? ""
      : ` It is a resonance form of ${generation.resonanceFormOfStateId}; lint will flag it.`;
  const history = recordEdit(session.history, generation.document);
  const made = withDraft(
    session,
    history,
    { tone: "good", text: joined + warning },
    generation.toStateId,
  );
  return { ...made, selectedStepKey: generation.stepKey };
}

/** Molecules arrive or leave at the selected state (reactionEditing/mechanism/changeSteps.ts). */
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
