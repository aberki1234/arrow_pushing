/**
 * One learner's run through a reaction in practice mode (item 7a): the state shown, the arrows
 * drawn, checks, hints, and what each step's outcome was. Every function returns a new session;
 * the Svelte screen only renders the session and calls these.
 *
 * Phases
 *   drawing       the learner draws arrows at the current state and checks them
 *   stepCorrect   the check was correct: the arrows stay, the explanation shows, "Next step" waits
 *   changeEvent   a change step (a reagent arrives, a work-up) is shown; nothing to draw
 *   complete      the product is reached
 *
 * Rules (decided 2026-11-25): hints are free and come in three tiers; the third also shows the
 * preferred step's canonical arrows as ghost arrows, which the learner draws over and checks (no
 * separate reveal). A correct check follows whichever leaving step matched, preferred or accepted.
 * Step outcome: firstTry, afterRetry (a wrong check before), or afterHint (any hint shown).
 * A check with no arrows is not an attempt.
 */
import type { CurvedArrow, ElectronLocus } from "../arrowNotation/curvedArrowNotation.js";
import { type AttemptAssessment, assessAttempt } from "../attemptAssessment/attemptAssessment.js";
import { graphOf } from "../attemptAssessment/preparedReaction.js";
import type { StateGraph } from "../stateGraphs/stateGraph.js";
import {
  type ArrowType,
  type TappedPlace,
  electronsMovedBy,
  tapToDestinationLocus,
  tapToSourceLocus,
} from "./arrowPicking.js";
import { type SessionReaction, type SessionStep, stepsLeaving } from "./sessionReaction.js";

export const HINT_TIER_COUNT = 3;
export const NO_ARROWS_MESSAGE = "Draw at least one arrow, then check.";

export type SessionPhase = "drawing" | "stepCorrect" | "changeEvent" | "complete";
export type StepOutcome = "firstTry" | "afterRetry" | "afterHint";

export interface StepResult {
  readonly stepKey: string;
  readonly stepOutcome: StepOutcome;
  /** Checks made at the state, the correct one included. */
  readonly attemptCount: number;
  readonly hintsUsed: number;
}

export interface StepSession {
  readonly reaction: SessionReaction;
  readonly phase: SessionPhase;
  readonly currentStateId: string;
  readonly arrowType: ArrowType;
  readonly drawnArrows: readonly CurvedArrow[];
  /** The source picked, waiting for a destination tap. */
  readonly pendingSource: ElectronLocus | null;
  /** Two destinations to choose between ("which atom forms the bond?"). */
  readonly pendingDestinationOptions: readonly ElectronLocus[] | null;
  /** Why the last tap was refused, or why the check did not run. */
  readonly pickMessage: string | null;
  /** Wrong checks at the current state. */
  readonly wrongCheckCount: number;
  readonly hintsShown: number;
  readonly lastAssessment: AttemptAssessment | null;
  /** The step just taken (stepCorrect) or being shown (changeEvent). */
  readonly currentStep: SessionStep | null;
  readonly stepResults: readonly StepResult[];
}

const THIRD_HINT_FALLBACK = "The arrows are shown faintly. Draw over them, then check.";

function currentGraph(session: StepSession): StateGraph {
  return graphOf(session.reaction.prepared, session.currentStateId);
}

/** The session at `stateId` with a fresh drawing: the phase follows from the steps leaving it. */
function enterState(session: StepSession, stateId: string): StepSession {
  const [firstLeaving] = stepsLeaving(session.reaction, stateId);
  let phase: SessionPhase = "drawing";
  if (firstLeaving === undefined) {
    phase = "complete";
  } else if (firstLeaving.stepKind === "change") {
    phase = "changeEvent";
  }
  return {
    ...session,
    phase,
    currentStateId: stateId,
    drawnArrows: [],
    pendingSource: null,
    pendingDestinationOptions: null,
    pickMessage: null,
    wrongCheckCount: 0,
    hintsShown: 0,
    lastAssessment: null,
    currentStep: phase === "changeEvent" ? (firstLeaving ?? null) : null,
  };
}

export function startStepSession(reaction: SessionReaction): StepSession {
  const blank: StepSession = {
    reaction,
    phase: "drawing",
    currentStateId: reaction.startStateId,
    arrowType: reaction.reactionClasses.includes("radical") ? "fishHook" : "pair",
    drawnArrows: [],
    pendingSource: null,
    pendingDestinationOptions: null,
    pickMessage: null,
    wrongCheckCount: 0,
    hintsShown: 0,
    lastAssessment: null,
    currentStep: null,
    stepResults: [],
  };
  return enterState(blank, reaction.startStateId);
}

function withArrow(
  session: StepSession,
  source: ElectronLocus,
  destination: ElectronLocus,
): StepSession {
  const curvedArrow: CurvedArrow = {
    source,
    destination,
    electronsMoved: electronsMovedBy(session.arrowType),
  };
  return {
    ...session,
    drawnArrows: [...session.drawnArrows, curvedArrow],
    pendingSource: null,
    pendingDestinationOptions: null,
    pickMessage: null,
  };
}

export function tapPlace(session: StepSession, tapped: TappedPlace): StepSession {
  if (session.phase !== "drawing" || session.pendingDestinationOptions !== null) {
    return session;
  }
  const graph = currentGraph(session);
  if (session.pendingSource === null) {
    const sourcePick = tapToSourceLocus(graph, tapped, session.drawnArrows, session.arrowType);
    return sourcePick.pickOutcome === "source"
      ? { ...session, pendingSource: sourcePick.source, pickMessage: null }
      : { ...session, pickMessage: sourcePick.refusalMessage };
  }
  const destinationPick = tapToDestinationLocus(
    graph,
    session.pendingSource,
    tapped,
    session.arrowType,
  );
  if (destinationPick.pickOutcome === "refused") {
    return { ...session, pickMessage: destinationPick.refusalMessage };
  }
  if (destinationPick.pickOutcome === "choice") {
    return {
      ...session,
      pendingDestinationOptions: destinationPick.destinationOptions,
      pickMessage: null,
    };
  }
  return withArrow(session, session.pendingSource, destinationPick.destination);
}

export function chooseDestination(session: StepSession, optionIndex: number): StepSession {
  const destination = session.pendingDestinationOptions?.[optionIndex];
  if (session.pendingSource === null || destination === undefined) {
    return session;
  }
  return withArrow(session, session.pendingSource, destination);
}

/** Esc: drop the picked source or the pending choice. */
export function cancelPick(session: StepSession): StepSession {
  return { ...session, pendingSource: null, pendingDestinationOptions: null, pickMessage: null };
}

function withArrows(session: StepSession, drawnArrows: readonly CurvedArrow[]): StepSession {
  if (session.phase !== "drawing") {
    return session;
  }
  return { ...cancelPick(session), drawnArrows };
}

export function removeArrow(session: StepSession, arrowIndex: number): StepSession {
  return withArrows(
    session,
    session.drawnArrows.filter((unusedArrow, position) => position !== arrowIndex),
  );
}

export function undoArrow(session: StepSession): StepSession {
  return withArrows(session, session.drawnArrows.slice(0, -1));
}

export function clearArrows(session: StepSession): StepSession {
  return withArrows(session, []);
}

export function setArrowType(session: StepSession, arrowType: ArrowType): StepSession {
  return { ...cancelPick(session), arrowType };
}

export function showNextHint(session: StepSession): StepSession {
  if (session.phase !== "drawing") {
    return session;
  }
  return { ...session, hintsShown: Math.min(session.hintsShown + 1, HINT_TIER_COUNT) };
}

function outcomeOf(session: StepSession): StepOutcome {
  if (session.hintsShown > 0) {
    return "afterHint";
  }
  return session.wrongCheckCount > 0 ? "afterRetry" : "firstTry";
}

export function checkArrows(session: StepSession): StepSession {
  if (session.phase !== "drawing") {
    return session;
  }
  if (session.drawnArrows.length === 0) {
    return { ...session, pickMessage: NO_ARROWS_MESSAGE };
  }
  const checked = { ...cancelPick(session) };
  const assessment = assessAttempt(
    session.reaction.prepared,
    session.currentStateId,
    session.drawnArrows,
  );
  if (assessment.assessmentKind !== "correct") {
    return { ...checked, lastAssessment: assessment, wrongCheckCount: session.wrongCheckCount + 1 };
  }
  const takenStep =
    session.reaction.steps.find((step) => step.stepKey === assessment.stepKey) ?? null;
  const stepResult: StepResult = {
    stepKey: assessment.stepKey,
    stepOutcome: outcomeOf(session),
    attemptCount: session.wrongCheckCount + 1,
    hintsUsed: session.hintsShown,
  };
  return {
    ...checked,
    phase: "stepCorrect",
    lastAssessment: assessment,
    currentStep: takenStep,
    stepResults: [...session.stepResults, stepResult],
  };
}

/** "Next step" after a correct check, or "Continue" after a change event. */
export function continueToNextState(session: StepSession): StepSession {
  if (
    (session.phase !== "stepCorrect" && session.phase !== "changeEvent") ||
    session.currentStep === null
  ) {
    return session;
  }
  return enterState(session, session.currentStep.toStateId);
}

/** The hint texts shown so far at the current state. */
export function shownHintTexts(session: StepSession): string[] {
  const hintTiers = session.reaction.stateIdToState.get(session.currentStateId)?.hintTiers ?? [];
  return Array.from(
    { length: session.hintsShown },
    (unusedEntry, tier) => hintTiers[tier] ?? THIRD_HINT_FALLBACK,
  );
}

/** The preferred step's canonical arrows once the third hint is shown; otherwise none. */
export function ghostArrows(session: StepSession): readonly CurvedArrow[] {
  if (session.hintsShown < HINT_TIER_COUNT || session.phase !== "drawing") {
    return [];
  }
  return stepsLeaving(session.reaction, session.currentStateId)[0]?.canonicalArrows ?? [];
}
