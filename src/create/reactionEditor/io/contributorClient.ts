/**
 * The built editor's calls for contributors and review (backendServer/routes/contributorRoutes.ts,
 * and the sign-in providers): Submit for review, the reviewer's notes, the review queue and a
 * review, and the owner's Users page. Same address as the editor, so the browser sends the session
 * cookie.
 */
import type { ReactionDocument } from "../../reactionEditing/draft/reactionDraft.js";
import type {
  ContributorClient,
  QueuedSubmission,
  RefusedRequest,
  RequestOutcome,
  ReviewMaterial,
  ReviewNotes,
  SignInProvider,
  SiteUser,
} from "../model/contributorClientInterface.js";

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
