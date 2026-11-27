/**
 * Drawn arrows become a step: the editor applies them to the from-state and keeps the result as
 * a new state, or joins an existing one (docs/SPEC.md §5, editor decisions 2026-11-25).
 *
 * Steps
 *   0. No change step may leave the from-state (it must be the only step leaving its state).
 *   1. The arrows must all be pair arrows (a polar step) or all fish-hooks (a radical step).
 *   2. They are applied (stateGraphs/arrowApplication.ts); a broken rule refuses them with its id.
 *   3. The result is compared with every other state, up to a skeleton symmetry of the from-state:
 *      the same as the from-state            refused (the arrows change nothing)
 *      the same as a state leading here      refused (a cycle)
 *      the same as a state a step from the from-state already reaches   refused
 *      the same as another state             the step joins it
 *      a resonance form of another state     a new state, with that state named as a warning
 *                                            (lint will flag it; it is not joined)
 *   4. A new state keeps every atom's coordinates from the from-state.
 *   5. The step is "preferred" if its from-state is on the preferred route (reached from the start
 *      state by preferred steps) and no preferred step leaves it yet; otherwise "accepted" (a
 *      branch, or a step along an accepted branch such as the Wittig's betaine route).
 *   6. The validator must accept the arrows for this step alone (lint rule 6), so redundant arrows
 *      are refused too.
 * Arrows are stored in their printed form.
 */
import {
  type CurvedArrow,
  formatCurvedArrow,
} from "../../core/arrowNotation/curvedArrowNotation.js";
import {
  type AttemptAssessment,
  assessAttempt,
} from "../../core/attemptAssessment/attemptAssessment.js";
import { prepareReaction } from "../../core/attemptAssessment/preparedReaction.js";
import { compareStates } from "../../core/attemptAssessment/resonanceEquivalence.js";
import {
  type MapNumberRelabelling,
  relabelStateGraph,
  skeletonSymmetries,
} from "../../core/attemptAssessment/skeletonSymmetry.js";
import {
  ArrowApplicationError,
  applyCurvedArrows,
} from "../../core/stateGraphs/arrowApplication.js";
import { stateGraphFromMappedSmiles } from "../../core/stateGraphs/mappedSmilesReading.js";
import { mappedSmilesFromStateGraph } from "../../core/stateGraphs/mappedSmilesWriting.js";
import { type StateGraph, stateGraphsEqual } from "../../core/stateGraphs/stateGraph.js";
import { addState, addStep, type ReactionDocument, statesOf, stepsOf } from "./reactionDraft.js";

export type StepGeneration =
  | {
      readonly outcome: "added";
      readonly document: ReactionDocument;
      readonly stepKey: string;
      readonly toStateId: string;
      readonly joinedExistingState: boolean;
      /** A state the new state is a resonance form of (a warning), or null. */
      readonly resonanceFormOfStateId: string | null;
    }
  | { readonly outcome: "refused"; readonly reason: string };

interface StateMatch {
  readonly identicalStateId: string | null;
  readonly resonanceFormOfStateId: string | null;
}

function refused(reason: string): StepGeneration {
  return { outcome: "refused", reason };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function graphOfState(document: ReactionDocument, stateId: string): StateGraph | undefined {
  const state = statesOf(document)[stateId];
  return isRecord(state) ? stateGraphFromMappedSmiles(String(state.mappedSmiles)) : undefined;
}

function sameAtoms(first: StateGraph, second: StateGraph): boolean {
  return (
    first.mapNumberToAtom.size === second.mapNumberToAtom.size &&
    [...first.mapNumberToAtom.keys()].every((mapNumber) => second.mapNumberToAtom.has(mapNumber))
  );
}

/** The first state identical to `result`, and the first it is a resonance form of. */
function matchingStates(
  document: ReactionDocument,
  result: StateGraph,
  symmetries: readonly MapNumberRelabelling[],
): StateMatch {
  let resonanceFormOfStateId: string | null = null;
  const relabelledResults = symmetries.map((symmetry) => relabelStateGraph(result, symmetry));
  for (const stateId of Object.keys(statesOf(document))) {
    const graph = graphOfState(document, stateId);
    if (graph === undefined || !sameAtoms(graph, result)) {
      continue;
    }
    if (relabelledResults.some((relabelled) => stateGraphsEqual(relabelled, graph))) {
      return { identicalStateId: stateId, resonanceFormOfStateId: null };
    }
    const isResonanceForm = relabelledResults.some(
      (relabelled) => compareStates(relabelled, graph) !== "different",
    );
    resonanceFormOfStateId ??= isResonanceForm ? stateId : null;
  }
  return { identicalStateId: null, resonanceFormOfStateId };
}

/** Whether some steps lead from `fromStateId` to `toStateId`. */
function leadsTo(document: ReactionDocument, fromStateId: string, toStateId: string): boolean {
  const reached = new Set([fromStateId]);
  const toVisit = [fromStateId];
  for (let stateId = toVisit.pop(); stateId !== undefined; stateId = toVisit.pop()) {
    for (const step of stepsOf(document)) {
      const next = String(step.toStateId);
      if (step.fromStateId === stateId && !reached.has(next)) {
        reached.add(next);
        toVisit.push(next);
      }
    }
  }
  return reached.has(toStateId);
}

/** The start state and every state reached from it by preferred steps. */
function preferredRouteStateIds(document: ReactionDocument): Set<string> {
  const onRoute = new Set([String(document.startStateId)]);
  let stateId = String(document.startStateId);
  for (;;) {
    const preferred = stepsOf(document).find(
      (step) => step.fromStateId === stateId && step.routePreference === "preferred",
    );
    const next = preferred === undefined ? undefined : String(preferred.toStateId);
    if (next === undefined || onRoute.has(next)) {
      return onRoute;
    }
    onRoute.add(next);
    stateId = next;
  }
}

/** Why joining `stateId` is refused, or undefined if it may be joined. */
function joinProblem(
  document: ReactionDocument,
  fromStateId: string,
  stateId: string,
): string | undefined {
  if (stateId === fromStateId) {
    return "the arrows give back the state they start from";
  }
  if (leadsTo(document, stateId, fromStateId)) {
    return `the arrows lead back to state "${stateId}", which would make a cycle`;
  }
  const alreadyReached = stepsOf(document).some(
    (step) => step.fromStateId === fromStateId && step.toStateId === stateId,
  );
  return alreadyReached
    ? `a step from "${fromStateId}" already reaches state "${stateId}"`
    : undefined;
}

function reasonNotAccepted(assessment: AttemptAssessment): string {
  switch (assessment.assessmentKind) {
    case "genericRule":
      return `${assessment.genericRuleId}: ${assessment.message}`;
    case "misconception":
      return `the arrows match misconception "${assessment.misconceptionId}"`;
    case "partialProgress":
      return assessment.brokenRuleId === null
        ? "the validator takes these arrows as only part of a step"
        : `${assessment.brokenRuleId}: ${assessment.brokenRuleMessage ?? ""}`;
    default:
      return "the validator does not accept these arrows for this step";
  }
}

/** Undefined if the validator accepts the arrows for the step alone, else why not. */
function validatorProblem(
  document: ReactionDocument,
  fromStateId: string,
  stepKey: string,
  curvedArrows: readonly CurvedArrow[],
): string | undefined {
  const prepared = prepareReaction(document);
  const onlyStep = (prepared.stateIdToLeavingSteps.get(fromStateId) ?? []).filter(
    (step) => step.stepKey === stepKey,
  );
  const stateIdToLeavingSteps = new Map(prepared.stateIdToLeavingSteps).set(fromStateId, onlyStep);
  const assessment = assessAttempt(
    { ...prepared, stateIdToLeavingSteps },
    fromStateId,
    curvedArrows,
  );
  return assessment.assessmentKind === "correct" ? undefined : reasonNotAccepted(assessment);
}

/** The arrows' step kind, or why they cannot make one step. */
function stepKindOf(
  curvedArrows: readonly CurvedArrow[],
): { readonly stepKind: "polar" | "radical" } | { readonly reason: string } {
  if (curvedArrows.length === 0) {
    return { reason: "there are no arrows" };
  }
  const isPair = (arrow: CurvedArrow): boolean => arrow.electronsMoved === 2;
  if (curvedArrows.every(isPair)) {
    return { stepKind: "polar" };
  }
  if (!curvedArrows.some(isPair)) {
    return { stepKind: "radical" };
  }
  return { reason: "a step is all pair arrows or all fish-hooks, not pair arrows and fish-hooks" };
}

/** The arrows applied to the from-state, or the rule they break. */
function appliedArrows(
  fromGraph: StateGraph,
  curvedArrows: readonly CurvedArrow[],
): StateGraph | { readonly reason: string } {
  try {
    return applyCurvedArrows(fromGraph, curvedArrows);
  } catch (error) {
    if (error instanceof ArrowApplicationError) {
      return { reason: `${error.genericRuleId}: ${error.message}` };
    }
    throw error;
  }
}

/** The step's to-state: the matched state, or a new one keeping the from-state's coordinates. */
function withToState(
  document: ReactionDocument,
  fromState: Readonly<Record<string, unknown>>,
  result: StateGraph,
  identicalStateId: string | null,
): { document: ReactionDocument; stateId: string } {
  if (identicalStateId !== null) {
    return { document, stateId: identicalStateId };
  }
  return addState(document, {
    mappedSmiles: mappedSmilesFromStateGraph(result),
    mapNumberToCoordinates: structuredClone(fromState.mapNumberToCoordinates),
  });
}

/** "preferred" on the preferred route when no preferred step leaves the state yet. */
export function routePreferenceFor(document: ReactionDocument, fromStateId: string): string {
  const preferredLeaves = stepsOf(document).some(
    (step) => step.fromStateId === fromStateId && step.routePreference === "preferred",
  );
  return preferredRouteStateIds(document).has(fromStateId) && !preferredLeaves
    ? "preferred"
    : "accepted";
}

/** Apply the drawn arrows at `fromStateId` and add the step (see the module comment). */
export function addArrowStep(
  document: ReactionDocument,
  fromStateId: string,
  curvedArrows: readonly CurvedArrow[],
): StepGeneration {
  const fromState = statesOf(document)[fromStateId];
  const fromGraph = graphOfState(document, fromStateId);
  if (!isRecord(fromState) || fromGraph === undefined) {
    return refused(`no state "${fromStateId}"`);
  }
  if (
    stepsOf(document).some((step) => step.fromStateId === fromStateId && step.stepKind === "change")
  ) {
    return refused(
      `a change step leaves "${fromStateId}", and it must be the only step leaving it`,
    );
  }
  const kind = stepKindOf(curvedArrows);
  const result = "reason" in kind ? kind : appliedArrows(fromGraph, curvedArrows);
  if ("reason" in result || "reason" in kind) {
    return refused("reason" in result ? result.reason : "");
  }
  const match = matchingStates(document, result, skeletonSymmetries(fromGraph));
  const joinRefusal =
    match.identicalStateId === null
      ? undefined
      : joinProblem(document, fromStateId, match.identicalStateId);
  if (joinRefusal !== undefined) {
    return refused(joinRefusal);
  }
  const toState = withToState(document, fromState, result, match.identicalStateId);
  const { document: withStep, stepKey } = addStep(toState.document, {
    fromStateId,
    toStateId: toState.stateId,
    stepKind: kind.stepKind,
    routePreference: routePreferenceFor(document, fromStateId),
    canonicalArrows: curvedArrows.map(formatCurvedArrow),
  });
  const notAccepted = validatorProblem(withStep, fromStateId, stepKey, curvedArrows);
  return notAccepted !== undefined
    ? refused(notAccepted)
    : {
        outcome: "added",
        document: withStep,
        stepKey,
        toStateId: toState.stateId,
        joinedExistingState: match.identicalStateId !== null,
        resonanceFormOfStateId: match.resonanceFormOfStateId,
      };
}
