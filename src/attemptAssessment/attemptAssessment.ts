/**
 * Assess one learner attempt: the arrows drawn at a state, against the steps leaving it.
 *
 * The TypeScript twin of python/attempt_assessment/attempt_assessment.py, whose docstring gives
 * the order of the checks (correct, meaningless arrows, misconceptions, partial progress, generic
 * rules, wrong). Both pass the shared cases in fixtures/assessment/attempt_cases.json. Assessments
 * are plain JSON-shaped objects, the same spelling as the Python assessment_to_json().
 */
import { type CurvedArrow, formatCurvedArrow } from "../arrowNotation/curvedArrowNotation.js";
import { ArrowApplicationError, applyCurvedArrows } from "../stateGraphs/arrowApplication.js";
import type { StateGraph } from "../stateGraphs/stateGraph.js";
import { arrowPatternMatches } from "./arrowPatterns.js";
import {
  graphOf,
  type PreparedReaction,
  type PreparedStep,
  symmetriesOf,
} from "./preparedReaction.js";
import { compareStates, type StateComparison } from "./resonanceEquivalence.js";
import {
  type MapNumberRelabelling,
  relabelCurvedArrow,
  relabelStateGraph,
} from "./skeletonSymmetry.js";

export { prepareReaction, type PreparedReaction } from "./preparedReaction.js";

const MEANINGLESS_ARROW_RULE_IDS: ReadonlySet<string> = new Set([
  "atom-not-in-state",
  "destination-not-adjacent-to-source",
  "no-electrons-at-source",
]);
const STEP_KIND_TO_ELECTRONS_MOVED: Readonly<Record<"polar" | "radical", 1 | 2>> = {
  polar: 2,
  radical: 1,
};
// Comparisons from best to worst: a better one wins when several symmetries give a match.
const COMPARISONS_BEST_FIRST: readonly StateComparison[] = [
  "identical",
  "resonanceForm",
  "minorResonanceForm",
  "different",
];
const MINOR_RESONANCE_FORM_MESSAGE =
  "This is a charge-separated resonance form of the expected structure: it has more charged " +
  "atoms. Move the electrons that would cancel those charges.";

export interface CorrectAssessment {
  readonly assessmentKind: "correct";
  readonly stepKey: string;
  readonly routePreference: string;
  /** A resonance form of the to-state, not its drawing. */
  readonly isDifferentDrawing: boolean;
}

export interface MisconceptionAssessment {
  readonly assessmentKind: "misconception";
  readonly misconceptionId: string;
  readonly misconceptionTag: string | null;
  readonly severity: string;
  readonly feedbackMessage: string;
}

export interface GenericRuleAssessment {
  readonly assessmentKind: "genericRule";
  readonly genericRuleId: string;
  readonly message: string;
}

/** Progress and any broken rule together, so the screen can say "right so far ... but ...". */
export interface PartialProgressAssessment {
  readonly assessmentKind: "partialProgress";
  /** null when the arrows are not part of a known set (authored message or minor form only). */
  readonly arrowsStillMissing: number | null;
  readonly authoredMessage: string | null;
  readonly brokenRuleId: string | null;
  readonly brokenRuleMessage: string | null;
}

export interface WrongAssessment {
  readonly assessmentKind: "wrong";
}

export type AttemptAssessment =
  | CorrectAssessment
  | MisconceptionAssessment
  | GenericRuleAssessment
  | PartialProgressAssessment
  | WrongAssessment;

// ---- One attempt ----

/** One attempt being assessed, with what is worked out once and used by several checks. */
interface Attempt {
  readonly prepared: PreparedReaction;
  readonly leavingSteps: readonly PreparedStep[];
  readonly stateId: string;
  readonly learnerArrows: readonly CurvedArrow[];
  /** The arrows applied to the state, or the rule they break. */
  readonly result: StateGraph | undefined;
  readonly applicationError: ArrowApplicationError | undefined;
  readonly cancellingArrows: readonly CurvedArrow[] | undefined;
  readonly symmetries: readonly MapNumberRelabelling[];
}

function applied(
  state: StateGraph,
  curvedArrows: readonly CurvedArrow[],
): [StateGraph | undefined, ArrowApplicationError | undefined] {
  try {
    return [applyCurvedArrows(state, curvedArrows), undefined];
  } catch (error) {
    if (error instanceof ArrowApplicationError) {
      return [undefined, error];
    }
    throw error;
  }
}

/**
 * Electrons gained (negative: lost) at each place: an atom's nonbonding electrons, keyed by its
 * map number, or a bond, keyed by its two map numbers.
 */
function netElectronChanges(curvedArrows: readonly CurvedArrow[]): Map<string, number> {
  const placeToElectronChange = new Map<string, number>();
  for (const curvedArrow of curvedArrows) {
    for (const [locus, sign] of [
      [curvedArrow.source, -1],
      [curvedArrow.destination, 1],
    ] as const) {
      const place = locus.atoms.map((atom) => String(atom.mapNumber)).join("-");
      placeToElectronChange.set(
        place,
        (placeToElectronChange.get(place) ?? 0) + sign * curvedArrow.electronsMoved,
      );
    }
  }
  return placeToElectronChange;
}

/** Every group of `groupSize` arrows, in the same order as Python's itertools.combinations. */
function groupsOf<Item>(items: readonly Item[], groupSize: number, start = 0): Item[][] {
  if (groupSize === 0) {
    return [[]];
  }
  const groups: Item[][] = [];
  for (let i = start; i <= items.length - groupSize; i++) {
    for (const rest of groupsOf(items, groupSize - 1, i + 1)) {
      groups.push([items[i] as Item, ...rest]);
    }
  }
  return groups;
}

/**
 * The smallest group of arrows that together move no electrons (e.g. an arrow and its reverse),
 * if there is one: removing that group leaves the result unchanged.
 */
function cancellingArrowsOf(
  learnerArrows: readonly CurvedArrow[],
): readonly CurvedArrow[] | undefined {
  for (let groupSize = 1; groupSize <= learnerArrows.length; groupSize++) {
    const cancelling = groupsOf(learnerArrows, groupSize).find((group) =>
      [...netElectronChanges(group).values()].every((electronChange) => electronChange === 0),
    );
    if (cancelling !== undefined) {
      return cancelling;
    }
  }
  return undefined;
}

function bestComparison(
  result: StateGraph,
  target: StateGraph,
  symmetries: readonly MapNumberRelabelling[],
): StateComparison {
  const comparisons = new Set(
    symmetries.map((symmetry) => compareStates(relabelStateGraph(result, symmetry), target)),
  );
  return COMPARISONS_BEST_FIRST.find((comparison) => comparisons.has(comparison)) ?? "different";
}

function arrowTypesFit(step: PreparedStep, learnerArrows: readonly CurvedArrow[]): boolean {
  const electronsMoved = STEP_KIND_TO_ELECTRONS_MOVED[step.stepKind];
  return learnerArrows.every((curvedArrow) => curvedArrow.electronsMoved === electronsMoved);
}

/** Each leaving step whose arrow type fits, with how the result compares to its to-state. */
function stepComparisons(attempt: Attempt): [PreparedStep, StateComparison][] {
  const { result } = attempt;
  if (result === undefined) {
    return [];
  }
  return attempt.leavingSteps
    .filter((step) => arrowTypesFit(step, attempt.learnerArrows))
    .map((step) => [
      step,
      bestComparison(result, graphOf(attempt.prepared, step.toStateId), attempt.symmetries),
    ]);
}

/** Check 1. The same drawing beats a resonance form. */
function correctAssessment(attempt: Attempt): CorrectAssessment | undefined {
  if (attempt.cancellingArrows !== undefined) {
    return undefined;
  }
  const comparisons = stepComparisons(attempt);
  for (const [wanted, isDifferentDrawing] of [
    ["identical", false],
    ["resonanceForm", true],
  ] as const) {
    const match = comparisons.find(([, comparison]) => comparison === wanted);
    if (match !== undefined) {
      const [step] = match;
      return {
        assessmentKind: "correct",
        stepKey: step.stepKey,
        routePreference: step.routePreference,
        isDifferentDrawing,
      };
    }
  }
  return undefined;
}

function relabelledArrows(attempt: Attempt, symmetry: MapNumberRelabelling): CurvedArrow[] {
  return attempt.learnerArrows.map((curvedArrow) => relabelCurvedArrow(curvedArrow, symmetry));
}

/** Check 3: the first misconception whose pattern matches, up to symmetry. */
function misconceptionAssessment(attempt: Attempt): MisconceptionAssessment | undefined {
  const misconceptions = attempt.prepared.stateIdToMisconceptions.get(attempt.stateId) ?? [];
  const found = misconceptions.find((misconception) =>
    attempt.symmetries.some((symmetry) =>
      arrowPatternMatches(misconception.arrowPattern, relabelledArrows(attempt, symmetry)),
    ),
  );
  if (found === undefined) {
    return undefined;
  }
  const { misconceptionId, misconceptionTag, severity, feedbackMessage } = found;
  return {
    assessmentKind: "misconception",
    misconceptionId,
    misconceptionTag,
    severity,
    feedbackMessage,
  };
}

/** How many times each printed arrow occurs. */
function arrowMultiset(curvedArrows: readonly CurvedArrow[]): Map<string, number> {
  const printedToCount = new Map<string, number>();
  for (const curvedArrow of curvedArrows) {
    const printed = formatCurvedArrow(curvedArrow);
    printedToCount.set(printed, (printedToCount.get(printed) ?? 0) + 1);
  }
  return printedToCount;
}

/** True when `part` is a strictly smaller part of `whole` (both as multisets). */
function isStrictPart(
  part: ReadonlyMap<string, number>,
  whole: ReadonlyMap<string, number>,
  partSize: number,
  wholeSize: number,
): boolean {
  return (
    partSize < wholeSize &&
    [...part].every(([printed, count]) => count <= (whole.get(printed) ?? 0))
  );
}

function sameMultiset(
  first: ReadonlyMap<string, number>,
  second: ReadonlyMap<string, number>,
): boolean {
  return (
    first.size === second.size &&
    [...first].every(([printed, count]) => second.get(printed) === count)
  );
}

/** The fewest arrows to add to reach a known arrow set, if the arrows are part of one. */
function arrowsStillMissing(attempt: Attempt): number | null {
  const missingCounts: number[] = [];
  const drawnSize = attempt.learnerArrows.length;
  for (const knownArrowSet of attempt.leavingSteps.flatMap((step) => step.knownArrowSets)) {
    const known = arrowMultiset(knownArrowSet);
    for (const symmetry of attempt.symmetries) {
      if (
        isStrictPart(
          arrowMultiset(relabelledArrows(attempt, symmetry)),
          known,
          drawnSize,
          knownArrowSet.length,
        )
      ) {
        missingCounts.push(knownArrowSet.length - drawnSize);
      }
    }
  }
  return missingCounts.length > 0 ? Math.min(...missingCounts) : null;
}

function authoredPartialMessage(attempt: Attempt): string | null {
  const messages = attempt.prepared.stateIdToPartialProgressMessages.get(attempt.stateId) ?? [];
  const found = messages.find((message) =>
    attempt.symmetries.some((symmetry) =>
      sameMultiset(
        arrowMultiset(relabelledArrows(attempt, symmetry)),
        arrowMultiset(message.learnerArrows),
      ),
    ),
  );
  return found?.feedbackMessage ?? null;
}

/** Check 4: progress, together with any rule the arrows break. */
function partialProgressAssessment(attempt: Attempt): PartialProgressAssessment | undefined {
  const missing = arrowsStillMissing(attempt);
  const authoredMessage = authoredPartialMessage(attempt);
  const isMinorForm = stepComparisons(attempt).some(
    ([, comparison]) => comparison === "minorResonanceForm",
  );
  if (missing === null && authoredMessage === null && !isMinorForm) {
    return undefined;
  }
  const error = attempt.applicationError;
  const brokenRuleId = error?.genericRuleId ?? (isMinorForm ? "minor-resonance-form" : null);
  const brokenRuleMessage = error?.message ?? (isMinorForm ? MINOR_RESONANCE_FORM_MESSAGE : null);
  return {
    assessmentKind: "partialProgress",
    arrowsStillMissing: missing,
    authoredMessage,
    brokenRuleId,
    brokenRuleMessage,
  };
}

/** "source atoms>destination atoms", for spotting an arrow drawn the other way round. */
function atomFlow(curvedArrow: CurvedArrow, reversed: boolean): string {
  const sourceAtoms = curvedArrow.source.atoms.map((atom) => atom.mapNumber).join("-");
  const destinationAtoms = curvedArrow.destination.atoms.map((atom) => atom.mapNumber).join("-");
  return reversed ? `${destinationAtoms}>${sourceAtoms}` : `${sourceAtoms}>${destinationAtoms}`;
}

/** A learner arrow whose source and destination atoms are a known arrow's, swapped. */
function reversedArrow(attempt: Attempt): CurvedArrow | undefined {
  const knownReversed = new Set(
    attempt.leavingSteps
      .flatMap((step) => step.knownArrowSets.flat())
      .map((known) => atomFlow(known, true)),
  );
  for (const symmetry of attempt.symmetries) {
    const index = relabelledArrows(attempt, symmetry).findIndex((relabelled) =>
      knownReversed.has(atomFlow(relabelled, false)),
    );
    if (index >= 0) {
      return attempt.learnerArrows[index];
    }
  }
  return undefined;
}

function wrongArrowTypeMessage(leavingSteps: readonly PreparedStep[]): string {
  const wanted = [...new Set(leavingSteps.map((step) => step.stepKind))].sort().join(" or ");
  const arrowAdvice = wanted === "radical" ? "fish-hooks (one electron each)" : "pair arrows";
  return `This step is ${wanted}: use ${arrowAdvice}`;
}

/** Check 5, in order: wrong-arrow-type, redundant-arrow, reversed-flow, other rules. */
function genericRuleAssessment(attempt: Attempt): GenericRuleAssessment | undefined {
  if (!attempt.leavingSteps.some((step) => arrowTypesFit(step, attempt.learnerArrows))) {
    return {
      assessmentKind: "genericRule",
      genericRuleId: "wrong-arrow-type",
      message: wrongArrowTypeMessage(attempt.leavingSteps),
    };
  }
  if (attempt.cancellingArrows !== undefined) {
    const cancelling = attempt.cancellingArrows
      .map((curvedArrow) => `"${formatCurvedArrow(curvedArrow)}"`)
      .join(", ");
    return {
      assessmentKind: "genericRule",
      genericRuleId: "redundant-arrow",
      message: `${cancelling}: together these move no electrons; remove them`,
    };
  }
  const reversed = reversedArrow(attempt);
  if (reversed !== undefined) {
    return {
      assessmentKind: "genericRule",
      genericRuleId: "reversed-flow",
      message: `"${formatCurvedArrow(reversed)}": the electrons flow the other way`,
    };
  }
  const error = attempt.applicationError;
  return error === undefined
    ? undefined
    : { assessmentKind: "genericRule", genericRuleId: error.genericRuleId, message: error.message };
}

/**
 * Assess the learner's arrows at `stateId`. Throws if no arrow step leaves that state.
 * No arrows at all is assessed as wrong.
 */
export function assessAttempt(
  prepared: PreparedReaction,
  stateId: string,
  learnerArrows: readonly CurvedArrow[],
): AttemptAssessment {
  const leavingSteps = prepared.stateIdToLeavingSteps.get(stateId) ?? [];
  if (leavingSteps.length === 0) {
    throw new Error(`no arrow step leaves state "${stateId}"`);
  }
  if (learnerArrows.length === 0) {
    return { assessmentKind: "wrong" };
  }
  const [result, applicationError] = applied(graphOf(prepared, stateId), learnerArrows);
  const attempt: Attempt = {
    prepared,
    leavingSteps,
    stateId,
    learnerArrows,
    result,
    applicationError,
    cancellingArrows: cancellingArrowsOf(learnerArrows),
    symmetries: symmetriesOf(prepared, stateId),
  };
  const meaningless: GenericRuleAssessment | undefined =
    applicationError !== undefined && MEANINGLESS_ARROW_RULE_IDS.has(applicationError.genericRuleId)
      ? {
          assessmentKind: "genericRule",
          genericRuleId: applicationError.genericRuleId,
          message: applicationError.message,
        }
      : undefined;
  return (
    correctAssessment(attempt) ??
    meaningless ??
    misconceptionAssessment(attempt) ??
    partialProgressAssessment(attempt) ??
    genericRuleAssessment(attempt) ?? { assessmentKind: "wrong" }
  );
}
