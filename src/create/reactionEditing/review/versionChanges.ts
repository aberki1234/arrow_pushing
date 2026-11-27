/**
 * What changed between two versions of a reaction: the review screen's list (docs/SPEC.md §6,
 * "Contributors": by default only what changed against the previous published version; a new
 * reaction shows everything).
 *
 * Terms
 *   compared entry  One thing a reviewer looks at: a reaction field, a state's structure or one
 *                   of its learner texts (each hint tier, each wrong answer by its id, each
 *                   partial answer), a step's arrows or texts. Its change key names it in both
 *                   versions ("state:reactants hintTiers:1") and is what a pinned note points at.
 *   version change  An entry added, removed or changed, with its text as word-diff pieces
 *                   (textDiff.ts) and the place it is edited at (lintPlaces.ts, for "Go there →").
 * Rules
 *   - Version numbers, authors, the licence and the format are never compared (the server sets
 *     them); an absent or empty field is no entry.
 *   - Order: the reaction's fields (REACTION_FIELDS), then each state of the newer version in its
 *     order, then each step; entries only in the older version come last, as removed.
 *   - A state's structure (mapped SMILES, coordinates, lone pairs, wedges) is one entry, drawn
 *     before and after by the page; its text is the mapped SMILES.
 */
import type { LintPlace } from "../draft/lintPlaces.js";
import { type ReactionDocument, statesOf, stepsOf } from "../draft/reactionDraft.js";
import { stateDisplayNames } from "../outline/stateStrip.js";
import { type TextPiece, textDiff } from "./textDiff.js";
import { isRecord } from "../../../core/jsonValues/jsonValues.js";

export type EntryKind = "text" | "structure" | "misconception" | "details";

export type ChangeKind = "added" | "removed" | "changed";

export interface VersionChange {
  readonly changeKey: string;
  /** "Start · Hint 2", "Start → Product · Arrows", "Name". */
  readonly heading: string;
  readonly place: LintPlace;
  readonly changeKind: ChangeKind;
  readonly entryKind: EntryKind;
  readonly textPieces: readonly TextPiece[];
  /** The state to draw (a structure or a wrong answer), else null. */
  readonly stateId: string | null;
  readonly misconceptionId: string | null;
}

interface ComparedEntry {
  readonly changeKey: string;
  readonly heading: string;
  readonly place: LintPlace;
  readonly entryKind: EntryKind;
  /** What is shown and diffed. */
  readonly text: string;
  /** What decides whether it changed (JSON). */
  readonly comparedValue: string;
  readonly stateId: string | null;
  readonly misconceptionId: string | null;
}

type JsonRecord = Readonly<Record<string, unknown>>;

/** The reaction's compared fields, in order: field, heading, entry kind. */
const REACTION_FIELDS: readonly (readonly [string, string, EntryKind])[] = [
  ["title", "Name", "text"],
  ["subtitle", "Subtitle", "text"],
  ["conditionsLabel", "Conditions", "text"],
  ["reactionClasses", "Reaction classes", "details"],
  ["difficultyTier", "Difficulty", "details"],
  ["dailyPuzzleEligible", "Daily puzzle", "details"],
  ["atomRoleToMapNumbers", "Atom roles", "details"],
  ["spectatorMapNumbers", "Spectators", "details"],
  ["abbreviatedGroups", "Abbreviated groups", "details"],
  ["mechanismSummary", "Summary at the end", "text"],
  ["references", "References", "text"],
];

const STRUCTURE_FIELDS = [
  "mappedSmiles",
  "mapNumberToCoordinates",
  "mapNumberToLonePairAnglesDegrees",
  "bondToWedgeStyle",
];

const STEP_DETAIL_FIELDS = [
  "fromStateId",
  "toStateId",
  "stepKind",
  "routePreference",
  "addedSpecies",
  "removedFragmentMapNumbers",
];

function textOf(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value.join("; ");
  }
  return JSON.stringify(value);
}

function entry(
  fields: Omit<ComparedEntry, "comparedValue" | "stateId" | "misconceptionId"> &
    Partial<Pick<ComparedEntry, "comparedValue" | "stateId" | "misconceptionId">>,
): ComparedEntry {
  return {
    stateId: null,
    misconceptionId: null,
    comparedValue: JSON.stringify(fields.text),
    ...fields,
  };
}

function reactionEntries(document: ReactionDocument): ComparedEntry[] {
  return REACTION_FIELDS.map(([field, heading, entryKind]) =>
    entry({
      changeKey: field,
      heading,
      place: { placeKind: "reaction", field },
      entryKind,
      text: textOf(document[field]),
    }),
  );
}

function structureEntry(stateId: string, state: JsonRecord, prefix: string): ComparedEntry {
  const structure = Object.fromEntries(STRUCTURE_FIELDS.map((field) => [field, state[field]]));
  return entry({
    changeKey: `state:${stateId} structure`,
    heading: `${prefix} · Structure`,
    place: { placeKind: "state", stateId, field: "mappedSmiles" },
    entryKind: "structure",
    text: textOf(state.mappedSmiles),
    comparedValue: JSON.stringify(structure),
    stateId,
  });
}

function misconceptionEntries(stateId: string, state: JsonRecord, prefix: string): ComparedEntry[] {
  const misconceptions = Array.isArray(state.misconceptions) ? state.misconceptions : [];
  return misconceptions.filter(isRecord).map((misconception, position) => {
    const misconceptionId = textOf(misconception.misconceptionId) || String(position);
    return entry({
      changeKey: `state:${stateId} misconception:${misconceptionId}`,
      heading: `${prefix} · Common wrong answer`,
      place: { placeKind: "state", stateId, field: "misconceptions" },
      entryKind: "misconception",
      text:
        `${textOf(misconception.arrowPattern)} (${textOf(misconception.severity)}): ` +
        textOf(misconception.feedbackMessage),
      comparedValue: JSON.stringify(misconception),
      stateId,
      misconceptionId,
    });
  });
}

/** One entry per item of a list field: hint tiers, partial answers. */
function listEntries(
  stateId: string,
  items: unknown,
  naming: { readonly field: string; readonly label: string; readonly prefix: string },
  itemText: (item: unknown) => string,
): ComparedEntry[] {
  return (Array.isArray(items) ? items : []).map((item, position) =>
    entry({
      changeKey: `state:${stateId} ${naming.field}:${String(position)}`,
      heading: `${naming.prefix} · ${naming.label} ${String(position + 1)}`,
      place: { placeKind: "state", stateId, field: naming.field },
      entryKind: "text",
      text: itemText(item),
      comparedValue: JSON.stringify(item),
    }),
  );
}

function partialAnswerText(item: unknown): string {
  return isRecord(item)
    ? `${textOf(item.learnerArrows)}: ${textOf(item.feedbackMessage)}`
    : textOf(item);
}

function stateTextEntry(
  stateId: string,
  state: JsonRecord,
  [field, label]: readonly [string, string],
  prefix: string,
): ComparedEntry {
  const value = state[field];
  const text = Array.isArray(value)
    ? value.map((item) => (isRecord(item) ? textOf(item.text) : textOf(item))).join("; ")
    : textOf(value);
  return entry({
    changeKey: `state:${stateId} ${field}`,
    heading: `${prefix} · ${label}`,
    place: { placeKind: "state", stateId, field },
    entryKind: "text",
    text,
    comparedValue: JSON.stringify(value ?? null),
  });
}

function stateEntries(stateId: string, state: JsonRecord, prefix: string): ComparedEntry[] {
  return [
    structureEntry(stateId, state, prefix),
    stateTextEntry(stateId, state, ["caption", "Caption"], prefix),
    stateTextEntry(stateId, state, ["annotations", "Labels"], prefix),
    stateTextEntry(stateId, state, ["learnerPrompt", "Question the learner sees"], prefix),
    ...listEntries(stateId, state.hintTiers, { field: "hintTiers", label: "Hint", prefix }, textOf),
    ...misconceptionEntries(stateId, state, prefix),
    ...listEntries(
      stateId,
      state.partialProgressMessages,
      { field: "partialProgressMessages", label: "Partial answer", prefix },
      partialAnswerText,
    ),
  ];
}

function stepEntries(step: JsonRecord, names: ReadonlyMap<string, string>): ComparedEntry[] {
  const stepKey = textOf(step.stepKey);
  const fromName = names.get(textOf(step.fromStateId)) ?? textOf(step.fromStateId);
  const prefix = `${fromName} → ${names.get(textOf(step.toStateId)) ?? textOf(step.toStateId)}`;
  const stepEntry = (field: string, label: string, entryKind: EntryKind): ComparedEntry =>
    entry({
      changeKey: `step:${stepKey} ${field}`,
      heading: `${prefix} · ${label}`,
      place: { placeKind: "step", stepKey, field },
      entryKind,
      text: textOf(step[field]),
    });
  const details = Object.fromEntries(STEP_DETAIL_FIELDS.map((field) => [field, step[field]]));
  return [
    stepEntry("canonicalArrows", "Arrows", "text"),
    stepEntry("partialArrowSets", "Partial arrow sets", "text"),
    stepEntry("caption", "What happens (caption)", "text"),
    stepEntry("explanationAfterStep", "Why it happens", "text"),
    entry({
      changeKey: `step:${stepKey} details`,
      heading: `${prefix} · Step details`,
      place: { placeKind: "step", stepKey, field: null },
      entryKind: "details",
      text: [textOf(step.stepKind), textOf(step.routePreference)].join(" · "),
      comparedValue: JSON.stringify(details),
    }),
  ];
}

/** Every compared entry of the document, in the order of the module comment. */
function comparedEntries(document: ReactionDocument): ComparedEntry[] {
  const names = stateDisplayNames(document);
  const states = Object.entries(statesOf(document)).filter(
    (stateEntry): stateEntry is [string, JsonRecord] => isRecord(stateEntry[1]),
  );
  return [
    ...reactionEntries(document),
    ...states.flatMap(([stateId, state]) =>
      stateEntries(stateId, state, names.get(stateId) ?? stateId),
    ),
    ...stepsOf(document).flatMap((step) => stepEntries(step, names)),
  ].filter((compared) => compared.text !== "");
}

function changeOf(
  compared: ComparedEntry,
  changeKind: ChangeKind,
  textPieces: TextPiece[],
): VersionChange {
  return {
    changeKey: compared.changeKey,
    heading: compared.heading,
    place: compared.place,
    changeKind,
    entryKind: compared.entryKind,
    textPieces,
    stateId: compared.stateId,
    misconceptionId: compared.misconceptionId,
  };
}

/** The changes from `older` (null for a new reaction: everything is added) to `newer`. */
export function versionChanges(
  older: ReactionDocument | null,
  newer: ReactionDocument,
): VersionChange[] {
  const olderEntries = older === null ? [] : comparedEntries(older);
  const keyToOlder = new Map(olderEntries.map((compared) => [compared.changeKey, compared]));
  const newerEntries = comparedEntries(newer);
  const newerKeys = new Set(newerEntries.map((compared) => compared.changeKey));
  const changes: VersionChange[] = [];
  for (const compared of newerEntries) {
    const before = keyToOlder.get(compared.changeKey);
    if (before === undefined) {
      changes.push(changeOf(compared, "added", textDiff("", compared.text)));
    } else if (before.comparedValue !== compared.comparedValue) {
      changes.push(changeOf(compared, "changed", textDiff(before.text, compared.text)));
    }
  }
  for (const before of olderEntries) {
    if (!newerKeys.has(before.changeKey)) {
      changes.push(changeOf(before, "removed", textDiff(before.text, "")));
    }
  }
  return changes;
}

/**
 * Where a pinned note's change key is edited in `document` (for "Go there →"): the entry's place,
 * else (an entry the draft no longer has) its state, its step, or the reaction field it names.
 */
export function placeOfChangeKey(document: ReactionDocument, changeKey: string): LintPlace {
  const found = comparedEntries(document).find((compared) => compared.changeKey === changeKey);
  if (found !== undefined) {
    return found.place;
  }
  const [subject = "", field = ""] = changeKey.split(" ");
  const fieldName = field.split(":")[0] ?? "";
  if (subject.startsWith("state:")) {
    return { placeKind: "state", stateId: subject.slice("state:".length), field: null };
  }
  if (subject.startsWith("step:")) {
    return { placeKind: "step", stepKey: subject.slice("step:".length), field: null };
  }
  return { placeKind: "reaction", field: fieldName === "" ? subject : fieldName };
}
