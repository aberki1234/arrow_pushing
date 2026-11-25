/**
 * What the finished view shows about a run (decided 2026-11-25, item 7b): each step taken with
 * its prompt, outcome, the arrows in words and the explanation, and the reaction's attribution.
 */
import type { Catalogue } from "../catalogue/catalogueReading.js";
import type { LearnerProgress } from "../learnerProgress/learnerProgress.js";
import {
  type PracticeCard,
  practiceCards,
  relatedCards,
} from "../learnerStatistics/practiceList.js";
import { masteryBySlug } from "../learnerStatistics/reactionMastery.js";
import {
  type RecurringFeedbackRow,
  misconceptionInfoOf,
  recurringFeedback,
} from "../learnerStatistics/recurringFeedback.js";
import { describeCurvedArrow } from "../stepSession/arrowDescriptions.js";
import type { SessionReaction } from "../stepSession/sessionReaction.js";
import type { StepOutcome, StepResult } from "../stepSession/stepSession.js";

export interface SummaryStep {
  readonly stepNumber: number;
  readonly prompt: string;
  readonly stepOutcome: StepOutcome;
  readonly outcomeText: string;
  /** The step's canonical arrows in words, e.g. "lone pair on O1 → new bond O1–C2". */
  readonly arrowTexts: readonly string[];
  readonly explanation: string;
}

const OUTCOME_TO_TEXT: Readonly<Record<StepOutcome, string>> = {
  firstTry: "First try",
  afterRetry: "After a retry",
  afterHint: "After a hint",
  missed: "Missed: the answer was shown",
};
// The licence ids the schema allows, as people write them.
const LICENCE_TO_TEXT: Readonly<Record<string, string>> = { "CC-BY-SA-4.0": "CC BY-SA 4.0" };

export function summarySteps(
  reaction: SessionReaction,
  stepResults: readonly StepResult[],
): SummaryStep[] {
  return stepResults.map((stepResult, position) => {
    const step = reaction.steps.find((candidate) => candidate.stepKey === stepResult.stepKey);
    const fromState =
      step === undefined ? undefined : reaction.stateIdToState.get(step.fromStateId);
    return {
      stepNumber: position + 1,
      prompt: fromState?.learnerPrompt ?? "",
      stepOutcome: stepResult.stepOutcome,
      outcomeText: OUTCOME_TO_TEXT[stepResult.stepOutcome],
      arrowTexts: (step?.canonicalArrows ?? []).map(describeCurvedArrow),
      explanation: step?.explanationAfterStep ?? "",
    };
  });
}

/** "By Ada Lovelace · CC BY-SA 4.0", for the foot of the finished view. */
export function attributionText(reaction: SessionReaction): string {
  const names = reaction.authors.map((author) => author.name).filter((name) => name !== "");
  const licence = LICENCE_TO_TEXT[reaction.licence] ?? reaction.licence;
  return [names.length > 0 ? `By ${names.join(", ")}` : "", licence]
    .filter((part) => part !== "")
    .join(" · ");
}

export interface FinishedViewExtras {
  /** Feedback this reaction has shown the learner, this run included, most frequent first. */
  readonly watchOutRows: readonly RecurringFeedbackRow[];
  /** Up to 3 other reactions sharing a class. */
  readonly relatedCards: readonly PracticeCard[];
  /** null when the reaction had never been finished before this run. */
  readonly masteryBefore: number | null;
  readonly masteryAfter: number;
}

/** What the finished view adds from the learner's history (item 7c). */
export function finishedViewExtras(
  catalogue: Catalogue,
  reaction: SessionReaction,
  progressBefore: LearnerProgress,
  progressAfter: LearnerProgress,
): FinishedViewExtras {
  const slug = reaction.reactionSlug;
  const masteryAfter = masteryBySlug(progressAfter);
  return {
    watchOutRows: recurringFeedback(
      progressAfter,
      new Map([[slug, misconceptionInfoOf(reaction)]]),
      slug,
    ),
    relatedCards: relatedCards(practiceCards(catalogue, masteryAfter), slug),
    masteryBefore: masteryBySlug(progressBefore).get(slug)?.masteryPercent ?? null,
    masteryAfter: masteryAfter.get(slug)?.masteryPercent ?? 0,
  };
}
