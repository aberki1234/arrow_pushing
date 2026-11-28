/**
 * A reaction file as typed data: schema/reaction.schema.json written as TypeScript, read only
 * through readReactionFile or readReactionMechanism (reactionFileReading.ts), which check it
 * against the schema first. Plain data: SMILES and arrows stay text; prepareReaction parses them.
 *
 * Two levels (docs/schema-design.md §0):
 *   ReactionMechanism  the states, steps, atom roles and abbreviated groups: what assessing,
 *                      drawing and Create's checks need. An unfinished draft has a mechanism.
 *   ReactionFile       the mechanism and everything else a published reaction carries.
 */

export type ReactionClass =
  | "acid-base"
  | "substitution"
  | "aromatic substitution"
  | "addition"
  | "elimination"
  | "carbonyl"
  | "pericyclic"
  | "rearrangement"
  | "radical";

export interface AbbreviatedGroup {
  readonly groupLabel: string;
  readonly attachmentMapNumber: number;
  readonly mapNumbers: readonly number[];
}

export interface StateAnnotation {
  readonly text: string;
  readonly nearMapNumber: number;
}

export interface Misconception {
  readonly misconceptionId: string;
  readonly misconceptionTag?: string;
  readonly severity: "wrong" | "plausible";
  /** Arrow-pattern grammar: docs/schema-design.md §5.2. */
  readonly arrowPattern: string;
  readonly feedbackMessage: string;
}

export interface PartialProgressMessage {
  readonly learnerArrows: readonly string[];
  readonly feedbackMessage: string;
}

export interface ReactionState {
  /** Fully atom-mapped Kekulé SMILES of the whole drawn mixture. */
  readonly mappedSmiles: string;
  /** 2D position of each mapped atom, RDKit units, y up; keys are map numbers. */
  readonly mapNumberToCoordinates: Readonly<Record<string, readonly [number, number]>>;
  readonly mapNumberToLonePairAnglesDegrees?: Readonly<Record<string, readonly number[]>>;
  /** Key "<map number>-<map number>", wide end at the second atom. Display only. */
  readonly bondToWedgeStyle?: Readonly<Record<string, "wedge" | "dash">>;
  readonly annotations?: readonly StateAnnotation[];
  readonly caption?: string;
  /** "racemic": one enantiomer is drawn for a racemic mixture (shown under the drawing). */
  readonly stereoMeaning?: "racemic";
  readonly learnerPrompt?: string;
  /** Position 0 conceptual, 1 narrowing, 2 reveal. */
  readonly hintTiers?: readonly string[];
  readonly misconceptions?: readonly Misconception[];
  readonly partialProgressMessages?: readonly PartialProgressMessage[];
}

interface StepFields {
  readonly stepKey: string;
  readonly fromStateId: string;
  readonly toStateId: string;
  readonly routePreference: "preferred" | "accepted";
  readonly explanationAfterStep?: string;
  readonly caption?: string;
}

/** A step drawn with curved arrows: pair arrows (->) if polar, fish-hooks (~>) if radical. */
export interface ArrowStep extends StepFields {
  readonly stepKind: "polar" | "radical";
  readonly canonicalArrows: readonly string[];
  readonly partialArrowSets?: readonly (readonly string[])[];
}

/** A step with no arrows: molecules arrive (addedSpecies) or fragments leave. */
export interface ChangeStep extends StepFields {
  readonly stepKind: "change";
  /** Mapped SMILES of molecules that arrive, with new map numbers. */
  readonly addedSpecies?: string;
  readonly removedFragmentMapNumbers?: readonly number[];
}

export type ReactionStep = ArrowStep | ChangeStep;

export interface ReactionMechanism {
  readonly startStateId: string;
  readonly stateIdToState: Readonly<Record<string, ReactionState>>;
  readonly steps: readonly ReactionStep[];
  /** Named atom sets that misconception patterns refer to as @roleName. */
  readonly atomRoleToMapNumbers?: Readonly<Record<string, readonly number[]>>;
  readonly abbreviatedGroups?: readonly AbbreviatedGroup[];
  /** Atoms drawn faded and never validated (counterions). */
  readonly spectatorMapNumbers?: readonly number[];
}

export interface ReactionAuthor {
  readonly name: string;
  readonly url: string | null;
}

export interface ReactionFile extends ReactionMechanism {
  readonly formatVersion: 1;
  readonly reactionSlug: string;
  readonly reactionVersion: number;
  /** The version this one was edited from; null for version 1. */
  readonly previousReactionVersion: number | null;
  readonly title: string;
  readonly subtitle?: string;
  readonly reactionClasses: readonly ReactionClass[];
  readonly difficultyTier: 1 | 2 | 3;
  /** Text over the reaction arrow; context only. */
  readonly conditionsLabel: string;
  readonly dailyPuzzleEligible: boolean;
  readonly atomRoleToMapNumbers: Readonly<Record<string, readonly number[]>>;
  readonly spectatorMapNumbers: readonly number[];
  readonly mechanismSummary: string;
  readonly references: readonly string[];
  readonly authors: readonly ReactionAuthor[];
  readonly licence: "CC-BY-SA-4.0";
  /** Set by the server at publish (UTC); absent in drafts. */
  readonly publishedAt?: string;
}
