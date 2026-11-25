/**
 * The learner's progress in the browser (docs/schema-design.md section 7; decided 2026-11-25,
 * item 7b), kept in localStorage and checked against schema/progress.schema.json when read.
 *
 * Keys
 *   arrowpush.progress             runs (both modes, saved when a run completes), daily results by
 *                                  local date, settings (theme)
 *   arrowpush.progress.unreadable  the old text, kept when the saved progress cannot be read, so
 *                                  starting afresh destroys nothing
 *   arrowpush.dailyInProgress      the unfinished daily puzzle, saved after every check and step
 *
 * Storage is passed in (the browser's localStorage, or a map in tests). Functions that change
 * progress return a new value; nothing is written until writeProgress.
 */
import { Ajv2020 } from "ajv/dist/2020.js";
import progressSchemaJson from "../../schema/progress.schema.json";
import type { SessionSnapshot } from "../stepSession/sessionSnapshot.js";
import type { SessionMode, StepResult, StepSession } from "../stepSession/stepSession.js";

export const PROGRESS_STORAGE_KEY = "arrowpush.progress";
export const UNREADABLE_PROGRESS_STORAGE_KEY = "arrowpush.progress.unreadable";
export const DAILY_IN_PROGRESS_STORAGE_KEY = "arrowpush.dailyInProgress";

/** The part of the browser's Storage interface used here. */
export interface ProgressStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type ThemeSetting = "auto" | "light" | "dark";

export interface RunRecord {
  readonly reactionVersionRef: string;
  readonly mode: SessionMode;
  /** ISO time; with the ref, identifies the run. */
  readonly startedAt: string;
  readonly stepResults: readonly StepResult[];
}

export interface DailyResult {
  readonly reactionVersionRef: string;
  readonly puzzleNumber: number;
  /** The daily run's startedAt, to find it among the runs. */
  readonly runStartedAt: string;
  readonly shareGrid: string;
  readonly score: number;
}

export interface LearnerProgress {
  readonly formatVersion: 1;
  readonly runs: readonly RunRecord[];
  readonly dateToDailyResult: Readonly<Record<string, DailyResult>>;
  readonly settings: { readonly theme: ThemeSetting };
}

export interface DailyInProgress {
  readonly formatVersion: 1;
  /** The learner's local date the puzzle was started on; the result counts for it. */
  readonly localDate: string;
  readonly puzzleNumber: number;
  readonly reactionVersionRef: string;
  readonly startedAt: string;
  readonly snapshot: SessionSnapshot;
}

const PROGRESS_SCHEMA_ID = "urn:mech-training:schema:progress:1";
const ajv = new Ajv2020({ allErrors: true });
ajv.addSchema(progressSchemaJson);
const isValidProgress = ajv.getSchema(PROGRESS_SCHEMA_ID);
const isValidDailyInProgress = ajv.compile({
  $ref: `${PROGRESS_SCHEMA_ID}#/$defs/dailyInProgress`,
});

/** The text parsed as JSON, or undefined when it is not JSON. */
function parsedJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

export function emptyProgress(): LearnerProgress {
  return { formatVersion: 1, runs: [], dateToDailyResult: {}, settings: { theme: "auto" } };
}

/** The saved progress; empty when there is none, or when it cannot be read (kept aside). */
export function readProgress(storage: ProgressStorage): LearnerProgress {
  const text = storage.getItem(PROGRESS_STORAGE_KEY);
  if (text === null) {
    return emptyProgress();
  }
  const saved = parsedJson(text);
  if (isValidProgress?.(saved) === true) {
    return saved as LearnerProgress;
  }
  storage.setItem(UNREADABLE_PROGRESS_STORAGE_KEY, text);
  return emptyProgress();
}

export function writeProgress(storage: ProgressStorage, progress: LearnerProgress): void {
  storage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress));
}

/** The progress with `run` added; a run with the same ref and start time is replaced. */
export function withRun(progress: LearnerProgress, run: RunRecord): LearnerProgress {
  const others = progress.runs.filter(
    (kept) =>
      kept.reactionVersionRef !== run.reactionVersionRef || kept.startedAt !== run.startedAt,
  );
  return { ...progress, runs: [...others, run] };
}

export function withDailyResult(
  progress: LearnerProgress,
  localDate: string,
  dailyResult: DailyResult,
): LearnerProgress {
  return {
    ...progress,
    dateToDailyResult: { ...progress.dateToDailyResult, [localDate]: dailyResult },
  };
}

export function withTheme(progress: LearnerProgress, theme: ThemeSetting): LearnerProgress {
  return { ...progress, settings: { ...progress.settings, theme } };
}

/** The run a daily result was saved from, if it is among the runs. */
export function runOfDailyResult(
  progress: LearnerProgress,
  dailyResult: DailyResult,
): RunRecord | null {
  return (
    progress.runs.find(
      (run) =>
        run.reactionVersionRef === dailyResult.reactionVersionRef &&
        run.startedAt === dailyResult.runStartedAt,
    ) ?? null
  );
}

/** The unfinished daily puzzle; null when there is none or it cannot be read (then removed). */
export function readDailyInProgress(storage: ProgressStorage): DailyInProgress | null {
  const text = storage.getItem(DAILY_IN_PROGRESS_STORAGE_KEY);
  if (text === null) {
    return null;
  }
  const saved = parsedJson(text);
  if (isValidDailyInProgress(saved)) {
    return saved as DailyInProgress;
  }
  storage.removeItem(DAILY_IN_PROGRESS_STORAGE_KEY);
  return null;
}

export function writeDailyInProgress(storage: ProgressStorage, saved: DailyInProgress): void {
  storage.setItem(DAILY_IN_PROGRESS_STORAGE_KEY, JSON.stringify(saved));
}

export function clearDailyInProgress(storage: ProgressStorage): void {
  storage.removeItem(DAILY_IN_PROGRESS_STORAGE_KEY);
}

/** The run to save for a session started at `startedAt` (ISO time). */
export function runRecordOf(session: StepSession, startedAt: string): RunRecord {
  const { reactionSlug, reactionVersion } = session.reaction;
  return {
    reactionVersionRef: `${reactionSlug}@${String(reactionVersion)}`,
    mode: session.mode,
    startedAt,
    stepResults: session.stepResults,
  };
}
