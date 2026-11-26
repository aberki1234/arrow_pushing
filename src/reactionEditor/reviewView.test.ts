/**
 * Tests for reviewView.ts: what Create's contributor and review pages say, and which reactions
 * Your mechanisms and "Improve a published one" list (docs/SPEC.md §6, "Contributors").
 */
import { describe, expect, it } from "vitest";
import type { QueuedSubmission, SiteUser } from "./contributorClient.js";
import type { ListedReactionFile } from "./reactionFileStore.js";
import { MAXIMUM_OPEN_DRAFTS as SERVER_LIMIT } from "../reactionDatabase/reactionVersions.js";
import {
  changesRequestedBanner,
  createSections,
  MAXIMUM_OPEN_DRAFTS,
  openDraftsLine,
  publishedToImprove,
  queueLine,
  timeAgo,
  userReactionsText,
  yourMechanisms,
  yourRowNote,
} from "./reviewView.js";

const NOW = new Date("2026-11-26T12:00:00Z");

function listed(
  fields: Partial<ListedReactionFile> & { reactionSlug: string },
): ListedReactionFile {
  return {
    fileName: `${fields.reactionSlug}.json`,
    title: fields.reactionSlug,
    newestReactionVersion: 1,
    newestSubmissionStatus: "draft",
    ownerUserId: "me",
    ownerName: "Me",
    newestAuthorUserId: "me",
    newestAuthorName: "Me",
    creationProgress: null,
    ...fields,
  };
}

const FILES: ListedReactionFile[] = [
  listed({ reactionSlug: "pinacol", newestSubmissionStatus: "changes_requested" }),
  listed({ reactionSlug: "radical", newestSubmissionStatus: "submitted" }),
  listed({
    reactionSlug: "sn2",
    newestReactionVersion: 3,
    ownerUserId: "ml",
    ownerName: "M. L.",
  }),
  listed({
    reactionSlug: "wittig",
    newestSubmissionStatus: "published",
    ownerUserId: "ml",
    ownerName: "M. L.",
    newestAuthorUserId: "ml",
    newestAuthorName: "M. L.",
  }),
  listed({ reactionSlug: "fischer", newestSubmissionStatus: "published" }),
];

describe("Your mechanisms and Improve a published one", () => {
  it("lists one's own reactions and versions, not others' published ones", () => {
    expect(yourMechanisms(FILES, "me").map((file) => file.reactionSlug)).toEqual([
      "pinacol",
      "radical",
      "sn2",
      "fischer",
    ]);
  });

  it("offers every published reaction to improve, naming its owner when not one's own", () => {
    expect(publishedToImprove(FILES, "me")).toEqual([
      { fileName: "wittig.json", label: "wittig (by M. L.)", nextVersion: 2 },
      { fileName: "fischer.json", label: "fischer", nextVersion: 2 },
    ]);
  });

  it("notes a suggestion for someone else's reaction and a version in review", () => {
    expect(yourRowNote(FILES[2] as ListedReactionFile, "me")).toBe(
      "Your suggestion for M. L.'s reaction",
    );
    expect(yourRowNote(FILES[1] as ListedReactionFile, "me")).toBe(
      "editing takes it out of review",
    );
    expect(yourRowNote(FILES[4] as ListedReactionFile, "me")).toBe("");
  });

  it("counts open drafts against the limit, and names changes requested", () => {
    expect(openDraftsLine(FILES, "me")).toBe("You have 3 of 20 open drafts.");
    expect(changesRequestedBanner(FILES, "me")).toBe("A reviewer asked for changes to pinacol");
    expect(changesRequestedBanner(FILES.slice(1), "me")).toBeNull();
    const two = [
      ...FILES,
      listed({ reactionSlug: "aldol", newestSubmissionStatus: "changes_requested" }),
    ];
    expect(changesRequestedBanner(two, "me")).toBe(
      "A reviewer asked for changes to 2 of your mechanisms",
    );
  });
});

describe("Create's sub-navigation", () => {
  it("shows Review to reviewers and Users to the owner", () => {
    expect(createSections(["createReactions", "submitForReview"])).toEqual(["mine"]);
    expect(createSections(["createReactions", "review"])).toEqual(["mine", "review"]);
    expect(createSections(["review", "manageUsers"])).toEqual(["mine", "review", "users"]);
  });
});

describe("the review queue", () => {
  const base: QueuedSubmission = {
    reactionSlug: "sn2",
    reactionVersion: 3,
    title: "SN2 substitution",
    authorName: "Sam Lee",
    ownerName: "M. L.",
    submittedAt: "2026-11-26T10:00:00Z",
    submissionNote: null,
    queueKind: "nextVersion",
  };

  it("says who suggested or wrote it, and when", () => {
    expect(queueLine(base, NOW)).toBe(
      "Suggested by Sam Lee for M. L.'s reaction · submitted 2 h ago",
    );
    expect(queueLine({ ...base, queueKind: "newReaction" }, NOW)).toBe(
      "New, by Sam Lee · submitted 2 h ago",
    );
    expect(queueLine({ ...base, queueKind: "resubmitted" }, NOW)).toBe(
      "By Sam Lee · resubmitted after changes · 2 h ago",
    );
  });

  it("gives times as minutes, hours, yesterday, days, then a date", () => {
    expect(timeAgo("2026-11-26T11:59:40Z", NOW)).toBe("just now");
    expect(timeAgo("2026-11-26T11:15:00Z", NOW)).toBe("45 min ago");
    expect(timeAgo("2026-11-25T08:00:00Z", NOW)).toBe("yesterday");
    expect(timeAgo("2026-11-21T08:00:00Z", NOW)).toBe("5 days ago");
    expect(timeAgo("2026-10-02T08:00:00Z", NOW)).toBe("2 Oct 2026");
  });
});

describe("the Users page", () => {
  it("sums up each user's reactions", () => {
    const user: SiteUser = {
      userId: "u",
      displayName: "Sam",
      providers: ["google"],
      siteRole: "contributor",
      joinedAt: "2026-11-23T00:00:00Z",
      openVersionCount: 1,
      publishedVersionCount: 1,
    };
    expect(userReactionsText(user)).toBe("1 published · 1 open");
    expect(userReactionsText({ ...user, openVersionCount: 0, publishedVersionCount: 0 })).toBe(
      "none yet",
    );
  });
});

describe("the open-draft limit", () => {
  it("is the server's", () => {
    expect(MAXIMUM_OPEN_DRAFTS).toBe(SERVER_LIMIT);
  });
});
