/** Tests for batchPublishing.ts: publishing several ticked drafts from Your mechanisms at once. */
import { describe, expect, it } from "vitest";
import { batchPublishMessage, publishableRows, publishSelected } from "./batchPublishing.js";
import type { ListedReactionFile } from "./reactionFileStore.js";
import type { PublishOutcome } from "./serverReactionStore.js";

function listed(
  reactionSlug: string,
  newestSubmissionStatus: string,
  newestAuthorUserId = "me",
): ListedReactionFile {
  return {
    fileName: `${reactionSlug}.json`,
    reactionSlug,
    title: reactionSlug,
    newestReactionVersion: 2,
    newestSubmissionStatus,
    ownerUserId: "me",
    newestAuthorUserId,
    creationProgress: null,
  };
}

const PUBLISHED: PublishOutcome = {
  outcome: "published",
  reactionVersion: 2,
  lintWarningCount: 0,
  deployStart: "started",
};

describe("which rows can be ticked", () => {
  it("is one's own unpublished versions: drafts, in review or with changes requested", () => {
    const files = [
      listed("mine-draft", "draft"),
      listed("mine-in-review", "submitted"),
      listed("mine-changes", "changes_requested"),
      listed("mine-live", "published"),
      listed("someone-elses", "submitted", "them"),
    ];
    expect(publishableRows(files, "me").map((file) => file.reactionSlug)).toEqual([
      "mine-draft",
      "mine-in-review",
      "mine-changes",
    ]);
  });
});

describe("publishing the ticked rows", () => {
  it("publishes each in turn, keeps going after a refusal, and says what happened", async () => {
    const asked: string[] = [];
    const result = await publishSelected(["one", "two", "three"], (reactionSlug, licence) => {
      asked.push(`${reactionSlug}:${String(licence)}`);
      return Promise.resolve(
        reactionSlug === "two"
          ? { outcome: "refused", reason: "the draft has lint errors", lintFindingCount: 1 }
          : PUBLISHED,
      );
    });
    expect(asked).toEqual(["one:true", "two:true", "three:true"]);
    expect(result).toEqual({
      publishedCount: 2,
      refusals: [{ reactionSlug: "two", reason: "the draft has lint errors" }],
      deployStart: "started",
    });
    expect(batchPublishMessage(result)).toEqual({
      tone: "bad",
      text:
        "Published 2 of 3. Not published: two (the draft has lint errors). " +
        "The learner site is being rebuilt.",
    });
  });

  it("counts a failed request as a refusal", async () => {
    const result = await publishSelected(["one"], () => Promise.reject(new Error("offline")));
    expect(result.refusals).toEqual([{ reactionSlug: "one", reason: "offline" }]);
  });

  it("reports all published plainly", async () => {
    const result = await publishSelected(["one", "two"], () => Promise.resolve(PUBLISHED));
    expect(batchPublishMessage(result)).toEqual({
      tone: "good",
      text: "Published 2 versions. The learner site is being rebuilt.",
    });
  });
});
