/**
 * The built editor's calls for contributors and review (backendServer/contributorRoutes.ts, and
 * the sign-in providers): Submit for review, the reviewer's notes, the review queue and a review,
 * and the owner's Users page. Same address as the editor, so the browser sends the session cookie.
 */
import type { ReactionDocument } from "../reactionEditing/draft/reactionDraft.js";

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

interface Answer {
  readonly status: number;
  readonly body: unknown;
}

function fieldOf(body: unknown, fieldName: string): unknown {
  return typeof body === "object" && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)[fieldName]
    : undefined;
}

function refusalOf(answer: Answer): RefusedRequest {
  const error = fieldOf(answer.body, "error");
  const lintFindings = fieldOf(answer.body, "lintFindings");
  return {
    outcome: "refused",
    reason: typeof error === "string" ? error : `the server answered ${String(answer.status)}`,
    lintFindingCount: Array.isArray(lintFindings) ? lintFindings.length : 0,
  };
}

function outcomeOf(answer: Answer): RequestOutcome {
  return answer.status >= 200 && answer.status < 300 ? { outcome: "done" } : refusalOf(answer);
}

/** The body of a successful answer; otherwise throws the server's reason. */
function bodyOf(answer: Answer): unknown {
  const outcome = outcomeOf(answer);
  if (outcome.outcome === "refused") {
    throw new Error(outcome.reason);
  }
  return answer.body;
}

function jsonRequest(method: string, body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function materialOf(body: unknown, reactionSlug: string): ReviewMaterial {
  const submitted = fieldOf(body, "submitted");
  const previous = fieldOf(body, "previousPublished");
  const submissionNote = fieldOf(body, "submissionNote");
  return {
    reactionSlug,
    reactionVersion: Number(fieldOf(submitted, "reactionVersion")),
    submitted: fieldOf(submitted, "reactionDocument") as ReactionDocument,
    previousPublished:
      previous === null ? null : (fieldOf(previous, "reactionDocument") as ReactionDocument),
    previousVersion: previous === null ? null : Number(fieldOf(previous, "reactionVersion")),
    authorName: String(fieldOf(body, "authorName")),
    submissionNote: typeof submissionNote === "string" ? submissionNote : null,
  };
}

function reactionPath(reactionSlug: string, rest: string): string {
  return `/api/reactions/${encodeURIComponent(reactionSlug)}/${rest}`;
}

/** The client over the API; `fetchFunction` is the browser's fetch unless a test passes another. */
export function contributorClient(fetchFunction: typeof fetch = fetch): ContributorClient {
  const request = async (path: string, init?: RequestInit): Promise<Answer> => {
    const response = await fetchFunction(path, init);
    const text = await response.text();
    return { status: response.status, body: text === "" ? null : (JSON.parse(text) as unknown) };
  };
  return {
    signInProviders: async () =>
      (bodyOf(await request("/api/sign-in-providers")) as unknown[]).filter(
        (provider): provider is SignInProvider => provider === "github" || provider === "google",
      ),
    signInAddress: async (provider) =>
      String(
        fieldOf(
          bodyOf(
            await request(
              "/api/auth/sign-in/social",
              jsonRequest("POST", { provider, callbackURL: "/" }),
            ),
          ),
          "url",
        ),
      ),
    signOut: async (): Promise<void> => {
      bodyOf(await request("/api/auth/sign-out", jsonRequest("POST", {})));
    },
    submit: async (reactionSlug, licenceAgreed, submissionNote) =>
      outcomeOf(
        await request(
          reactionPath(reactionSlug, "submit"),
          jsonRequest("POST", { licenceAgreed, submissionNote }),
        ),
      ),
    reviewNotes: async (reactionSlug) =>
      bodyOf(await request(reactionPath(reactionSlug, "review-notes"))) as ReviewNotes | null,
    reviewQueue: async () => bodyOf(await request("/api/review-queue")) as QueuedSubmission[],
    reviewMaterial: async (reactionSlug) =>
      materialOf(bodyOf(await request(reactionPath(reactionSlug, "review"))), reactionSlug),
    review: async (reactionSlug, decision) =>
      outcomeOf(await request(reactionPath(reactionSlug, "review"), jsonRequest("POST", decision))),
    users: async () => bodyOf(await request("/api/users")) as SiteUser[],
    setRole: async (userId, siteRole) =>
      outcomeOf(
        await request(
          `/api/users/${encodeURIComponent(userId)}/role`,
          jsonRequest("PUT", { siteRole }),
        ),
      ),
  };
}
