/**
 * How far a draft has come in Create (docs/SPEC.md §5, "Create"): the stage it opens on and the
 * progress line on the Create home ("Your mechanisms"). Built from the document alone, so the
 * server's reaction list can give it without running the linter.
 *
 * Opening stage: mechanism while there is no arrow step; teaching while a needed teaching item
 * is missing; publish after. (Start makes the draft, so a draft never opens on it.)
 */
import { type ReactionDocument, stepsOf } from "./reactionDraft.js";
import { teachingChecklist, teachingCounts } from "./teachingChecklist.js";

export type CreationStage = "start" | "mechanism" | "teaching" | "publish";

export interface CreationProgress {
  readonly arrowStepCount: number;
  readonly teachingDoneCount: number;
  readonly teachingItemCount: number;
  readonly neededLeftCount: number;
}

export function creationProgress(document: ReactionDocument): CreationProgress {
  const counts = teachingCounts(teachingChecklist(document, []));
  return {
    arrowStepCount: stepsOf(document).filter((step) => step.stepKind !== "change").length,
    teachingDoneCount: counts.doneCount,
    teachingItemCount: counts.itemCount,
    neededLeftCount: counts.neededLeftCount,
  };
}

export function openingStage(progress: CreationProgress): CreationStage {
  if (progress.arrowStepCount === 0) {
    return "mechanism";
  }
  return progress.neededLeftCount > 0 ? "teaching" : "publish";
}

/** "No steps yet", "2 steps · teaching 4 of 9", "1 step · teaching done". */
export function creationProgressLine(progress: CreationProgress): string {
  const { arrowStepCount, teachingDoneCount, teachingItemCount } = progress;
  if (arrowStepCount === 0) {
    return "No steps yet";
  }
  const steps = `${String(arrowStepCount)} step${arrowStepCount === 1 ? "" : "s"}`;
  const teaching =
    teachingDoneCount === teachingItemCount
      ? "teaching done"
      : `teaching ${String(teachingDoneCount)} of ${String(teachingItemCount)}`;
  return `${steps} · ${teaching}`;
}
