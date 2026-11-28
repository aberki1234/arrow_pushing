/**
 * Lint rules for stereo questions (docs/stereo-question.md §4). The rules themselves live in
 * core/stereoQuestions (stereoQuestionProblems), shared with Create's live checks; this module
 * only points each problem at its place in the file.
 */
import {
  graphOf,
  type PreparedReaction,
} from "../../../core/attemptAssessment/preparedReaction.js";
import type { ReactionMechanism } from "../../../core/reactionFiles/reactionFile.js";
import { stereoQuestionProblems } from "../../../core/stereoQuestions/stereoQuestions.js";
import type { LintFinding } from "../findings/lintFindings.js";
import { lintError, lintWarning } from "../findings/lintFindings.js";

/** Every stereo question problem, pointing at the question or at the arrangement concerned. */
export function stereoQuestionFindings(
  mechanism: ReactionMechanism,
  prepared: PreparedReaction,
): LintFinding[] {
  return mechanism.steps.flatMap((step, stepIndex) => {
    if (step.stepKind === "change" || step.stereoQuestion === undefined) {
      return [];
    }
    const toStateIsRacemic = mechanism.stateIdToState[step.toStateId]?.stereoMeaning === "racemic";
    const problems = stereoQuestionProblems(
      step,
      graphOf(prepared, step.fromStateId),
      graphOf(prepared, step.toStateId),
      toStateIsRacemic,
    );
    return problems.map((found) => {
      const place = ["steps", stepIndex, "stereoQuestion"];
      const path =
        found.arrangementIndex === null
          ? place
          : [...place, "otherArrangements", found.arrangementIndex];
      return found.level === "error"
        ? lintError(found.problemId, path, found.message)
        : lintWarning(found.problemId, path, found.message);
    });
  });
}
