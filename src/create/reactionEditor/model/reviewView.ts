/**
 * What Create's contributor and review pages say, and which reactions they list (docs/SPEC.md §6,
 * "Contributors"; mockups/review.html). Kept out of the Svelte components so it can be tested.
 *
 * Rules
 *   - Your mechanisms: the reactions whose newest version the user wrote, and their own published
 *     ones. Someone else's published reaction is offered under "Improve a published one" only.
 *   - Open drafts (draft, in review, changes requested) count against the limit of 20
 *     (reactionDatabase/reactions/reactionVersions.ts MAXIMUM_OPEN_DRAFTS); the owner has no limit
 *     ("keepUnlimitedDrafts"), so their line gives only the count.
 *   - Create's sub-navigation: Your mechanisms always; Review with "review"; Users with
 *     "manageUsers" (reactionDatabase/model/sitePermissions.ts).
 */
import type {
  QueueKind,
  QueuedSubmission,
  ReviewNotes,
  SignInProvider,
  SiteUser,
} from "./contributorClientInterface.js";
import type { ListedReactionFile } from "./reactionFileStoreInterface.js";

/** As reactionDatabase/reactions/reactionVersions.ts. */
export const MAXIMUM_OPEN_DRAFTS = 20;

export type CreateSection = "mine" | "review" | "users";

export const CREATE_SECTION_TO_LABEL: Readonly<Record<CreateSection, string>> = {
  mine: "Your mechanisms",
  review: "Review",
  users: "Users",
};

export const QUEUE_KIND_TO_LABEL: Readonly<Record<QueueKind, string>> = {
  newReaction: "New reaction",
  nextVersion: "Improvement",
  resubmitted: "Resubmitted",
};

export const PROVIDER_TO_LABEL: Readonly<Record<SignInProvider, string>> = {
  github: "GitHub",
  google: "Google",
};

export const ROLE_TO_LABEL: Readonly<Record<SiteUser["siteRole"], string>> = {
  owner: "Owner",
  reviewer: "Reviewer",
  contributor: "Contributor",
  blocked: "Blocked",
};

const OPEN_STATUSES: readonly string[] = ["draft", "submitted", "changes_requested"];

function isOwnVersion(file: ListedReactionFile, userId: string): boolean {
  return file.newestAuthorUserId === userId;
}

function isOpen(file: ListedReactionFile): boolean {
  return OPEN_STATUSES.includes(file.newestSubmissionStatus ?? "draft");
}

function titleOf(file: ListedReactionFile): string {
  return file.title ?? file.fileName;
}

export function yourMechanisms(
  files: readonly ListedReactionFile[],
  userId: string,
): ListedReactionFile[] {
  return files.filter(
    (file) =>
      isOwnVersion(file, userId) ||
      (file.ownerUserId === userId && file.newestSubmissionStatus === "published"),
  );
}

/** Your mechanisms' filter: everything, the ones not yet published, or the published ones. */
export type YourMechanismsFilter = "all" | "drafts" | "published";

function isPublishedRow(file: ListedReactionFile): boolean {
  return file.newestSubmissionStatus === "published";
}

/** The rows of Your mechanisms the filter shows; drafts are every row not yet published. */
export function yourMechanismsShown(
  files: readonly ListedReactionFile[],
  filter: YourMechanismsFilter,
): ListedReactionFile[] {
  if (filter === "all") {
    return [...files];
  }
  return files.filter((file) => isPublishedRow(file) === (filter === "published"));
}

/** How many rows each filter shows, for the filter buttons. */
export function yourMechanismsFilterCounts(
  files: readonly ListedReactionFile[],
): Record<YourMechanismsFilter, number> {
  const published = files.filter(isPublishedRow).length;
  return { all: files.length, drafts: files.length - published, published };
}

export interface ReactionToImprove {
  readonly fileName: string;
  readonly label: string;
  readonly nextVersion: number;
}

export function publishedToImprove(
  files: readonly ListedReactionFile[],
  userId: string,
): ReactionToImprove[] {
  return files
    .filter((file) => file.newestSubmissionStatus === "published")
    .map((file) => ({
      fileName: file.fileName,
      label:
        file.ownerUserId === userId || file.ownerName === undefined
          ? titleOf(file)
          : `${titleOf(file)} (by ${file.ownerName})`,
      nextVersion: (file.newestReactionVersion ?? 0) + 1,
    }));
}

/** The small note on a row of Your mechanisms, or "". */
export function yourRowNote(file: ListedReactionFile, userId: string): string {
  if (file.ownerUserId !== undefined && file.ownerUserId !== userId && isOpen(file)) {
    return `Your suggestion for ${file.ownerName ?? "someone"}'s reaction`;
  }
  return file.newestSubmissionStatus === "submitted" ? "editing takes it out of review" : "";
}

export function openDraftsLine(
  files: readonly ListedReactionFile[],
  userId: string,
  { draftLimitApplies = true }: { readonly draftLimitApplies?: boolean } = {},
): string {
  const openCount = files.filter((file) => isOwnVersion(file, userId) && isOpen(file)).length;
  if (!draftLimitApplies) {
    return `You have ${String(openCount)} open drafts.`;
  }
  return `You have ${String(openCount)} of ${String(MAXIMUM_OPEN_DRAFTS)} open drafts.`;
}

/** The banner on Your mechanisms while a reviewer has asked for changes, else null. */
export function changesRequestedBanner(
  files: readonly ListedReactionFile[],
  userId: string,
): string | null {
  const requested = files.filter(
    (file) => isOwnVersion(file, userId) && file.newestSubmissionStatus === "changes_requested",
  );
  const [only] = requested;
  if (only === undefined) {
    return null;
  }
  return requested.length === 1
    ? `A reviewer asked for changes to ${titleOf(only)}`
    : `A reviewer asked for changes to ${String(requested.length)} of your mechanisms`;
}

export function createSections(siteActions: readonly string[]): CreateSection[] {
  return [
    "mine",
    ...(siteActions.includes("review") ? (["review"] as const) : []),
    ...(siteActions.includes("manageUsers") ? (["users"] as const) : []),
  ];
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "just now", "45 min ago", "2 h ago", "yesterday", "5 days ago", else "2 Oct 2026". */
export function timeAgo(isoText: string, now: Date): string {
  const then = new Date(isoText);
  const elapsed = now.getTime() - then.getTime();
  if (elapsed < MINUTE_MS) {
    return "just now";
  }
  if (elapsed < HOUR_MS) {
    return `${String(Math.floor(elapsed / MINUTE_MS))} min ago`;
  }
  if (elapsed < DAY_MS) {
    return `${String(Math.floor(elapsed / HOUR_MS))} h ago`;
  }
  if (elapsed < 2 * DAY_MS) {
    return "yesterday";
  }
  if (elapsed < 7 * DAY_MS) {
    return `${String(Math.floor(elapsed / DAY_MS))} days ago`;
  }
  const month = MONTHS[then.getUTCMonth()] ?? "";
  return `${String(then.getUTCDate())} ${month} ${String(then.getUTCFullYear())}`;
}

export function queueLine(entry: QueuedSubmission, now: Date): string {
  const when = timeAgo(entry.submittedAt, now);
  if (entry.queueKind === "resubmitted") {
    return `By ${entry.authorName} · resubmitted after changes · ${when}`;
  }
  if (entry.queueKind === "nextVersion") {
    return `Suggested by ${entry.authorName} for ${entry.ownerName}'s reaction · submitted ${when}`;
  }
  return `New, by ${entry.authorName} · submitted ${when}`;
}

export function userReactionsText(user: SiteUser): string {
  const parts = [
    ...(user.publishedVersionCount > 0 ? [`${String(user.publishedVersionCount)} published`] : []),
    ...(user.openVersionCount > 0 ? [`${String(user.openVersionCount)} open`] : []),
  ];
  return parts.length === 0 ? "none yet" : parts.join(" · ");
}

/** What the Publish stage needs to submit for review instead of publishing. */
export interface SubmitControls {
  readonly reviewNotes: ReviewNotes | null;
  /** The version's submission status as last known ("draft", "submitted", …). */
  readonly submissionStatus: string;
  readonly onSubmit: (licenceAgreed: boolean, submissionNote: string) => void;
}
