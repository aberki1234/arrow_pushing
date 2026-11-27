/**
 * A reaction's mechanism in the shape the lint rules use (core/reactionFiles/reactionFile.ts is
 * the typed reaction). The linter reads it only after the schema check passed.
 * States keep the order of stateIdToState, steps the order of "steps" (findings point at steps by
 * position).
 */
import type {
  ReactionMechanism,
  ReactionState,
  ReactionStep,
} from "../../../core/reactionFiles/reactionFile.js";

export interface LintedMisconception {
  readonly misconceptionId: string;
  readonly arrowPattern: string;
}

export interface LintedState {
  readonly mappedSmiles: string;
  readonly hasLearnerPrompt: boolean;
  /** A caption with some text in it. */
  readonly hasCaption: boolean;
  readonly hintTierCount: number;
  readonly misconceptions: readonly LintedMisconception[];
}

export interface LintedStep {
  readonly stepKey: string;
  readonly fromStateId: string;
  readonly toStateId: string;
  readonly stepKind: ReactionStep["stepKind"];
  readonly routePreference: ReactionStep["routePreference"];
  readonly canonicalArrows: readonly string[];
  readonly partialArrowSets: readonly (readonly string[])[];
  readonly addedSpecies: string | undefined;
  readonly removedFragmentMapNumbers: readonly number[];
}

export interface LintedAbbreviatedGroup {
  readonly attachmentMapNumber: number;
  readonly mapNumbers: readonly number[];
}

export interface LintedReaction {
  readonly startStateId: string;
  readonly stateIdToState: ReadonlyMap<string, LintedState>;
  readonly steps: readonly LintedStep[];
  readonly atomRoleToMapNumbers: Readonly<Record<string, readonly number[]>>;
  readonly abbreviatedGroups: readonly LintedAbbreviatedGroup[];
}

function lintedState(state: ReactionState): LintedState {
  return {
    mappedSmiles: state.mappedSmiles,
    hasLearnerPrompt: state.learnerPrompt !== undefined,
    hasCaption: (state.caption ?? "").trim() !== "",
    hintTierCount: (state.hintTiers ?? []).length,
    misconceptions: (state.misconceptions ?? []).map(({ misconceptionId, arrowPattern }) => ({
      misconceptionId,
      arrowPattern,
    })),
  };
}

function lintedStep(step: ReactionStep): LintedStep {
  const isChange = step.stepKind === "change";
  return {
    stepKey: step.stepKey,
    fromStateId: step.fromStateId,
    toStateId: step.toStateId,
    stepKind: step.stepKind,
    routePreference: step.routePreference,
    canonicalArrows: isChange ? [] : step.canonicalArrows,
    partialArrowSets: isChange ? [] : (step.partialArrowSets ?? []),
    addedSpecies: isChange ? step.addedSpecies : undefined,
    removedFragmentMapNumbers: isChange ? (step.removedFragmentMapNumbers ?? []) : [],
  };
}

/** Read a mechanism that has passed its schema check. */
export function readLintedReaction(mechanism: ReactionMechanism): LintedReaction {
  return {
    startStateId: mechanism.startStateId,
    stateIdToState: new Map(
      Object.entries(mechanism.stateIdToState).map(([stateId, state]) => [
        stateId,
        lintedState(state),
      ]),
    ),
    steps: mechanism.steps.map(lintedStep),
    atomRoleToMapNumbers: mechanism.atomRoleToMapNumbers ?? {},
    abbreviatedGroups: (mechanism.abbreviatedGroups ?? []).map(
      ({ attachmentMapNumber, mapNumbers }) => ({ attachmentMapNumber, mapNumbers }),
    ),
  };
}
