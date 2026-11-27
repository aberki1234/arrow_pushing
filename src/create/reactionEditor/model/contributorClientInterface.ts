/**
 * The interface of Create's calls for contributors and review, and the shapes they carry: Submit
 * for review, the reviewer's notes, the review queue and a review, and the owner's Users page.
 * The adapter over HTTP is io/contributorClient.ts.
 */
import type { ReactionDocument } from "../../reactionEditing/draft/reactionDraft.js";

export type SignInProvider = "github" | "google";

export interface PinnedNote {
  readonly changeKey: string;
  readonly note: string;
}

/** The reviewer's notes while changes are requested (submissions.ts ReviewNotes). */
export interface ReviewNotes {
  readonly reviewerName: string;
  readonly comment: string | null;
  readonly pinnedNotes: readonly PinnedNote[];
  readonly reviewedAt: string;
}

export type QueueKind = "newReaction" | "nextVersion" | "resubmitted";

export interface QueuedSubmission {
  readonly reactionSlug: string;
  readonly reactionVersion: number;
  readonly title: string | null;
  readonly authorName: string;
  readonly ownerName: string;
  readonly submittedAt: string;
  readonly submissionNote: string | null;
  readonly queueKind: QueueKind;
}

/** What a reviewer compares (submissions.ts ReviewMaterial), the documents only. */
export interface ReviewMaterial {
  readonly reactionSlug: string;
  readonly reactionVersion: number;
  readonly submitted: ReactionDocument;
  readonly previousPublished: ReactionDocument | null;
  readonly previousVersion: number | null;
  readonly authorName: string;
  readonly submissionNote: string | null;
}

export type ReviewDecision = "publish" | "changes_requested";

export type EditableRole = "contributor" | "reviewer" | "blocked";

export interface SiteUser {
  readonly userId: string;
  readonly displayName: string;
  readonly providers: readonly string[];
  readonly siteRole: EditableRole | "owner";
  readonly joinedAt: string;
  readonly openVersionCount: number;
  readonly publishedVersionCount: number;
}

/** A request's outcome: done, or the server's reason it was refused. */
export type RequestOutcome = { readonly outcome: "done" } | RefusedRequest;

export interface RefusedRequest {
  readonly outcome: "refused";
  readonly reason: string;
  /** For a draft with lint errors: how many findings the server's lint gave. */
  readonly lintFindingCount: number;
}

export interface ContributorClient {
  signInProviders(): Promise<SignInProvider[]>;
  /** The provider's sign-in address to send the browser to; it comes back to "/". */
  signInAddress(provider: SignInProvider): Promise<string>;
  /** End the session (Better Auth's sign-out). */
  signOut(): Promise<void>;
  submit(
    reactionSlug: string,
    licenceAgreed: boolean,
    submissionNote: string,
  ): Promise<RequestOutcome>;
  reviewNotes(reactionSlug: string): Promise<ReviewNotes | null>;
  reviewQueue(): Promise<QueuedSubmission[]>;
  reviewMaterial(reactionSlug: string): Promise<ReviewMaterial>;
  review(
    reactionSlug: string,
    decision: { reviewDecision: ReviewDecision; comment: string; pinnedNotes: PinnedNote[] },
  ): Promise<RequestOutcome>;
  users(): Promise<SiteUser[]>;
  setRole(userId: string, siteRole: EditableRole): Promise<RequestOutcome>;
}
