/**
 * One run: one play-through of a reaction version in one run mode (docs/schema-design.md §0),
 * from loading its reaction to recording it in learner progress, once, when it is complete.
 * Storage, the reaction loader and the clock are passed in (RunDependencies), so a run touches
 * them only through those interfaces.
 */
import type { Catalogue } from "../../../core/catalogue/catalogueReading.js";
import {
  type DailyPuzzle,
  dailyPageStateOf,
  dailyResultOf,
} from "../../dailyPuzzle/dailyPuzzle.js";
import {
  type DailyResult,
  type LearnerProgress,
  type ProgressStorage,
  clearDailyInProgress,
  readDailyInProgress,
  readProgress,
  runOfDailyResult,
  runRecordOf,
  withDailyResult,
  withRun,
  writeDailyInProgress,
  writeProgress,
} from "../../learnerProgress/learnerProgress.js";
import { resumeStepSession, sessionSnapshot } from "../../stepSession/sessionSnapshot.js";
import type { SessionReaction } from "../../stepSession/sessionReaction.js";
import {
  type StepResult,
  type StepSession,
  startStepSession,
} from "../../stepSession/stepSession.js";
import { type FinishedViewExtras, finishedViewExtras } from "./runSummaryView.js";

/** Which reaction is played, in which run mode, and where from. */
export type RunSetting =
  | {
      readonly runMode: "practice";
      readonly reactionVersionRef: string;
      /** Played from a Learn problem set: the finished view offers no related reactions. */
      readonly inProblemSet: boolean;
    }
  | {
      readonly runMode: "checkpoint";
      readonly reactionVersionRef: string;
      /** The checkpoint, "<trackSlug>/<problemSetSlug>", recorded with the run. */
      readonly problemSetRef: string;
    }
  | {
      readonly runMode: "daily";
      /** Today's puzzle, fixed when the run is loaded: it counts for the day it started. */
      readonly puzzle: DailyPuzzle;
    };

export interface RunDependencies {
  readonly catalogue: Catalogue;
  readonly storage: ProgressStorage;
  readonly loadReaction: (reactionVersionRef: string) => Promise<SessionReaction>;
  readonly now: () => Date;
}

export type LearnerRun = {
  readonly setting: RunSetting;
} & (
  | { readonly runPhase: "loadFailed"; readonly loadError: string }
  | {
      /** A daily puzzle not started yet. */
      readonly runPhase: "notStarted";
      readonly reaction: SessionReaction;
      /** The learner's progress when the run was loaded (the daily streak). */
      readonly progress: LearnerProgress;
    }
  | {
      readonly runPhase: "playing";
      readonly reaction: SessionReaction;
      /** ISO time the run started; with the reaction version, it identifies the run. */
      readonly startedAt: string;
      readonly session: StepSession;
    }
  | {
      readonly runPhase: "finished";
      readonly reaction: SessionReaction;
      readonly startedAt: string;
      readonly stepResults: readonly StepResult[];
      /** A daily run's result; null in the other run modes. */
      readonly dailyResult: DailyResult | null;
      /** The learner's progress with this run recorded (the daily streak). */
      readonly progress: LearnerProgress;
      /** What the finished view adds from the learner's history. */
      readonly extras: FinishedViewExtras;
    }
);

/** The run for `setting`, with its reaction loaded. */
export async function loadRun(
  setting: RunSetting,
  dependencies: RunDependencies,
): Promise<LearnerRun> {
  let reaction: SessionReaction;
  try {
    reaction = await dependencies.loadReaction(reactionVersionRefOf(setting));
  } catch (error: unknown) {
    return { setting, runPhase: "loadFailed", loadError: String(error) };
  }
  if (setting.runMode === "daily") {
    return dailyRunOnOpening(setting, reaction, dependencies);
  }
  return playingFromStart(setting, reaction, dependencies);
}

function reactionVersionRefOf(setting: RunSetting): string {
  return setting.runMode === "daily"
    ? setting.puzzle.reactionVersionRef
    : setting.reactionVersionRef;
}

/** A daily run as the page opens: a puzzle saved on an earlier day is dropped. */
function dailyRunOnOpening(
  setting: RunSetting & { readonly runMode: "daily" },
  reaction: SessionReaction,
  dependencies: RunDependencies,
): LearnerRun {
  const progress = readProgress(dependencies.storage);
  const opened = dailyPageStateOf(
    setting.puzzle,
    progress,
    readDailyInProgress(dependencies.storage),
  );
  if (opened.pageState === "inProgress") {
    const session = resumeStepSession(reaction, opened.saved.snapshot);
    const resumed: LearnerRun = {
      setting,
      runPhase: "playing",
      reaction,
      startedAt: opened.saved.startedAt,
      session,
    };
    // Saved just after its last step was correct or missed: the run is already complete.
    return runAfterStep(resumed, session, dependencies);
  }
  if (opened.pageState === "finished") {
    const { dailyResult } = opened;
    return {
      setting,
      runPhase: "finished",
      reaction,
      startedAt: dailyResult.runStartedAt,
      stepResults: runOfDailyResult(progress, dailyResult)?.stepResults ?? [],
      dailyResult,
      progress,
      extras: finishedViewExtras(dependencies.catalogue, reaction, progress, progress),
    };
  }
  if (opened.dropSavedPuzzle) {
    clearDailyInProgress(dependencies.storage);
  }
  return { setting, runPhase: "notStarted", reaction, progress };
}

function playingFromStart(
  setting: RunSetting,
  reaction: SessionReaction,
  dependencies: RunDependencies,
): LearnerRun {
  return {
    setting,
    runPhase: "playing",
    reaction,
    startedAt: dependencies.now().toISOString(),
    session: startStepSession(reaction, setting.runMode),
  };
}

/** A daily puzzle started, or a finished practice run started again (Play again). */
export function startRun(run: LearnerRun, dependencies: RunDependencies): LearnerRun {
  const startable =
    run.runPhase === "notStarted" ||
    (run.runPhase === "finished" && run.setting.runMode === "practice");
  if (!startable) {
    return run;
  }
  const started = playingFromStart(run.setting, run.reaction, dependencies);
  saveUnfinishedDaily(started, dependencies);
  return started;
}

/** A daily run still being played is saved, to be resumed on return. */
function saveUnfinishedDaily(run: LearnerRun, dependencies: RunDependencies): void {
  if (run.setting.runMode !== "daily" || run.runPhase !== "playing") {
    return;
  }
  const { puzzle } = run.setting;
  writeDailyInProgress(dependencies.storage, {
    formatVersion: 1,
    localDate: puzzle.localDate,
    puzzleNumber: puzzle.puzzleNumber,
    reactionVersionRef: puzzle.reactionVersionRef,
    startedAt: run.startedAt,
    snapshot: sessionSnapshot(run.session),
  });
}

/** The run after its step session moved on to `next`. */
export function runAfterStep(
  run: LearnerRun,
  next: StepSession,
  dependencies: RunDependencies,
): LearnerRun {
  if (run.runPhase !== "playing") {
    return run;
  }
  if (next.phase !== "complete") {
    const playing: LearnerRun = { ...run, session: next };
    saveUnfinishedDaily(playing, dependencies);
    return playing;
  }
  const record = runRecordOf(next, run.startedAt, problemSetRefOf(run.setting));
  const dailyResult =
    run.setting.runMode === "daily" ? dailyResultOf(run.setting.puzzle, record) : null;
  const before = readProgress(dependencies.storage);
  let after = withRun(before, record);
  if (run.setting.runMode === "daily" && dailyResult !== null) {
    after = withDailyResult(after, run.setting.puzzle.localDate, dailyResult);
    clearDailyInProgress(dependencies.storage);
  }
  writeProgress(dependencies.storage, after);
  return {
    setting: run.setting,
    runPhase: "finished",
    reaction: run.reaction,
    startedAt: run.startedAt,
    stepResults: next.stepResults,
    dailyResult,
    progress: after,
    extras: extrasFor(
      run.setting,
      finishedViewExtras(dependencies.catalogue, run.reaction, before, after),
    ),
  };
}

function problemSetRefOf(setting: RunSetting): string | null {
  return setting.runMode === "checkpoint" ? setting.problemSetRef : null;
}

/** Related reactions are offered only for a practice run played outside a problem set. */
function extrasFor(setting: RunSetting, extras: FinishedViewExtras): FinishedViewExtras {
  const offersRelated = setting.runMode === "practice" && !setting.inProblemSet;
  return offersRelated ? extras : { ...extras, relatedCards: [] };
}
