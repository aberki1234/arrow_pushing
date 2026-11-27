/**
 * What is saved of an unfinished daily run, and resuming from it (decided 2026-11-25, item 7b).
 * Saved after every check and every move to a new state: the steps taken, and at the current
 * state the wrong checks, hints and feedback shown. The arrows being drawn are not saved. A run
 * saved just after a correct or missed step resumes at that step's to-state.
 */
import {
  type SessionMode,
  type StepResult,
  type StepSession,
  sessionAtState,
} from "./stepSession.js";
import type { SessionReaction } from "./sessionReaction.js";

export interface SessionSnapshot {
  readonly mode: SessionMode;
  readonly stateId: string;
  readonly stepResults: readonly StepResult[];
  readonly wrongCheckCount: number;
  readonly hintsShown: number;
  readonly feedbackIdsAtState: readonly string[];
}

export function sessionSnapshot(session: StepSession): SessionSnapshot {
  const doneStep =
    session.phase === "stepCorrect" || session.phase === "stepMissed" ? session.currentStep : null;
  if (doneStep !== null) {
    return {
      mode: session.mode,
      stateId: doneStep.toStateId,
      stepResults: session.stepResults,
      wrongCheckCount: 0,
      hintsShown: 0,
      feedbackIdsAtState: [],
    };
  }
  return {
    mode: session.mode,
    stateId: session.currentStateId,
    stepResults: session.stepResults,
    wrongCheckCount: session.wrongCheckCount,
    hintsShown: session.hintsShown,
    feedbackIdsAtState: session.feedbackIdsAtState,
  };
}

export function resumeStepSession(
  reaction: SessionReaction,
  snapshot: SessionSnapshot,
): StepSession {
  return sessionAtState(reaction, snapshot.mode, snapshot.stateId, {
    stepResults: snapshot.stepResults,
    wrongCheckCount: snapshot.wrongCheckCount,
    hintsShown: snapshot.hintsShown,
    feedbackIdsAtState: snapshot.feedbackIdsAtState,
  });
}
