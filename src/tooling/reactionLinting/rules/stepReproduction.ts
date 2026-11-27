/**
 * Lint rules that apply each step to its from-state (docs/schema-design.md §3.5).
 *
 * Rules, all errors
 *   step-does-not-reproduce-to-state       (rule 6) The canonical arrows, applied to the
 *       from-state, must give the to-state exactly as drawn: the learner moves on to the drawing,
 *       so a resonance form of it is not enough. Each partial arrow set must be accepted for the
 *       step (§4: identical or a resonance form, up to skeleton symmetry). A change step's added
 *       and removed molecules must give the to-state exactly.
 *   leaving-steps-reach-equivalent-states  (rule 5) Two arrow steps leaving one state reach
 *       states that are resonance-equivalent up to a skeleton symmetry of that state: an attempt
 *       could not tell them apart.
 *
 * Arrow sets are checked with the validator itself (assessAttempt), on a copy of the prepared
 * reaction where the step being checked is the only one leaving its state, so the linter accepts
 * exactly what the browser accepts, for that step.
 */
import type { CurvedArrow } from "../../../core/arrowNotation/curvedArrowNotation.js";
import {
  assessAttempt,
  type CorrectAssessment,
} from "../../../core/attemptAssessment/attemptAssessment.js";
import {
  graphOf,
  type PreparedReaction,
  type PreparedStep,
  symmetriesOf,
} from "../../../core/attemptAssessment/preparedReaction.js";
import { compareStates } from "../../../core/attemptAssessment/resonanceEquivalence.js";
import { relabelStateGraph } from "../../../core/attemptAssessment/skeletonSymmetry.js";
import {
  ArrowApplicationError,
  applyCurvedArrows,
  applySpeciesChange,
  SpeciesChangeError,
} from "../../../core/stateGraphs/arrowApplication.js";
import {
  MappedSmilesError,
  stateGraphFromMappedSmiles,
} from "../../../core/stateGraphs/mappedSmilesReading.js";
import { stateGraphsEqual } from "../../../core/stateGraphs/stateGraph.js";
import type { LintedReaction, LintedStep } from "../findings/lintedReaction.js";
import { type LintFinding, lintError } from "../findings/lintFindings.js";

function preparedStepOf(prepared: PreparedReaction, step: LintedStep): PreparedStep {
  const found = (prepared.stateIdToLeavingSteps.get(step.fromStateId) ?? []).find(
    (preparedStep) => preparedStep.stepKey === step.stepKey,
  );
  if (found === undefined) {
    throw new Error(`step "${step.stepKey}" was not prepared`);
  }
  return found;
}

/** A shallow copy in which `preparedStep` is the only step leaving `fromStateId`. */
function withOnlyStep(
  prepared: PreparedReaction,
  preparedStep: PreparedStep,
  fromStateId: string,
): PreparedReaction {
  const stateIdToLeavingSteps = new Map(prepared.stateIdToLeavingSteps);
  stateIdToLeavingSteps.set(fromStateId, [preparedStep]);
  return { ...prepared, stateIdToLeavingSteps }; // the symmetry cache is shared
}

/**
 * The validator's correct assessment of `curvedArrows` at `fromStateId` when `preparedStep` is
 * the only step leaving it; undefined if they are not accepted for that step.
 */
export function assessForStepAlone(
  prepared: PreparedReaction,
  preparedStep: PreparedStep,
  fromStateId: string,
  curvedArrows: readonly CurvedArrow[],
): CorrectAssessment | undefined {
  const assessment = assessAttempt(
    withOnlyStep(prepared, preparedStep, fromStateId),
    fromStateId,
    curvedArrows,
  );
  return assessment.assessmentKind === "correct" ? assessment : undefined;
}

/**
 * For arrows that are not accepted: the arrow-application rule they break, the generic rule the
 * validator gives, or that their result is not the to-state.
 */
function whyNotAccepted(
  prepared: PreparedReaction,
  preparedStep: PreparedStep,
  fromStateId: string,
  curvedArrows: readonly CurvedArrow[],
): string {
  try {
    applyCurvedArrows(graphOf(prepared, fromStateId), curvedArrows);
  } catch (error) {
    if (error instanceof ArrowApplicationError) {
      return `${error.genericRuleId}: ${error.message}`;
    }
    throw error;
  }
  // Without misconceptions, so the assessment names a generic rule if one applies.
  const stateIdToMisconceptions = new Map(prepared.stateIdToMisconceptions);
  stateIdToMisconceptions.set(fromStateId, []);
  const withoutMisconceptions = {
    ...withOnlyStep(prepared, preparedStep, fromStateId),
    stateIdToMisconceptions,
  };
  const assessment = assessAttempt(withoutMisconceptions, fromStateId, curvedArrows);
  if (assessment.assessmentKind === "genericRule") {
    return `${assessment.genericRuleId}: ${assessment.message}`;
  }
  return `the result is not state "${preparedStep.toStateId}"`;
}

function arrowStepFindings(
  prepared: PreparedReaction,
  step: LintedStep,
  position: number,
): LintFinding[] {
  const preparedStep = preparedStepOf(prepared, step);
  const [canonicalArrows = [], ...partialArrowSets] = preparedStep.knownArrowSets;
  const findings: LintFinding[] = [];
  const at = (...tail: (string | number)[]): (string | number)[] => ["steps", position, ...tail];
  const canonical = assessForStepAlone(prepared, preparedStep, step.fromStateId, canonicalArrows);
  if (canonical === undefined) {
    const reason = whyNotAccepted(prepared, preparedStep, step.fromStateId, canonicalArrows);
    findings.push(
      lintError(
        "step-does-not-reproduce-to-state",
        at("canonicalArrows"),
        `step "${step.stepKey}": canonical arrows do not give the to-state (${reason})`,
      ),
    );
  } else if (canonical.isDifferentDrawing) {
    findings.push(
      lintError(
        "step-does-not-reproduce-to-state",
        at("canonicalArrows"),
        `step "${step.stepKey}": canonical arrows give a resonance form of state ` +
          `"${step.toStateId}", not its drawing; draw the state as the arrows give it`,
      ),
    );
  }
  partialArrowSets.forEach((arrowSet, setPosition) => {
    if (assessForStepAlone(prepared, preparedStep, step.fromStateId, arrowSet) === undefined) {
      const reason = whyNotAccepted(prepared, preparedStep, step.fromStateId, arrowSet);
      findings.push(
        lintError(
          "step-does-not-reproduce-to-state",
          at("partialArrowSets", setPosition),
          `step "${step.stepKey}": partial arrow set ${String(setPosition)} is not accepted ` +
            `for the step (${reason})`,
        ),
      );
    }
  });
  return findings;
}

/** Why a change step does not give its to-state exactly, or undefined if it does. */
function changeStepProblem(prepared: PreparedReaction, step: LintedStep): string | undefined {
  let result;
  try {
    const addedSpecies =
      step.addedSpecies === undefined ? undefined : stateGraphFromMappedSmiles(step.addedSpecies);
    result = applySpeciesChange(
      graphOf(prepared, step.fromStateId),
      addedSpecies,
      step.removedFragmentMapNumbers,
    );
  } catch (error) {
    if (error instanceof MappedSmilesError || error instanceof SpeciesChangeError) {
      return error.message;
    }
    throw error;
  }
  return stateGraphsEqual(result, graphOf(prepared, step.toStateId))
    ? undefined
    : `the result is not state "${step.toStateId}"`;
}

/**
 * step-does-not-reproduce-to-state, at "/steps/<position>/canonicalArrows",
 * ".../partialArrowSets/<position>" or "/steps/<position>" for a change step.
 */
export function stepReproductionFindings(
  reaction: LintedReaction,
  prepared: PreparedReaction,
): LintFinding[] {
  return reaction.steps.flatMap((step, position) => {
    if (step.stepKind !== "change") {
      return arrowStepFindings(prepared, step, position);
    }
    const problem = changeStepProblem(prepared, step);
    return problem === undefined
      ? []
      : [
          lintError(
            "step-does-not-reproduce-to-state",
            ["steps", position],
            `change step "${step.stepKey}": ${problem}`,
          ),
        ];
  });
}

/**
 * The two to-states are resonance-equivalent up to a skeleton symmetry of the from-state.
 * To-states with other atoms than the from-state (a step that does not reproduce) are not.
 */
function reachEquivalentStates(
  prepared: PreparedReaction,
  fromStateId: string,
  firstToStateId: string,
  secondToStateId: string,
): boolean {
  const atoms = [...graphOf(prepared, fromStateId).mapNumberToAtom.keys()];
  const firstTarget = graphOf(prepared, firstToStateId);
  const secondTarget = graphOf(prepared, secondToStateId);
  const hasTheseAtoms = (graph: typeof firstTarget): boolean =>
    graph.mapNumberToAtom.size === atoms.length &&
    atoms.every((mapNumber) => graph.mapNumberToAtom.has(mapNumber));
  if (!hasTheseAtoms(firstTarget) || !hasTheseAtoms(secondTarget)) {
    return false;
  }
  return symmetriesOf(prepared, fromStateId).some(
    (symmetry) =>
      compareStates(relabelStateGraph(firstTarget, symmetry), secondTarget) !== "different",
  );
}

/** leaving-steps-reach-equivalent-states, at the later of the two steps. */
export function equivalentLeavingStepFindings(
  reaction: LintedReaction,
  prepared: PreparedReaction,
): LintFinding[] {
  const arrowSteps = reaction.steps
    .map((step, position) => ({ step, position }))
    .filter(({ step }) => step.stepKind !== "change");
  const findings: LintFinding[] = [];
  arrowSteps.forEach((first, firstIndex) => {
    for (const second of arrowSteps.slice(firstIndex + 1)) {
      const sameFromState = first.step.fromStateId === second.step.fromStateId;
      if (
        sameFromState &&
        reachEquivalentStates(
          prepared,
          first.step.fromStateId,
          first.step.toStateId,
          second.step.toStateId,
        )
      ) {
        findings.push(
          lintError(
            "leaving-steps-reach-equivalent-states",
            ["steps", second.position],
            `steps "${first.step.stepKey}" and "${second.step.stepKey}" reach ` +
              "resonance-equivalent states, so an attempt cannot tell them apart; keep one",
          ),
        );
      }
    }
  });
  return findings;
}
