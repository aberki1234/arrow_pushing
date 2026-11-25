/**
 * Create's Teaching stage: the to-do list (docs/SPEC.md §5, "Create", stage 3).
 *
 * Groups, in the order of the state strip (stateStrip.ts), then the reaction's own group:
 *   state        a state with arrow steps leaving it: the learner prompt (needed), hint tiers
 *                (needed; done at three), misconceptions (recommended), and the explanation after
 *                each arrow step leaving it (recommended).
 *   changeStep   a change step: its caption (recommended).
 *   reaction     the mechanism summary (needed: the schema requires it).
 * An item is built from the draft's own fields, not from the lint: a new draft fails the schema,
 * and the linter then stops before its learner-text rules. Lint findings at an item's place are
 * attached to it, so the page can show them there.
 */
import type { LintFinding } from "../reactionLinting/lintFindings.js";
import { type LintPlace, placeOfFinding } from "./lintPlaces.js";
import { type ReactionDocument, statesOf, stepsOf } from "./reactionDraft.js";
import { stateStripRows } from "./stateStrip.js";

export type TeachingItemKind =
  | "learnerPrompt"
  | "hintTiers"
  | "misconceptions"
  | "explanationAfterStep"
  | "caption"
  | "mechanismSummary";

export type TeachingNeed = "needed" | "recommended" | "optional";

/** started: some hint tiers, fewer than the full ladder of three. */
export type TeachingItemStatus = "missing" | "started" | "done";

export interface TeachingItem {
  readonly itemKind: TeachingItemKind;
  readonly need: TeachingNeed;
  readonly itemStatus: TeachingItemStatus;
  /** Hint tiers or misconceptions written; 1 or 0 for a text. */
  readonly filledCount: number;
  readonly place: LintPlace;
  readonly lintFindings: readonly LintFinding[];
}

export interface TeachingGroup {
  readonly groupKind: "state" | "changeStep" | "reaction";
  /** The state's id (state), the change step's key (changeStep), or null (reaction). */
  readonly groupSubject: string | null;
  readonly items: readonly TeachingItem[];
}

export interface TeachingCounts {
  readonly doneCount: number;
  readonly itemCount: number;
  /** Needed items still missing. */
  readonly neededLeftCount: number;
}

type JsonRecord = Readonly<Record<string, unknown>>;

/** The full hint ladder: conceptual, narrowing, reveal (lint: fewer-than-three-hint-tiers). */
export const FULL_HINT_LADDER_LENGTH = 3;

/** Lint rules about a whole state that belong to one of its fields. */
const LINT_RULE_TO_FIELD: Readonly<Record<string, string>> = {
  "learner-prompt-missing": "learnerPrompt",
  "hint-tiers-missing": "hintTiers",
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function filledTextCount(value: unknown): number {
  return typeof value === "string" && value.trim() !== "" ? 1 : 0;
}

function listLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function samePlace(first: LintPlace, second: LintPlace): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

/** The finding's place, with a field for the state rules that name none. */
function findingPlace(document: ReactionDocument, finding: LintFinding): LintPlace {
  const place = placeOfFinding(document, finding);
  const ruleField = LINT_RULE_TO_FIELD[finding.lintRuleId];
  return place.placeKind === "state" && place.field === null && ruleField !== undefined
    ? { ...place, field: ruleField }
    : place;
}

interface ItemMaking {
  readonly document: ReactionDocument;
  readonly lintFindings: readonly LintFinding[];
}

function teachingItem(
  making: ItemMaking,
  fields: { itemKind: TeachingItemKind; need: TeachingNeed; place: LintPlace; filled: number },
  doneAt = 1,
): TeachingItem {
  const { itemKind, need, place, filled } = fields;
  const itemStatus = filled >= doneAt ? "done" : filled > 0 ? "started" : "missing";
  return {
    itemKind,
    need,
    itemStatus,
    filledCount: filled,
    place,
    lintFindings: making.lintFindings.filter((finding) =>
      samePlace(findingPlace(making.document, finding), place),
    ),
  };
}

function stateGroup(making: ItemMaking, stateId: string): TeachingGroup | undefined {
  const leavingArrowSteps = stepsOf(making.document).filter(
    (step) => step.fromStateId === stateId && step.stepKind !== "change",
  );
  if (leavingArrowSteps.length === 0) {
    return undefined;
  }
  const state = statesOf(making.document)[stateId];
  const stateFields = isRecord(state) ? state : {};
  const statePlace = (field: string): LintPlace => ({ placeKind: "state", stateId, field });
  const items = [
    teachingItem(making, {
      itemKind: "learnerPrompt",
      need: "needed",
      place: statePlace("learnerPrompt"),
      filled: filledTextCount(stateFields.learnerPrompt),
    }),
    teachingItem(
      making,
      {
        itemKind: "hintTiers",
        need: "needed",
        place: statePlace("hintTiers"),
        filled: listLength(stateFields.hintTiers),
      },
      FULL_HINT_LADDER_LENGTH,
    ),
    teachingItem(making, {
      itemKind: "misconceptions",
      need: "recommended",
      place: statePlace("misconceptions"),
      filled: listLength(stateFields.misconceptions),
    }),
    ...leavingArrowSteps.map((step) =>
      teachingItem(making, {
        itemKind: "explanationAfterStep",
        need: "recommended",
        place: { placeKind: "step", stepKey: String(step.stepKey), field: "explanationAfterStep" },
        filled: filledTextCount(step.explanationAfterStep),
      }),
    ),
  ];
  return { groupKind: "state", groupSubject: stateId, items };
}

function changeStepGroup(making: ItemMaking, stepKey: string): TeachingGroup | undefined {
  const step = stepsOf(making.document).find((candidate) => candidate.stepKey === stepKey);
  if (step?.stepKind !== "change") {
    return undefined;
  }
  const caption = teachingItem(making, {
    itemKind: "caption",
    need: "recommended",
    place: { placeKind: "step", stepKey, field: "caption" },
    filled: filledTextCount(step.caption),
  });
  return { groupKind: "changeStep", groupSubject: stepKey, items: [caption] };
}

export function teachingChecklist(
  document: ReactionDocument,
  lintFindings: readonly LintFinding[],
): TeachingGroup[] {
  const making: ItemMaking = { document, lintFindings };
  const groups = stateStripRows(document).flatMap((row) =>
    row.frames.map((frame) =>
      frame.frameKind === "state"
        ? stateGroup(making, frame.stateId)
        : changeStepGroup(making, frame.stepKey),
    ),
  );
  const summary = teachingItem(making, {
    itemKind: "mechanismSummary",
    need: "needed",
    place: { placeKind: "reaction", field: "mechanismSummary" },
    filled: filledTextCount(document.mechanismSummary),
  });
  return [
    ...groups.filter((group) => group !== undefined),
    { groupKind: "reaction", groupSubject: null, items: [summary] },
  ];
}

export function teachingCounts(groups: readonly TeachingGroup[]): TeachingCounts {
  const items = groups.flatMap((group) => group.items);
  return {
    doneCount: items.filter((item) => item.itemStatus === "done").length,
    itemCount: items.length,
    neededLeftCount: items.filter((item) => item.need === "needed" && item.itemStatus === "missing")
      .length,
  };
}

/** "<itemKind> <placeKind>:<state id, step key or nothing>", e.g. "hintTiers state:reactants". */
export function teachingItemKey(item: TeachingItem): string {
  const { place } = item;
  const subject =
    place.placeKind === "state" ? place.stateId : place.placeKind === "step" ? place.stepKey : "";
  return `${item.itemKind} ${place.placeKind}:${subject}`;
}

/**
 * The key of the first item not done after `currentKey` (from the start if null), wrapping
 * round; when every item is done, simply the next item. Null for an empty list.
 */
export function nextTeachingItemKey(
  groups: readonly TeachingGroup[],
  currentKey: string | null,
): string | null {
  const items = groups.flatMap((group) => group.items);
  const currentPosition = items.findIndex((item) => teachingItemKey(item) === currentKey);
  // From just after the current item (or from the first when there is none), all the way round.
  const inOrder = Array.from(
    items.keys(),
    (offset) => items[(currentPosition + 1 + offset) % items.length],
  );
  const notDone = inOrder.find((item) => item !== undefined && item.itemStatus !== "done");
  const next = notDone ?? inOrder[0];
  return next === undefined ? null : teachingItemKey(next);
}
