/**
 * The feedback a learner meets again and again (decided 2026-11-25, item 7c), counted from the
 * feedback ids recorded with each step ("misconception:<slug>/<id>", "rule:<id>"). A generic rule
 * is one row under its plain heading; misconceptions are grouped by their misconceptionTag when
 * they have one (the same mistake in different reactions), otherwise by their id, and shown with
 * the authored message. Rows come most frequent first.
 */
import { type LearnerProgress, runsNewestFirst } from "../learnerProgress/learnerProgress.js";
import { GENERIC_RULE_ID_TO_HEADING } from "../stepSession/feedbackText.js";
import type { SessionReaction } from "../stepSession/sessionReaction.js";
import { splitReactionVersionRef } from "../../core/catalogue/reactionVersionRefs.js";

export const RECURRING_ROW_LIMIT = 5;

export interface MisconceptionInfo {
  readonly misconceptionTag: string | null;
  readonly feedbackMessage: string;
}

export interface RecurringFeedbackRow {
  readonly groupKey: string;
  readonly heading: string;
  /** The authored message of a misconception; "" for a generic rule. */
  readonly message: string;
  readonly count: number;
  /** Slugs where it was shown, most recent first, without repeats. */
  readonly reactionSlugs: readonly string[];
  /** The most recent reaction version it was shown in, to practise. */
  readonly practiseRef: string;
}

const MISCONCEPTION_PREFIX = "misconception:";
const RULE_PREFIX = "rule:";

/** "attack-leaving-group" -> "Attack leaving group". */
function headingFromSlug(slug: string): string {
  const words = slug.replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The slugs of reactions whose misconception messages are needed, most recent first. */
export function misconceptionSlugsShown(progress: LearnerProgress): string[] {
  const slugs: string[] = [];
  for (const run of runsNewestFirst(progress)) {
    for (const feedbackId of run.stepResults.flatMap((stepResult) => stepResult.feedbackIdsShown)) {
      const slug = feedbackId.startsWith(MISCONCEPTION_PREFIX)
        ? feedbackId.slice(MISCONCEPTION_PREFIX.length).split("/")[0]
        : undefined;
      if (slug !== undefined && !slugs.includes(slug)) {
        slugs.push(slug);
      }
    }
  }
  return slugs;
}

/** Each misconception id of a reaction to its tag and message. */
export function misconceptionInfoOf(reaction: SessionReaction): Map<string, MisconceptionInfo> {
  const info = new Map<string, MisconceptionInfo>();
  for (const misconceptions of reaction.prepared.stateIdToMisconceptions.values()) {
    for (const misconception of misconceptions) {
      info.set(misconception.misconceptionId, {
        misconceptionTag: misconception.misconceptionTag,
        feedbackMessage: misconception.feedbackMessage,
      });
    }
  }
  return info;
}

interface GroupHead {
  readonly groupKey: string;
  readonly heading: string;
  readonly message: string;
}

function groupHeadOf(
  feedbackId: string,
  slugToMisconceptionInfo: ReadonlyMap<string, ReadonlyMap<string, MisconceptionInfo>>,
): GroupHead {
  if (feedbackId.startsWith(RULE_PREFIX)) {
    const ruleId = feedbackId.slice(RULE_PREFIX.length);
    return {
      groupKey: feedbackId,
      heading: GENERIC_RULE_ID_TO_HEADING[ruleId] ?? headingFromSlug(ruleId),
      message: "",
    };
  }
  const [slug = "", misconceptionId = ""] = feedbackId
    .slice(MISCONCEPTION_PREFIX.length)
    .split("/");
  const info = slugToMisconceptionInfo.get(slug)?.get(misconceptionId);
  const tag = info?.misconceptionTag ?? null;
  return {
    groupKey: tag === null ? feedbackId : `tag:${tag}`,
    heading: headingFromSlug(tag ?? misconceptionId),
    message: info?.feedbackMessage ?? "",
  };
}

interface MutableRow {
  head: GroupHead;
  count: number;
  latestStartedAt: string;
  reactionSlugs: string[];
  practiseRef: string;
}

/**
 * The rows, most frequent first (ties: most recent first). `slugToMisconceptionInfo` holds the
 * loaded reactions; a misconception of a reaction not loaded is shown by its id.
 */
export function recurringFeedback(
  progress: LearnerProgress,
  slugToMisconceptionInfo: ReadonlyMap<string, ReadonlyMap<string, MisconceptionInfo>>,
  onlySlug: string | null = null,
): RecurringFeedbackRow[] {
  const keyToRow = new Map<string, MutableRow>();
  for (const run of runsNewestFirst(progress)) {
    const [slug] = splitReactionVersionRef(run.reactionVersionRef);
    if (onlySlug !== null && slug !== onlySlug) {
      continue;
    }
    for (const feedbackId of run.stepResults.flatMap((stepResult) => stepResult.feedbackIdsShown)) {
      const head = groupHeadOf(feedbackId, slugToMisconceptionInfo);
      const row = keyToRow.get(head.groupKey) ?? {
        head,
        count: 0,
        latestStartedAt: run.startedAt,
        reactionSlugs: [],
        practiseRef: run.reactionVersionRef,
      };
      row.count += 1;
      if (!row.reactionSlugs.includes(slug)) {
        row.reactionSlugs.push(slug);
      }
      keyToRow.set(head.groupKey, row);
    }
  }
  return [...keyToRow.values()]
    .sort(
      (one, other) =>
        other.count - one.count || other.latestStartedAt.localeCompare(one.latestStartedAt),
    )
    .slice(0, RECURRING_ROW_LIMIT)
    .map((row) => ({
      ...row.head,
      count: row.count,
      reactionSlugs: row.reactionSlugs,
      practiseRef: row.practiseRef,
    }));
}
