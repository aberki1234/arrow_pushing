/**
 * The words Create's stages show (docs/SPEC.md §5, "Create"), worked out from the draft: the
 * stage list, the Teaching groups' titles, each item's label and badge. States are named as the
 * strip names them (reactionEditing/outline/stateStrip.ts).
 */
import type { CreationStage } from "../../reactionEditing/publishing/creationProgress.js";
import { type ReactionDocument, stepsOf } from "../../reactionEditing/draft/reactionDraft.js";
import { stateDisplayNames } from "../../reactionEditing/outline/stateStrip.js";
import {
  FULL_HINT_LADDER_LENGTH,
  type TeachingGroup,
  type TeachingItem,
  type TeachingItemKind,
} from "../../reactionEditing/teaching/teachingChecklist.js";

/** The panels the Mechanism stage's ⋯ More menu opens. */
export type MorePanelKind = "addMolecule" | "shortenGroup" | "editSmiles";

export const CREATION_STAGES: readonly {
  readonly stage: CreationStage;
  readonly title: string;
  readonly subtitle: string;
}[] = [
  { stage: "start", title: "Start", subtitle: "name + molecules" },
  { stage: "mechanism", title: "Mechanism", subtitle: "push the arrows" },
  { stage: "teaching", title: "Teaching", subtitle: "questions, hints, traps" },
  { stage: "publish", title: "Publish", subtitle: "try it, details, publish" },
];

const ITEM_KIND_TO_LABEL: Readonly<Record<TeachingItemKind, string>> = {
  learnerPrompt: "Question the learner sees",
  hintTiers: "Hints",
  misconceptions: "Common wrong answers",
  explanationAfterStep: "Why it happens",
  caption: "What happens (caption)",
  mechanismSummary: "Summary at the end",
};

type JsonRecord = Readonly<Record<string, unknown>>;

function stepWithKey(document: ReactionDocument, stepKey: string): JsonRecord | undefined {
  return stepsOf(document).find((step) => step.stepKey === stepKey);
}

/** "Start → Product", the states named as the strip names them. */
function stepArrowText(document: ReactionDocument, step: JsonRecord | undefined): string {
  const names = stateDisplayNames(document);
  const nameOf = (stateId: unknown): string => names.get(String(stateId)) ?? String(stateId);
  return `${nameOf(step?.fromStateId)} → ${nameOf(step?.toStateId)}`;
}

function arrowStepsLeaving(document: ReactionDocument, stateId: unknown): JsonRecord[] {
  return stepsOf(document).filter(
    (step) => step.fromStateId === stateId && step.stepKind !== "change",
  );
}

export function teachingGroupTitle(document: ReactionDocument, group: TeachingGroup): string {
  if (group.groupKind === "reaction") {
    return "Whole reaction";
  }
  if (group.groupKind === "changeStep") {
    const step = stepWithKey(document, String(group.groupSubject));
    return `${stepArrowText(document, step)}: molecules change`;
  }
  const leaving = arrowStepsLeaving(document, group.groupSubject);
  if (leaving.length === 1) {
    return stepArrowText(document, leaving[0]);
  }
  const name = stateDisplayNames(document).get(String(group.groupSubject));
  return `From ${name ?? String(group.groupSubject)} (${String(leaving.length)} routes)`;
}

export function teachingItemLabel(document: ReactionDocument, item: TeachingItem): string {
  const label = ITEM_KIND_TO_LABEL[item.itemKind];
  if (item.itemKind !== "explanationAfterStep" || item.place.placeKind !== "step") {
    return label;
  }
  const step = stepWithKey(document, item.place.stepKey);
  const severalLeave = arrowStepsLeaving(document, step?.fromStateId).length > 1;
  return severalLeave ? `${label} (${stepArrowText(document, step)})` : label;
}

/** "needed", "1 of 3" (hints started), "recommended", "optional", or "" when done. */
export function teachingItemBadge(item: TeachingItem): string {
  if (item.itemStatus === "done") {
    return "";
  }
  if (item.itemStatus === "started") {
    return `${String(item.filledCount)} of ${String(FULL_HINT_LADDER_LENGTH)}`;
  }
  return item.need;
}
