/**
 * A schema-valid reaction file read into the typed shape the lint rules use.
 *
 * The linter runs these rules only after the JSON schema passed, so every required field is
 * there; each field is still checked as it is read, instead of being cast, and a field of the
 * wrong type throws (a bug in the schema or here, never a lint finding).
 * States keep the order of stateIdToState, steps the order of "steps" (findings point at steps by
 * position).
 */

type DocumentRecord = Readonly<Record<string, unknown>>;

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
  readonly stepKind: string;
  readonly routePreference: string;
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

function isDocumentRecord(value: unknown): value is DocumentRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordAt(record: DocumentRecord, key: string): DocumentRecord {
  const value = record[key];
  if (!isDocumentRecord(value)) {
    throw new Error(`reaction file: "${key}" must be an object`);
  }
  return value;
}

function textAt(record: DocumentRecord, key: string): string {
  const value = record[key];
  if (typeof value !== "string") {
    throw new Error(`reaction file: "${key}" must be text`);
  }
  return value;
}

function listAt(record: DocumentRecord, key: string): unknown[] {
  const value = record[key] ?? [];
  if (!Array.isArray(value)) {
    throw new Error(`reaction file: "${key}" must be a list`);
  }
  return value;
}

function textList(value: unknown, key: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`reaction file: "${key}" must be a list of text`);
  }
  return value;
}

function numberList(value: unknown, key: string): number[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "number")) {
    throw new Error(`reaction file: "${key}" must be a list of numbers`);
  }
  return value;
}

function recordsAt(record: DocumentRecord, key: string): DocumentRecord[] {
  return listAt(record, key).map((item) => {
    if (!isDocumentRecord(item)) {
      throw new Error(`reaction file: every entry of "${key}" must be an object`);
    }
    return item;
  });
}

function lintedState(state: DocumentRecord): LintedState {
  return {
    mappedSmiles: textAt(state, "mappedSmiles"),
    hasLearnerPrompt: "learnerPrompt" in state,
    hasCaption: typeof state.caption === "string" && state.caption.trim() !== "",
    hintTierCount: listAt(state, "hintTiers").length,
    misconceptions: recordsAt(state, "misconceptions").map((entry) => ({
      misconceptionId: textAt(entry, "misconceptionId"),
      arrowPattern: textAt(entry, "arrowPattern"),
    })),
  };
}

function lintedStep(step: DocumentRecord): LintedStep {
  return {
    stepKey: textAt(step, "stepKey"),
    fromStateId: textAt(step, "fromStateId"),
    toStateId: textAt(step, "toStateId"),
    stepKind: textAt(step, "stepKind"),
    routePreference: textAt(step, "routePreference"),
    canonicalArrows: textList(step.canonicalArrows ?? [], "canonicalArrows"),
    partialArrowSets: listAt(step, "partialArrowSets").map((arrowSet) =>
      textList(arrowSet, "partialArrowSets"),
    ),
    addedSpecies: typeof step.addedSpecies === "string" ? step.addedSpecies : undefined,
    removedFragmentMapNumbers: numberList(
      step.removedFragmentMapNumbers ?? [],
      "removedFragmentMapNumbers",
    ),
  };
}

/** Read a schema-valid reaction file. */
export function readLintedReaction(reactionDocument: DocumentRecord): LintedReaction {
  const roles = isDocumentRecord(reactionDocument.atomRoleToMapNumbers)
    ? reactionDocument.atomRoleToMapNumbers
    : {};
  return {
    startStateId: textAt(reactionDocument, "startStateId"),
    stateIdToState: new Map(
      Object.entries(recordAt(reactionDocument, "stateIdToState")).map(([stateId, state]) => {
        if (!isDocumentRecord(state)) {
          throw new Error(`reaction file: state "${stateId}" must be an object`);
        }
        return [stateId, lintedState(state)];
      }),
    ),
    steps: recordsAt(reactionDocument, "steps").map(lintedStep),
    atomRoleToMapNumbers: Object.fromEntries(
      Object.entries(roles).map(([role, mapNumbers]) => [role, numberList(mapNumbers, role)]),
    ),
    abbreviatedGroups: recordsAt(reactionDocument, "abbreviatedGroups").map((group) => ({
      attachmentMapNumber: Number(group.attachmentMapNumber),
      mapNumbers: numberList(group.mapNumbers, "mapNumbers"),
    })),
  };
}
