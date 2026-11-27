/**
 * Publishing several drafts at once from Your mechanisms (owner, 2026-11-26): for small changes,
 * such as an assistant's text-only next versions, ticked rows are published without opening each.
 *
 * Rules
 *   - Only someone who may publish directly sees the ticks, and only on their own unpublished
 *     versions (draft, in review, changes requested).
 *   - Each ticked reaction goes through the usual publish (the server lints it and records the
 *     licence), one after another; a refusal does not stop the rest.
 *   - One message afterwards: how many were published, and each refusal with its reason.
 */
import type { ListedReactionFile } from "./reactionFileStore.js";
import {
  DEPLOY_START_TO_SENTENCE,
  type DeployStart,
  type PublishOutcome,
  type ReactionPublishing,
} from "./serverReactionStore.js";

export interface BatchPublishResult {
  readonly publishedCount: number;
  readonly refusals: readonly { reactionSlug: string; reason: string }[];
  /** The last publish's deploy start, or null when nothing was published. */
  readonly deployStart: DeployStart | null;
}

/** The rows of Your mechanisms that can be ticked for publishing. */
export function publishableRows(
  files: readonly ListedReactionFile[],
  userId: string,
): ListedReactionFile[] {
  return files.filter(
    (file) =>
      file.newestAuthorUserId === userId &&
      file.newestSubmissionStatus !== undefined &&
      file.newestSubmissionStatus !== "published",
  );
}

/** Publish each slug in turn (licence agreed), collecting what happened. */
export async function publishSelected(
  reactionSlugs: readonly string[],
  publish: (reactionSlug: string, licenceAgreed: boolean) => Promise<PublishOutcome>,
): Promise<BatchPublishResult> {
  let publishedCount = 0;
  let deployStart: DeployStart | null = null;
  const refusals: { reactionSlug: string; reason: string }[] = [];
  for (const reactionSlug of reactionSlugs) {
    try {
      const outcome = await publish(reactionSlug, true);
      if (outcome.outcome === "published") {
        publishedCount += 1;
        deployStart = outcome.deployStart;
      } else {
        refusals.push({ reactionSlug, reason: outcome.reason });
      }
    } catch (error) {
      refusals.push({
        reactionSlug,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { publishedCount, refusals, deployStart };
}

/** The message Your mechanisms shows afterwards. */
export function batchPublishMessage(result: BatchPublishResult): {
  readonly tone: "good" | "bad";
  readonly text: string;
} {
  const total = result.publishedCount + result.refusals.length;
  const deployText =
    result.deployStart === null ? "" : ` ${DEPLOY_START_TO_SENTENCE[result.deployStart]}`;
  if (result.refusals.length === 0) {
    const versions = `${String(total)} version${total === 1 ? "" : "s"}`;
    return {
      tone: result.deployStart === "failed" ? "bad" : "good",
      text: `Published ${versions}.${deployText}`,
    };
  }
  const refused = result.refusals
    .map(({ reactionSlug, reason }) => `${reactionSlug} (${reason})`)
    .join("; ");
  return {
    tone: "bad",
    text:
      `Published ${String(result.publishedCount)} of ${String(total)}. ` +
      `Not published: ${refused}.${deployText}`,
  };
}

/** What Create runs for Publish selected: publish, refresh the list, and say what happened. */
export async function publishAndDescribe(
  reactionSlugs: readonly string[],
  publishing: Pick<ReactionPublishing, "publish">,
  afterwards: () => void,
): Promise<{ tone: "good" | "bad"; text: string }> {
  const result = await publishSelected(reactionSlugs, (reactionSlug, licenceAgreed) =>
    publishing.publish(reactionSlug, licenceAgreed),
  );
  afterwards();
  return batchPublishMessage(result);
}
