/**
 * Backing up and moving progress (decided 2026-11-25, item 7c): export as a JSON file, import
 * with a merge, and reset.
 *
 * Import checks the file against schema/progress.schema.json and merges it into the progress in
 * the browser: runs are added unless one with the same ref and start time is there; a daily result
 * is added for a date that has none (the browser's own result wins); settings are kept. A file
 * that is not valid progress changes nothing.
 */
import {
  DAILY_IN_PROGRESS_STORAGE_KEY,
  type LearnerProgress,
  PROGRESS_STORAGE_KEY,
  type ProgressStorage,
  progressFromText,
  withRun,
} from "./learnerProgress.js";

export type ImportOutcome =
  | {
      readonly importOutcome: "merged";
      readonly mergedProgress: LearnerProgress;
      readonly addedRunCount: number;
      readonly addedDailyResultCount: number;
    }
  | { readonly importOutcome: "refused"; readonly refusalMessage: string };

const EXPORT_INDENT = 2;

/** "arrowpush-progress-2026-12-01.json". */
export function exportFileName(localDate: string): string {
  return `arrowpush-progress-${localDate}.json`;
}

/** The progress as the text of an export file (2-space JSON). */
export function exportText(progress: LearnerProgress): string {
  return `${JSON.stringify(progress, null, EXPORT_INDENT)}\n`;
}

export function importProgress(current: LearnerProgress, fileText: string): ImportOutcome {
  const imported = progressFromText(fileText);
  if (imported === null) {
    return {
      importOutcome: "refused",
      refusalMessage: "This file is not ArrowPush progress, so nothing was changed.",
    };
  }
  const runKey = (run: { reactionVersionRef: string; startedAt: string }): string =>
    `${run.reactionVersionRef} ${run.startedAt}`;
  const knownRuns = new Set(current.runs.map(runKey));
  const newRuns = imported.runs.filter((run) => !knownRuns.has(runKey(run)));
  const newDates = Object.entries(imported.dateToDailyResult).filter(
    ([localDate]) => !Object.hasOwn(current.dateToDailyResult, localDate),
  );
  return {
    importOutcome: "merged",
    mergedProgress: {
      ...newRuns.reduce(withRun, current),
      dateToDailyResult: { ...current.dateToDailyResult, ...Object.fromEntries(newDates) },
    },
    addedRunCount: newRuns.length,
    addedDailyResultCount: newDates.length,
  };
}

function countText(count: number, singular: string, plural: string): string {
  return `${String(count)} ${count === 1 ? singular : plural}`;
}

/** "Added 4 runs and 2 daily results." */
export function importSummaryText(addedRunCount: number, addedDailyResultCount: number): string {
  return (
    `Added ${countText(addedRunCount, "run", "runs")} and ` +
    `${countText(addedDailyResultCount, "daily result", "daily results")}.`
  );
}

/** Forget all progress and any unfinished daily puzzle. */
export function resetProgress(storage: ProgressStorage): void {
  storage.removeItem(PROGRESS_STORAGE_KEY);
  storage.removeItem(DAILY_IN_PROGRESS_STORAGE_KEY);
}
